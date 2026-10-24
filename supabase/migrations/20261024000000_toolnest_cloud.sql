-- Toolnest cloud: per-user tool library, drawers, phone captures and QR phone pairing.
-- Every table is private to its owner through row level security; storage objects
-- live under a folder named after the owner's user id.

create table public.library_tools (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  name text not null check (char_length(name) between 1 and 60),
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.drawers (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  name text not null check (char_length(name) between 1 and 80),
  data jsonb not null,
  photo_path text,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Photos taken on a phone, waiting for the desktop to open them.
create table public.captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('tool', 'foam')),
  path text not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
create index captures_pending on public.captures (user_id, created_at) where consumed_at is null;

-- One-time QR pairing codes. Only a SHA-256 hash of the code is stored; the
-- pair-redeem edge function checks it with the service role and marks it used.
create table public.pairings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null default now() + interval '5 minutes',
  used_at timestamptz
);

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger library_tools_touch before update on public.library_tools for each row execute function public.touch_updated_at();
create trigger drawers_touch before update on public.drawers for each row execute function public.touch_updated_at();

alter table public.library_tools enable row level security;
alter table public.drawers enable row level security;
alter table public.captures enable row level security;
alter table public.pairings enable row level security;

create policy "own library" on public.library_tools for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own drawers" on public.drawers for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own captures" on public.captures for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- Owners may create and watch their pairing codes; redemption happens server-side.
create policy "create own pairing" on public.pairings for insert to authenticated
  with check ((select auth.uid()) = user_id and expires_at <= now() + interval '10 minutes');
create policy "read own pairing" on public.pairings for select to authenticated
  using ((select auth.uid()) = user_id);

-- The desktop listens for new captures and for its pairing code being used.
alter publication supabase_realtime add table public.captures, public.pairings;

-- Private bucket; JPEG/PNG/WebP up to 15 MB, stored as <user id>/<folder>/<file>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('toolnest', 'toolnest', false, 15728640, array['image/jpeg', 'image/png', 'image/webp']);

create policy "own files read" on storage.objects for select to authenticated
  using (bucket_id = 'toolnest' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files write" on storage.objects for insert to authenticated
  with check (bucket_id = 'toolnest' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files update" on storage.objects for update to authenticated
  using (bucket_id = 'toolnest' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'toolnest' and (storage.foldername(name))[1] = (select auth.uid())::text);
