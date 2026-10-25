import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

export default function DashboardPreview() {
  const dark = useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme === "dark");
  return <img className="landing-product" src={dark ? "/paylet-preview-dark.png" : "/paylet-preview.png"} width="1440" height="960" loading="lazy" alt={`Paylet dashboard in ${dark ? "dark" : "light"} mode with example expenses, monthly totals, and shortcuts for shared bills and lending`} />;
}
