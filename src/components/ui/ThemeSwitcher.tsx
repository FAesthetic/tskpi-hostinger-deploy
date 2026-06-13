"use client";

import { MonitorCog, Moon, Sparkles, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type ThemeKey = "dark" | "light" | "tstyle" | "focus";

const themes: Array<{
  key: ThemeKey;
  label: string;
  icon: typeof Moon;
}> = [
  { key: "dark", label: "Dark", icon: Moon },
  { key: "light", label: "Light", icon: Sun },
  { key: "tstyle", label: "T-Style", icon: MonitorCog },
  { key: "focus", label: "Focus", icon: Sparkles }
];

const storageKey = "tskpi.theme";

export function ThemeSwitcher({ mode = "full" }: { mode?: "compact" | "full" }) {
  const [theme, setTheme] = useState<ThemeKey>("dark");
  const visibleThemes = mode === "compact" ? themes.filter((item) => item.key === "dark" || item.key === "light") : themes;

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(storageKey) as ThemeKey | null;
    const initialTheme = savedTheme && themes.some((item) => item.key === savedTheme) ? savedTheme : "dark";

    setTheme(initialTheme);
    document.documentElement.dataset.theme = initialTheme;
  }, []);

  function selectTheme(nextTheme: ThemeKey) {
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(storageKey, nextTheme);
  }

  return (
    <div className="theme-switcher" aria-label="Darstellung waehlen">
      {visibleThemes.map((item) => {
        const Icon = item.icon;
        const isActive = item.key === theme;

        return (
          <button
            aria-pressed={isActive}
            className="theme-switcher__button"
            key={item.key}
            onClick={() => selectTheme(item.key)}
            title={item.label}
            type="button"
          >
            <Icon aria-hidden className="h-4 w-4" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
