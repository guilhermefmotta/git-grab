import { useEffect } from "react";

const SETTINGS_KEY = "git_rust_settings";
const DEFAULT_FONT  = 13;

export function applySettings(theme: string, fontSize: number) {
  document.documentElement.classList.toggle("light", theme === "light");
  // Scale entire UI proportionally — affects px, rem, everything in WebKit
  document.documentElement.style.zoom = String(fontSize / DEFAULT_FONT);
}

/** Read settings from localStorage and apply once on mount (for sub-windows). */
export function useApplySettings() {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const s   = raw ? JSON.parse(raw) : {};
      applySettings(s.theme ?? "dark", s.fontSize ?? DEFAULT_FONT);
    } catch {}
  }, []);
}
