// Optional cloud account (Supabase): sign-in, live-synced tool library and foams, QR phone pairing
// and a save indicator. Signed out, nothing leaves the browser: the Supabase client is only loaded
// once someone signs in, has a saved session or opens a pairing link.
import qrcode from './vendor/qrcode.mjs';
export const SUPABASE_URL='https://ddqyjscfbvtrqmrnehhn.supabase.co',SUPABASE_KEY='sb_publishable_NW3qw6msS3_CfC0Ox0mzow_FN1jAtNx';
// Public OAuth client id. Google's own button signs in on this site's origin, so the consent
// screen names Toolnest instead of the Supabase project address.
const GOOGLE_CLIENT_ID='874305021046-eooj6es41d3hg4i8a1g30unp5g2jevjf.apps.googleusercontent.com';
const SESSION_KEY='sb-ddqyjscfbvtrqmrnehhn-auth-token',BUCKET='toolnest',$=id=>document.getElementById(id);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Key-order independent JSON: Postgres jsonb reorders object keys, so compare canonical forms.
const stable=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(key=>[key,x[key]])):x);
const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const sha256=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const appURL=()=>location.origin+location.pathname;
const isPhone=()=>!matchMedia('(pointer:fine)').matches;

export function createCloud({toast,modal,foam,startToolPhoto}){
 let clientPromise=null,gisPromise=null,client=null,user=null,channel=null,libraryTimer=0,drawerTimer=0,remoteTimer=0,applying=false,lastSaved=0,lastError='';
 const dirty=new Set();
 const actions=document.querySelector('.top-actions'),pill=document.createElement('button'),button=document.createElement('button');
 pill.id='syncPill';pill.className='sync-pill';button.id='cloudBtn';button.className='icon-btn cloud-btn';button.setAttribute('aria-label','Account and cloud sync');button.textContent='☁';actions?.prepend(pill,button);
 // ---- Save indicator: always says where the work is and whether the last save worked.
 function showState(){const state=!user?'local':lastError?'error':dirty.size?'saving':'saved';pill.dataset.state=state;button.dataset.state=user?'on':'off';button.dataset.sync=state;
  pill.textContent={local:'Saved on this device',error:'⚠ Not saved',saving:'Saving…',saved:'✓ Saved'}[state];
  pill.title={local:'Saved in this browser only. Sign in with ☁ to back up and use it on your phone.',error:`${lastError}. Click to try again.`,saving:'Saving to your account…',saved:`Saved to ${user?.email||'your account'}${lastSaved?' at '+new Date(lastSaved).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):''}`}[state];
  button.title=user?`Signed in as ${user.email}`:'Sign in to sync across devices';const line=$('cloudStatus');if(line&&user)line.textContent=pill.title;}
 async function track(kind,job){dirty.add(kind);showState();try{await job();dirty.delete(kind);lastError='';lastSaved=Date.now();}catch(e){lastError=(kind==='library'?'Library':'Project')+' not saved: '+(e.message||e);}showState();}
 pill.onclick=()=>{if(!user)return open();if(lastError||dirty.size)flush();else foam.showLibrary();};
 function flush(){clearTimeout(libraryTimer);clearTimeout(drawerTimer);return Promise.all([track('library',pushLibrary),track('project',pushProject)]);}
 window.addEventListener('beforeunload',e=>{if(user&&dirty.size){e.preventDefault();e.returnValue='';}});

 function load(){if(!clientPromise)clientPromise=new Promise((resolve,reject)=>{const make=()=>{client=globalThis.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}});client.auth.onAuthStateChange((event,session)=>setTimeout(()=>{authChanged(session);if(event==='PASSWORD_RECOVERY')newPassword();},0));resolve(client);};if(globalThis.supabase?.createClient)return make();const s=document.createElement('script');s.src=new URL('./vendor/supabase.js?v=2.117.3',import.meta.url).href;s.onload=make;s.onerror=()=>{clientPromise=null;reject(Error('Cloud sign-in could not load. Check your connection.'));};document.head.append(s);});return clientPromise;}
 async function authChanged(session){const next=session?.user||null;if(next?.id===user?.id)return;user=next;lastError='';dirty.clear();if(channel){client.removeChannel(channel);channel=null;}foam.setProjectSource(user?projectSource:null);foam.setPhotoFetcher(user?async id=>{const {data}=await client.storage.from(BUCKET).download(`${user.id}/foam/${id}`);return data||null;}:null);showState();
  if(!user){if($('cloudBody'))render();return;}if($('modal').open&&$('cloudBody'))render();
  await track('library',async()=>{const fresh=await syncLibrary();if(fresh.length)toast(`Your library has ${fresh.length} tool${fresh.length===1?'':'s'} from your other devices.`);});await track('project',pushProject);if(isPhone())await openRecentIfEmpty().catch(()=>{});listen();foam.refreshLibrary();}

 // ---- Tool library: rows keyed by tool id. A per-account snapshot of what was last synced tells
 // local edits apart from remote ones; when both changed, the local copy wins. Returns new arrivals.
 const snapKey=()=>`toolnest.cloud.library.${user.id}`;
 const readSnap=()=>{try{return JSON.parse(localStorage.getItem(snapKey())||'{}');}catch{return {};}};
 async function syncLibrary(){const {data:rows,error}=await client.from('library_tools').select('id,data,deleted');if(error)throw error;const snap=readSnap(),local=new Map(foam.getLibrary().map(t=>[t.id,t])),push=[],next=new Map(local);
  for(const row of rows){const mine=local.get(row.id),cloud=row.deleted?null:stable(row.data),changedHere=mine?stable(mine)!==snap[row.id]:row.id in snap;
   if(changedHere){if(mine)push.push(mine);else if(cloud)push.push({id:row.id,deleted:true});}else if(cloud)next.set(row.id,row.data);else next.delete(row.id);}
  const known=new Set(rows.map(r=>r.id));for(const t of local.values())if(!known.has(t.id))push.push(t);
  const merged=[...next.values()].slice(0,200),arrived=merged.filter(t=>!local.has(t.id));if(stable([...local.values()])!==stable(merged)){applying=true;try{foam.setLibrary(merged);}finally{applying=false;}}
  await upsertLibrary(push);const fresh={};for(const t of merged)fresh[t.id]=stable(t);localStorage.setItem(snapKey(),JSON.stringify(fresh));return arrived;}
 async function upsertLibrary(items){if(!items.length)return;const {error}=await client.from('library_tools').upsert(items.map(t=>t.deleted?{id:t.id,name:'Deleted',data:{},deleted:true}:{id:t.id,name:t.name,data:t,deleted:false}),{onConflict:'user_id,id'});if(error)throw error;}
 async function pushLibrary(){if(!user)return;const snap=readSnap(),now=foam.getLibrary(),items=now.filter(t=>stable(t)!==snap[t.id]),ids=new Set(now.map(t=>t.id));for(const id of Object.keys(snap))if(!ids.has(id))items.push({id,deleted:true});await upsertLibrary(items);const fresh={};for(const t of now)fresh[t.id]=stable(t);localStorage.setItem(snapKey(),JSON.stringify(fresh));}
 foam.onLibraryChange(()=>{if(!user||applying)return;dirty.add('library');showState();clearTimeout(libraryTimer);libraryTimer=setTimeout(()=>track('library',pushLibrary),800);});

 // ---- Projects: each foam is a drawers row and the project row keeps their order. Every foam whose
 // content differs from what was last pushed is saved, so switching foams never drops an edit.
 // Foam photos go to storage once as <user>/foam/<photo id>, with a small .thumb.jpg beside them.
 const uploadedKey=()=>`toolnest.cloud.photos.${user.id}`,pushedKey=()=>`toolnest.cloud.pushed.${user.id}`;
 const readPushed=()=>{try{return JSON.parse(localStorage.getItem(pushedKey())||'{}');}catch{return {};}};
 const writePushed=pushed=>{const keys=Object.keys(pushed);if(keys.length>600)for(const k of keys.slice(0,keys.length-600))delete pushed[k];localStorage.setItem(pushedKey(),JSON.stringify(pushed));};
 const hasContent=f=>f.tools.length||f.foam.photo||f.foam.keepouts?.length;
 async function thumbnail(blob){const bitmap=await createImageBitmap(blob),scale=Math.min(1,480/Math.max(bitmap.width,bitmap.height)),c=document.createElement('canvas');c.width=Math.round(bitmap.width*scale);c.height=Math.round(bitmap.height*scale);c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);bitmap.close?.();return await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Could not make a thumbnail.')),'image/jpeg',.8));}
 async function uploadPhoto(f){const photo=f.foam.photo;if(!photo)return null;const path=`${user.id}/foam/${photo.id}`,done=new Set(JSON.parse(localStorage.getItem(uploadedKey())||'[]'));if(done.has(photo.id)&&done.has(photo.id+'.thumb')){await uploadSource(photo);return path;}const blob=await foam.getPhoto(photo.id);if(!blob)return done.has(photo.id)?path:null;
  const store=async(target,body)=>{const {error}=await client.storage.from(BUCKET).upload(target,body,{upsert:true,contentType:body.type||'image/jpeg'});if(error)throw error;};if(!done.has(photo.id)){await store(path,blob);done.add(photo.id);}await store(path+'.thumb.jpg',await thumbnail(blob));done.add(photo.id+'.thumb');localStorage.setItem(uploadedKey(),JSON.stringify([...done].slice(-400)));await uploadSource(photo);return path;}
 async function uploadSource(photo){if(!photo.sourceId)return;const done=new Set(JSON.parse(localStorage.getItem(uploadedKey())||'[]'));if(done.has(photo.sourceId))return;const blob=await foam.getPhoto(photo.sourceId);if(!blob)return;const {error}=await client.storage.from(BUCKET).upload(`${user.id}/foam/${photo.sourceId}`,blob,{upsert:true,contentType:blob.type||'image/jpeg'});if(error)throw error;done.add(photo.sourceId);localStorage.setItem(uploadedKey(),JSON.stringify([...done].slice(-400)));}
 async function pushProject(){if(!user)return;const p=foam.getProject();if(!p.foams.some(hasContent)&&p.name==='Untitled project')return;const pushed=readPushed(),ids=p.foams.map(f=>f.id);
  for(const f of p.foams){const h=stable(f);if(pushed[f.id]===h)continue;const {error}=await client.from('drawers').upsert({id:f.id,name:f.name,data:f,photo_path:await uploadPhoto(f),project_id:p.id,deleted:false},{onConflict:'user_id,id'});if(error)throw error;pushed[f.id]=h;writePushed(pushed);}
  const key='project:'+p.id,before=pushed[key]?JSON.parse(pushed[key]).foams:[],gone=before.filter(id=>!ids.includes(id));if(gone.length){const {error}=await client.from('drawers').update({deleted:true}).in('id',gone);if(error)throw error;}
  const h=stable({name:p.name,foams:ids});if(pushed[key]!==h){const {error}=await client.from('projects').upsert({id:p.id,name:p.name,data:{foams:ids},deleted:false},{onConflict:'user_id,id'});if(error)throw error;pushed[key]=h;writePushed(pushed);}}
 foam.onChange(()=>{if(!user||applying)return;dirty.add('project');showState();clearTimeout(drawerTimer);drawerTimer=setTimeout(()=>track('project',pushProject),2000);});
 // Fetch a project and its foams, in the project's order.
 async function fetchProject(id){const [{data:row,error},{data:foams,error:foamError}]=await Promise.all([client.from('projects').select('id,name,data').eq('id',id).single(),client.from('drawers').select('id,name,data,photo_path').eq('project_id',id).eq('deleted',false)]);if(error||foamError)throw error||foamError;const byId=new Map(foams.map(d=>[d.id,d])),order=[...(row.data?.foams||[]).filter(i=>byId.has(i)),...foams.map(d=>d.id).filter(i=>!(row.data?.foams||[]).includes(i))];return {row,foams:order.map(i=>byId.get(i))};}
 async function fetchPhotos(rows){for(const d of rows){const photo=d.data.foam.photo;if(!photo||!d.photo_path||await foam.getPhoto(photo.id))continue;const {data:blob}=await client.storage.from(BUCKET).download(d.photo_path);if(blob){await foam.putPhoto(photo.id,blob);foam.refreshStrip();}}}
 function remember(project,rows){const pushed=readPushed();for(const d of rows)pushed[d.id]=stable({...d.data,id:d.id,name:d.name});pushed['project:'+project.id]=stable({name:project.name,foams:rows.map(d=>d.id)});writePushed(pushed);}
 async function openProject(id){if(dirty.size)await flush();const {row,foams}=await fetchProject(id),project={id:row.id,name:row.name,active:0,foams:foams.map(d=>({...d.data,id:d.id,name:d.name}))};if(!project.foams.length)project.foams=[{id:crypto.randomUUID(),name:'Foam 1',foam:{width:600,height:400,thickness:50,base:5,margin:10,spacing:8},tools:[]}];applying=true;try{foam.loadProject(project);}finally{applying=false;}remember(row,foams);toast(`Opened ${row.name}.`);fetchPhotos(foams).catch(()=>{});}
 // Another device changed the open project: take its foams, keeping local foams with unsaved edits
 // and local foams that were never pushed; foams it deleted (that were pushed from here) go.
 async function mergeOpenProject(){const local=foam.getProject();if(dirty.has('project'))return;let fetched;try{fetched=await fetchProject(local.id);}catch{return;}const {row,foams}=fetched,pushed=readPushed(),remoteIds=foams.map(d=>d.id),localById=new Map(local.foams.map(f=>[f.id,f]));let changed=row.name!==local.name,arrived=0;const next=[];
  for(const d of foams){const mine=localById.get(d.id),remote={...d.data,id:d.id,name:d.name};if(mine&&stable(mine)!==pushed[d.id]){next.push(mine);continue;}if(!mine)arrived++;if(!mine||stable(mine)!==stable(remote))changed=true;next.push(remote);}
  for(const f of local.foams)if(!remoteIds.includes(f.id)){if(f.id in pushed)changed=true;else next.push(f);}
  if(!changed||!next.length)return;const activeId=local.foams[local.active]?.id,active=next.findIndex(f=>f.id===activeId);applying=true;try{foam.loadProject({id:local.id,name:row.name,active:active<0?0:active,foams:next});}finally{applying=false;}remember(row,foams);if(arrived)toast(`${arrived} new foam${arrived===1?'':'s'} in ${row.name} from your other device.`);fetchPhotos(foams).catch(()=>{});}
 // The foam designer's Library page lists these projects.
 const projectSource={signedIn:()=>!!user,open:openProject,saveNow:()=>flush(),
  async list(){const [{data:projects,error},{data:foams,error:foamError}]=await Promise.all([client.from('projects').select('id,name,updated_at,data').eq('deleted',false).order('updated_at',{ascending:false}),client.from('drawers').select('id,name,project_id,data,photo_path').eq('deleted',false)]);if(error||foamError)throw error||foamError;
   const paths=foams.filter(d=>d.photo_path).map(d=>d.photo_path+'.thumb.jpg'),urls=new Map();if(paths.length){const {data:signed}=await client.storage.from(BUCKET).createSignedUrls(paths,3600);for(const x of signed||[])if(x.signedUrl)urls.set(x.path,x.signedUrl);}
   return projects.map(p=>{const mine=foams.filter(d=>d.project_id===p.id),order=p.data?.foams||[];mine.sort((a,b)=>(order.indexOf(a.id)+1||1e9)-(order.indexOf(b.id)+1||1e9));return {id:p.id,name:p.name,updated:p.updated_at,foams:mine.map(d=>({name:d.name,data:d.data,thumb:d.photo_path?urls.get(d.photo_path+'.thumb.jpg')||null:null}))};});},
  async remove(id){const {error}=await client.from('projects').update({deleted:true}).eq('id',id);if(error)throw error;const {error:foamError}=await client.from('drawers').update({deleted:true}).eq('project_id',id);if(foamError)throw foamError;}};
 // A phone signing in with nothing open picks up the most recent project, so its photos land there.
 async function openRecentIfEmpty(){const p=foam.getProject();if(p.foams.some(hasContent))return;const {data}=await client.from('projects').select('id').eq('deleted',false).order('updated_at',{ascending:false}).limit(1);if(data?.[0]&&data[0].id!==p.id)await openProject(data[0].id);}

 // ---- Live updates: another device saving a tool or a foam shows up here within a second or two.
 function listen(){channel=client.channel('toolnest-'+user.id)
  .on('postgres_changes',{event:'*',schema:'public',table:'library_tools',filter:`user_id=eq.${user.id}`},()=>{clearTimeout(remoteTimer);remoteTimer=setTimeout(async()=>{if(dirty.has('library'))return;try{const fresh=await syncLibrary();if(fresh.length)toast(`New in your library: ${fresh.slice(0,3).map(t=>t.name).join(', ')}${fresh.length>3?` and ${fresh.length-3} more`:''}`);}catch{}},700);})
  .on('postgres_changes',{event:'*',schema:'public',table:'projects',filter:`user_id=eq.${user.id}`},onProjectChange)
  .on('postgres_changes',{event:'*',schema:'public',table:'drawers',filter:`user_id=eq.${user.id}`},onProjectChange)
  .subscribe();}
 let projectTimer=0;function onProjectChange({new:row}){clearTimeout(projectTimer);projectTimer=setTimeout(()=>{const open=foam.getProject().id;if(row&&(row.id===open||row.project_id===open))mergeOpenProject();foam.refreshLibrary();},800);}

 // ---- QR pairing: a random 256-bit code is shown once in the QR; only its hash is stored. The
 // phone sends it to the pair-redeem function, which signs the phone in to this account.
 async function showPairing(){const code=base64url(crypto.getRandomValues(new Uint8Array(32))),{data:row,error}=await client.from('pairings').insert({code_hash:await sha256(code)}).select('id,expires_at').single();if(error)return toast('Could not create a pairing code: '+error.message);
  const link=`${appURL()}#pair=${row.id}.${code}`,qr=qrcode(0,'M');qr.addData(link);qr.make();
  modal('Pair a phone','SCAN WITH YOUR PHONE CAMERA',`<div class="cloud-qr">${qr.createSvgTag({cellSize:5,margin:3,scalable:true})}</div><p class="cloud-note">Opens Toolnest on the phone, signed in as <b>${escape(user.email)}</b>. Tools and foams you photograph there appear in this library as soon as they're saved. The code works once and expires in <b id="pairCountdown">5:00</b>.</p><p id="pairState" class="cloud-note"></p>`);
  const end=new Date(row.expires_at).getTime(),tick=setInterval(()=>{const left=Math.max(0,end-Date.now()),el=$('pairCountdown');if(!el)return clearInterval(tick);el.textContent=`${Math.floor(left/60000)}:${String(Math.floor(left/1000)%60).padStart(2,'0')}`;if(!left){clearInterval(tick);$('pairState').textContent='Expired. Close and pair again.';}},1000);
  const watch=client.channel('pair-'+row.id).on('postgres_changes',{event:'UPDATE',schema:'public',table:'pairings',filter:`id=eq.${row.id}`},({new:p})=>{if(p.used_at&&$('pairState')){$('pairState').textContent='✓ Phone signed in.';clearInterval(tick);client.removeChannel(watch);}}).subscribe();}
 async function redeemPairing(token){const [id,code]=token.split('.');history.replaceState(null,'',appURL());try{await load();const {data,error}=await client.functions.invoke('pair-redeem',{body:{id,code}});if(error){let message='This pairing code has expired or was already used.';try{message=(await error.context.json()).error||message;}catch{}throw Error(message);}const {error:otpError}=await client.auth.verifyOtp({type:'magiclink',token_hash:data.token_hash});if(otpError)throw otpError;open();}catch(e){toast(e.message);}}

 // ---- Google: Google's own button (popup on this site); full-page redirect is the fallback.
 const loadGIS=()=>gisPromise||=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.onload=()=>resolve(globalThis.google.accounts.id);s.onerror=()=>{gisPromise=null;reject(Error('Google sign-in could not load.'));};document.head.append(s);});
 async function googleButton(el,say){try{const [gis]=await Promise.all([loadGIS(),load()]),raw=base64url(crypto.getRandomValues(new Uint8Array(16)));
  gis.initialize({client_id:GOOGLE_CLIENT_ID,nonce:await sha256(raw),use_fedcm_for_button:true,callback:async({credential})=>{say('Signing in…');const {error}=await client.auth.signInWithIdToken({provider:'google',token:credential,nonce:raw});say(error?error.message:'');}});
  if(!el.isConnected)return;el.replaceChildren();gis.renderButton(el,{theme:'outline',size:'large',text:'continue_with',shape:'pill',logo_alignment:'center',width:Math.max(220,Math.min(380,el.clientWidth||320))});}catch(e){say(e.message);}}
 async function googleRedirect(){await load();const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:appURL()}});if(error)throw error;}

 // ---- Account dialog
 function newPassword(){modal('Choose a new password','TOOLNEST CLOUD','<label class="foam-field">New password<input id="cloudNewPassword" type="password" autocomplete="new-password" minlength="8"></label><button id="cloudSetPassword" class="primary full">Save password</button><p id="cloudResetStatus" class="cloud-note"></p>');$('cloudSetPassword').onclick=async()=>{const password=$('cloudNewPassword').value;if(password.length<8)return $('cloudResetStatus').textContent='Use at least 8 characters.';const {error}=await client.auth.updateUser({password});if(error)return $('cloudResetStatus').textContent=error.message;$('modal').close();toast('Password changed. You are signed in.');};}
 function open(){modal('Account','TOOLNEST CLOUD','<div id="cloudBody"></div>');render();}
 function render(){const body=$('cloudBody');if(!body)return;
  if(!user){body.innerHTML=`<p class="cloud-note">Sign in to keep your tools and foams on every device. Photograph them on your phone and they appear here. Without an account everything stays in this browser.</p><div id="cloudGoogle" class="cloud-google"></div><button id="cloudGoogleRedirect" class="text-btn full small">Google button not showing? Sign in with Google on a full page</button><div class="cloud-or">or</div><label class="foam-field">Email<input id="cloudEmail" type="email" autocomplete="username email" inputmode="email" placeholder="you@example.com"></label><label class="foam-field">Password<input id="cloudPassword" type="password" autocomplete="current-password" minlength="8"></label><div class="foam-actions"><button id="cloudSignIn" class="primary">Sign in</button><button id="cloudSignUp" class="secondary">Create account</button></div><div class="cloud-links"><button id="cloudForgot" class="text-btn">Forgot password?</button><button id="cloudSend" class="text-btn">Email me a sign-in link instead</button></div><p id="cloudStatus" class="cloud-note"></p>`;
   const say=text=>{if($('cloudStatus'))$('cloudStatus').textContent=text;},email=()=>$('cloudEmail').value.trim(),password=()=>$('cloudPassword').value,validEmail=()=>/^\S+@\S+\.\S+$/.test(email())||(say('Enter your email address.'),false);
   // Every button loads the client first, then reports Supabase's own error message.
   const run=(id,action)=>{$(id).onclick=async()=>{const b=$(id);b.disabled=true;try{await load();await action();}catch(e){say(e.message);}finally{if($(id))b.disabled=false;}};};
   googleButton($('cloudGoogle'),say);run('cloudGoogleRedirect',googleRedirect);
   run('cloudSignIn',async()=>{if(!validEmail())return;const {error}=await client.auth.signInWithPassword({email:email(),password:password()});if(error)throw error;});
   run('cloudSignUp',async()=>{if(!validEmail())return;if(password().length<8)return say('Choose a password of at least 8 characters.');const {data,error}=await client.auth.signUp({email:email(),password:password(),options:{emailRedirectTo:appURL()}});if(error)throw error;if(!data.session)say(data.user?.identities?.length===0?'That email already has an account. Sign in, or use Forgot password.':`Check ${email()} to confirm your account, then sign in.`);});
   run('cloudForgot',async()=>{if(!validEmail())return;const {error}=await client.auth.resetPasswordForEmail(email(),{redirectTo:appURL()});if(error)throw error;say(`If ${email()} has an account, a reset link is on its way.`);});
   run('cloudSend',async()=>{if(!validEmail())return;const {error}=await client.auth.signInWithOtp({email:email(),options:{emailRedirectTo:appURL()}});if(error)throw error;say(`Check ${email()} for a sign-in link. It signs in whichever browser opens it.`);});
   $('cloudPassword').onkeydown=e=>{if(e.key==='Enter')$('cloudSignIn').click();};return;}
  // Signed in: phones get the two capture actions up front; computers get pairing.
  body.innerHTML=`<p class="cloud-note">Signed in as <b>${escape(user.email)}</b><br><span id="cloudStatus"></span></p><p class="cloud-note">Open project: <b>${escape(foam.getProject().name)}</b> · <button id="cloudProject" class="text-btn">Change</button></p>${isPhone()?'<div class="cloud-capture"><button id="cloudToolPhoto" class="primary full">📷 Photograph tools</button><p class="cloud-note">Lay tools on the printed sheet with all four corner markers in view, then tap <b>✓ Save all to library</b>. To photograph foam, open Foam and use ＋ New foam (or 📷) in the filmstrip. Everything appears on your computer as soon as it saves.</p></div>':'<button id="cloudPair" class="primary full">Pair a phone (QR code)</button><p class="cloud-note">Scan with your phone to sign it in. Tools and foams you photograph on it appear in your library here, and new foams in the open project join its filmstrip.</p>'}<button id="cloudLibrary" class="secondary full">Open library</button><button id="cloudSignOut" class="text-btn full">Sign out</button>`;showState();
  if($('cloudPair'))$('cloudPair').onclick=showPairing;if($('cloudToolPhoto'))$('cloudToolPhoto').onclick=()=>{$('modal').close();startToolPhoto();};
  $('cloudLibrary').onclick=()=>{$('modal').close();foam.showLibrary('projects');};$('cloudProject').onclick=()=>{$('modal').close();foam.showLibrary('projects');};
  $('cloudSignOut').onclick=async()=>{if(dirty.size)await flush();await client.auth.signOut();toast('Signed out. Your library and open foam stay on this device.');};}

 button.onclick=async()=>{open();if(!client&&localStorage.getItem(SESSION_KEY))await load().catch(e=>toast(e.message));};
 window.addEventListener('focus',()=>{if(user&&!dirty.has('library'))syncLibrary().catch(()=>{});});
 // Start the client only when there is a session, an email sign-in callback or a pairing link.
 const pair=/^#pair=([0-9a-f-]{36}\.[A-Za-z0-9_-]{20,100})$/.exec(location.hash);
 if(pair)redeemPairing(pair[1]);else if(localStorage.getItem(SESSION_KEY)||/access_token=|error_description=/.test(location.hash))load().catch(e=>toast(e.message));
 const failed=/error_description=([^&]+)/.exec(location.hash);if(failed){toast(decodeURIComponent(failed[1].replace(/\+/g,' ')));history.replaceState(null,'',appURL());}
 showState();
 return {open};
}
