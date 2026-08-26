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

-- Row Level Security (SECURITY_AUDIT.md C3):
--  • NO public policies at all. Every read/write goes through the API
--    functions (service role, which bypasses RLS). The previous public
--    SELECT policy exposed EVERY column — email, ip, checkout_id,
--    charge_id — to anyone holding the anon key. The map never uses the
--    anon key, so the policy was pure attack surface and has been dropped.
alter table public.claims          enable row level security;
alter table public.webhook_events  enable row level security;

drop policy if exists "read settled claims" on public.claims;

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

-- ============================================================================
-- SECURITY HARDENING (SECURITY_AUDIT.md C4/C5/H1) — new objects
-- Re-run this file on your Supabase project (SQL Editor → Run).
-- ============================================================================

-- Photo-upload mint rate limit (12 signed URLs / IP / day, enforced in
-- /api/upload-url). Service-role only (RLS on, no policies).
create table if not exists public.upload_mints (
  id         bigint generated always as identity primary key,
  ip         text not null,
  created_at timestamptz not null default now()
);
create index if not exists upload_mints_ip_day_idx on public.upload_mints (ip, created_at);
alter table public.upload_mints enable row level security;

-- Payments that arrived before their claim row existed (or matched nothing):
-- /api/claim-status replays these instead of dropping paid events (C5).
create table if not exists public.pending_fulfilments (
  id          uuid primary key default gen_random_uuid(),
  event_id    text,
  checkout_id text not null,
  charge_id   text,
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists pending_fulfilments_checkout_idx on public.pending_fulfilments (checkout_id);
alter table public.pending_fulfilments enable row level security;

-- Atomic visitor counter (fixes /api/visit: `{inc:1}` is invalid PostgREST
-- for bigint — the old endpoint 500'd in production and visits never moved).
create or replace function public.bump_stat(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.stats (key, value) values (p_key, 1)
  on conflict (key) do update set value = public.stats.value + 1, updated_at = now();
$$;

-- Atomic claim insert (C4): advisory-lock serialized so the founder-tier
-- gate, unique position assignment, and cell allocation can't race under
-- concurrent requests. p_founder_gate = founder free-claim (limit enforced
-- inside the same transaction — no TOCTOU window).
create or replace function public.insert_claim_sequential(p_row jsonb, p_founder_gate boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n   bigint;
  nxt integer;
  out jsonb;
begin
  perform pg_advisory_xact_lock(918273645);  -- serialize claim allocation

  if p_founder_gate then
    select count(*) into n from public.claims where status in ('paid','free');
    if n >= 200 then
      return jsonb_build_object('error', 'founder_full');
    end if;
  end if;

  select count(*) + 1 into nxt from public.claims where status in ('paid','free');

  insert into public.claims
    (name, bio, field, country, city, project, web, social, email, ip, spots,
     cells, macro, image_url, checkout_id, status, position)
  values
    (p_row->>'name', nullif(p_row->>'bio',''), nullif(p_row->>'field',''),
     p_row->>'country', nullif(p_row->>'city',''), nullif(p_row->>'project',''),
     nullif(p_row->>'web',''), nullif(p_row->>'social',''), p_row->>'email',
     p_row->>'ip', coalesce((p_row->>'spots')::int, 1),
     coalesce((p_row->>'cells')::jsonb, '[]'::jsonb), p_row->>'macro',
     nullif(p_row->>'image_url',''), nullif(p_row->>'checkout_id',''),
     coalesce(p_row->>'status','pending'), nxt)
  returning to_jsonb(public.claims.*) into out;

  return out;
end;
$$;

-- Atomic payment settlement (C4/C5): unique-safe position under the same
-- advisory lock; returns {settled: true/false} so the webhook can queue
-- unmatched payments for replay.
create or replace function public.settle_claim(p_checkout_id text, p_charge_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  nxt integer;
  done bigint;
begin
  perform pg_advisory_xact_lock(918273645);
  select count(*) + 1 into nxt from public.claims where status in ('paid','free');
  update public.claims
     set status = 'paid', charge_id = coalesce(p_charge_id, charge_id), position = nxt
   where checkout_id = p_checkout_id
     and status in ('pending','failed','expired');   -- never resurrect a refund/failed-free row blindly
  get diagnostics done = row_count;
  return jsonb_build_object('settled', done > 0);
end;
$$;

grant execute on function public.bump_stat(text) to service_role;
grant execute on function public.insert_claim_sequential(jsonb, boolean) to service_role;
grant execute on function public.settle_claim(text, text) to service_role;

-- ============================================================================
-- EDIT CODES (SECURITY_AUDIT.md C1 follow-up) — "the key to your spot"
-- A random 8-char code (e.g. K7PM-X2QF) is issued ONCE at claim time; only
-- this SHA-256 hash is stored. /api/my-claim accepts the code as the primary
-- way to edit a spot (email + registered name remains the fallback).
-- Guesses are rate-limited to 5/IP/day via auth_attempts.
-- ============================================================================
alter table public.claims add column if not exists edit_code_hash text;
create index if not exists claims_edit_code_idx on public.claims (edit_code_hash);

create table if not exists public.auth_attempts (
  id         bigint generated always as identity primary key,
  ip         text not null,
  created_at timestamptz not null default now()
);
create index if not exists auth_attempts_ip_day_idx on public.auth_attempts (ip, created_at);
alter table public.auth_attempts enable row level security;

-- ============================================================================
-- THE LADDER (2026-08-26 pivot) — rank = amount paid.
-- • ladder_entries: one row per paid spot. Rank is COMPUTED:
--     row_number() over (order by amount desc, paid_at asc)
--   No fixed slots: paying more always ranks you above lower payers; the
--   displaced simply re-sort. Impartial by construction, race-free placement.
-- • ladder_ledger: payment intent (lock) + audit trail. 'locked' while the
--   Bachs checkout is open (15 min), 'settled' by the webhook, 'needs_refund'
--   when the payment can no longer be honoured.
-- • spot_posts: media feed per spot (image / gif / video / audio + caption).
-- ============================================================================

create table if not exists public.ladder_entries (
  id         bigint generated always as identity primary key,
  claim_id   uuid not null unique references public.claims(id) on delete cascade,
  amount     bigint not null check (amount >= 100),
  paid_at    timestamptz not null default now()
);
create index if not exists ladder_sorted_idx on public.ladder_entries (amount desc, paid_at asc);
alter table public.ladder_entries enable row level security;

create table if not exists public.ladder_ledger (
  id                 bigint generated always as identity primary key,
  checkout_id        text unique,
  action             text not null check (action in ('join','overtake')),
  amount             bigint not null,
  target_claim_id    uuid references public.claims(id) on delete set null,
  target_prev_amount bigint,
  claim_id           uuid not null references public.claims(id) on delete cascade,
  status             text not null default 'locked'
                     check (status in ('locked','settled','expired','needs_refund')),
  locked_until       timestamptz not null default now() + interval '15 minutes',
  created_at         timestamptz not null default now()
);
create index if not exists ladder_ledger_target_idx on public.ladder_ledger (target_claim_id, status, locked_until);
create index if not exists ladder_ledger_recent_idx on public.ladder_ledger (status, created_at desc);
alter table public.ladder_ledger enable row level security;

create table if not exists public.spot_posts (
  id         uuid primary key default gen_random_uuid(),
  claim_id   uuid not null references public.claims(id) on delete cascade,
  kind       text not null check (kind in ('image','gif','video','audio')),
  url        text not null,
  caption    text,
  created_at timestamptz not null default now()
);
create index if not exists spot_posts_claim_idx on public.spot_posts (claim_id, created_at desc);
alter table public.spot_posts enable row level security;

-- Ranked view of the ladder with holder profile (for /api/ladder and the
-- frontend). Ranks are stable and computed, never stored.
create or replace function public.ladder_view(p_from integer default 1, p_count integer default 40)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select e.*, row_number() over (order by e.amount desc, e.paid_at asc) as rank
    from public.ladder_entries e
  )
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  from (
    select r.rank, r.amount, r.paid_at,
           c.id as claim_id, c.name, c.field, c.country, c.city, c.project,
           c.web, c.social, c.image_url, c.bio,
           (select count(*) from public.spot_posts p where p.claim_id = r.claim_id) as posts
    from ranked r
    join public.claims c on c.id = r.claim_id
    where r.rank >= p_from and r.rank < p_from + p_count
    order by r.rank
  ) t;
$$;

-- Atomic ladder settlement (webhook: collection.succeeded).
-- join: insert the entry (rank emerges from sorting).
-- overtake: target must still exist; the 2× price lands the payer above them.
-- Both idempotent; nothing about a settled entry ever changes.
create or replace function public.settle_ladder(p_checkout_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.ladder_ledger%rowtype;
begin
  perform pg_advisory_xact_lock(918273647);

  select * into l from public.ladder_ledger where checkout_id = p_checkout_id for update;
  if not found then return jsonb_build_object('error', 'no_ledger'); end if;
  if l.status = 'settled' then return jsonb_build_object('settled', true, 'duplicate', true); end if;
  if l.status <> 'locked' then return jsonb_build_object('error', 'ledger_' || l.status); end if;

  if l.action = 'overtake' then
    if not exists (select 1 from public.ladder_entries where claim_id = l.target_claim_id) then
      update public.ladder_ledger set status = 'needs_refund' where id = l.id;
      return jsonb_build_object('error', 'target_gone');
    end if;
  end if;

  insert into public.ladder_entries (claim_id, amount)
  values (l.claim_id, l.amount)
  on conflict (claim_id) do update set amount = excluded.amount, paid_at = now();

  update public.ladder_ledger set status = 'settled' where id = l.id;
  return jsonb_build_object('settled', true);
end;
$$;

-- Release expired locks (called opportunistically by the API).
create or replace function public.expire_ladder_locks()
returns void
language sql
security definer
set search_path = public
as $$
  update public.ladder_ledger
     set status = 'expired'
   where status = 'locked' and locked_until < now();
$$;

grant execute on function public.ladder_view(integer, integer) to service_role;
grant execute on function public.settle_ladder(text) to service_role;
grant execute on function public.expire_ladder_locks() to service_role;
