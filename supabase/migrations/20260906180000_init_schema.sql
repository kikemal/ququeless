-- QueueLess Phase 1: extensions, enums, tables, constraints, indexes, triggers

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_role') THEN
    CREATE TYPE public.member_role AS ENUM ('business_owner', 'staff');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'queue_status') THEN
    CREATE TYPE public.queue_status AS ENUM ('open', 'paused', 'closed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entry_status') THEN
    CREATE TYPE public.entry_status AS ENUM (
      'waiting',
      'called',
      'serving',
      'completed',
      'skipped',
      'no_show'
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  business_type text NOT NULL,
  phone text,
  email text,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT businesses_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT businesses_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT businesses_slug_length CHECK (char_length(slug) BETWEEN 2 AND 64),
  CONSTRAINT businesses_slug_unique UNIQUE (slug)
);

CREATE TABLE public.business_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role public.member_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_members_business_user_unique UNIQUE (business_id, user_id)
);

CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  average_service_minutes integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT services_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT services_average_service_minutes_positive CHECK (average_service_minutes > 0)
);

CREATE TABLE public.queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE RESTRICT,
  name text NOT NULL,
  status public.queue_status NOT NULL DEFAULT 'open',
  current_number integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT queues_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT queues_current_number_non_negative CHECK (current_number >= 0)
);

-- business_id is denormalized onto queue_entries for tenant RLS without recursive joins.
CREATE TABLE public.queue_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  queue_id uuid NOT NULL REFERENCES public.queues (id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  customer_phone text,
  queue_number integer NOT NULL,
  status public.entry_status NOT NULL DEFAULT 'waiting',
  access_token_hash text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  called_at timestamptz,
  serving_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT queue_entries_public_id_unique UNIQUE (public_id),
  CONSTRAINT queue_entries_customer_name_not_blank CHECK (length(trim(customer_name)) > 0),
  CONSTRAINT queue_entries_queue_number_positive CHECK (queue_number > 0),
  CONSTRAINT queue_entries_token_hash_not_blank CHECK (length(access_token_hash) > 0),
  CONSTRAINT queue_entries_queue_number_unique_per_queue UNIQUE (queue_id, queue_number)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX business_members_business_id_idx ON public.business_members (business_id);
CREATE INDEX business_members_user_id_idx ON public.business_members (user_id);
CREATE INDEX services_business_id_idx ON public.services (business_id);
CREATE INDEX queues_business_id_idx ON public.queues (business_id);
CREATE INDEX queues_service_id_idx ON public.queues (service_id);
CREATE INDEX queue_entries_queue_id_idx ON public.queue_entries (queue_id);
CREATE INDEX queue_entries_status_idx ON public.queue_entries (status);
CREATE INDEX queue_entries_public_id_idx ON public.queue_entries (public_id);
CREATE INDEX queue_entries_business_id_idx ON public.queue_entries (business_id);
CREATE INDEX queue_entries_queue_status_joined_idx
  ON public.queue_entries (queue_id, status, joined_at);

-- ---------------------------------------------------------------------------
-- updated_at helper + integrity triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER businesses_set_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER services_set_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER queues_set_updated_at
  BEFORE UPDATE ON public.queues
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_queue_service_same_business()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  service_business_id uuid;
BEGIN
  SELECT s.business_id INTO service_business_id
  FROM public.services s
  WHERE s.id = NEW.service_id;

  IF service_business_id IS NULL THEN
    RAISE EXCEPTION 'Service not found for queue';
  END IF;

  IF service_business_id IS DISTINCT FROM NEW.business_id THEN
    RAISE EXCEPTION 'Queue business_id must match service business_id';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER queues_enforce_service_business
  BEFORE INSERT OR UPDATE OF business_id, service_id ON public.queues
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_queue_service_same_business();

CREATE OR REPLACE FUNCTION public.enforce_entry_queue_business()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  queue_business_id uuid;
BEGIN
  SELECT q.business_id INTO queue_business_id
  FROM public.queues q
  WHERE q.id = NEW.queue_id;

  IF queue_business_id IS NULL THEN
    RAISE EXCEPTION 'Queue not found for entry';
  END IF;

  IF queue_business_id IS DISTINCT FROM NEW.business_id THEN
    RAISE EXCEPTION 'Entry business_id must match queue business_id';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER queue_entries_enforce_queue_business
  BEFORE INSERT OR UPDATE OF business_id, queue_id ON public.queue_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_entry_queue_business();

-- Auto-create profile when an auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.email, '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- When a business is created by an authenticated user, add them as owner
CREATE OR REPLACE FUNCTION public.handle_new_business()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create a business';
  END IF;

  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES (NEW.id, auth.uid(), 'business_owner');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_business_created
  AFTER INSERT ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_business();
