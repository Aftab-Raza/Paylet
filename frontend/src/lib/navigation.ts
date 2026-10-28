import { useEffect, useSyncExternalStore } from "react";

const navigationEvent = "paylet:navigate";
let navigationGuard: (() => boolean) | null = null;
let previousUrl = location.href;
let previousState = history.state;
window.addEventListener("popstate", (event) => {
  if (navigationGuard && !navigationGuard()) {
    event.stopImmediatePropagation();
    history.pushState(previousState, "", previousUrl);
    return;
  }
  previousUrl = location.href;
  previousState = history.state;
}, true);
export function useNavigationGuard(guard: () => boolean) {
  useEffect(() => { navigationGuard = guard; return () => { navigationGuard = null; }; }, [guard]);
}
function subscribe(callback: () => void) {
  previousUrl = location.href;
  previousState = history.state;
  window.addEventListener("popstate", callback);
  window.addEventListener(navigationEvent, callback);
  return () => { window.removeEventListener("popstate", callback); window.removeEventListener(navigationEvent, callback); };
}
function changeUrl(url: URL) {
  if (url.href === window.location.href) return;
  if (window.history.state?.payletParent === url.href) { window.history.back(); return; }
  if (navigationGuard && !navigationGuard()) return;
  window.history.pushState({ payletParent: window.location.href }, "", url);
  previousUrl = location.href;
  previousState = history.state;
  window.dispatchEvent(new Event(navigationEvent));
  window.scrollTo(0, 0);
}
export function openScreen(screen: string, details: Record<string, string> = {}) {
  const url = new URL(window.location.href);
  url.searchParams.set("view", "dashboard");
  for (const key of ["screen", "person", "group", "logMonth"]) url.searchParams.delete(key);
  if (screen !== "dashboard") url.searchParams.set("screen", screen);
  for (const [key, value] of Object.entries(details)) url.searchParams.set(key, value);
  changeUrl(url);
}
export function useScreen(name: string): [boolean, (open: boolean) => void] {
  const screen = useSyncExternalStore(subscribe, () => new URLSearchParams(location.search).get("screen") ?? "dashboard");
  return [screen === name, (open) => openScreen(open ? name : "dashboard")];
}
export function useHistoryParam(key: string): [string | null, (value: string | null) => void] {
  const value = useSyncExternalStore(subscribe, () => new URLSearchParams(location.search).get(key));
  return [value, (next) => {
    const url = new URL(window.location.href);
    if (next === null) url.searchParams.delete(key); else url.searchParams.set(key, next);
    changeUrl(url);
  }];
}
