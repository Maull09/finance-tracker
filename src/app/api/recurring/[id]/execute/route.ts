import { NextRequest, NextResponse } from "next/server"
import { authenticatedResponse } from "@/lib/server/authenticated-response"
import { integerInput, parseOccurrenceRecording } from "@/lib/planning-validation"
import { recordRecurringOccurrence } from "@/lib/server/recurring-recording"

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  return authenticatedResponse(async (db) => {
    const id = integerInput((await params).id, 1, 2_147_483_647)
    const input = parseOccurrenceRecording(await request.json())
    return NextResponse.json(await recordRecurringOccurrence(db, id, input), { status: 201 })
  })
}
