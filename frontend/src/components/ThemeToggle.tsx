import { useState } from "react";
import { Moon, Sun } from "lucide-react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? "light");
  const next = theme === "dark" ? "light" : "dark";
  function toggle() {
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try { localStorage.setItem("paylet-theme", next); } catch { /* Theme still works when storage is unavailable. */ }
  }
  return <button type="button" className="theme-toggle button icon-button" onClick={toggle} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`} aria-pressed={theme === "dark"}>{theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}</button>;
}
