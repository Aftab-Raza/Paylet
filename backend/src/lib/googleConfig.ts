export function googleConfig(env: NodeJS.ProcessEnv) {
  const appOrigin = env.APP_ORIGIN?.trim();
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!appOrigin || !clientId || !clientSecret) {
    throw new Error("APP_ORIGIN, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required");
  }
  const origin = new URL(appOrigin);
  if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== appOrigin) {
    throw new Error("APP_ORIGIN must be an exact HTTP(S) origin");
  }
  const expected = `${appOrigin}/api/auth/google/callback`;
  const redirectUri = env.GOOGLE_REDIRECT_URI?.trim() || expected;
  if (redirectUri !== expected) {
    throw new Error(`GOOGLE_REDIRECT_URI must be ${expected}. Register that exact URI on the matching Google Web OAuth client.`);
  }
  return { appOrigin, clientId, clientSecret, redirectUri };
}
