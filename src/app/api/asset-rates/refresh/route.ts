import { NextResponse } from "next/server"
import { authenticatedResponse } from "@/lib/server/authenticated-response"
import { refreshAssetRates } from "@/lib/server/asset-rates"

export async function POST() {
  return authenticatedResponse(async (db) => NextResponse.json(await refreshAssetRates(db)))
}
