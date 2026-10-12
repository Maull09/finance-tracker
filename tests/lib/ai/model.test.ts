import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ollamaModel } from "@/lib/ai/model"

describe("Ollama request configuration", () => {
  beforeEach(() => vi.stubEnv("OLLAMA_ENABLED", undefined))
  afterEach(() => vi.unstubAllEnvs())
  it("sends reasoning_effort for Qwen through chat completions without relying on OpenAI model-name detection", () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
    vi.stubEnv("OLLAMA_MODEL", "qwen3.5:9b")
    expect(ollamaModel().invocationParams()).toMatchObject({ model: "qwen3.5:9b", reasoning_effort: "none", max_tokens: 2000 })
  })
  it("reports missing server configuration without making a request", () => {
    vi.stubEnv("OLLAMA_BASE_URL", "")
    vi.stubEnv("OLLAMA_MODEL", "")
    expect(() => ollamaModel()).toThrow("aiNotConfigured")
  })
  it("refuses inference when disabled despite configured model credentials", () => {
    vi.stubEnv("OLLAMA_ENABLED", "false")
    vi.stubEnv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
    vi.stubEnv("OLLAMA_MODEL", "qwen3.5:9b")
    expect(() => ollamaModel()).toThrow("aiDisabled")
  })
  it("allows inference when explicitly enabled and configured", () => {
    vi.stubEnv("OLLAMA_ENABLED", "true")
    vi.stubEnv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
    vi.stubEnv("OLLAMA_MODEL", "qwen3.5:9b")
    expect(ollamaModel().invocationParams()).toMatchObject({ model: "qwen3.5:9b" })
  })
})
