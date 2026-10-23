"use client"

import { useEffect, useRef, useState } from "react"
import { MessageSquare, Plus, Send } from "lucide-react"
import { useLanguage } from "./language-provider"
import { useAiAvailability } from "./ai-availability-provider"
import { EmptyState, ErrorNotice, Field, LoadingState, PageHeading } from "./feedback"
import { Button } from "./ui/button"
import { Textarea } from "./ui/textarea"
import { jsonBody, requestJson } from "@/lib/client-api"
import { useRemoteData } from "@/lib/use-remote-data"
import { clearRemoteResourceCache } from "@/lib/remote-resource-cache"
import type { AiConversation, AiConversationDetail } from "@/lib/ai/types"

export function AiAssistant() {
  const { assistantEnabled } = useAiAvailability()
  const { t } = useLanguage()
  if (!assistantEnabled) return (
    <div className="space-y-6">
      <PageHeading title={t("ai")} description={t("aiDescription")} />
      <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground sm:p-5">{t("aiDisabled")}</p>
    </div>
  )
  return <AssistantChat />
}

function AssistantChat() {
  const { t } = useLanguage()
  const conversations = useRemoteData<AiConversation[]>("/api/ai/conversations")
  const [selected, setSelected] = useState(() => {
    if (typeof window === "undefined") return ""
    const id = new URLSearchParams(window.location.hash.split("?")[1]).get("conversation")
    return id && /^[a-f0-9-]{36}$/.test(id) ? id : ""
  })
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")
  const conversationId = selected || conversations.data?.[0]?.id || ""

  function reloadConversations() {
    clearRemoteResourceCache()
    conversations.reload()
  }

  async function createConversation() {
    setCreating(true)
    setError("")
    try {
      const conversation = await requestJson<AiConversation>("/api/ai/conversations", jsonBody("POST", { title: t("aiNewConversation") }))
      setSelected(conversation.id)
      reloadConversations()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "serviceUnavailable")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeading title={t("ai")} description={t("aiDescription")}>
        <Button variant="outline" disabled={busy || creating} onClick={() => void createConversation()}>
          <Plus aria-hidden="true" />{t(creating ? "aiCreating" : "aiNewConversation")}
        </Button>
      </PageHeading>
      <ErrorNotice message={error || conversations.error} onRetry={reloadConversations} />
      {conversations.loading ? <LoadingState /> : (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside aria-label={t("aiConversations")} className="min-w-0">
            <h2 className="mb-3 text-sm font-semibold">{t("aiConversations")}</h2>
            <ul className="flex max-h-96 gap-2 overflow-auto lg:flex-col">
              {conversations.data?.map((conversation) => <li key={conversation.id} className="shrink-0 lg:shrink">
                <Button variant="ghost" className={"min-h-11 w-full justify-start text-left " + (conversationId === conversation.id ? "bg-brand-soft text-brand-active" : "")}
                  disabled={busy || creating} aria-current={conversationId === conversation.id ? "true" : undefined}
                  onClick={() => setSelected(conversation.id)}>
                  <MessageSquare aria-hidden="true" className="size-4" /><span className="max-w-44 truncate">{conversation.title}</span>
                </Button>
              </li>)}
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{t("aiHistoryHint")}</p>
          </aside>
          {conversationId ? <Conversation key={conversationId} id={conversationId} onBusy={setBusy} onReply={reloadConversations} /> : (
            <EmptyState title={t("aiStart")} description={t("aiStartHint")}>
              <Button disabled={creating} onClick={() => void createConversation()}>{t("aiNewConversation")}</Button>
            </EmptyState>
          )}
        </div>
      )}
    </div>
  )
}

function Conversation({ id, onBusy, onReply }: { id: string; onBusy: (value: boolean) => void; onReply: () => void }) {
  const { t, locale } = useLanguage()
  const remote = useRemoteData<AiConversationDetail>(`/api/ai/conversations/${id}`)
  const [reply, setReply] = useState<AiConversationDetail | null>(null)
  const [message, setMessage] = useState("")
  const [working, setWorking] = useState(false)
  const [error, setError] = useState("")
  const messageEnd = useRef<HTMLDivElement>(null)
  const submitting = useRef(false)
  const data = reply ?? remote.data
  const busy = working

  useEffect(() => { messageEnd.current?.scrollIntoView({ block: "nearest" }) }, [data?.messages.length])

  async function send() {
    if (submitting.current) return
    submitting.current = true
    setWorking(true)
    onBusy(true)
    setError("")
    try {
      const result = await requestJson<AiConversationDetail>("/api/ai/chat", jsonBody("POST", { conversationId: id, message, locale }))
      setReply(result)
      setMessage("")
      onReply()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "serviceUnavailable")
      clearRemoteResourceCache()
      setReply(null)
      remote.reload()
    } finally {
      submitting.current = false
      setWorking(false)
      onBusy(false)
    }
  }

  return (
    <section aria-label={t("ai")} className="min-w-0 overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3 text-sm sm:px-6">
        <MessageSquare aria-hidden="true" className="size-4 text-brand-active" /><span className="font-medium">{t("ai")}</span>
        <span className="ml-auto text-xs text-muted-foreground">{t("aiLocal")}</span>
      </div>
      <div className="max-h-[65dvh] min-h-48 overflow-y-auto p-4 sm:p-6" role="log" aria-label={t("aiConversations")} aria-live="polite" tabIndex={0}>
        <ErrorNotice message={remote.error} onRetry={remote.reload} />
        {remote.loading ? <LoadingState /> : !data?.messages.length ? <p className="text-sm leading-relaxed text-muted-foreground">{t("aiStartHint")}</p> : (
          <div className="space-y-6">
            {data.messages.map((item) => <article key={item.id} className={item.role === "user" ? "rounded-lg bg-brand-soft p-4" : ""}>
              <h2 className="mb-2 text-xs font-semibold text-muted-foreground">{t(item.role === "user" ? "aiYou" : "ai")}</h2>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{item.content}</p>
              {data.drafts.some((draft) => draft.messageId === item.id && draft.status === "pending") && (
                <a href="/dashboard#transactions" className="mt-3 inline-flex min-h-11 items-center text-sm text-brand-active underline focus-visible:outline-2">{t("aiReviewInTransactions")}</a>
              )}
            </article>)}
          </div>
        )}
        <div ref={messageEnd} />
      </div>
      <div className="space-y-5 border-t p-4 sm:p-6" aria-busy={busy}>
        {working && <p role="status" className="text-sm text-muted-foreground">{t("aiReplying")}</p>}
        <ErrorNotice message={error} />
        <form onSubmit={(event) => { event.preventDefault(); void send() }} className="space-y-3">
          <Field id="ai-message" label={t("aiMessage")}>
            <Textarea id="ai-message" required maxLength={4000} rows={3} value={message} disabled={busy}
              placeholder={t("aiPlaceholder")} onChange={(event) => setMessage(event.target.value)} />
          </Field>
          <Button disabled={busy || !message.trim() || remote.loading || !!remote.error} type="submit"><Send aria-hidden="true" />{t("aiSend")}</Button>
        </form>
      </div>
    </section>
  )
}
