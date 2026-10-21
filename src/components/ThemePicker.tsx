"use client";

import { useSyncExternalStore } from "react";

import { THEME_KEY, type ThemeChoice } from "@/lib/theme";

const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function stored(): ThemeChoice {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system"; // no storage (private mode, previews): follow the device
  }
}

// This page's choice: read from storage once, then kept here so it still works
// when storage doesn't, and updated when another tab changes it.
let current: ThemeChoice | null = null;
const listeners = new Set<() => void>();

function apply(choice: ThemeChoice) {
  current = choice;
  if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY) apply(stored());
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const snapshot = () => (current ??= stored());
const serverSnapshot = (): ThemeChoice => "system";

/** System / Light / Dark, for the "How to play" drawer. */
export function ThemePicker() {
  const theme = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  function choose(choice: ThemeChoice) {
    try {
      if (choice === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, choice);
    } catch {}
    apply(choice);
  }

  return (
    <fieldset className="theme">
      <legend>Appearance</legend>
      {CHOICES.map((c) => (
        <label key={c.value}>
          <input
            type="radio"
            name="theme"
            value={c.value}
            checked={theme === c.value}
            onChange={() => choose(c.value)}
          />
          {c.label}
        </label>
      ))}
    </fieldset>
  );
}
