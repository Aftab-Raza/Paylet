try {
  const saved = localStorage.getItem("paylet-theme");
  document.documentElement.dataset.theme = saved === "dark" || saved === "light"
    ? saved : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
} catch {
  document.documentElement.dataset.theme = "light";
}
