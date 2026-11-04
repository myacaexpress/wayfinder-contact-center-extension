const WF=['https://wayfindercontactcenter.com/agent*','https://www.wayfindercontactcenter.com/agent*','https://wayfindercontactcenter.com/manager*','https://www.wayfindercontactcenter.com/manager*'];
let queue=Promise.resolve(),polling=false;
const serial=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
const state=async()=>({...((await chrome.storage.session.get('state')).state||{}),...((await chrome.storage.local.get('lastSwitch')).lastSwitch?{lastSwitch:(await chrome.storage.local.get('lastSwitch')).lastSwitch}:{})});
const save=async value=>{if(value.lastSwitch)await chrome.storage.local.set({lastSwitch:value.lastSwitch});await chrome.storage.session.set({state:value});};
const settings=async()=>({enabled:false,returnAfterWrap:false,...(await chrome.storage.local.get('settings')).settings});
const activeOrPending=async()=>{const prefs=await settings();return prefs.enabled||prefs.pending;};
const ownPage=url=>{try{const u=new URL(url);return u.origin==='https://allcalls.io'&&u.pathname==='/take-calls';}catch{return false;}};
const wfPage=url=>{try{const u=new URL(url);return ['https://wayfindercontactcenter.com','https://www.wayfindercontactcenter.com'].includes(u.origin)&&['/agent','/manager'].includes(u.pathname);}catch{return false;}};
const valid=m=>['unknown','off','waiting','ringing','talking','wrap'].includes(m?.observed)&&['on','off','unknown'].includes(m?.delivery)&&Number.isSafeInteger(m?.measured_at);
const message=(id,body)=>new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(new Error('Calling tab did not respond within 12 seconds. Refresh that tab.')),12000);
 chrome.tabs.sendMessage(id,body).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
});
async function synchronize(s,configuration){
  const identity=(await chrome.storage.local.get('identity')).identity||{clientId:crypto.randomUUID(),sequence:0};
  identity.sequence++;await chrome.storage.local.set({identity});
  const fresh=Number.isSafeInteger(s.measured_at)&&Math.abs(Date.now()/1000-s.measured_at)<8;
  const body={client_id:identity.clientId,sequence:identity.sequence,action:'sync',observed:fresh&&!s.issue?s.observed:'unknown',delivery:fresh?s.delivery:'unknown',measured_at:s.measured_at||0,manual_allcalls:!!s.manualAllcalls,expected_agent_id:identity.agentId||null,source_issue:s.issue||'none',allcalls_session:s.allcallsSession||null};
  if(configuration){
    await chrome.storage.local.set({settings:{...await settings(),pending:true}});
    Object.assign(body,{action:'configure',enabled:configuration.enabled});
  }
  // Keep the last acknowledged result visible while the next request is pending.
  s.syncStartedAt=Date.now();await save(s);
  try{
    const result=await message(s.wayfinderTab,{type:'wayfinder-request',body});
    if(!result||result.error||!result.agent_id)throw new Error(result?.error||'Wayfinder has not confirmed automatic protection.');
    identity.agentId=result.agent_id;await chrome.storage.local.set({identity});
    if(typeof result.enabled==='boolean')await chrome.storage.local.set({settings:{enabled:result.enabled,returnAfterWrap:result.return_after_wrap===true,pending:false}});
    s.manualAllcalls=false;s.result=result;s.confirmedAt=Date.now();s.error='';
    if(result.enabled!==false&&['on','off'].includes(result.allcalls_target)){
      const target=result.allcalls_target;
      s.lastSwitch={target,confirmed:false,at:Date.now(),reason:result.diagnostics?.reason||'status_change'};
      await save(s);
      const reply=await message(s.allcallsTab,{type:'set-delivery',target,allcalls_session:s.allcallsSession,issued_at:target==='off'?Date.now():s.measured_at*1000});
      s.lastSwitch={target,confirmed:reply?.accepted===true,at:Date.now(),reason:result.diagnostics?.reason||(result.wayfinder_busy?'wayfinder_busy':s.observed==='unknown'?'allcalls_unknown':'status_change')};
      if(!reply?.accepted)s.error='AllCalls '+target.toUpperCase()+' switch was not confirmed. Keep the Take Calls page open.';
    }
  }catch(error){s.error=error.message;s.result=null;
    // A transport/configuration error is not permission to change vendor state.
    // Only acknowledged, server-owned pause commands may switch AllCalls.
  }
  s.syncStartedAt=null;await save(s);return s;
}
async function pair(s){
 const all=await chrome.tabs.query({url:'https://allcalls.io/*'});
 const ac=all.filter(t=>ownPage(t.url));
 const absent=all.length===0?'allcalls_closed':all.every(t=>{try{return new URL(t.url).pathname==='/login';}catch{return false;}})?'allcalls_logged_out':'allcalls_tab_missing';
 const wf=(await chrome.tabs.query({url:WF})).filter(t=>wfPage(t.url));
 s.allcallsCount=ac.length;s.wayfinderCount=wf.length;
 const current=await chrome.tabs.query({active:true,lastFocusedWindow:true});
 const chosen=wf.find(t=>t.id===s.wayfinderTab)||(wf.length===1?wf[0]:wf.find(t=>current.some(c=>c.id===t.id)));
 if(chosen)s.wayfinderTab=chosen.id;else delete s.wayfinderTab;
 s.issue=ac.length===0?absent:ac.length>1?'multiple_allcalls_tabs':wf.length===0?'wayfinder_tab_missing':!chosen?'multiple_wayfinder_tabs':'';
 return {ac,wf};
}
async function observe(m,sender){
 const s=await state(),{ac}=await pair(s);
 if(!ac.some(t=>t.id===sender.tab.id))return;
 s.allcallsTab=sender.tab.id;s.observed=m.observed;s.delivery=m.delivery;s.measured_at=m.measured_at;
 s.allcallsSession=m.allcalls_session||null;
 s.manualAllcalls=!!s.manualAllcalls||m.manual_allcalls===true;
 if(!await activeOrPending()){await save(s);return {accepted:true};}
 if(s.issue){
   s.result=null;

 }
 if(s.wayfinderTab)await synchronize(s);else await save(s);
 return {accepted:!s.error&&!s.issue};
}
// A visible Wayfinder tab actively requests a fresh DOM sample. Background-tab
// timer throttling in AllCalls no longer starves the server's 30-second lease.
async function poll(sender){
 if(!await activeOrPending())return;
 const s=await state(),{ac,wf}=await pair(s);
 if(!wf.some(t=>t.id===sender.tab.id))return;
 if(!s.wayfinderTab){await save(s);return;}
 if(!(await settings()).pending&&!s.issue&&s.confirmedAt&&Date.now()-s.confirmedAt<1500)return;
 if(ac.length===1){
   s.allcallsTab=ac[0].id;
   try{
     const m=await message(ac[0].id,{type:'read-observation'});
     if(!valid(m))throw new Error('AllCalls status reader did not return a valid observation.');
     const accepted=await observe(m,{tab:ac[0]});
     if(accepted?.accepted&&Number.isSafeInteger(m.manual_generation))await message(ac[0].id,{type:'ack-observation',manual_generation:m.manual_generation,allcalls_session:m.allcalls_session});
     return accepted;
   }catch{ s.issue='allcalls_reader_unavailable'; }
 }
 s.observed='unknown';s.delivery='unknown';s.measured_at=Math.floor(Date.now()/1000);
 await synchronize(s);
}
async function configure(m){
 const s=await state(),{ac,wf}=await pair(s);
 if(Number.isSafeInteger(m.wayfinderTabId)){
   if(!wf.some(t=>t.id===m.wayfinderTabId))throw new Error('That workspace is no longer open. Reopen the popup and choose again.');
   s.wayfinderTab=m.wayfinderTabId;
   await pair(s);
 }
 if(!s.wayfinderTab&&wf.length>1)throw new Error('Choose your Wayfinder workspace below the protection switch, then try again.');
 if(!s.wayfinderTab)throw new Error('Open the paired signed-in Wayfinder workspace to change protection.');
 s.observed='unknown';s.delivery='unknown';s.measured_at=0;
 if(m.enabled&&ac.length===1){
   s.allcallsTab=ac[0].id;
   try{const sample=await message(ac[0].id,{type:'read-observation'});if(valid(sample))Object.assign(s,{observed:sample.observed,delivery:sample.delivery,measured_at:sample.measured_at,manualAllcalls:sample.manual_allcalls===true,allcallsSession:sample.allcalls_session||null});else s.issue='allcalls_reader_unavailable';}
   catch{s.issue='allcalls_reader_unavailable';}
 }
 await synchronize(s,{enabled:m.enabled});
 if(s.error)throw new Error(s.error);
 return {accepted:true};
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
 if(sender.id!==chrome.runtime.id)return;
 // Popup reads never wait behind network/provider calls.
 if(m.type==='status'&&!sender.tab&&sender.url===chrome.runtime.getURL('popup.html')){
   Promise.all([state(),settings()]).then(async([s,prefs])=>{
     const pairedTab=s.wayfinderTab;
     const {wf}=await pair(s);
     const current=await chrome.tabs.query({active:true,lastFocusedWindow:true});
     const windows=[...new Set(wf.map(t=>t.windowId))];
     reply({...s,settings:prefs,workspaces:wf.map(t=>({id:t.id,title:new URL(t.url).pathname==='/manager'?'Manager board':'Agent workspace',current:current.some(c=>c.id===t.id),paired:t.id===pairedTab&&!!s.confirmedAt,window:windows.indexOf(t.windowId)+1,position:Number.isInteger(t.index)?t.index+1:null})),needsWorkspace:wf.length>0});
   }).catch(()=>reply({error:'Could not inspect workspace tabs.'}));return true;
 }
 if(m.type==='focus-workspace'&&!sender.tab&&sender.url===chrome.runtime.getURL('popup.html')&&Number.isSafeInteger(m.wayfinderTabId)){
   (async()=>{
     const wf=(await chrome.tabs.query({url:WF})).filter(t=>wfPage(t.url));
     const tab=wf.find(t=>t.id===m.wayfinderTabId);
     if(!tab)throw new Error('That workspace is no longer open. Choose another tab.');
     await chrome.tabs.update(tab.id,{active:true});
     await chrome.windows.update(tab.windowId,{focused:true});
     return {accepted:true};
   })().then(reply).catch(error=>reply({error:error.message}));return true;
 }
 if(m.type==='configure'&&!sender.tab&&sender.url===chrome.runtime.getURL('popup.html')&&typeof m.enabled==='boolean'){
   serial(()=>configure(m)).then(reply).catch(error=>reply({error:error.message}));return true;
 }
 if(m.type==='poll'&&sender.tab&&wfPage(sender.url)){
   if(polling){reply({});return;}
   polling=true;serial(()=>poll(sender)).then(value=>reply(value||{})).catch(()=>reply({})).finally(()=>{polling=false;});return true;
 }
 if(m.type!=='observation'||!ownPage(sender.url)||!sender.tab||!valid(m))return;
 serial(()=>observe(m,sender)).then(result=>reply(result||{})).catch(error=>reply({error:error.message}));return true;
});
chrome.tabs.onRemoved.addListener(tabId=>{void serial(async()=>{
 if(!await activeOrPending())return;
 const s=await state();
 if(tabId===s.allcallsTab&&s.wayfinderTab){await pair(s);s.observed='unknown';s.delivery='unknown';s.measured_at=Math.floor(Date.now()/1000);await synchronize(s);}
 if(tabId===s.wayfinderTab){s.result=null;s.issue='wayfinder_tab_missing';await save(s);}
});});
