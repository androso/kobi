export const THEME_STORAGE_KEY = "kobi_theme";

export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function getThemePreference(): ThemePreference {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(storedTheme)) return storedTheme;
  } catch {
    // Storage can be unavailable in privacy-restricted browsers; system preference still works.
  }

  return "system";
}

export function getSystemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyThemePreference(preference: ThemePreference): Theme {
  const theme = preference === "system" ? getSystemTheme() : preference;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  root.dataset.themePreference = preference;
  root.style.colorScheme = theme;
  return theme;
}

export function initializeTheme(): ThemePreference {
  const preference = getThemePreference();
  applyThemePreference(preference);
  return preference;
}

export function saveThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Applying the choice for this session is still useful when persistence is unavailable.
  }
  applyThemePreference(preference);
}
