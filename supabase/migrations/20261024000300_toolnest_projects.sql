-- Projects group several foams (the drawers table). A project's data holds the foam order.
create table public.projects (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null check (char_length(id) between 1 and 100),
  name text not null check (char_length(name) between 1 and 80),
  data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();
alter table public.projects enable row level security;
create policy "own projects" on public.projects for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter publication supabase_realtime add table public.projects;

alter table public.drawers add column project_id text;
create index drawers_project on public.drawers (user_id, project_id);

-- Existing foams move into one project per account, newest first.
with owners as (select distinct user_id from public.drawers where not deleted),
made as (
  insert into public.projects (user_id, id, name, data)
  select o.user_id, gen_random_uuid()::text, 'My foams',
         jsonb_build_object('foams', (select jsonb_agg(d.id order by d.updated_at desc) from public.drawers d where d.user_id = o.user_id and not d.deleted))
  from owners o returning user_id, id
)
update public.drawers d set project_id = made.id from made where d.user_id = made.user_id and not d.deleted;
