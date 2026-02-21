import { GoogleGenAI, Type } from "@google/genai";
import { PDFDocument } from 'pdf-lib';
import { PlanData, GradeLevel, TeachingPlanItem, EvaluationPlanRow, RubricElement, PerformanceTask } from "../types";

// Helper to get API Key dynamically
const getApiKey = (): string => {
  // 1. Check Local Storage (User entered key)
  const storedKey = localStorage.getItem('TEACHER_PLAN_API_KEY');
  if (storedKey) return storedKey;

  // 2. Fallback to env (Developer/Deployment key)
  return process.env.API_KEY || '';
};

// Helper to check if key exists and alert if not
const requireApiKey = (): string | null => {
  const key = getApiKey();
  if (!key) {
    alert("API 키가 설정되지 않았습니다.\n우측 상단 '설정(⚙️)' 버튼을 눌러 Google Gemini API 키를 입력해주세요.");
    return null;
  }
  return key;
};

// Helper to convert file to base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:application/pdf;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Helper to read text file with encoding fallback
const readTextFile = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    // First try UTF-8
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      // Check for replacement character () indicating encoding mismatch
      if (text.includes('\uFFFD')) {
        // Fallback to EUC-KR (common for Korean text files)
        const reader2 = new FileReader();
        reader2.onload = (e2) => resolve(e2.target?.result as string);
        reader2.onerror = reject;
        reader2.readAsText(file, 'euc-kr');
      } else {
        resolve(text);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file, 'utf-8');
  });
};

// Helper to determine mime type if missing from file object
const getMimeType = (file: File): string => {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.txt')) return 'text/plain';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  return 'application/pdf'; // Fallback
};

// Sanitize string to remove common OCR/Encoding artifacts
const sanitizeText = (text: string): string => {
  if (!text) return "";
  // Fix specifically reported issue: '･' showing as '아ᅢ' or other corruptions
  // Also normalize middle dots
  return text
    .replace(/아ᅢ/g, '·')
    .replace(/･/g, '·')
    .replace(/\uFF65/g, '·'); // Halfwidth Katakana Middle Dot
};

// --- PDF Slicing Helper ---

// Parse page range string (e.g. "1, 3-5") into 0-based index array
const parsePageRange = (rangeStr: string, totalPages: number): number[] => {
  const pages = new Set<number>();
  const parts = rangeStr.split(/,|\s+/); // Split by comma or space

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (!isNaN(start) && !isNaN(end)) {
        // Ensure range is valid and within bounds
        const s = Math.max(1, Math.min(start, end));
        const e = Math.min(totalPages, Math.max(start, end));
        for (let i = s; i <= e; i++) {
          pages.add(i - 1); // 0-based
        }
      }
    } else {
      const page = parseInt(trimmed, 10);
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        pages.add(page - 1); // 0-based
      }
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
};

// Extract specific pages from a PDF file and return as Base64 string
// Accepts indices (0-based) array now to support chunking logic easier
const extractPdfPagesByIndices = async (file: File, pageIndices: number[]): Promise<string | null> => {
  try {
    if (pageIndices.length === 0) return null;
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);

    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);

    for (const page of copiedPages) {
      newPdf.addPage(page);
    }

    const savedBase64 = await newPdf.saveAsBase64();
    return savedBase64;
  } catch (error) {
    console.error("PDF Slicing Error:", error);
    return null;
  }
};

// Original Helper (Wrapper)
const extractPdfPages = async (file: File, pageRange: string): Promise<string | null> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const totalPages = pdfDoc.getPageCount();
    const pagesToKeep = parsePageRange(pageRange, totalPages);
    return extractPdfPagesByIndices(file, pagesToKeep);
  } catch (e) {
    console.error(e);
    return null;
  }
}


export const generateTeacherGoals = async (
  subject: string,
  grade: GradeLevel,
  gradeGoal: string,
  humanIdeal: string
): Promise<{ teacherGoal: string; actionPlan: string }> => {
  const apiKey = requireApiKey();
  if (!apiKey) return { teacherGoal: '', actionPlan: '' };

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    You are an expert Korean school teacher.
    
    Context:
    - Subject: ${subject}
    - Grade: ${grade}
    - Grade Level Goal: "${gradeGoal}"
    - Ideal Human Image (Core Competencies): "${humanIdeal}"

    Task:
    Based strictly on the "Grade Level Goal" and "Ideal Human Image" provided above, please generate the following two items for the "${subject}" class:
    1. **Teacher's Class Goal (수업자 수업 중점 목표)**: A specific goal for this subject that aligns with the grade level goal.
    2. **Action Plan (주요 실천 방안)**: Concrete strategies to achieve these goals in the classroom and evaluation.

    Output Format (JSON):
    {
      "teacherGoal": "...",
      "actionPlan": "..."
    }
    
    Language: Korean (Formal educational tone).
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ text: prompt }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            teacherGoal: { type: Type.STRING },
            actionPlan: { type: Type.STRING }
          }
        }
      }
    });

    const text = response.text;
    if (text) {
      return JSON.parse(text);
    }
    return { teacherGoal: '', actionPlan: '' };
  } catch (error) {
    console.error("Teacher goals generation failed", error);
    return { teacherGoal: '', actionPlan: '' };
  }
};

export const generateSamplePlan = async (
  subject: string,
  grade: GradeLevel,
  currentData: PlanData
): Promise<Partial<PlanData>> => {
  const apiKey = requireApiKey();
  if (!apiKey) return {};

  const ai = new GoogleGenAI({ apiKey });

  let userPrompt = `
    You are an expert Korean school teacher. 
    Create a JSON object to populate a "Teaching and Evaluation Plan" for the subject: ${subject}, Grade: ${grade}.
    
    The response must follow this schema structure roughly, but return valid JSON:
    {
      "teachingPlans": [
        {
          "unit": "Unit Name (Use Roman Numerals I, II, III for main units)",
          "standard": "Curriculum Standard",
          "element": "Evaluation Element",
          "method": ["지필", "수행"], // Array of strings. Options: '지필', '수행', '기타'
          "teachingMethod": "Teaching Method (List at least 3 distinct methods, e.g. Lecture, Discussion, Project)",
          "notes": "Format: [도입]... [수업]... [평가]... (Keep concise)",
          "remarks": "Remarks (optional)",
          "period": "Time period (e.g. 3월 1주)",
          "hours": "Hours (e.g. (4/4))"
        }
      ],
      "evaluationRows": [
        {
           "category": "지필평가" or "수행평가",
           "name": "Evaluation Area Name",
           "maxScore": "100",
           "ratio": 30, // Semester Ratio %
           "typeSelect": 20, // Multiple choice % point
           "typeShort": 10, // Short answer % point
           "typeEssay": 0, // Essay % point
           "typeOther": 0, // Other % point
           "timing": "Month (e.g. 4월)"
        }
      ]
    }
    
    Constraints:
    - If Grade 1, do NOT include "지필평가" (Written Exam) rows. Only "수행평가" (Performance) rows summing to 100%.
    - If Grade 2 or 3, typically include 2 Written Exams (Midterm, Final) and Performance Tasks summing to 100%.
    - **IMPORTANT**: For "evaluationRows", the sum of (typeSelect + typeShort + typeEssay + typeOther) MUST EQUAL the "ratio" value. 
      (Example: If ratio is 30, then typeSelect 20 + typeShort 10 = 30).
    
    Keep it realistic for the Korean curriculum 2022 revised. Return ONLY JSON.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ text: userPrompt }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            teachingPlans: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  unit: { type: Type.STRING },
                  standard: { type: Type.STRING },
                  element: { type: Type.STRING },
                  method: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  teachingMethod: { type: Type.STRING },
                  notes: { type: Type.STRING },
                  remarks: { type: Type.STRING },
                  period: { type: Type.STRING },
                  hours: { type: Type.STRING },
                }
              }
            },
            evaluationRows: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING },
                  name: { type: Type.STRING },
                  maxScore: { type: Type.STRING },
                  ratio: { type: Type.NUMBER },
                  typeSelect: { type: Type.NUMBER },
                  typeShort: { type: Type.NUMBER },
                  typeEssay: { type: Type.NUMBER },
                  typeOther: { type: Type.NUMBER },
                  timing: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    const text = response.text;
    if (text) {
      const parsed = JSON.parse(text);

      // Post-process evaluationRows to add IDs
      const processedEvaluationRows = parsed.evaluationRows?.map((row: any, idx: number) => ({
        ...row,
        id: `eval-${Date.now()}-${idx}`
      })) || [];

      // Post-process teachingPlans
      const processedTeachingPlans = parsed.teachingPlans?.map((p: any, idx: number) => ({
        ...p,
        id: `gen-${Date.now()}-${idx}`
      })) || [];

      return {
        ...parsed,
        teachingPlans: processedTeachingPlans,
        evaluationRows: processedEvaluationRows
      };
    }
    return {};
  } catch (error) {
    console.error("Gemini generation failed", error);
    return {};
  }
};

// --- Single Chunk Analyzer ---
const analyzeChunk = async (
  ai: GoogleGenAI,
  chunkContent: any[],
  subject: string,
  grade: GradeLevel,
  range?: string,
  chunkIndex?: number
): Promise<any[]> => {
  const prompt = `
    You are an expert Korean school teacher helper.
    I have uploaded a document containing Curriculum Standards (성취기준).
    
    **Target Subject Name**: "${subject}" (Grade ${grade})
    
    **CRITICAL TASK**: 
    1. **SUBJECT FILTER**: The uploaded file may contain standards for MULTIPLE different subjects. You must **ONLY** extract standards for "**${subject}**".
    2. **STRICT FILTERING & FORMATTING**:
       - **Target**: Extract "Achievement Standards" (성취기준).
       - **Code Association**: Look for standard codes (e.g., [9수01-01], [12국어02-01]). If the code is in a separate column or line from the text, **PREPEND** the code to the standard text. 
         - Example: "[9수01-01] 지수법칙을 이해한다."
       - **Exclusion**:
         - **IGNORE** Unit names (e.g. "I. 수와 연산", "문자와 식").
         - **IGNORE** Learning Objectives (often starting with bullet points or "학습목표").
         - **IGNORE** Table headers.
       - **Validation**: 
         - A valid standard MUST end with a verb phrase like "~한다", "~할 수 있다", "~이해한다".
         - If a line is just a noun phrase (e.g. "일차방정식의 풀이"), **IGNORE IT**.
    
    ${range ? `- **SCOPE**: Only extract standards that match this description: "${range}"` : ''}
    
    Please perform the following steps for the subject "${subject}":
    1. Scan the text to find the table or list of Achievement Standards.
    2. EXTRACT the Standard Code and Description.
    3. ANALYZE each standard to determine the Unit Name (단원명).
    4. GENERATE an 'Evaluation Element' (평가 요소).
    5. SUGGEST 'Teaching Methods' (수업 방법).
    6. GENERATE 'Notes' (수업-평가 연계 주안점) strictly in this format:
       [도입] ...
       [수업] ...
       [평가] ...
    
    **OUTPUT RULE**: 
    - **Encoding Correction**: If the document contains the middle dot character '･' or '・', strictly treat it as '·' (Middle Dot).
    - Return JSON Array.
    `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [...chunkContent, { text: prompt }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              unit: { type: Type.STRING },
              standard: { type: Type.STRING },
              element: { type: Type.STRING },
              teachingMethod: { type: Type.STRING },
              notes: { type: Type.STRING }
            }
          }
        }
      }
    });
    const text = response.text;
    return text ? JSON.parse(text) : [];
  } catch (e) {
    console.warn(`Chunk ${chunkIndex} failed`, e);
    return [];
  }
}

export const parseStandardsAndGeneratePlan = async (
  file: File,
  subject: string,
  grade: GradeLevel,
  range?: string,
  pageRange?: string // Optional page range hint
): Promise<TeachingPlanItem[]> => {
  const apiKey = requireApiKey();
  if (!apiKey) throw new Error("API Key missing");

  const ai = new GoogleGenAI({ apiKey });
  const mimeType = getMimeType(file);

  let allItems: any[] = [];

  // CHUNKING LOGIC FOR PDF
  // If PDF and pageRange is provided, chunk it into groups of 3 pages to avoid context loss
  if (mimeType === 'application/pdf' && pageRange && pageRange.trim()) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const totalPages = pdfDoc.getPageCount();

      // Get all requested page indices (0-based)
      const requestedIndices = parsePageRange(pageRange, totalPages);

      if (requestedIndices.length === 0) {
        console.warn("No valid pages found in range");
        return [];
      }

      // Split into chunks of 3 pages
      const CHUNK_SIZE = 3;
      const chunkedIndices: number[][] = [];
      for (let i = 0; i < requestedIndices.length; i += CHUNK_SIZE) {
        chunkedIndices.push(requestedIndices.slice(i, i + CHUNK_SIZE));
      }

      console.log(`Split ${requestedIndices.length} pages into ${chunkedIndices.length} chunks.`);

      // Process chunks in parallel (limited concurrency could be added if needed, but 3-flash is fast)
      const chunkPromises = chunkedIndices.map(async (indices, i) => {
        const slicedBase64 = await extractPdfPagesByIndices(file, indices);
        if (!slicedBase64) return [];

        const chunkContent = [{
          inlineData: { mimeType: 'application/pdf', data: slicedBase64 }
        }];
        return analyzeChunk(ai, chunkContent, subject, grade, range, i);
      });

      const results = await Promise.all(chunkPromises);
      results.forEach(res => allItems.push(...res));

    } catch (e) {
      console.error("Chunking failed, falling back to full file", e);
      // Fallback to single call
      const base64Data = await fileToBase64(file);
      const chunkContent = [{ inlineData: { mimeType, data: base64Data } }];
      allItems = await analyzeChunk(ai, chunkContent, subject, grade, range);
    }
  } else {
    // Non-PDF or no range: Single Call
    let contents: any[] = [];
    if (mimeType === 'text/plain') {
      const textContent = await readTextFile(file);
      contents = [{ text: textContent }];
    } else {
      const base64Data = await fileToBase64(file);
      contents = [{ inlineData: { mimeType, data: base64Data } }];
    }
    allItems = await analyzeChunk(ai, contents, subject, grade, range);
  }

  // Deduplication & Filtering Logic
  const finalItems: any[] = [];
  const bodyMap = new Map<string, number>(); // cleanBody -> index in finalItems
  const headers = ['성취기준', '내용체계', '영역', '단원명', '평가요소', '교육과정', '핵심아이디어', '단원', '구분', '순서', '시기', '차시'];

  for (const item of allItems) {
    let stdText = (item.standard || '').trim();

    // 1. Basic Cleanup
    // Remove leading/trailing markers if any (like - or bullet)
    stdText = stdText.replace(/^[-·*]\s*/, '');

    if (!stdText || stdText.length < 10) continue;

    // 2. Identify Code
    const codeMatch = stdText.match(/\[[^\]]+\]/);
    const hasCode = !!codeMatch;

    // 3. Extract pure text body for comparison
    // Remove the code part to compare "content" content
    const bodyText = stdText.replace(/\[[^\]]+\]/g, '').trim();
    const cleanBody = bodyText.replace(/[\s\u3000]+/g, ''); // Remove all whitespace

    // 4. Content Filters
    // a. Filter Headers
    if (headers.some(h => cleanBody === h || cleanBody.includes('성취기준코드'))) continue;

    // b. Filter by ending (Must be a sentence ending in '다' or '다.' if no code is present)
    const endsWithDa = /[다\.?]$/.test(bodyText);
    const endsWithNoun = /[임음함]$/.test(bodyText); // Also accept noun endings if valid

    // Removed the strict requirement to ONLY have codes or specific endings.
    // Since OCR/PDF extraction of curriculum tables is messy, 
    // we trust the AI structural extraction more here for valid row entries.
    if (!hasCode && !endsWithDa && !endsWithNoun) {
      // Still strictly filter out very short obvious header/noise words 
      if (cleanBody.length < 5) continue;
    }

    // c. Filter if Standard is same as Unit
    if (item.unit && item.unit.replace(/\s+/g, '') === cleanBody) continue;

    // 5. Smart Deduplication
    if (bodyMap.has(cleanBody)) {
      // Collision found. 
      const index = bodyMap.get(cleanBody)!;
      const existingItem = finalItems[index];
      const existingHasCode = /\[[^\]]+\]/.test(existingItem.standard);

      if (!existingHasCode && hasCode) {
        // Replace existing (non-code) with new (coded) item
        finalItems[index] = item;
      }
      // Else: Existing has code (or neither do), keep existing (first one found)
    } else {
      // New content
      bodyMap.set(cleanBody, finalItems.length);
      finalItems.push(item);
    }
  }

  return finalItems.map((item: any, idx: number) => ({
    ...item,
    unit: sanitizeText(item.unit),
    standard: sanitizeText(item.standard),
    element: sanitizeText(item.element),
    teachingMethod: sanitizeText(item.teachingMethod),
    notes: sanitizeText(item.notes),
    id: `file-gen-${Date.now()}-${idx}`,
    period: '', // Ensure empty
    hours: '',  // Ensure empty
    remarks: '', // Ensure empty
    method: []  // Ensure empty
  }));
};

export const generateNotesFromMaterial = async (
  file: File,
  standard: string,
  subject: string
): Promise<string> => {
  const apiKey = requireApiKey();
  if (!apiKey) return '';

  const ai = new GoogleGenAI({ apiKey });
  const mimeType = getMimeType(file);

  let contentPart: any;
  try {
    if (mimeType === 'text/plain') {
      const text = await readTextFile(file);
      contentPart = { text };
    } else {
      const base64 = await fileToBase64(file);
      contentPart = { inlineData: { mimeType, data: base64 } };
    }
  } catch (e) {
    console.error("File reading failed", e);
    return '';
  }

  const prompt = `
    You are an expert Korean teacher.
    Target Subject: ${subject}
    Target Standard: ${standard}
    
    I have provided a teaching material file.
    Please create a "Teaching-Evaluation Linkage Note" (수업-평가 연계 주안점) strictly following this format:
    
    [도입] (Briefly describe motivation or introduction - within 50 chars)
    [수업] (Describe the main activity - within 100 chars)
    [평가] (Describe the evaluation point - within 50 chars)
    
    Language: Korean.
    Return ONLY the text formatted as above.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [contentPart, { text: prompt }]
    });
    return response.text || '';
  } catch (error) {
    console.error("Generate Notes Error", error);
    return '';
  }
};

export const extractGradeGoalsFromFile = async (file: File): Promise<{ gradeGoal: string; humanIdeal: string }> => {
  const apiKey = requireApiKey();
  if (!apiKey) return { gradeGoal: '', humanIdeal: '' };
  const ai = new GoogleGenAI({ apiKey });

  const mimeType = getMimeType(file);
  let contentPart: any = {};
  try {
    if (mimeType === 'text/plain') {
      contentPart = { text: await readTextFile(file) };
    } else {
      contentPart = { inlineData: { mimeType, data: await fileToBase64(file) } };
    }
  } catch (e) {
    console.error(e);
    return { gradeGoal: '', humanIdeal: '' };
  }

  const prompt = `
    Extract the "Grade Level Goal" (학년 중점 목표) and "Ideal Human Image" (학년 인간상/핵심역량) from this document.
    Return JSON: { "gradeGoal": "...", "humanIdeal": "..." }
    If not found, return empty strings.
    `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [contentPart, { text: prompt }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            gradeGoal: { type: Type.STRING },
            humanIdeal: { type: Type.STRING }
          }
        }
      }
    });
    const text = response.text;
    return text ? JSON.parse(text) : { gradeGoal: '', humanIdeal: '' };
  } catch (e) {
    console.error(e);
    return { gradeGoal: '', humanIdeal: '' };
  }
};

export const extractEvaluationPlanFromFile = async (file: File): Promise<EvaluationPlanRow[]> => {
  const apiKey = requireApiKey();
  if (!apiKey) return [];
  const ai = new GoogleGenAI({ apiKey });

  const mimeType = getMimeType(file);
  let contentPart: any = {};
  try {
    if (mimeType === 'text/plain') {
      contentPart = { text: await readTextFile(file) };
    } else {
      contentPart = { inlineData: { mimeType, data: await fileToBase64(file) } };
    }
  } catch (e) {
    console.error(e);
    return [];
  }

  const prompt = `
    Extract the Evaluation Plan table from this document.
    Return a list of evaluation rows (Written Exams and Performance Tasks).
    JSON Array format.
    Fields: category ('지필평가' or '수행평가'), name, maxScore, ratio (number), typeSelect (%), typeShort (%), typeEssay (%), typeOther (%), timing (e.g. '4월').
    Ensure ratios sum correctly if possible.
    `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [contentPart, { text: prompt }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING },
              name: { type: Type.STRING },
              maxScore: { type: Type.STRING },
              ratio: { type: Type.NUMBER },
              typeSelect: { type: Type.NUMBER },
              typeShort: { type: Type.NUMBER },
              typeEssay: { type: Type.NUMBER },
              typeOther: { type: Type.NUMBER },
              timing: { type: Type.STRING }
            }
          }
        }
      }
    });
    const text = response.text;
    if (!text) return [];
    const rows = JSON.parse(text);
    return rows.map((r: any, i: number) => ({ ...r, id: `imported-${Date.now()}-${i}` }));
  } catch (e) {
    console.error(e);
    return [];
  }
}

export const generateCriteriaFromRubric = async (
  taskName: string,
  elements: RubricElement[],
  rubricType: string,
  scale: '3' | '5'
): Promise<{ A: string; B: string; C: string; D: string; E: string }> => {
  const apiKey = requireApiKey();
  if (!apiKey) return { A: '', B: '', C: '', D: '', E: '' };
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    Task: ${taskName}
    Rubric Elements: ${JSON.stringify(elements)}
    
    Generate detailed evaluation criteria for ${scale} levels (${scale === '5' ? 'A, B, C, D, E' : 'A(Sang), B(Jung), C(Ha)'}).
    Summarize the rubric elements to describe what a student at each level achieves.
    Return JSON: { "A": "...", "B": "...", "C": "...", "D": "...", "E": "..." }
    (For 3 levels, D and E should be empty strings).
    Language: Korean.
    `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ text: prompt }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            A: { type: Type.STRING },
            B: { type: Type.STRING },
            C: { type: Type.STRING },
            D: { type: Type.STRING },
            E: { type: Type.STRING }
          }
        }
      }
    });
    const text = response.text;
    return text ? JSON.parse(text) : { A: '', B: '', C: '', D: '', E: '' };
  } catch (e) {
    console.error(e);
    return { A: '', B: '', C: '', D: '', E: '' };
  }
}

export const extractRubricsFromFile = async (file: File): Promise<any[]> => {
  const apiKey = requireApiKey();
  if (!apiKey) return [];
  const ai = new GoogleGenAI({ apiKey });

  const mimeType = getMimeType(file);
  let contentPart: any = {};
  try {
    if (mimeType === 'text/plain') {
      contentPart = { text: await readTextFile(file) };
    } else {
      contentPart = { inlineData: { mimeType, data: await fileToBase64(file) } };
    }
  } catch (e) {
    console.error(e);
    return [];
  }

  const prompt = `
    Extract Performance Task Rubrics from this file.
    Return JSON Array of tasks.
    Each task should have: name, standards (array of strings), coreIdea, rubricElements (array of objects with element, description, items(criteria, score)), baseScore.
    `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [contentPart, { text: prompt }],
      config: { responseMimeType: "application/json" } // Schema is complex, letting model infer or using 'any'
    });
    const text = response.text;
    return text ? JSON.parse(text) : [];
  } catch (e) {
    console.error(e);
    return [];
  }
}

export const generateRubricItems = async (elementName: string, considerations: string): Promise<{ criteria: string, score: string }[]> => {
  const apiKey = requireApiKey();
  if (!apiKey) return [];
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    Create a rubric checklist for evaluation element: "${elementName}".
    Considerations: "${considerations}".
    Return JSON array: [{ "criteria": "...", "score": "..." }]
    `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ text: prompt }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              criteria: { type: Type.STRING },
              score: { type: Type.STRING }
            }
          }
        }
      }
    });
    const text = response.text;
    return text ? JSON.parse(text) : [];
  } catch (e) {
    console.error(e);
    return [];
  }
}

export const suggestCoreIdeas = async (subject: string, standards: string[], taskName: string): Promise<string[]> => {
  const apiKey = requireApiKey();
  if (!apiKey) return [];
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    Subject: ${subject}
    Task: ${taskName}
    Standards: ${standards.join(', ')}
    
    Suggest 3 suitable "Core Ideas" (핵심 아이디어) from the 2022 Revised Curriculum that match these standards.
    Return JSON array of strings.
    `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ text: prompt }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    const text = response.text;
    return text ? JSON.parse(text) : [];
  } catch (e) {
    console.error(e);
    return [];
  }
}

export const suggestCoreIdeasFromFile = async (file: File, subject: string, standards: string[], taskName: string): Promise<string[]> => {
  // Similar to suggestCoreIdeas but with file context
  const apiKey = requireApiKey();
  if (!apiKey) return [];
  const ai = new GoogleGenAI({ apiKey });

  const mimeType = getMimeType(file);
  let contentPart: any = {};
  try {
    if (mimeType === 'text/plain') {
      contentPart = { text: await readTextFile(file) };
    } else {
      contentPart = { inlineData: { mimeType, data: await fileToBase64(file) } };
    }
  } catch (e) {
    console.error(e);
    return [];
  }

  const prompt = `
    Based on the file content (Curriculum Document), suggest "Core Ideas" for:
    Subject: ${subject}
    Task: ${taskName}
    Standards: ${standards.join(', ')}
    
    Return JSON array of strings.
    `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [contentPart, { text: prompt }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    const text = response.text;
    return text ? JSON.parse(text) : [];
  } catch (e) {
    console.error(e);
    return [];
  }
}

export const generateSemesterStandardsFromDomainFile = async (
  file: File,
  scale: '3' | '5',
  subject: string,
  range?: string,
  pageRange?: string
): Promise<{ A: string; B: string; C: string; D?: string; E?: string }> => {
  const apiKey = requireApiKey();
  if (!apiKey) return { A: '', B: '', C: '' };
  const ai = new GoogleGenAI({ apiKey });

  // Handle PDF paging if necessary, similar to extractStandards
  let contentParts: any[] = [];

  try {
    if (getMimeType(file) === 'application/pdf' && pageRange) {
      // Simple extraction for now, assuming helper works
      const base64 = await extractPdfPages(file, pageRange);
      if (base64) {
        contentParts = [{ inlineData: { mimeType: 'application/pdf', data: base64 } }];
      } else {
        const fullBase64 = await fileToBase64(file);
        contentParts = [{ inlineData: { mimeType: 'application/pdf', data: fullBase64 } }];
      }
    } else {
      const mimeType = getMimeType(file);
      if (mimeType === 'text/plain') {
        contentParts = [{ text: await readTextFile(file) }];
      } else {
        contentParts = [{ inlineData: { mimeType, data: await fileToBase64(file) } }];
      }
    }
  } catch (e) {
    console.error(e);
    return { A: '', B: '', C: '' };
  }

  const prompt = `
    Role: Expert Korean Curriculum Developer.
    Target Subject: "${subject}"
    Target Scale: ${scale} levels (A-${scale === '5' ? 'E' : 'C'}).
    ${range ? `Content Scope: ${range}` : ''}

    **OBJECTIVE**: Create a detailed "Semester Achievement Standard" (학기단위 성취수준) table.

    **ALGORITHM**:
    1. **Source Identification**:
       - Priority 1: Look for "Domain Achievement Standards" (영역별 성취수준) tables in the text.
       - Priority 2: Look for "Standard-specific Achievement Levels" (성취기준별 성취수준) if Priority 1 is missing.
       - Priority 3: Use "Achievement Standards" (성취기준) text if levels are missing entirely.

    2. **Aggregation Strategy (Crucial)**:
       - **For Level A**: Combine and synthesize ALL "Level A" descriptions found in the source (across all domains or standards). The result should be a rich, comprehensive paragraph describing what a top-performing student can do across the ENTIRE scope.
       - **For Level B**: Combine all "Level B" descriptions.
       - **For Level C**: Combine all "Level C" descriptions.
       ${scale === '5' ? '- **For Level D/E**: Combine all corresponding descriptions.' : ''}

    3. **Output Requirements**:
       - The output must be **detailed** and **comprehensive**, reflecting the content of the uploaded file.
       - Do NOT return single sentences. Merge the details from the various units/domains into a cohesive narrative for each level.
       - Language: Korean (Formal educational tone).

    Return JSON: { "A": "...", "B": "...", "C": "..." ${scale === '5' ? ', "D": "...", "E": "..."' : ''} }
    `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [...contentParts, { text: prompt }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            A: { type: Type.STRING },
            B: { type: Type.STRING },
            C: { type: Type.STRING },
            D: { type: Type.STRING },
            E: { type: Type.STRING }
          }
        }
      }
    });
    const text = response.text;
    return text ? JSON.parse(text) : { A: '', B: '', C: '' };
  } catch (e) {
    console.error(e);
    return { A: '', B: '', C: '' };
  }
}