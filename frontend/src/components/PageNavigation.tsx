import { ChevronLeft, ChevronRight } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { usePageHistory } from "../lib/navigation";

export default function PageNavigation({ onBack, disabled = false, beforeNavigate }: { onBack: () => void; disabled?: boolean; beforeNavigate?: () => boolean }) {
  const { canGoBack, canGoForward } = usePageHistory();
  function go(forward: boolean) {
    if (disabled || beforeNavigate && !beforeNavigate()) return;
    if (forward) { if (canGoForward) history.forward(); }
    else if (canGoBack) history.back();
    else onBack();
  }
  return <nav className="page-navigation" aria-label="Page navigation">
    <button type="button" className="button button-outline icon-button" aria-label="Back" title="Back" disabled={disabled} onClick={() => go(false)}><ChevronLeft size={19} aria-hidden="true"/></button>
    <button type="button" className="button button-outline icon-button" aria-label="Forward" title="Forward" disabled={disabled || !canGoForward} onClick={() => go(true)}><ChevronRight size={19} aria-hidden="true"/></button>
    <ThemeToggle/>
  </nav>;
}
