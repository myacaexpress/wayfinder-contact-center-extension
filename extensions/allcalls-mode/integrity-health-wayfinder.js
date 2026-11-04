// Dedicated ephemeral health-list bridge. Never persists or logs imported text.
(() => {
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 const workspace=()=>['https://wayfindercontactcenter.com','https://www.wayfindercontactcenter.com'].includes(location.origin)&&['/agent','/manager'].includes(location.pathname);
 window.addEventListener('message',event=>{
  const data=event.data;
  if(event.source!==window||event.origin!==location.origin||!workspace()||data?.type!=='wayfinder-integrity-health-start'||!UUID.test(data.requestId||'')||!/^[1-9][0-9]{0,18}$/.test(data.leadId||''))return;
  chrome.runtime.sendMessage({type:'integrity-health-start',requestId:data.requestId,leadId:data.leadId}).then(result=>window.postMessage({type:'wayfinder-integrity-health-result',requestId:data.requestId,result},location.origin),()=>window.postMessage({type:'wayfinder-integrity-health-result',requestId:data.requestId,result:{status:'blocked',code:'connection_unavailable'}},location.origin));
 });
 chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message?.type!=='integrity-health-authorize'||sender.id!==chrome.runtime.id||!workspace()||!UUID.test(message.requestId||'')||!/^[1-9][0-9]{0,18}$/.test(message.leadId||''))return;
  const nonce=crypto.randomUUID();let timer;
  const listener=event=>{const data=event.data;if(event.source!==window||event.origin!==location.origin||data?.type!=='wayfinder-integrity-health-authorized'||data.nonce!==nonce)return;clearTimeout(timer);window.removeEventListener('message',listener);reply(data.result);};
  window.addEventListener('message',listener);
  timer=setTimeout(()=>{window.removeEventListener('message',listener);reply(null);},10000);
  window.postMessage({type:'wayfinder-integrity-health-authorize',requestId:message.requestId,leadId:message.leadId,nonce},location.origin);
  return true;
 });
})();
