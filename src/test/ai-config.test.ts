import { afterEach, describe, expect, it } from "vitest";
import { aiConfig, gatewayKey } from "@/server/ai/gateway";

const KEYS = ["AI_BASE_URL", "AI_API_KEY", "AI_CHAT_MODEL", "LOVABLE_API_KEY"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("AI server selection", () => {
  it("uses Lovable AI when AI_BASE_URL is not set", () => {
    delete process.env.AI_BASE_URL;
    expect(aiConfig().lovable).toBe(true);
    expect(aiConfig().baseURL).toBe("https://ai.gateway.lovable.dev/v1");
  });

  it("uses a local Ollama server when AI_BASE_URL points to it", () => {
    process.env.AI_BASE_URL = "http://localhost:11434/v1/";
    process.env.AI_CHAT_MODEL = "qwen2.5:7b";
    const config = aiConfig();
    expect(config.lovable).toBe(false);
    expect(config.baseURL).toBe("http://localhost:11434/v1");
    expect(config.chatModel).toBe("qwen2.5:7b");
  });

  it("does not require a key for a local AI server", () => {
    process.env.AI_BASE_URL = "http://localhost:11434/v1";
    delete process.env.AI_API_KEY;
    expect(() => gatewayKey()).not.toThrow();
  });

  it("requires LOVABLE_API_KEY when using Lovable AI", () => {
    delete process.env.AI_BASE_URL;
    delete process.env.LOVABLE_API_KEY;
    expect(() => gatewayKey()).toThrow(/LOVABLE_API_KEY/);
  });
});
