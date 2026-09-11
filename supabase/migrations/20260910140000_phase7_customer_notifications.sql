-- Phase 7: optional customer email + notification outbox (queue transitions remain authoritative).

-- ---------------------------------------------------------------------------
-- queue_entries: optional email + preference flag
-- ---------------------------------------------------------------------------

ALTER TABLE public.queue_entries
  ADD COLUMN customer_email text,
  ADD COLUMN email_notifications_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.queue_entries
  ADD CONSTRAINT queue_entries_email_notifications_require_email
  CHECK (
    (
      email_notifications_enabled = false
      AND customer_email IS NULL
    )
    OR (
      email_notifications_enabled = true
      AND customer_email IS NOT NULL
      AND length(trim(customer_email)) > 0
    )
  );

REVOKE ALL ON TABLE public.queue_entries FROM authenticated;
GRANT SELECT (
  id,
  public_id,
  business_id,
  queue_id,
  customer_name,
  customer_phone,
  customer_email,
  email_notifications_enabled,
  queue_number,
  status,
  joined_at,
  called_at,
  serving_at,
  completed_at
) ON TABLE public.queue_entries TO authenticated;

-- ---------------------------------------------------------------------------
-- Enums + outbox table
-- ---------------------------------------------------------------------------

CREATE TYPE public.customer_notification_type AS ENUM (
  'called',
  'completed',
  'skipped',
  'cancelled'
);

CREATE TYPE public.customer_notification_channel AS ENUM (
  'email'
);

CREATE TYPE public.customer_notification_status AS ENUM (
  'pending',
  'sending',
  'sent',
  'failed'
);

CREATE TABLE public.customer_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_entry_id uuid NOT NULL REFERENCES public.queue_entries (id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  type public.customer_notification_type NOT NULL,
  channel public.customer_notification_channel NOT NULL DEFAULT 'email',
  recipient text NOT NULL,
  status public.customer_notification_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  provider_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_notifications_recipient_not_blank CHECK (length(trim(recipient)) > 0),
  CONSTRAINT customer_notifications_attempts_non_negative CHECK (attempts >= 0),
  CONSTRAINT customer_notifications_unique_event UNIQUE (queue_entry_id, type, channel)
);

CREATE INDEX customer_notifications_business_id_idx
  ON public.customer_notifications (business_id);

CREATE INDEX customer_notifications_status_created_idx
  ON public.customer_notifications (status, created_at);

CREATE INDEX customer_notifications_queue_entry_id_idx
  ON public.customer_notifications (queue_entry_id);

ALTER TABLE public.customer_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_notifications FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.customer_notifications FROM PUBLIC;
REVOKE ALL ON TABLE public.customer_notifications FROM anon;
REVOKE ALL ON TABLE public.customer_notifications FROM authenticated;

-- Members may read notification metadata for operational visibility (no secrets).
GRANT SELECT (
  id,
  queue_entry_id,
  business_id,
  type,
  channel,
  recipient,
  status,
  attempts,
  provider_message_id,
  last_error,
  created_at,
  sent_at,
  updated_at
) ON TABLE public.customer_notifications TO authenticated;

CREATE POLICY customer_notifications_select_member
  ON public.customer_notifications
  FOR SELECT
  TO authenticated
  USING (public.is_business_member(business_id));

GRANT USAGE ON TYPE public.customer_notification_type TO authenticated, anon;
GRANT USAGE ON TYPE public.customer_notification_channel TO authenticated, anon;
GRANT USAGE ON TYPE public.customer_notification_status TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- Enqueue helper (SECURITY DEFINER; called only from trusted RPCs)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_customer_notification(
  p_entry_id uuid,
  p_type public.customer_notification_type
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.queue_entries%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT e.*
  INTO v_entry
  FROM public.queue_entries e
  WHERE e.id = p_entry_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT COALESCE(v_entry.email_notifications_enabled, false)
     OR v_entry.customer_email IS NULL
     OR length(trim(v_entry.customer_email)) = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.customer_notifications (
    queue_entry_id,
    business_id,
    type,
    channel,
    recipient,
    status
  ) VALUES (
    v_entry.id,
    v_entry.business_id,
    p_type,
    'email',
    lower(trim(v_entry.customer_email)),
    'pending'
  )
  ON CONFLICT (queue_entry_id, type, channel) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_customer_notification(uuid, public.customer_notification_type) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_customer_notification(uuid, public.customer_notification_type) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Claim / finalize delivery (member-scoped or ticket-token scoped)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_customer_notifications_for_entry(
  p_entry_id uuid
)
RETURNS TABLE (
  id uuid,
  type public.customer_notification_type,
  channel public.customer_notification_channel,
  recipient text,
  attempts integer,
  business_name text,
  queue_name text,
  queue_number integer,
  public_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.queue_entries%ROWTYPE;
  v_max_attempts integer := 3;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT e.*
  INTO v_entry
  FROM public.queue_entries e
  WHERE e.id = p_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue entry not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_business_member(v_entry.business_id) THEN
    RAISE EXCEPTION 'Not a member of this business'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH claimed AS (
    UPDATE public.customer_notifications n
    SET
      status = 'sending',
      attempts = n.attempts + 1,
      updated_at = now(),
      last_error = NULL
    WHERE n.id IN (
      SELECT c.id
      FROM public.customer_notifications c
      WHERE c.queue_entry_id = p_entry_id
        AND c.channel = 'email'
        AND (
          c.status = 'pending'
          OR (c.status = 'failed' AND c.attempts < v_max_attempts)
        )
      ORDER BY c.created_at ASC
      FOR UPDATE SKIP LOCKED
    )
    RETURNING n.*
  )
  SELECT
    claimed.id,
    claimed.type,
    claimed.channel,
    claimed.recipient,
    claimed.attempts,
    b.name,
    q.name,
    v_entry.queue_number,
    v_entry.public_id
  FROM claimed
  JOIN public.businesses b ON b.id = claimed.business_id
  JOIN public.queues q ON q.id = v_entry.queue_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_customer_notifications_for_entry(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_customer_notifications_for_entry(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_customer_notifications_for_entry(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_customer_notifications_for_ticket(
  p_public_id uuid,
  p_access_token text
)
RETURNS TABLE (
  id uuid,
  type public.customer_notification_type,
  channel public.customer_notification_channel,
  recipient text,
  attempts integer,
  business_name text,
  queue_name text,
  queue_number integer,
  public_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_entry public.queue_entries%ROWTYPE;
  v_token_hash text;
  v_max_attempts integer := 3;
BEGIN
  IF p_public_id IS NULL OR p_access_token IS NULL OR length(trim(p_access_token)) = 0 THEN
    RAISE EXCEPTION 'Invalid ticket credentials'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_token_hash := encode(extensions.digest(trim(p_access_token), 'sha256'), 'hex');

  SELECT e.*
  INTO v_entry
  FROM public.queue_entries e
  WHERE e.public_id = p_public_id
    AND e.access_token_hash = v_token_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN QUERY
  WITH claimed AS (
    UPDATE public.customer_notifications n
    SET
      status = 'sending',
      attempts = n.attempts + 1,
      updated_at = now(),
      last_error = NULL
    WHERE n.id IN (
      SELECT c.id
      FROM public.customer_notifications c
      WHERE c.queue_entry_id = v_entry.id
        AND c.channel = 'email'
        AND (
          c.status = 'pending'
          OR (c.status = 'failed' AND c.attempts < v_max_attempts)
        )
      ORDER BY c.created_at ASC
      FOR UPDATE SKIP LOCKED
    )
    RETURNING n.*
  )
  SELECT
    claimed.id,
    claimed.type,
    claimed.channel,
    claimed.recipient,
    claimed.attempts,
    b.name,
    q.name,
    v_entry.queue_number,
    v_entry.public_id
  FROM claimed
  JOIN public.businesses b ON b.id = claimed.business_id
  JOIN public.queues q ON q.id = v_entry.queue_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_customer_notifications_for_ticket(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_customer_notifications_for_ticket(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.finalize_customer_notification(
  p_notification_id uuid,
  p_success boolean,
  p_provider_message_id text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.customer_notifications%ROWTYPE;
  v_safe_error text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT n.*
  INTO v_row
  FROM public.customer_notifications n
  WHERE n.id = p_notification_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_business_member(v_row.business_id) THEN
    RAISE EXCEPTION 'Not a member of this business'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_row.status IS DISTINCT FROM 'sending' THEN
    RETURN false;
  END IF;

  v_safe_error := left(trim(COALESCE(p_error, '')), 200);
  IF v_safe_error = '' THEN
    v_safe_error := NULL;
  END IF;

  IF p_success THEN
    UPDATE public.customer_notifications
    SET
      status = 'sent',
      provider_message_id = NULLIF(left(trim(COALESCE(p_provider_message_id, '')), 200), ''),
      last_error = NULL,
      sent_at = now(),
      updated_at = now()
    WHERE id = v_row.id;
    RETURN true;
  END IF;

  UPDATE public.customer_notifications
  SET
    status = 'failed',
    last_error = COALESCE(v_safe_error, 'Delivery failed'),
    updated_at = now()
  WHERE id = v_row.id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_customer_notification(uuid, boolean, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_customer_notification(uuid, boolean, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_customer_notification(uuid, boolean, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_customer_notification_for_ticket(
  p_notification_id uuid,
  p_public_id uuid,
  p_access_token text,
  p_success boolean,
  p_provider_message_id text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row public.customer_notifications%ROWTYPE;
  v_entry public.queue_entries%ROWTYPE;
  v_token_hash text;
  v_safe_error text;
BEGIN
  IF p_public_id IS NULL OR p_access_token IS NULL OR length(trim(p_access_token)) = 0 THEN
    RAISE EXCEPTION 'Invalid ticket credentials'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_token_hash := encode(extensions.digest(trim(p_access_token), 'sha256'), 'hex');

  SELECT e.*
  INTO v_entry
  FROM public.queue_entries e
  WHERE e.public_id = p_public_id
    AND e.access_token_hash = v_token_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT n.*
  INTO v_row
  FROM public.customer_notifications n
  WHERE n.id = p_notification_id
    AND n.queue_entry_id = v_entry.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_row.status IS DISTINCT FROM 'sending' THEN
    RETURN false;
  END IF;

  v_safe_error := left(trim(COALESCE(p_error, '')), 200);
  IF v_safe_error = '' THEN
    v_safe_error := NULL;
  END IF;

  IF p_success THEN
    UPDATE public.customer_notifications
    SET
      status = 'sent',
      provider_message_id = NULLIF(left(trim(COALESCE(p_provider_message_id, '')), 200), ''),
      last_error = NULL,
      sent_at = now(),
      updated_at = now()
    WHERE id = v_row.id;
    RETURN true;
  END IF;

  UPDATE public.customer_notifications
  SET
    status = 'failed',
    last_error = COALESCE(v_safe_error, 'Delivery failed'),
    updated_at = now()
  WHERE id = v_row.id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_customer_notification_for_ticket(uuid, uuid, text, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_customer_notification_for_ticket(uuid, uuid, text, boolean, text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- join_queue: optional email
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.join_queue(uuid, text, text);

CREATE FUNCTION public.join_queue(
  p_queue_id uuid,
  p_customer_name text,
  p_customer_phone text DEFAULT NULL,
  p_customer_email text DEFAULT NULL
)
RETURNS TABLE (
  public_id uuid,
  access_token text,
  queue_number integer,
  status public.entry_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_queue public.queues%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_name text;
  v_phone text;
  v_email text;
  v_notify boolean := false;
  v_token text;
  v_token_hash text;
  v_public_id uuid;
  v_number integer;
BEGIN
  v_name := trim(COALESCE(p_customer_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'Customer name is required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Customer name is too long'
      USING ERRCODE = 'check_violation';
  END IF;

  v_phone := NULLIF(trim(COALESCE(p_customer_phone, '')), '');
  IF v_phone IS NOT NULL AND char_length(v_phone) > 32 THEN
    RAISE EXCEPTION 'Customer phone is too long'
      USING ERRCODE = 'check_violation';
  END IF;

  v_email := lower(trim(COALESCE(p_customer_email, '')));
  IF v_email = '' THEN
    v_email := NULL;
  ELSE
    IF position('@' IN v_email) = 0
       OR position(' ' IN v_email) > 0
       OR char_length(v_email) > 254 THEN
      RAISE EXCEPTION 'A valid email is required'
        USING ERRCODE = 'check_violation';
    END IF;
    v_notify := true;
  END IF;

  SELECT *
  INTO v_queue
  FROM public.queues q
  WHERE q.id = p_queue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_queue.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Queue is not open'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT *
  INTO v_service
  FROM public.services s
  WHERE s.id = v_queue.service_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found for queue'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_service.business_id IS DISTINCT FROM v_queue.business_id THEN
    RAISE EXCEPTION 'Queue/service business mismatch'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT v_service.is_active THEN
    RAISE EXCEPTION 'Service is inactive'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.queues q
  SET current_number = q.current_number + 1,
      updated_at = now()
  WHERE q.id = v_queue.id
  RETURNING q.current_number INTO v_number;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  v_public_id := gen_random_uuid();

  INSERT INTO public.queue_entries (
    public_id,
    business_id,
    queue_id,
    customer_name,
    customer_phone,
    customer_email,
    email_notifications_enabled,
    queue_number,
    status,
    access_token_hash
  ) VALUES (
    v_public_id,
    v_queue.business_id,
    v_queue.id,
    v_name,
    v_phone,
    v_email,
    v_notify,
    v_number,
    'waiting',
    v_token_hash
  );

  RETURN QUERY
  SELECT
    v_public_id,
    v_token,
    v_number,
    'waiting'::public.entry_status;
END;
$$;

REVOKE ALL ON FUNCTION public.join_queue(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_queue(uuid, text, text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- cancel_ticket: enqueue cancelled (not skipped)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_ticket(
  p_public_id uuid,
  p_access_token text
)
RETURNS TABLE (
  public_id uuid,
  queue_number integer,
  status public.entry_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_entry public.queue_entries%ROWTYPE;
  v_token_hash text;
BEGIN
  IF p_public_id IS NULL OR p_access_token IS NULL OR length(trim(p_access_token)) = 0 THEN
    RAISE EXCEPTION 'Invalid ticket credentials'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_token_hash := encode(extensions.digest(p_access_token, 'sha256'), 'hex');

  SELECT e.*
  INTO v_entry
  FROM public.queue_entries e
  WHERE e.public_id = p_public_id
    AND e.access_token_hash = v_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_entry.status IS DISTINCT FROM 'waiting' THEN
    RAISE EXCEPTION 'Only waiting tickets can be cancelled'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.queue_entries e
  SET status = 'skipped',
      completed_at = now()
  WHERE e.id = v_entry.id;

  PERFORM public.enqueue_customer_notification(v_entry.id, 'cancelled');

  RETURN QUERY
  SELECT e.public_id, e.queue_number, e.status
  FROM public.queue_entries e
  WHERE e.id = v_entry.id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_ticket(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_ticket(uuid, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- transition_entry: enqueue called / completed / skipped
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.transition_entry(
  p_entry_id uuid,
  p_new_status public.entry_status
)
RETURNS TABLE (
  id uuid,
  public_id uuid,
  queue_id uuid,
  queue_number integer,
  status public.entry_status,
  called_at timestamptz,
  serving_at timestamptz,
  completed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.queue_entries%ROWTYPE;
  v_allowed boolean := false;
  v_notify_type public.customer_notification_type;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT e.*
  INTO v_entry
  FROM public.queue_entries e
  WHERE e.id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue entry not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_business_member(v_entry.business_id) THEN
    RAISE EXCEPTION 'Not a member of this business'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_entry.status = p_new_status THEN
    RAISE EXCEPTION 'Entry is already in status %', p_new_status
      USING ERRCODE = 'check_violation';
  END IF;

  v_allowed :=
    (v_entry.status = 'waiting' AND p_new_status IN ('called', 'skipped'))
    OR (v_entry.status = 'called' AND p_new_status IN ('serving', 'skipped', 'no_show'))
    OR (v_entry.status = 'serving' AND p_new_status IN ('completed', 'no_show'));

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Invalid transition from % to %', v_entry.status, p_new_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.queue_entries e
  SET
    status = p_new_status,
    called_at = CASE
      WHEN p_new_status = 'called' THEN COALESCE(e.called_at, now())
      ELSE e.called_at
    END,
    serving_at = CASE
      WHEN p_new_status = 'serving' THEN COALESCE(e.serving_at, now())
      ELSE e.serving_at
    END,
    completed_at = CASE
      WHEN p_new_status IN ('completed', 'skipped', 'no_show') THEN COALESCE(e.completed_at, now())
      ELSE e.completed_at
    END
  WHERE e.id = v_entry.id;

  v_notify_type := CASE
    WHEN p_new_status = 'called' THEN 'called'::public.customer_notification_type
    WHEN p_new_status = 'completed' THEN 'completed'::public.customer_notification_type
    WHEN p_new_status IN ('skipped', 'no_show') THEN 'skipped'::public.customer_notification_type
    ELSE NULL
  END;

  IF v_notify_type IS NOT NULL THEN
    PERFORM public.enqueue_customer_notification(v_entry.id, v_notify_type);
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.public_id,
    e.queue_id,
    e.queue_number,
    e.status,
    e.called_at,
    e.serving_at,
    e.completed_at
  FROM public.queue_entries e
  WHERE e.id = v_entry.id;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_entry(uuid, public.entry_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_entry(uuid, public.entry_status) TO authenticated;

-- ---------------------------------------------------------------------------
-- call_next_entry: enqueue called
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.call_next_entry(p_queue_id uuid)
RETURNS TABLE (
  id uuid,
  public_id uuid,
  queue_id uuid,
  queue_number integer,
  status public.entry_status,
  called_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_queue public.queues%ROWTYPE;
  v_entry public.queue_entries%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT q.*
  INTO v_queue
  FROM public.queues AS q
  WHERE q.id = p_queue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_business_member(v_queue.business_id) THEN
    RAISE EXCEPTION 'Not a member of this business'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_queue.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Queue is not open'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT e.*
  INTO v_entry
  FROM public.queue_entries AS e
  WHERE e.queue_id = p_queue_id
    AND e.status = 'waiting'
  ORDER BY e.joined_at, e.queue_number
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No waiting customers'
      USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.queue_entries AS e
  SET
    status = 'called'::public.entry_status,
    called_at = COALESCE(e.called_at, now())
  WHERE e.id = v_entry.id;

  PERFORM public.enqueue_customer_notification(v_entry.id, 'called');

  RETURN QUERY
  SELECT
    e.id,
    e.public_id,
    e.queue_id,
    e.queue_number,
    e.status,
    e.called_at
  FROM public.queue_entries AS e
  WHERE e.id = v_entry.id;
END;
$$;

REVOKE ALL ON FUNCTION public.call_next_entry(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.call_next_entry(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.call_next_entry(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- get_ticket: include email_notifications_enabled (not the email address)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_ticket(uuid, text);

CREATE FUNCTION public.get_ticket(
  p_public_id uuid,
  p_access_token text
)
RETURNS TABLE (
  public_id uuid,
  queue_id uuid,
  queue_number integer,
  status public.entry_status,
  people_ahead integer,
  estimated_wait_minutes integer,
  service_name text,
  business_name text,
  queue_name text,
  email_notifications_enabled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_entry public.queue_entries%ROWTYPE;
  v_token_hash text;
  v_people_ahead integer;
  v_avg_minutes integer;
BEGIN
  IF p_public_id IS NULL OR p_access_token IS NULL OR length(trim(p_access_token)) = 0 THEN
    RAISE EXCEPTION 'Invalid ticket credentials'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_token_hash := encode(extensions.digest(p_access_token, 'sha256'), 'hex');

  SELECT e.*
  INTO v_entry
  FROM public.queue_entries e
  WHERE e.public_id = p_public_id
    AND e.access_token_hash = v_token_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_people_ahead
  FROM public.queue_entries e
  WHERE e.queue_id = v_entry.queue_id
    AND e.id <> v_entry.id
    AND (
      e.status IN ('called', 'serving')
      OR (
        e.status = 'waiting'
        AND (
          e.joined_at < v_entry.joined_at
          OR (e.joined_at = v_entry.joined_at AND e.queue_number < v_entry.queue_number)
        )
      )
    );

  SELECT s.average_service_minutes
  INTO v_avg_minutes
  FROM public.queues q
  JOIN public.services s ON s.id = q.service_id
  WHERE q.id = v_entry.queue_id;

  RETURN QUERY
  SELECT
    v_entry.public_id,
    v_entry.queue_id,
    v_entry.queue_number,
    v_entry.status,
    v_people_ahead,
    (v_people_ahead * COALESCE(v_avg_minutes, 1))::integer,
    s.name,
    b.name,
    q.name,
    v_entry.email_notifications_enabled
  FROM public.queues q
  JOIN public.services s ON s.id = q.service_id
  JOIN public.businesses b ON b.id = q.business_id
  WHERE q.id = v_entry.queue_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ticket(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ticket(uuid, text) TO anon, authenticated;
