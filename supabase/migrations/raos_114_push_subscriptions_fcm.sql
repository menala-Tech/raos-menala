-- raos_114: extend push_subscriptions for hybrid Web Push (VAPID) + FCM tokens.
--
-- Durable contract:
--   platform = 'web'  -> endpoint, p256dh, auth required (legacy web push)
--   platform = 'fcm'  -> token required (Android native FCM)
--
-- Do not apply to production until reviewed. Source migration only.

DO $$
BEGIN
  -- Add platform discriminator if missing. Default 'web' keeps every existing row valid.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'push_subscriptions'
      AND column_name = 'platform'
  ) THEN
    ALTER TABLE public.push_subscriptions
      ADD COLUMN platform text NOT NULL DEFAULT 'web'
        CHECK (platform IN ('web', 'fcm'));
  END IF;

  -- Add FCM registration token if missing.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'push_subscriptions'
      AND column_name = 'token'
  ) THEN
    ALTER TABLE public.push_subscriptions
      ADD COLUMN token text;
  END IF;
END $$;

-- Ensure exactly one platform's required fields are present per row.
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_platform_fields_check;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_platform_fields_check
    CHECK (
      (platform = 'web' AND endpoint IS NOT NULL AND p256dh IS NOT NULL AND auth IS NOT NULL)
      OR
      (platform = 'fcm' AND token IS NOT NULL)
    );

-- Deduplicate FCM tokens. Web rows already rely on the existing endpoint unique key.
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_token_unique
  ON public.push_subscriptions (token)
  WHERE token IS NOT NULL;
