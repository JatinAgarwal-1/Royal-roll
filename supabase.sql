-- Roll Royale: minimal Supabase setup for private-code Ludo rooms.
-- Run this in Supabase Dashboard > SQL Editor.

create table if not exists public.ludo_rooms (
  room_code text primary key check (room_code ~ '^[A-Z0-9]{6}$'),
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.ludo_rooms enable row level security;

-- DEMO ACCESS MODEL:
-- This policy allows anyone holding the public anon key to read/write room rows.
-- The six-character room code is a casual invite code, NOT strong authorization.
-- For a public production game, replace these policies with authenticated membership
-- checks or Edge Functions before exposing it to untrusted users.
drop policy if exists "Allow room access for demo clients" on public.ludo_rooms;
create policy "Allow room access for demo clients"
  on public.ludo_rooms for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update on public.ludo_rooms to anon, authenticated;

-- Enable Postgres Changes so all connected clients receive room updates.
alter publication supabase_realtime add table public.ludo_rooms;
