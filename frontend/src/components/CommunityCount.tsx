import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { api } from "../lib/api";

export default function CommunityCount() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api<{ users: number }>("/community/stats", { signal: controller.signal }).then(({ users }) => {
      if (!controller.signal.aborted && Number.isSafeInteger(users) && users > 0) setCount(users);
    }).catch(() => { /* Omit the claim when the count cannot be verified. */ });
    return () => controller.abort();
  }, []);
  return <div className="landing-community-count" aria-live="polite">{count !== null && <span title="Registered Paylet accounts"><Users size={16} aria-hidden="true" /><strong>{count.toLocaleString("en-IN")}+ strong users</strong><span aria-hidden="true">🚀</span></span>}</div>;
}
