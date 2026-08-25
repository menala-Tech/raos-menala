-- raos_115: runtime fix for native FCM subscription upserts.
--
-- raos_114 introduced platform/token, but the legacy Web Push columns still
-- retained NOT NULL at the column level. That prevents valid FCM-only rows.
-- Also use a normal UNIQUE index on token so PostgREST/Supabase upsert with
-- onConflict: 'token' can infer the conflict target. PostgreSQL UNIQUE permits
-- multiple NULL values, so Web Push rows remain unaffected.

ALTER TABLE public.push_subscriptions
  ALTER COLUMN endpoint DROP NOT NULL,
  ALTER COLUMN p256dh DROP NOT NULL,
  ALTER COLUMN auth DROP NOT NULL;

DROP INDEX IF EXISTS public.push_subscriptions_token_unique;

CREATE UNIQUE INDEX push_subscriptions_token_unique
  ON public.push_subscriptions (token);
