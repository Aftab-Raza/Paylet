import "dotenv/config";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";

const secret = process.env.SESSION_SECRET;
const connectionString = process.env.DATABASE_URL;

if (!secret || secret.length < 32) {
  throw new Error("SESSION_SECRET must contain at least 32 characters");
}

if (!connectionString) {
  throw new Error("DATABASE_URL is missing");
}

const PgSession = connectPgSimple(session);

const sessionPool = new pg.Pool({
  connectionString,
});

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export const sessionMiddleware = session({
  name: "paylet.sid",
  secret,
  store: new PgSession({
    pool: sessionPool,
    tableName: "user_sessions",
    createTableIfMissing: true,
  }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    ...sessionCookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});