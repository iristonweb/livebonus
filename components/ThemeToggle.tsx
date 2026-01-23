"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = (localStorage.getItem("allin_theme") as Theme | null) ?? "dark";
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("allin_theme", next);
    document.documentElement.dataset.theme = next;
  }

  return (
    <button className="btn btnSmall btnGhost" onClick={toggle} aria-label="Переключить тему">
      {theme === "dark" ? "Светлая тема" : "Тёмная тема"}
    </button>
  );
}
