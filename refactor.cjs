const fs = require('fs');

const FILE_PATH = 'services/geminiService.ts';
let code = fs.readFileSync(FILE_PATH, 'utf8');

// 1. Replace Imports
code = code.replace(/import \{ GoogleGenAI, Type \} from "@google\/genai"/g, 'import { GoogleGenerativeAI, SchemaType as Type } from "@google/generative-ai"');

// 2. Replace Instantiate
code = code.replace(/new GoogleGenAI\(\{ apiKey \}\)/g, 'new GoogleGenerativeAI(apiKey.toString())');

// 3. Replace analyzeChunk (complex config)
code = code.replace(/ai\.models\.generateContent\(\{\s*model:\s*'gemini-1\.5-flash',\s*contents:\s*(.*?),\s*config:\s*\{(.*?)\}\s*\}\)/gs, (match, p1, p2) => {
    return "ai.getGenerativeModel({ model: 'gemini-1.5-flash', generationConfig: { " + p2 + " } }).generateContent(" + p1 + ")";
});

// 4. Replace simple calls (no config)
code = code.replace(/ai\.models\.generateContent\(\{\s*model:\s*'gemini-1\.5-flash',\s*contents:\s*(.*?)\s*\}\)/gs, (match, p1) => {
    return "ai.getGenerativeModel({ model: 'gemini-1.5-flash' }).generateContent(" + p1 + ")";
});

// 5. Replace text response getter
// V1 SDK: response.text
// V0 SDK: response.response.text() -- actually `generateContent` returns `{ response: { text: () => string } }`
code = code.replace(/const text = response\.text;/g, 'const text = response.response.text();');

// 6. Inline text return
code = code.replace(/return response\.text \|\| '';/g, "return response.response.text() || '';");

fs.writeFileSync(FILE_PATH, code);
console.log("Replaced SDK syntax.");
