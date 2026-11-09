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
  // Diagnostics: why the last read settled where it did. Enumerated tokens
  // only; no DOM text, timer contents or customer data ever leave this script.
  let lastCause='off_page';
  const switchControl=()=>{
    // No legacy click fallback: a lone campaign toggle is not the master switch.
    const controls=Array.from(document.querySelectorAll('button[role="switch"][aria-checked]'))
      .filter(el=>visible(el)&&/^turn inbound calls (on|off)$/.test(normalize(el.getAttribute('aria-label'))));
    const heading=Array.from(document.querySelectorAll('h1,h2')).some(el=>visible(el)&&normalize(el.textContent)==='take calls');
    if(!heading){lastCause='no_heading';return null;}
    if(controls.length===0){lastCause='no_switch';return null;}
    if(controls.length>1){lastCause='multiple_switches';return null;}
    if(!['true','false'].includes(controls[0].getAttribute('aria-checked'))){lastCause='switch_state_unreadable';return null;}
    return controls[0];
  };
  const statusRegion=control=>{
    // Observed 2026-11-05: direct Call Status header, sibling row containing
    // the switch + status text, three ancestors above the switch. Never widen
    // to a history table or application-wide container.
    let el=control?.parentElement;
    for(let depth=1;el&&el!==document.body&&depth<=3;depth++,el=el.parentElement){
      if(el.closest('table,nav,[role="dialog"]')||el.querySelector('table,nav,main'))continue;
      if(normalize(el.getAttribute('aria-label'))==='call status')return el;
      const children=Array.from(el.children);
      if(children.length===2&&/^(DIV|LABEL|H[1-4]|SPAN|P)$/.test(children[0].tagName)&&
         visible(children[0])&&normalize(children[0].textContent)==='call status'&&
         children[1].contains(control))return el;
    }
    return null;
  };
  const texts=(scope,idle=false)=>Array.from(scope.querySelectorAll('[role="status"],[role="alert"],h1,h2,h3,button,span,div,p'))
    .filter(el=>visible(el)&&!el.closest(idle?'table,nav,[role="dialog"]':'table,nav')&&el.textContent.length<120)
    .map(el=>normalize(el.textContent));
  const busyState=values=>{
    if(values.some(t=>/^(dispositioning|after[- ]call work|wrap[- ]?up)(?:$|[ :–-])/.test(t)))return 'wrap';
    if(values.some(t=>/^(talking|on (?:a )?call|connected|on hold|dialing|transferring)(?:$|[ :–-])/.test(t)))return 'talking';
    if(values.some(t=>/^(ringing|incoming call)(?:$|[ :–-])/.test(t)))return 'ringing';
    return null;
  };
  let lastStatus='',lastSent=0,inFlight=false,manualGeneration=0,acknowledgedManual=0,lastCommand=0;
  document.addEventListener('click',event=>{
    if(!onPage()||!event.isTrusted||!(event.target instanceof Element))return;
    const control=switchControl();
    if(control&&event.target.closest('button[role="switch"]')===control)manualGeneration++;
  },true);
  function read(){
    if(!onPage()){lastCause='off_page';return {observed:'unknown',delivery:'unknown',allcalls_session:pageSession,cause:lastCause};}
    const control=switchControl();
    const delivery=control?(control.getAttribute('aria-checked')==='true'?'on':'off'):'unknown';
    // Busy evidence is conservative; idle evidence must be in the status region.
    // No DOM text, timer contents or customer data leave this content script.
    const region=statusRegion(control),statusLabels=region?texts(region,true):[];
    const ringingControls=Array.from(document.querySelectorAll('button,[role="button"]')).some(el=>{
      if(!visible(el)||el.closest('table,nav'))return false;
      const label=normalize(el.getAttribute('aria-label')||el.textContent);
      if(/^(answer|accept|decline|reject) (?:incoming )?call$/.test(label))return true;
      if(!/^(answer|accept|decline|reject)$/.test(label))return false;
      // Generic consent/invitation actions are not call evidence. Require an
      // incoming-call accessible name on the nearest dialog, never the page.
      const dialog=el.closest('dialog,[role="dialog"],[role="alertdialog"]');
      if(!dialog||!visible(dialog))return false;
      // Referenced hidden nodes still contribute to the accessible name.
      const labelledBy=(dialog.getAttribute('aria-labelledby')||'').split(/\s+/)
        .map(id=>document.getElementById(id)).filter(Boolean)
        .map(node=>node.textContent).join(' ');
      return /^(incoming call|ringing)$/.test(normalize(labelledBy||dialog.getAttribute('aria-label')));
    });
    const callControls=Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible)
      .some(el=>/^(hang up|end call|disconnect call|mute(?: microphone)?|unmute(?: microphone)?|hold(?: call)?|resume call|transfer(?: call)?)$/.test(normalize(el.getAttribute('aria-label')||el.textContent)));
    const timer=Array.from(document.querySelectorAll('[role="status"],[role="alert"]')).filter(visible)
      .some(el=>/\b\d{1,2}:\d{2}\b/.test(el.textContent));
    const busyText=busyState(texts(document));
    let observed=busyText||(ringingControls?'ringing':callControls||timer?'talking':'unknown');
    let cause=busyText?'busy_text':ringingControls?'ringing_controls':callControls?'call_controls':timer?'call_timer':'';
    if(!['ringing','talking','wrap'].includes(observed)){
      const offline=statusLabels.some(t=>/^(offline(?: [–-] inbound calls are off)?|you're off [–-] no calls will be sent)$/.test(t));
      const waiting=statusLabels.some(t=>/^(waiting|online [–-] (?:taking calls|waiting for inbound calls))$/.test(t));
      observed=delivery==='off'&&offline?'off':delivery==='on'&&waiting?'waiting':'unknown';
      // Distinguish structural failures (switch/region not found) from wording
      // failures (region found, idle label unrecognized) and contradictions.
      cause=observed!=='unknown'?'idle_label':!control?lastCause:!region?'no_status_region':statusLabels.length===0?'empty_status_region':(offline||waiting)?'label_switch_mismatch':'no_idle_label';
    }
    lastCause=cause;
    return {observed,delivery,allcalls_session:pageSession,cause};
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
    // Every refusal names its reason so an unconfirmed pause can be diagnosed
    // from the popup trace without reproducing it on a live call.
    if(!onPage()){reply({accepted:false,reason:'off_page'});return;}
    if(message.allcalls_session!==pageSession){reply({accepted:false,reason:'session_mismatch'});return;}
    const control=switchControl(),value=read();
    if(control&&message.target==='off'&&control.getAttribute('aria-checked')==='false'){reply({accepted:true,reason:'already_off'});return;}
    if(!control){reply({accepted:false,reason:lastCause});return;}
    if(['unknown','ringing','talking','wrap'].includes(value.observed)){reply({accepted:false,reason:value.observed==='unknown'?'observed_unknown:'+value.cause:'observed_'+value.observed});return;}
    if(message.target==='on'&&manualGeneration!==acknowledgedManual){reply({accepted:false,reason:'manual_override_pending'});return;}
    const checked=message.target==='on';
    if((control.getAttribute('aria-checked')==='true')===checked){reply({accepted:true,reason:'already_'+message.target});return;}
    if(control.disabled){reply({accepted:false,reason:'switch_disabled'});return;}
    if(Date.now()-lastCommand<1500){reply({accepted:false,reason:'rate_limited'});return;}
    lastCommand=Date.now();control.click();
    // A click is not confirmation. The next observation must report the actual state.
    setTimeout(()=>{const after=switchControl()?.getAttribute('aria-checked');reply({accepted:after===String(checked),reason:after===String(checked)?'clicked_confirmed':after==null?'clicked_switch_lost':'clicked_readback_mismatch'});},1000);
    return true;
  });
  let queued=false;
  new MutationObserver(()=>{if(!queued){queued=true;setTimeout(()=>{queued=false;void sample();},100);}}).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','aria-hidden','class','aria-checked','disabled']});
  setInterval(sample,2000);addEventListener('pageshow',sample);sample();
})();
