// Stable A–Z palette: each letter keeps the same solid color in either theme.
const alphabetColors = [
  "#7c3aed", "#1d4ed8", "#047857", "#b45309", "#be185d", "#0e7490",
  "#6d28d9", "#0369a1", "#15803d", "#a16207", "#9f1239", "#4338ca",
  "#0f766e", "#a21caf", "#c2410c", "#2563eb", "#7e22ce", "#b91c1c",
  "#166534", "#0c4a6e", "#86198f", "#92400e", "#3730a3", "#115e59",
  "#831843", "#075985",
] as const;

export function alphabetAvatar(name: string) {
  const trimmed = name.trim();
  const initial = trimmed.normalize("NFD").replace(/[\u0300-\u036f]/g, "").charAt(0).toUpperCase();
  const index = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(initial);
  if (initial && index >= 0) return { initial, color: alphabetColors[index] };
  return { initial: /^\p{L}/u.test(trimmed) ? Array.from(trimmed)[0]!.toUpperCase() : "#", color: "#475569" };
}
