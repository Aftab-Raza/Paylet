import { useState } from "react";

export default function PublicAvatar({ name, url }: { name: string; url?: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const safeUrl = url && (/^https:\/\//i.test(url) || /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(url)) ? url : null;
  return <span className="public-avatar" aria-hidden="true">{safeUrl && failedUrl !== safeUrl ? <img src={safeUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(safeUrl)} /> : name.trim().slice(0, 1).toUpperCase() || "P"}</span>;
}
