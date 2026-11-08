export type Theme = "light" | "dark";

const STORAGE_KEY = "core:theme";

export const themeState = $state<{ value: Theme }>({ value: "light" });

let initialized = false;

export function initTheme(): void {
  if (initialized || typeof document === "undefined") return;
  initialized = true;

  const current = document.documentElement.dataset.theme;
  themeState.value = current === "dark" ? "dark" : "light";

  const stored = readStoredTheme();
  if (stored) return;

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", (event) => {
    if (readStoredTheme()) return;
    applyTheme(event.matches ? "dark" : "light", false);
  });
}

export function setTheme(theme: Theme): void {
  applyTheme(theme, true);
}

export function toggleTheme(): void {
  setTheme(themeState.value === "dark" ? "light" : "dark");
}

function applyTheme(theme: Theme, persist: boolean): void {
  themeState.value = theme;

  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }

  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // The theme still applies for this session.
    }
  }
}

function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}
