import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';

let apiKey = process.env.GEMINI_API_KEY;
if (!apiKey && fs.existsSync('.env.local')) {
    const envContent = fs.readFileSync('.env.local', 'utf-8');
    const match = envContent.match(/GEMINI_API_KEY=(.*)/);
    if (match) apiKey = match[1].trim();
}

async function test() {
    if (!apiKey) {
        console.log("No API Key");
        return;
    }
    const ai = new GoogleGenerativeAI(apiKey);

    try {
        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + apiKey);
        const data = await response.json();
        const models = data.models ? data.models.map((m: any) => m.name) : ["No models array found"];
        console.log("Available Models for this API Key:");
        console.log(models);

        try {
            console.log("Testing gemini-1.5-flash natively...");
            await ai.getGenerativeModel({ model: 'gemini-1.5-flash' }).generateContent("hi");
            console.log("SUCCESS!");
        } catch (e) {
            console.error("SDK FAIL: ", e);
        }
    } catch (e: any) {
        console.error(`[FAIL] ${e.message}`);
    }
}

test();
