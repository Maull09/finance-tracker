import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { createClient } from "@/lib/supabase/server"
import { financeResponse } from "@/lib/api-response"
import { apiCacheKey, readApiCache, writeApiCache } from "./api-cache"
import { redisEnabled } from "./service-config"

export type UserDatabase = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function authenticatedResponse(
  action: (connection: UserDatabase) => Promise<Response>,
  request?: Request,
) {
  let cacheEntry: { key: string; body: string } | undefined
  let cacheStatus = "BYPASS"
  const response = await financeResponse(async () => {
    const requestHeaders = await headers()
    const origin = requestHeaders.get("origin")
    const host = requestHeaders.get("host")
    if (
      requestHeaders.get("sec-fetch-site") === "cross-site" ||
      (origin && new URL(origin).host !== host)
    )
      return NextResponse.json({ code: "forbidden" }, { status: 403 })

    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error || !user)
      return NextResponse.json({ code: "unauthorized" }, { status: 401 })

    const result = await db.transaction(
      async (connection) => {
        // The connection URL may belong to a privileged role. Always drop privileges.
        await connection.execute(sql`set local role finance_user`)
        await connection.execute(
          sql`select set_config('app.user_id', ${user.id}, true)`,
        )
        const key =
          request?.method === "GET" && redisEnabled() && process.env.REDIS_URL
            ? await apiCacheKey(connection, user.id, request)
            : null
        if (key) {
          const body = await readApiCache(key)
          if (body !== null) {
            cacheStatus = "HIT"
            return new Response(body, {
              headers: { "Content-Type": "application/json" },
            })
          }
          cacheStatus = "MISS"
        }
        const response = await action(connection)
        if (
          key && response.status === 200 &&
          response.headers.get("Content-Type")?.includes("application/json") &&
          !response.headers.has("Set-Cookie")
        ) {
          cacheEntry = { key, body: await response.clone().text() }
        }
        return response
      },
      { isolationLevel: "serializable" },
    )
    // Publish only after PostgreSQL commits; failed transactions never populate Redis.
    if (cacheEntry) await writeApiCache(cacheEntry.key, cacheEntry.body)
    return result
  })
  response.headers.set("Cache-Control", "private, no-store")
  response.headers.set("X-Finance-Cache", cacheStatus)
  return response
}
