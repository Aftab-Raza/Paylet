import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme ?? "light", () => "light");
  const next = theme === "dark" ? "light" : "dark";
  function toggle() {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("paylet-theme", next); } catch { /* Theme still works when storage is unavailable. */ }
  }
  return <button type="button" className="theme-toggle button icon-button" onClick={toggle} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`} aria-pressed={theme === "dark"}>{theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}</button>;
}
