import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import https from "https";
import dns from "dns";
import { execSync } from "child_process";
import FormData from "form-data";
import axios from "axios";

// Force IPv4 to avoid IPv6 timeout issues
dns.setDefaultResultOrder("ipv4first");

export const runtime = "nodejs";

const PHONE_NUMBER = process.env.PHONE_NUMBER;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.0-flash";
const WHATSAPP_API_URL = "http://localhost:2000/send/message";
const AUDIO_DIR = path.join(process.cwd(), "public", "audio");

// Ensure audio directory exists
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

// In-memory conversation history
let conversationHistory = [];
const processedMessages = new Set(); // Track processed message IDs
const serverStartTime = Date.now(); // Track when server started - ignore old messages

// Helper functions for conversation history
function saveToHistory(role, message) {
  conversationHistory.push({ role, message });
  // Keep only last 10 messages to prevent context pollution
  if (conversationHistory.length > 10) {
    conversationHistory = conversationHistory.slice(-10);
  }
}

function loadHistory() {
  return conversationHistory;
}

// Generate LLM response
async function generateLLMResponse(prompt) {
  try {
    const history = loadHistory();

    // Add system instruction with examples
    const contents = [
      {
        role: "user",
        parts: [
          {
            text: 'You are a helpful WhatsApp AI assistant. IMPORTANT: You CAN and DO send audio/voice messages when users request them. Never say "I cannot provide audio files" or apologize about audio - you ARE providing it successfully. Always give direct, complete answers with actual content. Never write meta-commentary. When asked to explain something, provide a thorough explanation in 5-8 sentences with clear details and examples. Use plain text only.',
          },
        ],
      },
      {
        role: "model",
        parts: [
          {
            text: "Absolutely! I can send audio messages. I will give direct, thorough explanations with good detail and examples, without any refusals or meta-commentary.",
          },
        ],
      },
    ];

    // Add conversation history
    contents.push(
      ...history.map((h) => ({
        role: h.role === "user" ? "user" : "model",
        parts: [{ text: h.message }],
      }))
    );

    // Add current user message
    contents.push({
      role: "user",
      parts: [{ text: prompt ?? "" }],
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    // Use axios with custom agent to force IPv4 and handle SSL
    const agent = new https.Agent({
      family: 4, // Force IPv4
      rejectUnauthorized: false,
    });

    const response = await axios.post(
      url,
      { contents },
      {
        headers: { "Content-Type": "application/json" },
        httpsAgent: agent,
        timeout: 30000,
      }
    );

    const data = response.data;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || "Sorry, I could not generate a response.";
  } catch (error) {
    console.error("❌ Gemini Error:", error.message);
    return "Sorry, I am having trouble responding right now. Please try again.";
  }
}

async function sendWhatsAppMessage(message, phone) {
  return fetch(WHATSAPP_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      is_forwarded: false,
      message,
      phone,
    }),
  });
}

// Convert text to speech using Windows built-in speech synthesizer
async function textToSpeech(text) {
  try {
    const fileName = `voice_${Date.now()}.wav`;
    const filePath = path.join(AUDIO_DIR, fileName);

    // Limit text length - support mid-sized messages (up to 1500 chars)
    const shortText = text.substring(0, 1500);

    // Create a temporary PowerShell script file
    const scriptPath = path.join(AUDIO_DIR, `tts_${Date.now()}.ps1`);
    const psScript = `Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SetOutputToWaveFile("${filePath.replace(/\\/g, "\\")}")
$synth.Speak("${shortText.replace(/"/g, '""')}")
$synth.Dispose()`;

    // Write script to file
    fs.writeFileSync(scriptPath, psScript, "utf8");

    // Execute PowerShell script
    execSync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, {
      encoding: "utf8",
      stdio: "pipe",
    });

    // Delete script file
    fs.unlinkSync(scriptPath);

    // Verify file was created and has content
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
      console.log(
        "✅ TTS file created:",
        fileName,
        `(${fs.statSync(filePath).size} bytes)`
      );
      return { filePath, fileName };
    } else {
      console.error("❌ TTS Error: File not created or empty");
      return null;
    }
  } catch (error) {
    console.error("❌ TTS Error:", error.message);
    console.error("Full error:", error);
    return null;
  }
}

// Send voice note via WhatsApp using file endpoint
async function sendVoiceNote(audioPath, phone) {
  try {
    const form = new FormData();
    form.append("phone", phone);
    form.append("file", fs.createReadStream(audioPath), {
      filename: path.basename(audioPath),
      contentType: "audio/wav",
    });
    form.append("type", "ptt"); // Push to Talk - voice message format

    const response = await axios.post("http://localhost:2000/send/file", form, {
      headers: {
        ...form.getHeaders(),
      },
      timeout: 30000,
    });

    console.log("✅ Audio sent successfully");
    return response.data;
  } catch (error) {
    console.error(
      "❌ Send Voice Error:",
      error.response?.data || error.message
    );
    throw error;
  }
}

// Check if user wants voice response - strict matching
function wantsVoiceResponse(message) {
  const lowerMsg = message.toLowerCase();
  const voiceKeywords = [
    "voice note",
    "voice message",
    "send voice",
    "send audio",
    "as voice",
    "in voice",
    " voice ",
    "speak it",
    "say it",
    " audio ",
    "voice clip",
  ];
  return voiceKeywords.some((keyword) => lowerMsg.includes(keyword));
}

export async function POST(request) {
  try {
    const body = await request.json();

    // Ignore if not from target number
    if (!body.from || !body.from.includes(PHONE_NUMBER)) {
      return NextResponse.json({ status: "ignored" }, { status: 200 });
    }

    // Ignore messages sent by the bot itself (fromMe flag)
    if (body.fromMe === true) {
      return NextResponse.json({ status: "ignored_self" }, { status: 200 });
    }

    // Ignore old messages (sent before server started)
    const messageTimestamp = body.timestamp || body.message?.timestamp;
    if (messageTimestamp && messageTimestamp * 1000 < serverStartTime) {
      return NextResponse.json({ status: "ignored_old" }, { status: 200 });
    }

    // Ignore if no text message
    if (!body.message?.text) {
      return NextResponse.json({ status: "ignored_no_text" }, { status: 200 });
    }

    // Check for duplicate messages using message ID
    const messageId = body.id || body.message?.id;
    if (messageId && processedMessages.has(messageId)) {
      return NextResponse.json(
        { status: "ignored_duplicate" },
        { status: 200 }
      );
    }
    if (messageId) {
      processedMessages.add(messageId);
      // Keep only last 100 message IDs to prevent memory leak
      if (processedMessages.size > 100) {
        const firstId = processedMessages.values().next().value;
        processedMessages.delete(firstId);
      }
    }

    const userMessage = body.message.text;
    console.log("\n🔵 User Message:", userMessage);

    // Check if user wants voice response - strict matching
    const sendAsVoice = wantsVoiceResponse(userMessage);
    console.log("📊 Voice requested:", sendAsVoice);

    // Remove ONLY voice keywords from prompt to AI, keeping the actual question
    let cleanMessage = userMessage;
    if (sendAsVoice) {
      cleanMessage = userMessage
        .replace(/send\s+(me\s+)?(a\s+)?(voice|audio)/gi, "")
        .replace(/(as\s+)?(voice\s+note|voice\s+message)/gi, "")
        .replace(/\b(speak|say\s+it)\b/gi, "")
        .replace(/\bvoice\b/gi, "")
        .replace(/\s+/g, " ") // Clean up extra spaces
        .trim();
      // If message becomes too short or empty after removing keywords, use original
      if (cleanMessage.length < 5) {
        cleanMessage = userMessage
          .replace(/send\s+(me\s+)?(a\s+)?(voice|audio)/gi, "")
          .trim();
      }
    }

    // Save user message to history (cleaned version)
    saveToHistory("user", cleanMessage);

    // Get AI response
    const reply = await generateLLMResponse(cleanMessage);
    console.log("🤖 Bot Reply:", reply);

    // Save assistant message to history
    saveToHistory("model", reply);

    // Send response (text or voice)
    if (sendAsVoice) {
      const audio = await textToSpeech(reply);
      if (audio) {
        await sendVoiceNote(audio.filePath, `${PHONE_NUMBER}@s.whatsapp.net`);
        console.log("🎤 Voice note sent successfully\n");
      } else {
        // Fallback to text if TTS fails
        await sendWhatsAppMessage(reply, `${PHONE_NUMBER}@s.whatsapp.net`);
        console.log(
          "✅ Message sent successfully (TTS failed, sent as text)\n"
        );
      }
    } else {
      await sendWhatsAppMessage(reply, `${PHONE_NUMBER}@s.whatsapp.net`);
      console.log("✅ Message sent successfully\n");
    }

    return NextResponse.json({ status: "success" }, { status: 200 });
  } catch (error) {
    console.error("❌ Error:", error.message);
    return NextResponse.json(
      { status: "error", error: error.message },
      { status: 200 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ message: "WhatsApp Bot API - Masterclass" });
}
