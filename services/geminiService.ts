import { GoogleGenerativeAI, SchemaType as Type } from "@google/generative-ai";
import { PlanData, GradeLevel, TeachingPlanItem, EvaluationPlanRow, RubricElement, PerformanceTask } from "../types";

// Helper to get API Key dynamically
const getApiKey = (): string => {
  // 1. Check Local Storage (User entered key)
  const storedKey = localStorage.getItem('TEACHER_PLAN_API_KEY');
  if (storedKey) return storedKey;

  // 2. Fallback to env (Developer/Deployment key)
  const envKey = process.env.API_KEY;
  if (envKey && envKey !== 'PLACEHOLDER_API_KEY') return envKey;

  return '';
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

// Collision-proof id generator.
// Date.now() alone collides when several rows are created within the same millisecond,
// which desyncs evaluationRows from their linked performanceTasks.
let idCounter = 0;
export const createId = (prefix: string): string => {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
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

export const generateTeacherGoals = async (
  subject: string,
  grade: GradeLevel,
  gradeGoal: string,
  humanIdeal: string
): Promise<{ teacherGoal: string; actionPlan: string }> => {
  const apiKey = requireApiKey();
  if (!apiKey) return { teacherGoal: '', actionPlan: '' };

  const ai = new GoogleGenerativeAI(apiKey.toString());

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
    const response = await ai.getGenerativeModel({
      model: 'gemini-2.5-flash', generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            teacherGoal: { type: Type.STRING },
            actionPlan: { type: Type.STRING }
          }
        }
      }
    }).generateContent([{ text: prompt }]);

    const text = response.response.text();
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

  const ai = new GoogleGenerativeAI(apiKey.toString());

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
    const response = await ai.getGenerativeModel({
      model: 'gemini-2.5-flash', generationConfig: {
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
    }).generateContent([{ text: userPrompt }]);

    const text = response.response.text();
    if (text) {
      const parsed = JSON.parse(text);

      // Post-process evaluationRows to add IDs
      const processedEvaluationRows = parsed.evaluationRows?.map((row: any) => ({
        ...row,
        id: createId('eval')
      })) || [];

      // Post-process teachingPlans
      const processedTeachingPlans = parsed.teachingPlans?.map((p: any) => ({
        ...p,
        id: createId('gen')
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

// Run async tasks with a bounded number in flight.
// Gemini free-tier keys rate-limit by requests-per-minute, so firing every page
// chunk at once turns a large page range into a wall of 429s.
export const generateNotesFromMaterial = async (
  file: File,
  standard: string,
  subject: string
): Promise<string> => {
  const apiKey = requireApiKey();
  if (!apiKey) return '';

  const ai = new GoogleGenerativeAI(apiKey.toString());
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
    const response = await ai.getGenerativeModel({ model: 'gemini-2.5-flash' }).generateContent([contentPart, { text: prompt }]);
    return response.response.text() || '';
  } catch (error) {
    console.error("Generate Notes Error", error);
    return '';
  }
};

export const extractGradeGoalsFromFile = async (file: File): Promise<{ gradeGoal: string; humanIdeal: string }> => {
  const apiKey = requireApiKey();
  if (!apiKey) return { gradeGoal: '', humanIdeal: '' };
  const ai = new GoogleGenerativeAI(apiKey.toString());

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
    // JSON mode is required here: without it the model wraps the object in a
    // ```json fence and JSON.parse throws, silently yielding empty fields.
    const response = await ai.getGenerativeModel({
      model: 'gemini-2.5-flash', generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            gradeGoal: { type: Type.STRING },
            humanIdeal: { type: Type.STRING }
          }
        }
      }
    }).generateContent([contentPart, { text: prompt }]);
    const text = response.response.text();
    return text ? JSON.parse(text) : { gradeGoal: '', humanIdeal: '' };
  } catch (e) {
    console.error(e);
    return { gradeGoal: '', humanIdeal: '' };
  }
};

export const extractEvaluationPlanFromFile = async (file: File): Promise<EvaluationPlanRow[]> => {
  const apiKey = requireApiKey();
  if (!apiKey) return [];
  const ai = new GoogleGenerativeAI(apiKey.toString());

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
    const response = await ai.getGenerativeModel({
      model: 'gemini-2.5-flash', generationConfig: {
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
    }).generateContent([contentPart, { text: prompt }]);
    const text = response.response.text();
    if (!text) return [];
    const rows = JSON.parse(text);
    return rows.map((r: any) => ({ ...r, id: createId('imported') }));
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
  const ai = new GoogleGenerativeAI(apiKey.toString());

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
    const response = await ai.getGenerativeModel({
      model: 'gemini-2.5-flash', generationConfig: {
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
    }).generateContent([{ text: prompt }]);
    const text = response.response.text();
    return text ? JSON.parse(text) : { A: '', B: '', C: '', D: '', E: '' };
  } catch (e) {
    console.error(e);
    return { A: '', B: '', C: '', D: '', E: '' };
  }
}

export const extractRubricsFromFile = async (file: File): Promise<any[]> => {
  const apiKey = requireApiKey();
  if (!apiKey) return [];
  const ai = new GoogleGenerativeAI(apiKey.toString());

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
    const response = await ai.getGenerativeModel({
      model: 'gemini-2.5-flash', generationConfig: { responseMimeType: "application/json" } // Schema is complex, letting model infer or using 'any'
    }).generateContent([contentPart, { text: prompt }]);
    const text = response.response.text();
    return text ? JSON.parse(text) : [];
  } catch (e) {
    console.error(e);
    return [];
  }
}

export const generateRubricItems = async (elementName: string, considerations: string): Promise<{ criteria: string, score: string }[]> => {
  const apiKey = requireApiKey();
  if (!apiKey) return [];
  const ai = new GoogleGenerativeAI(apiKey.toString());

  const prompt = `
    Create a rubric checklist for evaluation element: "${elementName}".
    Considerations: "${considerations}".
    Return JSON array: [{ "criteria": "...", "score": "..." }]
    `;

  try {
    const response = await ai.getGenerativeModel({
      model: 'gemini-2.5-flash', generationConfig: {
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
    }).generateContent([{ text: prompt }]);
    const text = response.response.text();
    return text ? JSON.parse(text) : [];
  } catch (e) {
    console.error(e);
    return [];
  }
}

export const suggestCoreIdeas = async (subject: string, standards: string[], taskName: string): Promise<string[]> => {
  const apiKey = requireApiKey();
  if (!apiKey) return [];
  const ai = new GoogleGenerativeAI(apiKey.toString());

  const prompt = `
    Subject: ${subject}
    Task: ${taskName}
    Standards: ${standards.join(', ')}
    
    Suggest 3 suitable "Core Ideas" (핵심 아이디어) from the 2022 Revised Curriculum that match these standards.
    Return JSON array of strings.
    `;

  try {
    const response = await ai.getGenerativeModel({
      model: 'gemini-2.5-flash', generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    }).generateContent([{ text: prompt }]);
    const text = response.response.text();
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
  const ai = new GoogleGenerativeAI(apiKey.toString());

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
    const response = await ai.getGenerativeModel({
      model: 'gemini-2.5-flash', generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    }).generateContent([contentPart, { text: prompt }]);
    const text = response.response.text();
    return text ? JSON.parse(text) : [];
  } catch (e) {
    console.error(e);
    return [];
  }
}

export const extractAchievementLevelsFromFile = async (
  file: File,
  scale: '3' | '5',
  subject: string
): Promise<{ A: string; B: string; C: string; D?: string; E?: string }> => {
  const empty = { A: '', B: '', C: '', D: '', E: '' };
  const apiKey = requireApiKey();
  if (!apiKey) return empty;
  const ai = new GoogleGenerativeAI(apiKey.toString());

  let contentPart: any;
  try {
    const mimeType = getMimeType(file);
    contentPart = mimeType === 'text/plain'
      ? { text: await readTextFile(file) }
      : { inlineData: { mimeType, data: await fileToBase64(file) } };
  } catch (e) {
    console.error('Achievement level file read failed', e);
    throw new Error('파일을 읽지 못했습니다.');
  }

  const levels = scale === '5' ? 'A, B, C, D, E' : 'A, B, C';

  const prompt = `
    Role: Korean secondary school evaluation specialist.
    Target Subject: "${subject}"
    Target Scale: ${scale} levels (${levels}).

    **OBJECTIVE**: Extract the "Achievement Level" (성취수준) descriptions from the ATTACHED DOCUMENT
    and aggregate them into one semester-level description per level (학기단위 성취수준).

    **STRICT SOURCING RULE — THIS IS THE MOST IMPORTANT INSTRUCTION**:
    - Use ONLY text that is actually present in the attached document.
    - Look for 성취수준 tables: 영역별 성취수준 first, then 성취기준별 성취수준.
    - **If the document contains NO 성취수준 descriptions, return EMPTY STRINGS for every level.**
    - **NEVER invent, infer, or extrapolate levels from 성취기준 text.** An empty result is correct
      and expected when the document does not contain achievement levels. Do not try to be helpful
      by writing plausible descriptions — that would put unverified text into an official school document.

    **AGGREGATION** (only for levels actually found):
    - For each level, merge the descriptions found across all domains/standards into one cohesive
      paragraph describing what a student at that level can do across the whole scope.
    - Preserve the document's original wording as closely as possible.
    - Language: Korean (formal educational tone).

    Return JSON: { "A": "...", "B": "...", "C": "..."${scale === '5' ? ', "D": "...", "E": "..."' : ''} }
    `;

  try {
    const response = await ai.getGenerativeModel({
      model: 'gemini-2.5-flash', generationConfig: {
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
    }).generateContent([contentPart, { text: prompt }]);

    const text = response.response.text();
    if (!text) return empty;
    const parsed = JSON.parse(text);
    return {
      A: sanitizeText(parsed.A || ''),
      B: sanitizeText(parsed.B || ''),
      C: sanitizeText(parsed.C || ''),
      D: sanitizeText(parsed.D || ''),
      E: sanitizeText(parsed.E || ''),
    };
  } catch (e: any) {
    console.error('Achievement level extraction failed', e);
    throw new Error(e?.message || String(e));
  }
};

/**
 * 선택된 성취기준에 대해 평가요소·수업방법·주안점을 생성한다.
 * 성취기준 자체는 내장 데이터에서 정확히 오므로, AI는 생성이 필요한 칸만 채운다.
 */
export const generatePlanDetailsForStandards = async (
  items: { id: string; unit: string; standard: string }[],
  subject: string,
  grade: GradeLevel
): Promise<Record<string, { element: string; teachingMethod: string; notes: string }>> => {
  const apiKey = requireApiKey();
  if (!apiKey) return {};
  const ai = new GoogleGenerativeAI(apiKey.toString());

  const itemList = items
    .map((it, i) => `${i + 1}. [id=${it.id}] (영역: ${it.unit}) ${it.standard}`)
    .join('\n');

  const prompt = `
    You are an expert Korean secondary school teacher.
    Subject: ${subject} (Grade ${grade})

    For EACH achievement standard below, produce three fields.
    The "standard" text is authoritative and must NOT be rewritten or returned.

    Input:
    ${itemList}

    For each item return:
      - id: echo the id EXACTLY as given.
      - element (평가요소): a short noun phrase naming what is assessed (e.g. "지수법칙의 이해와 적용"). Not a sentence.
      - teachingMethod (수업방법): 2-3 concrete methods separated by ", " (e.g. "강의식, 모둠 탐구, 발표").
      - notes (수업-평가 연계 주안점): EXACTLY this format on three lines:
        [도입] ... (within 50 chars)
        [수업] ... (within 100 chars)
        [평가] ... (within 50 chars)

    Return a JSON array with one object per input item, in the same order.
    Language: Korean (formal educational tone).
    `;

  try {
    const response = await ai.getGenerativeModel({
      model: 'gemini-2.5-flash', generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              element: { type: Type.STRING },
              teachingMethod: { type: Type.STRING },
              notes: { type: Type.STRING }
            }
          }
        }
      }
    }).generateContent([{ text: prompt }]);

    const text = response.response.text();
    if (!text) return {};
    const rows = JSON.parse(text);
    if (!Array.isArray(rows)) return {};

    const out: Record<string, { element: string; teachingMethod: string; notes: string }> = {};
    rows.forEach((r: any, idx: number) => {
      // Prefer the echoed id, but fall back to positional matching if the model drops it.
      const target = items.find(it => it.id === r?.id) || items[idx];
      if (!target) return;
      out[target.id] = {
        element: sanitizeText(r?.element || ''),
        teachingMethod: sanitizeText(r?.teachingMethod || ''),
        notes: sanitizeText(r?.notes || ''),
      };
    });
    return out;
  } catch (e: any) {
    console.error('Plan detail generation failed', e);
    throw new Error(e?.message || String(e));
  }
};
