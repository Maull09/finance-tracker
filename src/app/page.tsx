import type { Metadata } from "next"
import { Landing } from "@/components/landing"
import { en } from "@/lib/i18n/en"
import { siteUrl } from "@/lib/site"

export const metadata: Metadata = {
  alternates: siteUrl ? { canonical: siteUrl.href } : undefined,
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "Finance Tracker",
    title: en.seoTitle,
    description: en.seoDescription,
    locale: "en_US",
    url: siteUrl?.href,
    images: siteUrl
      ? [
          {
            url: new URL("/social-preview.png", siteUrl).href,
            width: 1200,
            height: 630,
            alt: en.seoImageAlt,
          },
        ]
      : undefined,
  },
  twitter: {
    card: siteUrl ? "summary_large_image" : "summary",
    title: en.seoTitle,
    description: en.seoDescription,
    images: siteUrl
      ? [{ url: new URL("/social-preview.png", siteUrl).href, alt: en.seoImageAlt }]
      : undefined,
  },
}

export default function HomePage() {
  return <Landing />
}
