-- ============================================================================
-- TURF F. — Supabase schema
-- Run this in your Supabase project: SQL Editor → New query → paste → Run
-- ============================================================================

create extension if not exists pgcrypto;

-- Every claim attempt (pending → paid/failed/expired via webhook)
create table if not exists public.claims (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  name               text not null,
  bio                text,
  field              text,
  country            text not null,
  city               text,
  project            text,
  web                text,
  social             text,
  email              text,
  ip                 text,                          -- client IP for the 3-per-day limit
  spots              integer not null default 1 check (spots in (1, 5, 10)),
  cells              jsonb not null default '[]',  -- cell indexes on the 100×100 grid
  position           integer unique,               -- global rank: oldest member = 1 (assigned on settlement)
  checkout_id        text unique,                  -- Bachs chk_…
  charge_id          text,                         -- Bachs ch_… (set on payment)
  status             text not null default 'pending'
                     check (status in ('pending','paid','free','failed','expired')),
  webhook_event_id   text
);

create index if not exists claims_status_idx   on public.claims (status);
create index if not exists claims_country_idx  on public.claims (country);
create index if not exists claims_checkout_idx on public.claims (checkout_id);

-- No accounts: the claim data IS the identity.
-- Same name + email can only ever claim once.
create unique index if not exists claims_identity_uq on public.claims (lower(name), lower(email));

-- Webhook event dedupe (Bachs delivers at-least-once)
create table if not exists public.webhook_events (
  id           text primary key,   -- evt_…
  type         text not null,
  received_at  timestamptz not null default now()
);

-- Row Level Security:
--  • public can READ paid claims only (the map loads these via anon key)
--  • NO public write policies — all mutations go through the service role key
alter table public.claims          enable row level security;
alter table public.webhook_events  enable row level security;

drop policy if exists "read settled claims" on public.claims;
create policy "read settled claims" on public.claims
  for select using (status in ('paid','free'));
