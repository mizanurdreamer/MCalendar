"use client";

import * as React from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "bookingcalendar-theme";

function getPreferredTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem(STORAGE_KEY);
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  const root = window.document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.style.colorScheme = theme;
  window.localStorage.setItem(STORAGE_KEY, theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<Theme>("light");

  React.useEffect(() => {
    const initialTheme = getPreferredTheme();
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  const handleChange = (nextTheme: Theme) => {
    setTheme(nextTheme);
    applyTheme(nextTheme);
  };

  return (
    <div className="fixed right-4 top-4 z-50">
      <label className="flex items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-2 text-sm shadow-sm backdrop-blur">
        <span className="font-medium text-foreground">Theme</span>
        <select
          aria-label="Select theme"
          value={theme}
          onChange={(event) => handleChange(event.target.value as Theme)}
          className="rounded-full border-none bg-transparent text-sm font-medium text-foreground outline-none"
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
    </div>
  );
}
