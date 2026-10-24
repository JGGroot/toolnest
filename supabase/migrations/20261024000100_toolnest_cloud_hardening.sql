-- Index the pairing owner and keep Supabase's RLS auto-enable helper out of the public API
-- (it runs as an event trigger and never needs to be called over REST).
create index pairings_user on public.pairings (user_id);
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
