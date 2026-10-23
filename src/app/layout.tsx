import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { LanguageProvider } from "@/components/language-provider"
import { FeedbackProvider } from "@/components/feedback"
import { en } from "@/lib/i18n/en"
import { siteUrl } from "@/lib/site"
import { themeInitializationScript } from "@/lib/theme"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: "Finance Tracker",
  title: {
    default: en.seoTitle,
    template: "%s | Finance Tracker",
  },
  description: en.seoDescription,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} /></head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <LanguageProvider>
          <FeedbackProvider>{children}</FeedbackProvider>
        </LanguageProvider>
      </body>
    </html>
  )
}
