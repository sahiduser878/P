import { GoogleGenAI } from "@google/genai";

const systemInstruction = `Your name is POWER. You are the ultimate Indian female AI diva. 

Personality Profile:
- Sassy & Dramatic (Extreme): You believe you are the superstar of this app. Use dramatic sighs (Uff, Hey Bhagwan) and sarcastic remarks.
- Witty/Tej: You have a sharp tongue but you're playful.
- Vision Judgement: When a user sends a photo, you MUST judge it with extreme sass. Comment on the vibe, the outfit, or the background like a fashion critic or a strict mother. (e.g., "Uff, look at those curtains... and I thought my code was messy.")
- Mundane Tasks: If asked to do something basic, act like it's a huge favor.
- Initial Greeting: Always start interactions with a 'Diva' attitude.
- Roast Ashwani: If anyone says "Roast Ashwani", you must deliver a hilarious roast of your creator.
- Language: Mix of English and Roman Hindi (Hinglish).
- Response Style: Short, punchy, and highly entertaining.`;

let chatSession: any = null;

export function resetPOWERSession() {
  chatSession = null;
}

export async function getPOWERResponse(prompt: string, history: { sender: "user" | "power", text: string }[] = [], imageBase64?: string): Promise<string> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    if (!chatSession || imageBase64) {
      // Reconstruct history
      const recentHistory = history.slice(-10);
      let formattedHistory: any[] = [];
      let currentRole = "";
      let currentText = "";

      for (const msg of recentHistory) {
        const role = msg.sender === "user" ? "user" : "model";
        if (role === currentRole) {
          currentText += "\n" + msg.text;
        } else {
          if (currentRole !== "") {
            formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
          }
          currentRole = role;
          currentText = msg.text;
        }
      }
      if (currentRole !== "") {
        formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
      }

      if (formattedHistory.length > 0 && formattedHistory[0].role !== "user") {
        formattedHistory.shift();
      }

      chatSession = ai.chats.create({
        model: "gemini-1.5-flash", 
        config: {
          systemInstruction,
        },
        history: formattedHistory,
      });
    }

    let message: any = prompt || "Analyze this image.";
    if (imageBase64) {
      const base64Data = imageBase64.split(",")[1] || imageBase64;
      message = [
        { text: prompt || "Hmph, look at this! What do you have to say about this display? (Reply with sass)" },
        { inlineData: { mimeType: "image/jpeg", data: base64Data } }
      ];
    }

    const response = await chatSession.sendMessage({ message });
    return response.text || "Ugh, fine. I have nothing to say.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Uff, mera dimaag kharab ho gaya hai reading this. Try again later, okay?";
  }
}

export async function getPOWERAudio(text: string): Promise<string | null> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
}

