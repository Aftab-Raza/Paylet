import { useEffect, useEffectEvent, useId, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

type Props = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
};

export default function Modal({ title, children, onClose, busy = false }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const handleBack = useEffectEvent((event: PopStateEvent) => {
    if (history.state?.payletModal === titleId) return;
    if (busy) {
      event.stopImmediatePropagation();
      history.pushState({ ...history.state, payletModal: titleId }, "", location.href);
    } else onClose();
  });

  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const modalUrl = location.href;
    if (history.state?.payletModal !== titleId) history.pushState({ ...history.state, payletModal: titleId }, "", modalUrl);
    const pop = (event: PopStateEvent) => handleBack(event);
    window.addEventListener("popstate", pop, true);
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      window.removeEventListener("popstate", pop, true);
      // Strict Mode reuses the connected dialog; only a real unmount removes its entry.
      queueMicrotask(() => {
        if (!dialog.isConnected && history.state?.payletModal === titleId && location.href === modalUrl) {
          window.addEventListener("popstate", () => requestAnimationFrame(() => {
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
          }), { once: true });
          history.back();
        }
      });
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [titleId]);

  return (
    <dialog ref={dialogRef} className="paylet-modal" aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
        )).filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="button button-outline icon-button" aria-label="Close dialog"
          title="Close dialog" disabled={busy} onClick={onClose}><X size={20} /></button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
