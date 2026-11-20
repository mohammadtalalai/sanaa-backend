/** Voice in/out through Lovable AI (replaces faster-whisper and edge-tts). */
import { aiConfig, gatewayKey } from "@/server/ai/gateway";
import { ServiceUnavailableError, ValidationFailedError } from "@/server/core/http";
import { detectLanguage } from "@/shared/language";

const MAX_AUDIO_BYTES = 24 * 1024 * 1024;

export async function transcribe(file: File, language?: string | null) {
  if (!file || !file.size) throw new ValidationFailedError("Audio file is empty");
  if (file.size > MAX_AUDIO_BYTES) throw new ValidationFailedError("Audio file is too large (max 24 MB)");
  const type = file.type && file.type.startsWith("video/") ? file.type.replace("video/", "audio/") : file.type || "audio/webm";
  const upload = new File([await file.arrayBuffer()], file.name || "audio.webm", { type });
  const config = aiConfig();
  const form = new FormData();
  form.append("model", config.transcribeModel);
  form.append("file", upload, upload.name);
  form.append("response_format", "json");
  if (config.lovable) form.append("stream", "true");
  if (language === "ar" || language === "en") form.append(config.lovable ? "languages" : "language", language);
  const response = await fetch(`${config.baseURL}/audio/transcriptions`, {
    method: "POST", headers: { Authorization: `Bearer ${gatewayKey()}` }, body: form,
  });
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new ServiceUnavailableError(`Speech-to-text failed (${response.status})`, { detail: detail.slice(0, 300) });
  }
  const raw = await response.text();
  let text = "", done = "", seconds: number | null = null;
  const frames = raw.replace(/\r\n/g, "\n").split("\n");
  for (const line of frames) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const event = JSON.parse(data) as { type?: string; delta?: string; text?: string; usage?: { seconds?: number } };
      if (event.type === "transcript.text.delta" && event.delta) text += event.delta;
      if (event.type === "transcript.text.done") { done = event.text ?? text; seconds = event.usage?.seconds ?? null; }
    } catch {
      // ignore keep-alive frames
    }
  }
  if (!text && !done && raw.trim().startsWith("{")) {
    try { done = (JSON.parse(raw) as { text?: string }).text ?? ""; } catch { /* not JSON */ }
  }
  if (!text && !done) console.warn("Transcription returned no text:", raw.slice(0, 300));
  const finalText = (done || text).trim();
  if (!finalText) throw new ValidationFailedError("No speech was recognised in the audio");
  return { text: finalText, language: detectLanguage(finalText), duration_seconds: seconds };
}

export async function synthesize(text: string, language?: string | null): Promise<Response> {
  const clean = (text ?? "").trim();
  if (!clean) throw new ValidationFailedError("Text is empty");
  const lang = language === "ar" || language === "en" ? language : detectLanguage(clean);
  const spoken = lang === "ar" ? `اقرأ النص التالي بلهجة مصرية واضحة وهادئة: ${clean}` : `Read this clearly and calmly: ${clean}`;
  const config = aiConfig();
  const body = config.lovable
    ? {
        model: config.ttsModel,
        contents: [{ role: "user", parts: [{ text: spoken }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.ttsVoice } } } },
        stream_format: "audio",
      }
    : { model: config.ttsModel, input: clean, voice: config.ttsVoice, response_format: "mp3" }; // OpenAI style
  const response = await fetch(`${config.baseURL}/audio/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${gatewayKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new ServiceUnavailableError(`Text-to-speech failed (${response.status})`, { detail: detail.slice(0, 300) });
  }
  return new Response(response.body, {
    headers: { "Content-Type": response.headers.get("content-type") || "audio/wav", "Cache-Control": "no-cache" },
  });
}
