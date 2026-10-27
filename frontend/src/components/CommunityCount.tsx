import { useEffect, useState } from "react";
import { api } from "../lib/api";
import PublicAvatar from "./PublicAvatar";

export default function CommunityCount({ refreshKey = 0 }: { refreshKey?: number }) {
  const [count, setCount] = useState<number | null>(null);
  const [faces, setFaces] = useState<{ displayName: string; avatarUrl: string }[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    api<{ users: number }>("/community/stats", { signal: controller.signal }).then(({ users }) => {
      if (!controller.signal.aborted && Number.isSafeInteger(users) && users > 0) setCount(users);
    }).catch(() => { /* Omit the claim when the count cannot be verified. */ });
    api<{ users: { displayName: string; avatarUrl: string }[] }>("/community/recent-users", { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted && Array.isArray(result.users)) setFaces(result.users.slice(0, 5));
    }).catch(() => { /* Keep the verified count if community photos are unavailable. */ });
    return () => controller.abort();
  }, [refreshKey]);
  return <div className="landing-community-count" aria-live="polite">{count !== null && <span title="Registered Paylet accounts">{faces.length > 0 && <span className="community-faces" aria-label="Community members who chose to share their photos">{faces.map((face, index) => <PublicAvatar key={index} name={face.displayName} url={face.avatarUrl} />)}</span>}<strong>{count.toLocaleString("en-IN")}+ strong users</strong><span aria-hidden="true">🚀</span></span>}</div>;
}
