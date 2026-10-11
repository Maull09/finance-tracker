import React from "react"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"
import { en } from "../src/lib/i18n/en"

async function generateSocialPreview() {
  const font = await readFile(join(process.cwd(), "src/assets/fonts/Geist-SemiBold.ttf"))

  const image = new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          padding: 64,
          background: "#FFFFFF",
          color: "#0A0B0D",
          fontFamily: "Geist",
          fontWeight: 600,
          borderTop: "12px solid #0052FF",
        }}
      >
        <div style={{ display: "flex", color: "#0052FF", fontSize: 32, marginBottom: 40 }}>
          Finance Tracker
        </div>
        <div style={{ display: "flex", fontSize: 72, lineHeight: 1.1, letterSpacing: -2 }}>
          {en.landingTitle}
        </div>
        <div style={{ display: "flex", fontSize: 28, lineHeight: 1.5, color: "#5B616E", marginTop: 32 }}>
          {en.seoDescription}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: "Geist", data: font, weight: 600, style: "normal" }],
    },
  )

  await writeFile(
    join(process.cwd(), "public/social-preview.png"),
    Buffer.from(await image.arrayBuffer()),
  )
}

void generateSocialPreview()
