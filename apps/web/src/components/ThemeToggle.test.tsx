import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_STORAGE_KEY } from "../lib/theme";
import { ThemeToggle } from "./ThemeToggle";

const themeStyles = readFileSync(`${process.cwd()}/src/index.css`, "utf8");
let systemPrefersDark = false;
let systemThemeListeners = new Set<(event: MediaQueryListEvent) => void>();

function setSystemTheme(prefersDark: boolean) {
  systemPrefersDark = prefersDark;
  systemThemeListeners = new Set();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      get matches() {
        return query === "(prefers-color-scheme: dark)" && systemPrefersDark;
      },
      media: query,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        systemThemeListeners.add(listener);
      },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        systemThemeListeners.delete(listener);
      },
    })),
  });
}

function changeSystemTheme(prefersDark: boolean) {
  systemPrefersDark = prefersDark;
  const event = { matches: prefersDark, media: "(prefers-color-scheme: dark)" } as MediaQueryListEvent;
  systemThemeListeners.forEach((listener) => listener(event));
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = "";
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.themePreference;
    document.documentElement.style.colorScheme = "";
    setSystemTheme(false);
  });

  it("uses the system preference by default without persisting an implicit choice", () => {
    setSystemTheme(true);

    render(<ThemeToggle />);

    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement).toHaveAttribute("data-theme-preference", "system");
    expect(screen.getByRole("button", { name: "Usar tema sistema" })).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("uses a saved light choice instead of the system dark preference", () => {
    setSystemTheme(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");

    render(<ThemeToggle />);

    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(screen.getByRole("button", { name: "Usar tema claro" })).toHaveAttribute("aria-pressed", "true");
  });

  it("persists an explicit dark choice", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Usar tema oscuro" }));

    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("can return to system mode and follows system changes", async () => {
    const user = userEvent.setup();
    setSystemTheme(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Usar tema sistema" }));

    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");

    act(() => changeSystemTheme(false));

    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("keeps neutral hover text readable in dark mode", () => {
    expect(themeStyles).toContain('.dark [class~="hover:text-slate-900"]:hover');
    expect(themeStyles).toContain('.dark [class~="hover:text-slate-950"]:hover');
    expect(themeStyles).toContain('color: hsl(var(--theme-text));');
  });
});
