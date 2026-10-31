import {eraseStorage} from './erase-storage.mjs';
export function createDeleteHandler(getAdmin, ALLOWED=['https://jggroot.github.io','http://localhost:3000','http://127.0.0.1:3000']) {
return async req=>{
 const origin=req.headers.get('origin')??'';
 const headers={'Access-Control-Allow-Origin':ALLOWED.includes(origin)?origin:ALLOWED[0],'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Content-Type':'application/json','Cache-Control':'no-store'};
 const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!ALLOWED.includes(origin))return reply(403,{error:'Origin not allowed'});
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return reply(405,{error:'POST only'});
 const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
 if(!token)return reply(401,{error:'Sign in before deleting your account.'});
 try{
  const body=await req.json();
  if(body?.confirmation!=='DELETE MY ACCOUNT')return reply(400,{error:'Account deletion must be confirmed.'});
  const admin=getAdmin();
  if(!admin)return reply(503,{error:'Account deletion is not configured. No deletion confirmed.'});
  // Never accept a user id from the body. Validate the caller's session with Auth.
  const {data,error}=await admin.auth.getUser(token);
  if(error||!data.user)return reply(401,{error:'Your session has expired. Sign in again.'});
  await eraseStorage(admin.storage.from('toolnest'),data.user.id);
  // All app tables reference auth.users with ON DELETE CASCADE.
  // Remove storage first: Supabase refuses to delete users who own stored objects.
  const {error:deleteError}=await admin.auth.admin.deleteUser(data.user.id);
  if(deleteError)throw deleteError;
  return reply(200,{deleted:true});
 }catch{
  // Do not leak database internals or report partial erasure as success.
  return reply(500,{error:'Deletion did not finish. Some data may already have been removed. Retry or contact the maintainer.'});
 }
};
}
