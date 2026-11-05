import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Menu } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

export default function MobileActions({ children }: { children: ReactNode }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      if (!detailsRef.current?.contains(event.target as Node)) {
        detailsRef.current?.removeAttribute("open");
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && detailsRef.current?.open) {
        detailsRef.current.removeAttribute("open");
        detailsRef.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div className="app-navigation">
      <div className="desktop-actions">{children}</div>
      <div className="mobile-actions">
        <ThemeToggle/>
        <details ref={detailsRef} className="mobile-menu">
          <summary><Menu size={18} aria-hidden="true"/><span>Menu</span></summary>
          <div className="mobile-menu-panel" onClick={(event) => {
            if ((event.target as HTMLElement).closest("button, a")) {
              detailsRef.current?.removeAttribute("open");
              detailsRef.current?.querySelector("summary")?.focus();
            }
          }}>
            {children}
          </div>
        </details>
      </div>
    </div>
  );
}
