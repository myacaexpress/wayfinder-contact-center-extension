chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || message.type !== 'wayfinder-request') return;
  const requestId=crypto.randomUUID();
  let timer;
  const listener=event=>{
    if(event.source!==window||event.origin!==location.origin||event.data?.type!=='wayfinder-call-mode-result'||event.data.requestId!==requestId)return;
    clearTimeout(timer);window.removeEventListener('message',listener);
    reply(event.data.result);
  };
  window.addEventListener('message',listener);
  timer=setTimeout(()=>{window.removeEventListener('message',listener);reply({error:'Keep the signed-in Wayfinder agent workspace open.'});},12000);
  window.postMessage({type:'wayfinder-call-mode-request',requestId,body:message.body},location.origin);
  return true;
});

// Drive observation from the active calling workspace as well as AllCalls.
const pollProtection=()=>{if(['/agent','/manager'].includes(location.pathname))chrome.runtime.sendMessage({type:'poll'}).catch(()=>{});};
setInterval(pollProtection,2000);
addEventListener('pageshow',pollProtection);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)pollProtection();});
pollProtection();
