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
  const normalize=value=>(value||'').replace(/\s+/g,' ').trim().toLowerCase();
  const switchControl=()=>{
    // No legacy click fallback: a lone campaign toggle is not the master switch.
    const controls=Array.from(document.querySelectorAll('button[role="switch"][aria-checked]'))
      .filter(el=>visible(el)&&/^turn inbound calls (on|off)$/.test(normalize(el.getAttribute('aria-label'))));
    const heading=Array.from(document.querySelectorAll('h1,h2')).some(el=>visible(el)&&normalize(el.textContent)==='take calls');
    return heading&&controls.length===1&&['true','false'].includes(controls[0].getAttribute('aria-checked'))?controls[0]:null;
  };
  const statusRegion=control=>{
    // Use only the smallest inbound control section, not queue cards elsewhere.
    for(let el=control?.parentElement;el&&el!==document.body;el=el.parentElement){
      if(normalize(el.getAttribute('aria-label'))==='call status'||
         Array.from(el.querySelectorAll('label,span,div,p,h1,h2,h3,h4')).some(n=>visible(n)&&normalize(n.textContent)==='call status'))return el;
    }
    return null;
  };
  const texts=scope=>Array.from(scope.querySelectorAll('[role="status"],[role="alert"],h1,h2,h3,button,span,div,p'))
    .filter(el=>visible(el)&&!el.closest('table,nav,[role="dialog"]')&&el.textContent.length<120)
    .map(el=>normalize(el.textContent));
  const busyState=values=>{
    if(values.some(t=>/^(dispositioning|after[- ]call work|wrap[- ]?up)(?:$|[ :–-])/.test(t)))return 'wrap';
    if(values.some(t=>/^(talking|on (?:a )?call|connected|on hold|dialing|transferring)(?:$|[ :–-])/.test(t)))return 'talking';
    if(values.some(t=>/^(ringing|incoming call)(?:$|[ :–-])/.test(t)))return 'ringing';
    return null;
  };
  let lastStatus='',lastSent=0,inFlight=false,manualGeneration=0,acknowledgedManual=0,lastCommand=0;
  document.addEventListener('click',event=>{
    if(event.isTrusted&&event.target instanceof Element&&event.target.closest('button[role="switch"]')===switchControl())manualGeneration++;
  },true);
  function read(){
    if(!onPage())return {observed:'unknown',delivery:'unknown',allcalls_session:pageSession};
    const control=switchControl();
    const delivery=control?(control.getAttribute('aria-checked')==='true'?'on':'off'):'unknown';
    // Busy evidence is conservative; idle evidence must be in the status region.
    // No DOM text, timer contents or customer data leave this content script.
    const region=statusRegion(control),statusLabels=region?texts(region):[];
    const callControls=Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible)
      .some(el=>/^(hang up|end call|disconnect call|mute(?: microphone)?|unmute(?: microphone)?|hold(?: call)?|resume call|transfer(?: call)?)$/.test(normalize(el.getAttribute('aria-label')||el.textContent)));
    const timer=Array.from(document.querySelectorAll('[role="status"],[role="alert"]')).filter(visible)
      .some(el=>/\b\d{1,2}:\d{2}\b/.test(el.textContent));
    let observed=busyState(texts(document))||(callControls||timer?'talking':'unknown');
    if(!['ringing','talking','wrap'].includes(observed)){
      const offline=statusLabels.some(t=>/^(offline(?: [–-] inbound calls are off)?|you're off [–-] no calls will be sent)$/.test(t));
      const waiting=statusLabels.some(t=>/^(waiting|online [–-] taking calls)$/.test(t));
      observed=delivery==='off'&&offline?'off':delivery==='on'&&waiting?'waiting':'unknown';
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
