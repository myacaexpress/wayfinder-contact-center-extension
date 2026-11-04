// Fixed Verify messages only: no endpoint, credential or generic command bridge.
(() => {
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 const workspace=()=>['https://wayfindercontactcenter.com','https://www.wayfindercontactcenter.com'].includes(location.origin)&&['/agent','/manager'].includes(location.pathname);
 window.addEventListener('message',event=>{
  const data=event.data;
  if(event.source!==window||event.origin!==location.origin||!workspace()||data?.type!=='wayfinder-integrity-verify-start'||!UUID.test(data.requestId||'')||!UUID.test(data.intakeId||''))return;
  chrome.runtime.sendMessage({type:'integrity-verify-start',requestId:data.requestId,intakeId:data.intakeId}).then(result=>window.postMessage({type:'wayfinder-integrity-verify-result',requestId:data.requestId,result},location.origin),()=>window.postMessage({type:'wayfinder-integrity-verify-result',requestId:data.requestId,result:{status:'blocked',code:'connection_unavailable'}},location.origin));
 });
 chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message?.type!=='integrity-verify-api'||sender.id!==chrome.runtime.id||!workspace())return;
  const action=message.action,body=message.body;
  if(!['prepare','claim'].includes(action)||!UUID.test(body?.intake_id||'')||action==='claim'&&!UUID.test(body?.job_id||'')){reply({error:'invalid_request'});return;}
  const requestId=crypto.randomUUID();let timer;
  const listener=event=>{
   if(event.source!==window||event.origin!==location.origin||event.data?.type!=='wayfinder-integrity-verify-api-result'||event.data.requestId!==requestId)return;
   clearTimeout(timer);window.removeEventListener('message',listener);reply(event.data.result);
  };
  window.addEventListener('message',listener);
  timer=setTimeout(()=>{window.removeEventListener('message',listener);reply({error:'connection_unavailable'});},12000);
  window.postMessage({type:'wayfinder-integrity-verify-api',requestId,action,body:{intake_id:body.intake_id,...(action==='claim'?{job_id:body.job_id}:{})}},location.origin);
  return true;
 });
})();
