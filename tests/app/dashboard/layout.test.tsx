import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import DashboardLayout from "@/app/dashboard/layout"
import { useAiAvailability } from "@/components/ai-availability-provider"

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: "alice" } }, error: null }) },
}) }))
vi.mock("@/components/auth-provider", () => ({ AuthProvider: ({ children }: { children: React.ReactNode }) => children }))
vi.mock("@/components/session-guard", () => ({ SessionGuard: ({ children }: { children: React.ReactNode }) => children }))

function Availability() {
  const { assistantEnabled, insightsEnabled } = useAiAvailability()
  return <p>{String(assistantEnabled) + "/" + String(insightsEnabled)}</p>
}

describe("server-provided AI availability", () => {
  afterEach(() => vi.unstubAllEnvs())
  it.each([
    [undefined, undefined, "true/true"],
    ["true", "true", "true/true"],
    ["true", "false", "true/false"],
    ["false", "true", "false/false"],
    ["false", "false", "false/false"],
  ])("uses Ollama=%s and Redis=%s before rendering client features", async (ollama, redis, expected) => {
    vi.stubEnv("OLLAMA_ENABLED", ollama)
    vi.stubEnv("REDIS_ENABLED", redis)
    const layout = await DashboardLayout({ children: <Availability /> })
    expect(renderToStaticMarkup(layout)).toBe("<p>" + expected + "</p>")
  })
})
