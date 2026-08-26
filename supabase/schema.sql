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
  macro              text,                          -- "mr-mc" of the FIRST cell (sector fetch index)
  image_url          text,                          -- public photo URL (Supabase Storage)
  checkout_id        text unique,                  -- Bachs chk_…
  charge_id          text,                         -- Bachs ch_… (set on payment)
  status             text not null default 'pending'
                     check (status in ('pending','paid','free','failed','expired')),
  webhook_event_id   text
);

create index if not exists claims_status_idx   on public.claims (status);
create index if not exists claims_country_idx  on public.claims (country);
create index if not exists claims_checkout_idx on public.claims (checkout_id);
create index if not exists claims_ip_day_idx   on public.claims (ip, created_at);
create index if not exists claims_macro_idx    on public.claims (macro);

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

-- ============================================================================
-- IMAGES — Supabase Storage
-- Bucket 'people' is PUBLIC READ (profile photos are public data).
-- Writes happen ONLY via service-role signed upload URLs minted by
-- /api/upload-url — the browser never touches the service key.
-- Path layout:  people/<claim-or-temp-uuid>.webp  (client pre-compresses to ≤512px WebP)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('people', 'people', true)
on conflict (id) do nothing;

drop policy if exists "people public read" on storage.objects;
create policy "people public read" on storage.objects
  for select using (bucket_id = 'people');
-- (no insert/update/delete policies: uploads are service-role signed URLs only)

-- ============================================================================
-- SCALE PATH — aggregates for the summary endpoint
-- At ≤100k claims, /api/summary queries directly (fine).
-- Beyond that, refresh these on a schedule (pg_cron or app trigger) and read
-- from them instead:
--   select * from mv_country_counts;
--   select * from mv_top20;
-- (enable the pg_cron extension first: create extension pg_cron;)
-- ============================================================================
create materialized view if not exists mv_country_counts as
  select country, count(*)::bigint as people
  from public.claims
  where status in ('paid', 'free')
  group by country;

create materialized view if not exists mv_top20 as
  select position, name, country, city, field, cells, status
  from public.claims
  where status in ('paid', 'free') and position <= 20
  order by position;

-- ============================================================================
-- STATS — page visits + live presence (online now)
-- ============================================================================
create table if not exists public.stats (
  key         text primary key,
  value       bigint not null default 0,
  updated_at  timestamptz not null default now()
);
insert into public.stats (key, value) values ('total_visits', 0) on conflict (key) do nothing;

create table if not exists public.presence (
  session    text primary key,
  last_seen  timestamptz not null default now()
);
create index if not exists presence_last_seen_idx on public.presence (last_seen);

alter table public.stats    enable row level security;
alter table public.presence enable row level security;
-- (no policies: all access goes through the service role inside our functions)
