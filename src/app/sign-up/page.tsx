import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { AuthForm } from "@/components/auth-form"
import { createClient } from "@/lib/supabase/server"
import { safeNextPath } from "@/lib/auth"
import { en } from "@/lib/i18n/en"

export const metadata: Metadata = {
  title: en.signUp,
  description: en.authSignUpDescription,
  robots: { index: false, follow: false },
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect(safeNextPath(params.next))
  return <AuthForm mode="sign-up" next={params.next} />
}
