export function resetEmailConfig() {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.PASSWORD_RESET_FROM?.trim();
  const origin = process.env.APP_ORIGIN?.trim();
  if (!key || !from || !origin) return null;
  const url = new URL(origin);
  if (url.origin !== origin || !["http:", "https:"].includes(url.protocol) || (process.env.NODE_ENV === "production" && url.protocol !== "https:")) return null;
  return { key, from, origin };
}
export async function sendResetEmail(email: string, token: string) {
  const config = resetEmailConfig();
  if (!config) throw new Error("ResetEmailUnavailable");
  const url = new URL(config.origin);
  url.searchParams.set("view", "reset");
  // Fragments are not sent to hosting access logs or as HTTP referrers.
  url.hash = new URLSearchParams({ token }).toString();
  const result = await fetch("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: config.from, to: [email], subject: "Reset your Paylet password",
      text: `Use this link to set a new Paylet password: ${url.href}\n\nThis link expires in 30 minutes and works once. If you did not request this, you can ignore this email.` }),
  });
  if (!result.ok) throw new Error("ResetEmailDeliveryFailed");
}
