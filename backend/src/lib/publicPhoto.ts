export function publicPhoto(url: string | null | undefined) {
  if (!url) return null;
  if (/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(url)) return url;
  try { const parsed = new URL(url); return parsed.protocol === "https:" && !parsed.username && !parsed.password ? url : null; } catch { return null; }
}
