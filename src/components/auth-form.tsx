"use client"

import { useRef, useState, useSyncExternalStore, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, EyeOff } from "lucide-react"
import { createClient } from "@/lib/supabase/browser"
import { authErrorKey, safeNextPath } from "@/lib/auth"
import { useLanguage } from "./language-provider"
import { PublicHeader } from "./public-header"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"

function subscribeToClientReady() {
  return () => {}
}

export function AuthForm({
  mode,
  next,
  invalidLink = false,
}: {
  mode: "sign-in" | "sign-up"
  next?: string
  invalidLink?: boolean
}) {
  const { t } = useLanguage()
  const clientReady = useSyncExternalStore(subscribeToClientReady, () => true, () => false)
  const router = useRouter()
  const signingUp = mode === "sign-up"
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(invalidLink ? "authInvalidLink" : "")
  const [sent, setSent] = useState(false)
  const [resent, setResent] = useState(false)
  const confirmationRef = useRef<HTMLInputElement>(null)
  const target = safeNextPath(next)
  const confirmationUrl = () =>
    `${window.location.origin}/auth/confirm?next=${encodeURIComponent(target)}`

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError("")
    if (signingUp && password !== confirmation) {
      setError("authPasswordMismatch")
      confirmationRef.current?.focus()
      return
    }
    setBusy(true)
    try {
      const client = createClient()
      const { data, error: failure } = signingUp
        ? await client.auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: confirmationUrl() },
          })
        : await client.auth.signInWithPassword({
            email: email.trim(),
            password,
          })
      if (failure) {
        setError(authErrorKey(failure.code))
        return
      }
      setPassword("")
      setConfirmation("")
      if (signingUp && !data.session) {
        setSent(true)
        return
      }
      router.replace(target)
      router.refresh()
    } catch {
      setError("authFailed")
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    setBusy(true)
    setError("")
    setResent(false)
    try {
      const { error: failure } = await createClient().auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: confirmationUrl() },
      })
      if (failure) setError(authErrorKey(failure.code))
      else setResent(true)
    } catch {
      setError("authFailed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <PublicHeader />
      <main className="mx-auto max-w-5xl px-5 pb-16 pt-4 sm:px-8 sm:pt-8">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-sm text-brand-active underline underline-offset-4"
        >
          {t("authBackHome")}
        </Link>
        <div className="mt-5 grid items-start gap-8 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <aside className="hidden py-8 lg:block">
            <h2 className="max-w-sm text-3xl font-semibold leading-tight tracking-tight">
              {t("landingTitle")}
            </h2>
            <p className="mt-4 max-w-sm leading-relaxed text-muted-foreground">
              {t("landingDescription")}
            </p>
            <ol className="mt-8 space-y-6">
              {["Account", "Transaction", "Plan"].map((step, index) => (
                <li key={step} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-sm font-medium text-brand-active"
                  >
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">
                      {t("landingStep" + step)}
                    </h3>
                    <p className="mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">
                      {t("landingStep" + step + "Body")}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
          <section className="mx-auto w-full max-w-md rounded-xl border bg-card p-5 sm:p-8">
            <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
              {t(
                sent
                  ? "authCheckEmail"
                  : signingUp
                    ? "authJoin"
                    : "authWelcome",
              )}
            </h1>
            <p className="mt-3 break-words text-sm leading-relaxed text-muted-foreground">
              {t(
                sent
                  ? "authConfirmationSent"
                  : signingUp
                    ? "authSignUpDescription"
                    : "authSignInDescription",
                { email },
              )}
            </p>
            {sent ? (
              <div className="mt-8 space-y-4">
                <Button
                  onClick={resend}
                  disabled={!clientReady || busy}
                  variant="outline"
                  className="min-h-11 w-full"
                >
                  {t(busy ? "authWorking" : "authResend")}
                </Button>
                <Button asChild className="min-h-11 w-full">
                  <Link href={`/sign-in?next=${encodeURIComponent(target)}`}>
                    {t("signIn")}
                  </Link>
                </Button>
              </div>
            ) : (
              <form
                method="post"
                onSubmit={submit}
                className="mt-8 space-y-5"
                aria-busy={busy}
              >
                <div className="space-y-2">
                  <Label htmlFor="auth-email">{t("authEmail")}</Label>
                  <Input
                    id="auth-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    disabled={!clientReady || busy}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="auth-password">{t("authPassword")}</Label>
                  <div className="relative">
                    <Input
                      id="auth-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={
                        signingUp ? "new-password" : "current-password"
                      }
                      required
                      minLength={signingUp ? 8 : undefined}
                      maxLength={128}
                      disabled={!clientReady || busy}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-describedby={signingUp ? "password-hint" : undefined}
                      className="h-12 bg-white pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={t(
                        showPassword ? "authHidePassword" : "authShowPassword",
                      )}
                      aria-pressed={showPassword}
                      className="absolute right-0 top-0 flex size-12 items-center justify-center rounded-md text-slate-600"
                    >
                      {showPassword ? (
                        <EyeOff className="size-5" aria-hidden="true" />
                      ) : (
                        <Eye className="size-5" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {signingUp && (
                    <p id="password-hint" className="text-sm text-slate-600">
                      {t("authPasswordHint")}
                    </p>
                  )}
                </div>
                {signingUp && (
                  <div className="space-y-2">
                    <Label htmlFor="auth-confirm">
                      {t("authConfirmPassword")}
                    </Label>
                    <Input
                      ref={confirmationRef}
                      id="auth-confirm"
                      name="confirm-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      maxLength={128}
                      disabled={!clientReady || busy}
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                      aria-invalid={error === "authPasswordMismatch"}
                      aria-describedby={
                        error === "authPasswordMismatch"
                          ? "auth-error"
                          : undefined
                      }
                      className="h-12 bg-white"
                    />
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={!clientReady || busy}
                  className="min-h-12 w-full bg-brand text-white hover:bg-brand-active"
                >
                  {t(busy ? "authWorking" : signingUp ? "signUp" : "signIn")}
                </Button>
                {(error === "authEmailNotConfirmed" || invalidLink) && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resend}
                    disabled={!clientReady || busy || !email.trim()}
                    className="min-h-11 w-full"
                  >
                    {t("authResend")}
                  </Button>
                )}
              </form>
            )}
            {error && (
              <p
                id="auth-error"
                role="alert"
                className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              >
                {t(error)}
              </p>
            )}
            {resent && (
              <p role="status" className="mt-4 text-sm text-brand-active">
                {t("authResent")}
              </p>
            )}
            {!sent && (
              <p className="mt-8 text-sm text-slate-600">
                {t(signingUp ? "authHasAccount" : "authNoAccount")}{" "}
                <Link
                  className="inline-flex min-h-11 items-center font-medium text-brand-active underline underline-offset-4"
                  href={`${signingUp ? "/sign-in" : "/sign-up"}?next=${encodeURIComponent(target)}`}
                >
                  {t(signingUp ? "signIn" : "signUp")}
                </Link>
              </p>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
