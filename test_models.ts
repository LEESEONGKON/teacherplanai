import { GoogleGenAI } from "@google/genai";
import fs from 'fs';

// Read API key from .env.local for testing
let apiKey = process.env.GEMINI_API_KEY;
if (!apiKey && fs.existsSync('.env.local')) {
    const envContent = fs.readFileSync('.env.local', 'utf-8');
    const match = envContent.match(/GEMINI_API_KEY=(.*)/);
    if (match) apiKey = match[1].trim();
}

async function test() {
    const ai = new GoogleGenAI({ apiKey });

    const modelsToTest = ['gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-pro', 'gemini-1.5-flash-latest', 'gemini-1.5-pro'];

    for (const model of modelsToTest) {
        try {
            console.log(`Testing model: ${model}...`);
            await ai.models.generateContent({
                model: model,
                contents: "Hi"
            });
            console.log(`[SUCCESS] ${model} works!`);
            break; // Stop on first success
        } catch (e: any) {
            console.error(`[FAIL] ${model}: ${e.message}`);
        }
    }
}

test();
