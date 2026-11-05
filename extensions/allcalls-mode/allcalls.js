(() => {
  // Idempotent: background re-injection after an extension update or a
  // client-side route into Take Calls must not start a second reader.
  if(globalThis.wayfinderAllCallsReader)return;
  globalThis.wayfinderAllCallsReader=true;
  // Gate per sample, not at injection: the AllCalls app routes client-side,
  // so this script may be injected on another page and navigate here later.
  const onPage=()=>location.pathname==='/take-calls';
  const pageSession=crypto.randomUUID();
  const visible=el=>!!(el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
  const switchControl=()=>{
    const controls=Array.from(document.querySelectorAll('button[role="switch"][aria-checked]')).filter(visible);
    // Campaign switches must never be mistaken for the overall inbound control.
    const inbound=controls.filter(el=>/^Turn inbound calls (on|off)$/i.test(el.getAttribute('aria-label')||''));
    const configuring=Array.from(document.querySelectorAll('h1,h2,h3')).some(el=>visible(el)&&el.textContent.trim()==='Call Type Settings');
    const candidates=inbound.length?inbound:configuring?[]:controls;
    const heading=Array.from(document.querySelectorAll('h1,h2')).some(el=>visible(el)&&el.textContent.trim()==='Take Calls');
    return heading&&candidates.length===1&&['true','false'].includes(candidates[0].getAttribute('aria-checked'))?candidates[0]:null;
  };
  const labels=['Ringing','Incoming call','Talking','On a call','Dispositioning','After-call work','Waiting','Online - Taking Calls','Offline'];
  let lastStatus='',lastSent=0,inFlight=false,manualGeneration=0,acknowledgedManual=0,lastCommand=0;
  document.addEventListener('click',event=>{
    if(event.isTrusted&&event.target instanceof Element&&event.target.closest('button[role="switch"]')===switchControl())manualGeneration++;
  },true);
  function read(){
    if(!onPage())return {observed:'unknown',delivery:'unknown',allcalls_session:pageSession};
    const control=switchControl();
    const delivery=control?(control.getAttribute('aria-checked')==='true'?'on':'off'):'unknown';
    // Compare fixed labels locally; never transmit page text or caller data.
    const statusLabels=Array.from(document.querySelectorAll('[role="status"],[role="alert"],h1,h2,h3,button,span,div,p')).filter(el=>visible(el)&&!el.closest('table')&&el.children.length===0).map(el=>el.textContent.trim()).filter(text=>labels.includes(text));
    let observed=globalThis.wayfinderAllCallsDetect({statuses:statusLabels,busyLabels:statusLabels});
    if(!['ringing','talking','wrap'].includes(observed)){
      observed=delivery==='off'?'off':delivery==='on'&&(statusLabels.includes('Waiting')||statusLabels.includes('Online - Taking Calls'))?'waiting':'unknown';
    }
    return {observed,delivery,allcalls_session:pageSession};
  }
  async function sample(){
    if(inFlight||!onPage())return;
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
    if(!onPage()||message.allcalls_session!==pageSession){reply({accepted:false});return;}
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
