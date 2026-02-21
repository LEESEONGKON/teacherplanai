import { GoogleGenAI, Type } from "@google/genai";
import fs from 'fs';

// Read API key from .env.local for testing
let apiKey = process.env.GEMINI_API_KEY;
if (!apiKey && fs.existsSync('.env.local')) {
    const envContent = fs.readFileSync('.env.local', 'utf-8');
    const match = envContent.match(/GEMINI_API_KEY=(.*)/);
    if (match) apiKey = match[1].trim();
}

async function test() {
    if (!apiKey) {
        console.error("Set GEMINI_API_KEY");
        return;
    }
    const ai = new GoogleGenAI({ apiKey });

    // Dummy small PDF Base64
    const base64 = "JVBERi0xLjcKCjEgMCBvYmogICUgZW50cnkgcG9pbnQKPDwKICAvVHlwZSAvQ2F0YWxvZwogIC9QYWdlcyAyIDAgUgo+PgplbmRvYmoKCjIgMCBvYmoKPDwKICAvVHlwZSAvUGFnZXMKICAvTWVkaWFCb3ggWyAwIDAgMjAwIDIwMCBdCiAgL0NvdW50IDEKICAvS2lkcyBbIDMgMCBSIF0KPj4KZW5kb2JqCgozIDAgb2JqCjw8CiAgL1R5cGUgL1BhZ2UKICAvUGFyZW50IDIgMCBSCiAgL1Jlc291cmNlcyA8PAogICAgL0ZvbnQgPDwKICAgICAgL0YxIDQgMCBSCgkvRjIgNSAwIFIKICAgID4+CiAgPj4KICAvQ29udGVudHMgNiAwIFIKPj4KZW5kb2JqCgo0IDAgb2JqCjw8CiAgL1R5cGUgL0ZvbnQKICAvU3VidHlwZSAvVHlwZTEKICAvQmFzZUZvbnQgL1RpbWVzLVJvbWFuCj4+CmVuZG9iagoM";
    const chunkContent = [{ inlineData: { mimeType: 'application/pdf', data: base64 } }];

    const prompt = `Can you extract the text in the PDF and return it as JSON {"A": "text"}?`;
    try {
        console.log("Calling Gemini API...");
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [...chunkContent, { text: prompt }],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        A: { type: Type.STRING },
                    }
                }
            }
        });
        console.log("Success!");
        console.log("Response Text:", response.text);
    } catch (e) {
        console.error("Gemini Error:", e);
    }
}

test();
