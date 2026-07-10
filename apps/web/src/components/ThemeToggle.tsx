import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { initializeTheme, saveTheme, type Theme } from "../lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => initializeTheme());
  const nextTheme = theme === "dark" ? "light" : "dark";
  const nextThemeLabel = nextTheme === "dark" ? "oscuro" : "claro";

  function toggleTheme() {
    saveTheme(nextTheme);
    setTheme(nextTheme);
  }

  return (
    <button
      aria-label={`Cambiar a modo ${nextThemeLabel}`}
      aria-pressed={theme === "dark"}
      className="theme-toggle"
      onClick={toggleTheme}
      title={`Cambiar a modo ${nextThemeLabel}`}
      type="button"
    >
      {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      <span>{theme === "dark" ? "Claro" : "Oscuro"}</span>
    </button>
  );
}
