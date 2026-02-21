import { GoogleGenAI } from "@google/genai";
import fs from 'fs';

let apiKey = process.env.GEMINI_API_KEY;
if (!apiKey && fs.existsSync('.env.local')) {
    const envContent = fs.readFileSync('.env.local', 'utf-8');
    const match = envContent.match(/GEMINI_API_KEY=(.*)/);
    if (match) apiKey = match[1].trim();
}

async function test() {
    const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
            apiVersion: "v1"
        }
    });

    try {
        console.log("Testing model: gemini-1.5-flash with v1...");
        await ai.models.generateContent({
            model: "gemini-1.5-flash",
            contents: "Hi"
        });
        console.log("[SUCCESS] gemini-1.5-flash works on v1!");
    } catch (e: any) {
        console.error(`[FAIL] ${e.message}`);
    }
}

test();
