-- Library and drawer changes are pushed live to other signed-in devices; the separate
-- phone-photo inbox is replaced by saving straight into the library, so it goes.
alter publication supabase_realtime add table public.library_tools, public.drawers;
alter publication supabase_realtime drop table public.captures;
drop table public.captures;
