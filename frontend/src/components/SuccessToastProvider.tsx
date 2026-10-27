import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, X } from "lucide-react";
import { SuccessToastContext } from "../lib/successToast";
import type { SuccessToastOptions } from "../lib/successToast";
import "./success-toast.css";

function SuccessToast({ message, onDismiss, position }: { message: string; onDismiss: () => void; position: SuccessToastOptions["position"] }) {
  const remaining = useRef(3000);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  useEffect(() => {
    if (paused) return;
    const started = performance.now();
    const timer = window.setTimeout(onDismiss, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (performance.now() - started));
    };
  }, [paused, onDismiss]);
  return <div className={`success-toast${position === "top-right" ? " success-toast-top" : ""}`} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <CheckCircle2 className="success-toast-icon" size={23} aria-hidden="true" />
    <p role="status" aria-live="polite" aria-atomic="true">{message}</p>
    <button type="button" className="success-toast-close" aria-label="Dismiss notification" onClick={onDismiss}><X size={18} aria-hidden="true" /></button>
    <span className="success-toast-track" aria-hidden="true"><span style={{ animationPlayState: paused ? "paused" : "running" }} /></span>
  </div>;
}

export default function SuccessToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string; position: SuccessToastOptions["position"] } | null>(null);
  const sequence = useRef(0);
  const notify = useCallback((message: string, options?: SuccessToastOptions) => setToast({ id: ++sequence.current, message, position: options?.position }), []);
  const dismiss = useCallback(() => setToast(null), []);
  return <SuccessToastContext.Provider value={notify}>{children}{toast && <SuccessToast key={toast.id} message={toast.message} position={toast.position} onDismiss={dismiss} />}</SuccessToastContext.Provider>;
}
