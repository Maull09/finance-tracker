import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AuthProvider } from "@/components/auth-provider"
import { AiAvailabilityProvider } from "@/components/ai-availability-provider"
import { SessionGuard } from "@/components/session-guard"
import { ollamaEnabled, redisEnabled } from "@/lib/server/service-config"
import { en } from "@/lib/i18n/en"

export const metadata: Metadata = {
  title: en.dashboard,
  description: en.dashboardDescription,
  robots: { index: false, follow: false },
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) redirect("/sign-in")
  const assistantEnabled = ollamaEnabled()
  return (
    <AuthProvider>
      <AiAvailabilityProvider value={{ assistantEnabled, insightsEnabled: assistantEnabled && redisEnabled() }}>
        <SessionGuard userId={user.id}>{children}</SessionGuard>
      </AiAvailabilityProvider>
    </AuthProvider>
  )
}
