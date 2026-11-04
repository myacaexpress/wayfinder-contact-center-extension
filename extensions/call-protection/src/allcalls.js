(() => {
  if(location.pathname!=='/take-calls')return;
  const pageSession=crypto.randomUUID();
  const visible=el=>!!(el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
  const switchControl=()=>{
    const controls=Array.from(document.querySelectorAll('button[role="switch"][aria-checked]')).filter(visible);
    const heading=Array.from(document.querySelectorAll('h1,h2')).some(el=>visible(el)&&el.textContent.trim()==='Take Calls');
    return heading&&controls.length===1&&['true','false'].includes(controls[0].getAttribute('aria-checked'))?controls[0]:null;
  };
  const labels=['Ringing','Incoming call','Talking','On a call','Dispositioning','After-call work','Waiting','Online - Taking Calls','Offline'];
  let lastStatus='',lastSent=0,inFlight=false,manualGeneration=0,acknowledgedManual=0,lastCommand=0;
  document.addEventListener('click',event=>{
    if(event.isTrusted&&event.target instanceof Element&&event.target.closest('button[role="switch"]')===switchControl())manualGeneration++;
  },true);
  function read(){
    const control=switchControl();
    const delivery=control?(control.getAttribute('aria-checked')==='true'?'on':'off'):'unknown';
    // Compare fixed labels locally; never transmit page text or caller data.
    const statusLabels=Array.from(document.querySelectorAll('[role="status"],[role="alert"],h1,h2,h3,button,span,div,p')).filter(el=>visible(el)&&!el.closest('table')&&el.children.length===0).map(el=>el.textContent.trim()).filter(text=>labels.includes(text));
    let observed=globalThis.wayfinderAllCallsDetect({statuses:statusLabels,busyLabels:statusLabels});
    if(!control)observed='unknown';
    else if(!['ringing','talking','wrap'].includes(observed)){
      observed=delivery==='off'&&statusLabels.includes('Offline')?'off':delivery==='on'&&(statusLabels.includes('Waiting')||statusLabels.includes('Online - Taking Calls'))?'waiting':'unknown';
    }
    return {observed,delivery,allcalls_session:pageSession};
  }
  async function sample(){
    if(inFlight)return;
    const value=read(),now=Date.now(),key=value.observed+value.delivery+manualGeneration;
    if(key===lastStatus&&now-lastSent<1900)return;
    lastStatus=key;lastSent=now;inFlight=true;
    const generation=manualGeneration;
    try{
      const result=await chrome.runtime.sendMessage({type:'observation',...value,manual_allcalls:generation!==acknowledgedManual,measured_at:Math.floor(now/1000)});
      if(result?.accepted)acknowledgedManual=generation;
    }catch{}finally{inFlight=false;}
  }
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(sender.id===chrome.runtime.id&&!sender.tab&&message.type==='ack-observation'&&Number.isSafeInteger(message.manual_generation)&&message.manual_generation>=0&&message.manual_generation<=manualGeneration){if(message.allcalls_session!==pageSession){reply({accepted:false});return;}acknowledgedManual=Math.max(acknowledgedManual,message.manual_generation);reply({accepted:true});return;}
    if(sender.id===chrome.runtime.id&&!sender.tab&&message.type==='read-observation'){reply({...read(),manual_allcalls:manualGeneration!==acknowledgedManual,manual_generation:manualGeneration,measured_at:Math.floor(Date.now()/1000)});return;}
    if(sender.id!==chrome.runtime.id||sender.tab||message.type!=='set-delivery'||!['on','off'].includes(message.target)||!Number.isSafeInteger(message.issued_at)||Math.abs(Date.now()-message.issued_at)>5000)return;
    if(message.allcalls_session!==pageSession){reply({accepted:false});return;}
    const control=switchControl(),value=read();
    if(control&&message.target==='off'&&control.getAttribute('aria-checked')==='false'){reply({accepted:true});return;}
    if(!control||['unknown','ringing','talking','wrap'].includes(value.observed)||(message.target==='on'&&(['unknown','ringing','talking','wrap'].includes(value.observed)||manualGeneration!==acknowledgedManual))){reply({accepted:false});return;}
    const checked=message.target==='on';
    if((control.getAttribute('aria-checked')==='true')===checked){reply({accepted:true});return;}
    if(control.disabled||Date.now()-lastCommand<1500){reply({accepted:false});return;}
    lastCommand=Date.now();control.click();
    // A click is not confirmation. The next observation must report the actual state.
    setTimeout(()=>reply({accepted:switchControl()?.getAttribute('aria-checked')===String(checked)}),1000);
    return true;
  });
  let queued=false;
  new MutationObserver(()=>{if(!queued){queued=true;setTimeout(()=>{queued=false;void sample();},100);}}).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','aria-hidden','class','aria-checked','disabled']});
  setInterval(sample,2000);addEventListener('pageshow',sample);sample();
})();
