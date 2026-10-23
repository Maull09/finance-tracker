export type Theme = "light" | "dark" | "system"

function parseTheme(value: string | null | undefined): Theme {
  return value === "light" || value === "dark" ? value : "system"
}

export function currentTheme(): Theme {
  return parseTheme(document.documentElement.dataset.theme)
}

function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.dataset.theme = theme
  document.documentElement.classList.toggle("dark", dark)
  document.documentElement.style.colorScheme = dark ? "dark" : "light"
}

export function setTheme(theme: Theme) {
  try { window.localStorage.setItem("theme", theme) } catch { /* Appearance remains usable when storage is blocked. */ }
  applyTheme(theme)
  window.dispatchEvent(new Event("theme-change"))
}

export function subscribeTheme(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)")
  const onSystemChange = () => applyTheme(currentTheme())
  const onStorageChange = (event: StorageEvent) => {
    if (event.key !== "theme" && event.key !== null) return
    applyTheme(parseTheme(event.newValue))
    onChange()
  }
  media.addEventListener("change", onSystemChange)
  window.addEventListener("storage", onStorageChange)
  window.addEventListener("theme-change", onChange)
  return () => {
    media.removeEventListener("change", onSystemChange)
    window.removeEventListener("storage", onStorageChange)
    window.removeEventListener("theme-change", onChange)
  }
}

export const themeInitializationScript = `(function(){var theme="system";try{var saved=localStorage.getItem("theme");if(saved==="light"||saved==="dark")theme=saved}catch{}var root=document.documentElement;var dark=theme==="dark"||(theme==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);root.dataset.theme=theme;root.classList.toggle("dark",dark);root.style.colorScheme=dark?"dark":"light"})()`
