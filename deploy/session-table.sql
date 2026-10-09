CREATE TABLE IF NOT EXISTS public.user_sessions (
    sid varchar NOT NULL PRIMARY KEY,
    sess json NOT NULL,
    expire timestamp(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS user_sessions_expire_idx ON public.user_sessions (expire);
