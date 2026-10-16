"use client"

import { createContext, useContext } from "react"

type AiAvailability = {
  assistantEnabled: boolean
  insightsEnabled: boolean
}

const AiAvailabilityContext = createContext<AiAvailability | null>(null)

export function AiAvailabilityProvider({ children, value }: { children: React.ReactNode; value: AiAvailability }) {
  return <AiAvailabilityContext.Provider value={value}>{children}</AiAvailabilityContext.Provider>
}

export function useAiAvailability() {
  const availability = useContext(AiAvailabilityContext)
  if (!availability) throw new Error("useAiAvailability must be used within AiAvailabilityProvider")
  return availability
}
