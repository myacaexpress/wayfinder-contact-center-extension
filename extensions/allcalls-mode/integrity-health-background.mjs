const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOST='https://connect.integrity.com/*';
const page=url=>{try{const u=new URL(url);return ['https://wayfindercontactcenter.com','https://www.wayfindercontactcenter.com'].includes(u.origin)&&['/agent','/manager'].includes(u.pathname);}catch{return false;}};
const contact=(url,id)=>{try{const u=new URL(url);return u.origin==='https://connect.integrity.com'&&u.pathname===`/agent/clients/contact/${id}/health`;}catch{return false;}};
export function installIntegrityHealthBridge(chrome,{wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const busy=new Set();
 async function run(message,sender){
  const blocked=code=>({status:'blocked',code});
  if(!await chrome.permissions.contains({origins:[HOST]}))return blocked('permission_required');
  const authorize=()=>chrome.tabs.sendMessage(sender.tab.id,{type:'integrity-health-authorize',requestId:message.requestId,leadId:message.leadId},{frameId:0});
  const job=await authorize();
  if(job?.leadId!==message.leadId||!job.agentNpn||!job.name||!Number.isFinite(job.expiresAt)||job.expiresAt<=Date.now())return blocked('authorization_failed');
  // A fresh background document cannot contain a previous contact's SPA cards.
  // Never navigate, read from or close an agent's existing contact tab.
  let created=false,tab;
  try{
   if(!tab){tab=await chrome.tabs.create({url:`https://connect.integrity.com/agent/clients/contact/${message.leadId}/health`,active:false});created=true;}
   if(!Number.isInteger(tab?.id))return blocked('contact_not_ready');
   for(let i=0;i<40;i++){
    if(Date.now()>=job.expiresAt)return blocked('expired');
    const current=await chrome.tabs.get(tab.id);
    if(current.status==='complete'){
     if(!contact(current.url,message.leadId))return blocked('login_or_contact_required');
     const results=await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},world:'ISOLATED',func:async(url,job)=>{const module=await import(url);return module.readIntegrityHealth(document,job);},args:[chrome.runtime.getURL('integrity-health.mjs'),job]});
     const result=results?.length===1?results[0].result:null;
     if(result?.status==='complete'){
      // Recheck current app selection, server ownership and vendor tab after read.
      const fresh=await authorize(),end=await chrome.tabs.get(tab.id);
      if(fresh?.leadId!==job.leadId||fresh.agentNpn!==job.agentNpn||fresh.name!==job.name||!contact(end.url,job.leadId))return blocked('context_changed');
      return result;
     }
     if(!['lists_not_ready','contact_mismatch','incomplete_list'].includes(result?.code))return result||blocked('page_unreadable');
    }
    await wait(250);
   }
   return blocked('contact_not_ready');
  }finally{if(created&&Number.isInteger(tab?.id))await chrome.tabs.remove(tab.id).catch(()=>{});}
 }
 chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message?.type!=='integrity-health-start')return;
  if(sender.id!==chrome.runtime.id||sender.frameId!==0||!sender.tab||!page(sender.url)||!page(sender.tab.url)||!UUID.test(message.requestId||'')||!/^[1-9][0-9]{0,18}$/.test(message.leadId||'')){reply({status:'blocked',code:'invalid_request'});return;}
  if(busy.has(sender.tab.id)){reply({status:'blocked',code:'busy'});return;}
  busy.add(sender.tab.id);
  run(message,sender).then(reply,()=>reply({status:'blocked',code:'connection_unavailable'})).finally(()=>busy.delete(sender.tab.id));
  return true;
 });
}
