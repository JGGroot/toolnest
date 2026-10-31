import {createClient} from 'npm:@supabase/supabase-js@2';
import {createDeleteHandler} from './handler.mjs';

Deno.serve(createDeleteHandler(()=>{
 const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}');
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||keys.default||Object.values(keys)[0];
 if(typeof key!=='string')return null;
 return createClient(Deno.env.get('SUPABASE_URL')!,key,{auth:{persistSession:false,autoRefreshToken:false}});
}));
