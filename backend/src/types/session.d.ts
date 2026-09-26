import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;

    googleOAuth?: {
      state: string;
      nonce: string;
      codeVerifier: string;
      expiresAt: number;
      linkUserId?: string;
    };
  }
}