import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {eraseStorage} from '../supabase/functions/delete-account/erase-storage.mjs';
import {createDeleteHandler} from '../supabase/functions/delete-account/handler.mjs';

const owner='11111111-1111-4111-8111-111111111111';
test('storage erasure visits folders and paginates before removing objects',async()=>{
 const files=Array.from({length:1001},(_,i)=>({id:String(i+1),name:`photo-${String(i).padStart(4,'0')}`})),removed=[];
 let listedAll=false;
 const storage={async list(path,{offset,limit}){
  if(path===owner)return {data:[{id:null,name:'foam'},{id:'root',name:'root.jpg'}]};
  assert.equal(path,owner+'/foam');if(offset===1000)listedAll=true;
  return {data:files.slice(offset,offset+limit)};
 },async remove(paths){assert.ok(listedAll);assert.ok(paths.length<=100);removed.push(...paths);return {};}};
 await eraseStorage(storage,owner);
 assert.equal(new Set(removed).size,1002);assert.ok(removed.every(path=>path.startsWith(owner+'/')));
});
test('invalid paths and listing/removal failures abort erasure',async()=>{
 await assert.rejects(eraseStorage({},'../someone-else'));
 await assert.rejects(eraseStorage({list:async()=>({data:[{id:'1',name:'../other'}]})},owner));
 await assert.rejects(eraseStorage({list:async()=>({error:Error('offline')})},owner));
 await assert.rejects(eraseStorage({list:async()=>({data:[{id:'1',name:'photo'}]}),remove:async()=>({error:Error('denied')})},owner));
});
const request=(body={confirmation:'DELETE MY ACCOUNT'},headers={})=>new Request('https://example.test/delete-account',{method:'POST',headers:{origin:'https://jggroot.github.io',authorization:'Bearer valid','content-type':'application/json',...headers},body:JSON.stringify(body)});
test('account deletion validates auth and uses only authenticated owner, removing photos first',async()=>{
 const events=[];
 const admin={auth:{getUser:async token=>{assert.equal(token,'valid');return {data:{user:{id:owner}}};},admin:{deleteUser:async id=>{events.push(['account',id]);return {};}}},storage:{from(bucket){assert.equal(bucket,'toolnest');return {list:async path=>{assert.equal(path,owner);return {data:[{id:'1',name:'photo.jpg'}]};},remove:async paths=>{events.push(['photos',paths]);return {};}};}}};
 const response=await createDeleteHandler(()=>admin)(request({confirmation:'DELETE MY ACCOUNT',user_id:'attacker-chosen-id'}));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{deleted:true});
 assert.deepEqual(events,[['photos',[owner+'/photo.jpg']],['account',owner]]);
});
test('failed storage erasure never deletes auth user or reports success',async()=>{
 let deleted=false;
 const response=await createDeleteHandler(()=>({auth:{getUser:async()=>({data:{user:{id:owner}}}),admin:{deleteUser:async()=>{deleted=true;}}},storage:{from:()=>({list:async()=>({error:Error('denied')})})}}))(request());
 assert.equal(response.status,500);assert.equal(deleted,false);assert.equal((await response.json()).deleted,undefined);
});
test('missing auth, wrong confirmation, foreign origin and unconfigured service fail closed',async()=>{
 const handler=createDeleteHandler(()=>null);
 assert.equal((await handler(request({}, {authorization:''}))).status,401);
 assert.equal((await handler(request({confirmation:'no'}))).status,400);
 assert.equal((await handler(request(undefined,{origin:'https://other.test'}))).status,403);
 assert.equal((await handler(request())).status,503);
 const invalid=createDeleteHandler(()=>({auth:{getUser:async()=>({data:{user:null},error:Error('expired')})}}));
 assert.equal((await invalid(request())).status,401);
});
test('device erasure preserves other apps on a shared origin and waits for blocked photo storage',async()=>{
 const elements=Object.fromEntries(['confirmClear','clearLocal','privacyStatus'].map(id=>[id,{}]));
 const storage={'toolnest.project.v1':'project','toolnest.cloud.photos.user':'photos','sb-ddqyjscfbvtrqmrnehhn-auth-token':'token','another-app':'keep','sb-other-auth-token':'keep'};
 Object.defineProperty(storage,'removeItem',{value:key=>delete storage[key]});
 let deletion;
 const context={document:{getElementById:id=>elements[id]},localStorage:storage,indexedDB:{deleteDatabase(name){assert.equal(name,'toolnest-media');return deletion={};}}};
 vm.runInNewContext(await readFile(new URL('../dist/privacy.js',import.meta.url),'utf8'),context);
 elements.confirmClear.checked=true;elements.confirmClear.onchange();
 const clearing=elements.clearLocal.onclick();
 deletion.onblocked();assert.match(elements.privacyStatus.textContent,/Close other/);
 assert.equal(storage['another-app'],'keep');assert.equal(storage['sb-other-auth-token'],'keep');assert.equal(storage['toolnest.project.v1'],undefined);
 deletion.onsuccess();await clearing;assert.match(elements.privacyStatus.textContent,/cleared/);
});
