const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOST='https://connect.integrity.com/*';
function wayfinder(url){try{const u=new URL(url);return ['https://wayfindercontactcenter.com','https://www.wayfindercontactcenter.com'].includes(u.origin)&&['/agent','/manager'].includes(u.pathname);}catch{return false;}}
function leadPage(url,id){try{const u=new URL(url);return u.origin==='https://connect.integrity.com'&&u.pathname===`/agent/clients/contact/${id}/overview`;}catch{return false;}}
export function installIntegrityVerifyBridge(chrome,{wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const busy=new Set(),attempted=new Set();
 const api=async(tabId,action,body)=>{
  let timer;
  try{return await Promise.race([chrome.tabs.sendMessage(tabId,{type:'integrity-verify-api',action,body},{frameId:0}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),15000);})]);}
  finally{clearTimeout(timer);}
 };
 async function run(message,sender){
  const blocked=(code,jobId)=>({status:'blocked',code,...(UUID.test(jobId||'')?{jobId}:{})});
  if(!await chrome.permissions.contains({origins:[HOST]}))return blocked('permission_required');
  const prepared=await api(sender.tab.id,'prepare',{intake_id:message.intakeId});
  if(!prepared||prepared.intakeId!==message.intakeId||!UUID.test(prepared.jobId||'')||!/^[0-9]{1,20}$/.test(prepared.leadId||'')||!/^[0-9]{1,20}$/.test(prepared.agentNpn||''))return blocked('prepare_failed');
  const jobId=prepared.jobId;
  if(['claimed','completed'].includes(prepared.status)||attempted.has(jobId))return {status:'pending',code:'already_claimed',jobId};
  if(prepared.status!=='prepared'||Date.parse(prepared.claimExpiresAt)<=Date.now()||!Number.isFinite(Date.parse(prepared.claimExpiresAt)))return blocked('expired_job',jobId);
  const tabs=(await chrome.tabs.query({url:HOST})).filter(tab=>leadPage(tab.url,prepared.leadId));
  if(tabs.length>1)return blocked('ambiguous_contact_tab',jobId);
  // Never replace an unrelated contact tab. The background tab contains only
  // the server-bound opaque lead ID, never beneficiary identity fields.
  let tab=tabs[0]||await chrome.tabs.create({url:`https://connect.integrity.com/agent/clients/contact/${prepared.leadId}/overview`,active:false});
  if(!Number.isInteger(tab?.id))return blocked('contact_not_ready',jobId);
  let loaded=false;
  for(let attempt=0;attempt<40;attempt++){
   if(Date.parse(prepared.claimExpiresAt)<=Date.now())return blocked('expired_job',jobId);
   tab=await chrome.tabs.get(tab.id);
   if(tab.status==='complete'){
    if(!leadPage(tab.url,prepared.leadId))return blocked(/\/(?:login|signin|sign-in|auth)(?:\/|[?#]|$)/i.test(tab.url||'')?'login_required':'contact_not_ready',jobId);
    loaded=true;break;
   }
   await wait(250);
  }
  if(!loaded)return blocked('contact_not_ready',jobId);
  const matches=(await chrome.tabs.query({url:HOST})).filter(item=>leadPage(item.url,prepared.leadId));
  if(matches.length!==1||matches[0].id!==tab.id)return blocked('ambiguous_contact_tab',jobId);
  const tabId=tab.id,moduleUrl=chrome.runtime.getURL('integrity-verify.mjs');
  const probes=await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},world:'ISOLATED',func:async(url,leadId)=>{const module=await import(url);return module.inspectIntegrityVerifyContext(document,leadId);},args:[moduleUrl,prepared.leadId]});
  const probe=probes?.length===1?probes[0].result:null;
  if(!probe?.ready)return blocked('contact_not_ready',jobId);
  if(!probe.agentNpn||probe.agentNpn!==prepared.agentNpn)return blocked('account_unverified',jobId);
  // Claim only after permission, unique bound tab and account evidence are ready.
  attempted.add(jobId);
  try {
  const claimed=await api(sender.tab.id,'claim',{intake_id:message.intakeId,job_id:jobId});
  if(!claimed||claimed.jobId!==jobId||claimed.intakeId!==message.intakeId||claimed.status!=='claimed'||claimed.action!=='verify_eligibility'||claimed.expected?.leadId!==prepared.leadId||claimed.expected?.agentNpn!==prepared.agentNpn)return blocked('claim_failed',jobId);
  const issuedAt=Date.parse(claimed.claimedAt),expiresAt=Math.min(Date.parse(claimed.expiresAt),issuedAt+120000);
  if(!Number.isFinite(issuedAt)||!Number.isFinite(expiresAt)||expiresAt<=Date.now())return blocked('expired_job',jobId);
  const expected=claimed.expected;
  const results=await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},world:'ISOLATED',func:async(url,job,agentNpn)=>{
   const module=await import(url),context=await module.inspectIntegrityVerifyContext(document,job.leadId);
   if(!context.ready||context.agentNpn!==agentNpn)return {status:'blocked',code:'account_unverified'};
   return module.createIntegrityVerifyAdapter(document,{enabled:true}).run(job);
  },args:[moduleUrl,{requestId:jobId,leadId:prepared.leadId,issuedAt,expiresAt,expected:{firstName:expected.firstName,lastName:expected.lastName,dob:expected.dob,mbi:expected.medicareNumber}},prepared.agentNpn]});
  const result=results?.length===1?results[0].result:null;
  if(result?.status==='pending')return {status:'pending',code:result.code==='submitted'?'submitted':'submission_unconfirmed',jobId};
  return blocked('verification_not_started',jobId);
  }catch{return {status:'pending',code:'submission_unconfirmed',jobId};}
 }
 chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message?.type!=='integrity-verify-start')return;
  if(sender.id!==chrome.runtime.id||sender.frameId!==0||!sender.tab||!wayfinder(sender.url)||!wayfinder(sender.tab.url)||!UUID.test(message.intakeId||'')||!UUID.test(message.requestId||'')){reply({status:'blocked',code:'invalid_request'});return;}
  const key=`${sender.tab.id}:${message.intakeId}`;
  if(busy.has(key)){reply({status:'blocked',code:'busy'});return;}
  busy.add(key);
  run(message,sender).then(result=>{busy.delete(key);reply(result);},()=>{busy.delete(key);reply({status:'blocked',code:'connection_unavailable'});});
  return true;
 });
}
