import { GoogleGenAI } from "@google/genai";

async function test() {
    // Instantiate with a dummy key just to see if it throws validation locally
    const ai = new GoogleGenAI({ apiKey: "dummy_key_to_bypass_constructor_check" });

    const base64 = "dummy";
    const chunkContent = [{ inlineData: { mimeType: 'application/pdf', data: base64 } }];
    const prompt = "text";

    try {
        console.log("Attempting generation with flat Parts array...");
        await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            // OLD FORMAT: Passing Parts directly into contents
            contents: [...chunkContent, { text: prompt }],
            config: { responseMimeType: "application/json" }
        });
        console.log("Did not throw synchronously.");
    } catch (e) {
        console.error("Synchronous Error Caught:", e);
    }
}

test();
