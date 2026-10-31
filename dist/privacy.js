const confirm=document.getElementById('confirmClear'),button=document.getElementById('clearLocal'),status=document.getElementById('privacyStatus');
confirm.onchange=()=>{button.disabled=!confirm.checked;};
button.onclick=async()=>{
 if(!confirm.checked)return;
 button.disabled=true;status.textContent='Clearing Toolnest data…';
 try{
  // Deliberately scope deletion: GitHub Pages shares an origin across repositories.
  const keys=Object.keys(localStorage).filter(key=>key.startsWith('toolnest.')||key==='sb-ddqyjscfbvtrqmrnehhn-auth-token'||key.startsWith('sb-ddqyjscfbvtrqmrnehhn-auth-token-'));
  for(const key of keys)localStorage.removeItem(key);
  await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase('toolnest-media');request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>{status.textContent='Close other Toolnest tabs to finish deleting photos. Waiting for those tabs to close…';};});
  status.textContent='Toolnest data cleared on this browser. Cloud data and downloaded files were not deleted.';
 }catch(error){status.textContent='Could not finish clearing data: '+error.message;button.disabled=false;}
};
