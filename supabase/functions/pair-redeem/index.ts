// Redeems a one-time QR pairing code shown on a signed-in desktop and returns a
// magic-link token hash, which the phone exchanges for its own session with
// supabase.auth.verifyOtp({type:'magiclink', token_hash}). No email is sent.
// Deploy with JWT verification off: the phone is not signed in yet.
import {createClient} from 'npm:@supabase/supabase-js@2';

const ALLOWED = ['https://jggroot.github.io', 'http://localhost:3010', 'http://localhost:3000', 'http://127.0.0.1:3000'];

function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
  return keys.default ?? Object.values(keys)[0];
}

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');

Deno.serve(async req => {
  const origin = req.headers.get('origin') ?? '';
  const cors = {
    'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), {status, headers: {...cors, 'content-type': 'application/json'}});
  if (req.method === 'OPTIONS') return new Response(null, {headers: cors});
  if (req.method !== 'POST') return reply(405, {error: 'POST only'});

  let id: unknown, code: unknown;
  try { ({id, code} = await req.json()); } catch { return reply(400, {error: 'Invalid request'}); }
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id) || typeof code !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(code))
    return reply(400, {error: 'Invalid pairing link'});

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), {auth: {persistSession: false, autoRefreshToken: false}});
  const hash = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)));
  const now = new Date().toISOString();
  // Claim the code atomically: only an unused, unexpired row with the matching hash is updated.
  const {data: row, error} = await admin.from('pairings').update({used_at: now})
    .eq('id', id).eq('code_hash', hash).is('used_at', null).gt('expires_at', now)
    .select('user_id').maybeSingle();
  if (error) return reply(500, {error: 'Pairing failed'});
  if (!row) return reply(410, {error: 'This pairing code has expired or was already used. Show a new QR code on the desktop.'});

  const {data: found, error: userError} = await admin.auth.admin.getUserById(row.user_id);
  const email = found?.user?.email;
  if (userError || !email) return reply(500, {error: 'Account not found'});
  const {data: link, error: linkError} = await admin.auth.admin.generateLink({type: 'magiclink', email});
  if (linkError || !link?.properties?.hashed_token) return reply(500, {error: 'Could not sign this phone in'});
  return reply(200, {token_hash: link.properties.hashed_token});
});
