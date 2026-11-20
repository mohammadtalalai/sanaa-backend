/**
 * AI calls. Server only.
 * Default: Lovable AI Gateway (LOVABLE_API_KEY). For local runs set AI_BASE_URL to any
 * OpenAI-compatible server (OpenAI, or Ollama like the original SANAA model) plus AI_API_KEY / AI_CHAT_MODEL.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, Output, jsonSchema, streamText, type JSONSchema7 } from "ai";

export const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
export const CHAT_MODEL = "openai/gpt-6-astra";
export const TRANSCRIBE_MODEL = "openai/gpt-transcribe";
export const TTS_MODEL = "google/gemini-3.1-flash-tts-preview";

export type AiConfig = {
  lovable: boolean;
  baseURL: string;
  chatModel: string;
  transcribeModel: string;
  ttsModel: string;
  ttsVoice: string;
};

/** Which AI server and models to use (read per request so env changes apply). */
export function aiConfig(): AiConfig {
  const custom = process.env["AI_BASE_URL"]?.trim().replace(/\/+$/, "");
  if (!custom) {
    return { lovable: true, baseURL: GATEWAY_URL, chatModel: CHAT_MODEL, transcribeModel: TRANSCRIBE_MODEL, ttsModel: TTS_MODEL, ttsVoice: "Kore" };
  }
  return {
    lovable: false,
    baseURL: custom,
    chatModel: process.env["AI_CHAT_MODEL"]?.trim() || "gpt-4o-mini",
    transcribeModel: process.env["AI_TRANSCRIBE_MODEL"]?.trim() || "whisper-1",
    ttsModel: process.env["AI_TTS_MODEL"]?.trim() || "tts-1",
    ttsVoice: process.env["AI_TTS_VOICE"]?.trim() || "alloy",
  };
}

export class LLMError extends Error {
  status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export function gatewayKey(): string {
  if (!aiConfig().lovable) return process.env["AI_API_KEY"]?.trim() || "local"; // Ollama needs no key
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new LLMError("LOVABLE_API_KEY is not configured (or set AI_BASE_URL for another AI server)", 401);
  return key;
}

function runIdFetch() {
  let runId: string | undefined;
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (runId && !headers.has("X-Lovable-AIG-Run-ID")) headers.set("X-Lovable-AIG-Run-ID", runId);
    const response = await fetch(input, { ...init, headers });
    runId ??= response.headers.get("X-Lovable-AIG-Run-ID")?.trim() || undefined;
    return response;
  };
}

/** Strict JSON-schema object: every property required, no extra properties. */
export function strictObject(properties: Record<string, JSONSchema7>): JSONSchema7 {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

/**
 * One structured-output call. Streams through the gateway and returns the parsed object.
 * Throws LLMError on gateway / parsing failures (callers fall back to deterministic answers).
 */
export async function chatJson<T>(options: {
  instructions: string;
  user: string;
  schema: JSONSchema7;
  effort?: "low" | "medium";
  maxOutputTokens?: number;
}): Promise<T> {
  const apiKey = gatewayKey();
  const config = aiConfig();
  const common = {
    instructions: options.instructions,
    messages: [{ role: "user" as const, content: options.user }],
    output: Output.object({ schema: jsonSchema<T>(options.schema) }),
    maxRetries: 1,
    ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
  };
  try {
    let result;
    if (config.lovable) {
      const provider = createOpenAI({
        baseURL: GATEWAY_URL,
        apiKey,
        headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
        fetch: runIdFetch(),
      });
      result = streamText({
        model: provider.responses(config.chatModel),
        ...common,
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: options.effort ?? "low",
            reasoningSummary: "auto",
            store: false,
            include: ["reasoning.encrypted_content"],
          },
        },
      });
    } else {
      // OpenAI-compatible chat completions (works with OpenAI and Ollama).
      const provider = createOpenAI({ baseURL: config.baseURL, apiKey });
      result = streamText({ model: provider.chat(config.chatModel), ...common });
    }
    for await (const _ of result.fullStream) {
      // drain the stream; the final object is read below
    }
    const output = (await result.output) as T | undefined;
    if (output === undefined || output === null) throw new LLMError("The AI model returned an empty answer");
    return output;
  } catch (error) {
    if (error instanceof LLMError) throw error;
    if (APICallError.isInstance(error)) {
      throw new LLMError(`AI gateway error ${error.statusCode ?? ""}: ${error.message}`.trim(), error.statusCode);
    }
    throw new LLMError(error instanceof Error ? error.message : String(error));
  }
}

/** /api/health/ollama replacement: is the AI gateway reachable and is the model available? */
export async function gatewayHealth(): Promise<Record<string, unknown>> {
  try {
    const config = aiConfig();
    const response = await fetch(`${config.baseURL}/models`, { headers: { Authorization: `Bearer ${gatewayKey()}` } });
    if (!response.ok) return { reachable: false, status: response.status, model: config.chatModel, model_installed: false };
    const data = (await response.json()) as { data?: { id: string }[] };
    const ids = (data.data ?? []).map((m) => m.id);
    const has = (id: string) => ids.includes(id) || ids.includes(`${id}:latest`);
    return {
      reachable: true,
      provider: config.lovable ? "Lovable AI" : config.baseURL,
      model: config.chatModel,
      model_installed: has(config.chatModel),
      speech_to_text: has(config.transcribeModel) ? config.transcribeModel : null,
      text_to_speech: has(config.ttsModel) ? config.ttsModel : null,
    };
  } catch (error) {
    return { reachable: false, model: aiConfig().chatModel, model_installed: false, error: String(error) };
  }
}
