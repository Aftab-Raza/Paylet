import { useEffect, useState } from "react";
import { api } from "../lib/api";

export type GroupInvitation = {
  id: string;
  group: { id: string; name: string; owner: { displayName: string; username: string } };
};

export function notifyGroupInvitationsChanged() {
  window.dispatchEvent(new Event("paylet:invitations"));
}

export function useGroupInvitations() {
  const [invitations, setInvitations] = useState<GroupInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let current: AbortController | null = null;
    function refresh() {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      api<{ invitations: GroupInvitation[] }>("/groups/invitations", { signal: controller.signal })
        .then((result) => {
          if (!active || controller.signal.aborted) return;
          setInvitations(result.invitations);
          setError("");
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (!active || controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : "Unable to check invitations.");
          setLoading(false);
        });
    }
    function whenVisible() { if (!document.hidden) refresh(); }
    refresh();
    const timer = window.setInterval(whenVisible, 20000);
    window.addEventListener("focus", whenVisible);
    window.addEventListener("paylet:invitations", refresh);
    document.addEventListener("visibilitychange", whenVisible);
    return () => {
      active = false;
      current?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", whenVisible);
      window.removeEventListener("paylet:invitations", refresh);
      document.removeEventListener("visibilitychange", whenVisible);
    };
  }, []);
  return { invitations, loading, error, refresh: notifyGroupInvitationsChanged };
}
