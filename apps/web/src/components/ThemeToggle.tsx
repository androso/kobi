import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import {
  applyThemePreference,
  initializeTheme,
  saveThemePreference,
  type ThemePreference,
} from "../lib/theme";

const themeOptions: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
];

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>(() => initializeTheme());

  useEffect(() => {
    if (preference !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncWithSystem = () => applyThemePreference("system");
    mediaQuery.addEventListener?.("change", syncWithSystem);

    return () => mediaQuery.removeEventListener?.("change", syncWithSystem);
  }, [preference]);

  function selectTheme(nextPreference: ThemePreference) {
    saveThemePreference(nextPreference);
    setPreference(nextPreference);
  }

  return (
    <div aria-label="Tema de color" className="theme-picker" role="group">
      {themeOptions.map(({ value, label, icon: Icon }) => (
        <button
          aria-label={`Usar tema ${label.toLowerCase()}`}
          aria-pressed={preference === value}
          className="theme-option"
          key={value}
          onClick={() => selectTheme(value)}
          title={`Usar tema ${label.toLowerCase()}`}
          type="button"
        >
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
