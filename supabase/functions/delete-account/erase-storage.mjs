// List before deleting so pagination cannot skip objects as the bucket shrinks.
// Call only after authenticating the user on the server.
export async function eraseStorage(storage, userId) {
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId))throw Error('Invalid account id');
 const paths=[],folders=[userId];
 for(let next=0;next<folders.length;next++){
  const folder=folders[next];
  if(folder.split('/').length>20||folders.length>10000)throw Error('Storage tree too large');
  for(let offset=0;;offset+=1000){
   const {data,error}=await storage.list(folder,{limit:1000,offset,sortBy:{column:'name',order:'asc'}});
   if(error)throw error;
   if(!Array.isArray(data))throw Error('Storage listing unavailable');
   for(const item of data){
    if(!item.name||item.name==='.'||item.name==='..'||item.name.includes('/'))throw Error('Invalid stored path');
    const path=folder+'/'+item.name;
    if(item.id)paths.push(path);else folders.push(path);
    if(paths.length>100000)throw Error('Storage account too large');
   }
   if(data.length<1000)break;
  }
 }
 for(let offset=0;offset<paths.length;offset+=100){
  const {error}=await storage.remove(paths.slice(offset,offset+100));
  if(error)throw error;
 }
}
