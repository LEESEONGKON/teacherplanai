import { GoogleGenAI, Type } from "@google/genai";

async function testAnalyzeChunk() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("Set GEMINI_API_KEY");
        return;
    }
    const ai = new GoogleGenAI({ apiKey });

    // Dummy tiny PDF
    const base64 = "JVBERi0xLjcKCjEgMCBvYmogICUgZW50cnkgcG9pbnQKPDwKICAvVHlwZSAvQ2F0YWxvZwogIC9QYWdlcyAyIDAgUgo+PgplbmRvYmoKCjIgMCBvYmoKPDwKICAvVHlwZSAvUGFnZXMKICAvTWVkaWFCb3ggWyAwIDAgMjAwIDIwMCBdCiAgL0NvdW50IDEKICAvS2lkcyBbIDMgMCBSIF0KPj4KZW5kb2JqCgozIDAgb2JqCjw8CiAgL1R5cGUgL1BhZ2UKICAvUGFyZW50IDIgMCBSCiAgL1Jlc291cmNlcyA8PAogICAgL0ZvbnQgPDwKICAgICAgL0YxIDQgMCBSCgkvRjIgNSAwIFIKICAgID4+CiAgPj4KICAvQ29udGVudHMgNiAwIFIKPj4KZW5kb2JqCgo0IDAgb2JqCjw8CiAgL1R5cGUgL0ZvbnQKICAvU3VidHlwZSAvVHlwZTEKICAvQmFzZUZvbnQgL1RpbWVzLVJvbWFuCj4+CmVuZG9iagoM";
    const chunkContent = [{ inlineData: { mimeType: 'application/pdf', data: base64 } }];

    const subject = "역사";
    const range = "";
    const prompt = `
    You are an expert Korean school teacher helper.
    I have uploaded a document containing Curriculum Standards (성취기준).
    
    **Target Subject Name**: "${subject}" (Grade 3)
    
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
        console.log("Calling API...");
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
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
        console.log("Response text:", response.text);
    } catch (e) {
        console.error("Caught error:", e);
    }
}

testAnalyzeChunk();
