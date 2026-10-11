import { afterEach, describe, expect, it, vi } from "vitest"
import nextConfig from "../../next.config"

vi.mock("@/components/landing", () => ({ Landing: () => null }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("public-page SEO", () => {
  it("omits domain-dependent URLs until a production origin is configured", async () => {
    vi.stubEnv("SITE_URL", undefined)
    vi.resetModules()
    const { default: sitemap } = await import("@/app/sitemap")
    const { default: robots } = await import("@/app/robots")
    const { siteUrl } = await import("@/lib/site")
    const { metadata } = await import("@/app/page")

    expect(siteUrl).toBeUndefined()
    expect(sitemap()).toEqual([])
    expect(robots().sitemap).toBeUndefined()
    expect(metadata.alternates).toBeUndefined()
    expect(metadata.openGraph).toMatchObject({
      type: "website",
      url: undefined,
      images: undefined,
    })
    expect(metadata.twitter).toMatchObject({ card: "summary", images: undefined })
  })

  it("lists only the public homepage and lets crawlers read noindex pages", async () => {
    vi.stubEnv("SITE_URL", "https://finance.example.com")
    vi.resetModules()
    const { default: sitemap } = await import("@/app/sitemap")
    const { default: robots } = await import("@/app/robots")
    const { metadata } = await import("@/app/page")

    expect(sitemap()).toEqual([{ url: "https://finance.example.com/" }])
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/"] },
      sitemap: "https://finance.example.com/sitemap.xml",
    })
    expect(metadata.alternates).toEqual({ canonical: "https://finance.example.com/" })
    expect(metadata.openGraph).toMatchObject({
      url: "https://finance.example.com/",
      images: [{ url: "https://finance.example.com/social-preview.png", width: 1200, height: 630 }],
    })
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      images: [{ url: "https://finance.example.com/social-preview.png" }],
    })
  })

  it("excludes account, dashboard, auth, and API responses from search indexing", async () => {
    const headers = await nextConfig.headers!()
    for (const source of [
      "/sign-in", "/sign-up", "/dashboard/:path*", "/auth/:path*", "/api/:path*",
    ]) {
      expect(headers).toContainEqual({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      })
    }
    expect(headers.some(({ source }) => source === "/")).toBe(false)
  })
})
