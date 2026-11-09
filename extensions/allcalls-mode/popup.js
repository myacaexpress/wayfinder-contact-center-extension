const issueText={
 allcalls_tab_missing:'AllCalls Take Calls is not open in this Chrome profile.',
 multiple_allcalls_tabs:'Multiple AllCalls Take Calls tabs are open. Close the duplicate.',
 wayfinder_tab_missing:'The paired Wayfinder agent workspace or Manager board is not open.',
 multiple_wayfinder_tabs:'Choose a workspace below, or open this popup from the Wayfinder tab you want to use.',
 allcalls_reader_unavailable:'AllCalls is not responding to status checks. Refresh its Take Calls page.',
};
const names={off:'Offline',waiting:'Online · waiting',ringing:'Ringing',talking:'On a call',wrap:'Wrap-up',unknown:'Unknown'};
const age=at=>at?Math.max(0,Math.floor((Date.now()-at)/1000))+' seconds ago':'Never';
let changing=false,workspaceOptions="";
async function refresh(){
 try {
  const s=await chrome.runtime.sendMessage({type:'status'});
  const choice=document.getElementById('workspace-choice'),workspace=document.getElementById('workspace');
  choice.hidden=!s.needsWorkspace;
  const options=JSON.stringify(s.workspaces||[]);
  if(options!==workspaceOptions){
   const selected=workspace.value;
   workspace.replaceChildren(new Option('Select a workspace…',''));
   for(const tab of s.workspaces||[])workspace.add(new Option(`${tab.current?'This tab · ':''}${tab.paired?'Paired · ':''}${tab.title} · Window ${tab.window??1}${tab.position?`, tab ${tab.position}`:''}`,String(tab.id)));
   workspace.value=(s.workspaces||[]).some(t=>String(t.id)===selected)?selected:String(s.wayfinderTab||'');workspaceOptions=options;
  }
  if(!workspace.value&&s.wayfinderTab)workspace.value=String(s.wayfinderTab);
  document.getElementById('workspace-open').disabled=!workspace.value;
  document.getElementById('workspace-help').textContent=s.workspaces?.some(t=>t.id===Number(workspace.value)&&t.paired)?'Paired workspace. Tab selection does not change the signed-in account.':'This tab is the page you are viewing. Other entries are open pages; sign-in is confirmed when protection connects.';
  const prefs=s.settings||{enabled:false,returnAfterWrap:false};
  if(!changing){document.getElementById('enabled').checked=prefs.enabled;}
  document.getElementById('enabled').disabled=changing||!!prefs.pending;
  const r=s.result,d=r?.diagnostics;
  const fresh=!!r&&s.confirmedAt&&Date.now()-s.confirmedAt<15000&&(!r.expires_at||r.expires_at*1000>Date.now());
  const standalone=r?.mode==='standalone';
  const issue=s.error||issueText[s.issue];
  document.getElementById('status').textContent=prefs.pending?'Confirming protection setting':!prefs.enabled?'Automatic protection is off':issue?'Protection needs attention':fresh&&standalone?'Wayfinder only · protection standing by':fresh?(r.mode==='auto_observe'?'Protection needs attention':r.mcp_allowed?'Automatic protection active':'New Wayfinder calls paused'):s.confirmedAt?'Status updates are stale':'Waiting for connection';
  document.getElementById('detail').textContent=prefs.pending?'The change is not yet confirmed. Keep Wayfinder open while the extension checks its actual setting.':!prefs.enabled?'No automatic status changes. Manage both systems yourself.':issue||(fresh?d?.reason_text||'Status confirmed by Wayfinder.':s.confirmedAt?'The last confirmation is too old. Keep a calling tab visible and refresh both pages if updates do not resume.':'Open AllCalls Take Calls and a signed-in Wayfinder agent workspace in this Chrome profile.');
  document.getElementById('version').textContent=s.version?`Extension version ${s.version}`:'';
  const fields=[['AllCalls observed',names[s.observed]||'Unknown'],['AllCalls evidence',s.cause||'Not recorded'],['AllCalls switch',s.delivery==='on'?'On':s.delivery==='off'?'Off':'Unknown'],['Wayfinder observed',d?.wayfinder_state||r?.wayfinder_state||'Unknown'],['Last successful sync',age(s.confirmedAt)],['Last AllCalls sample',age(s.measured_at*1000)],['Tabs found',`${s.allcallsCount??0} AllCalls · ${s.wayfinderCount??0} Wayfinder`],['Blocking reason',prefs.pending?'settings_confirmation_pending':!prefs.enabled?'protection_off':s.issue|| (s.error?'sync_failed':!fresh?'status_stale':d?.reason||'none')]];
  const list=document.getElementById('diagnostics');list.replaceChildren();
  for(const [label,value] of fields){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;list.append(dt,dd);}
  const last=s.lastSwitch;
  document.getElementById('last-switch').textContent=last?`Last automatic AllCalls switch: ${last.target.toUpperCase()} · ${last.confirmed?'confirmed':'not confirmed'} · ${age(last.at)} · Reason: ${last.reason||'Not recorded'}${last.detail?` · Detail: ${last.detail}`:''}`:'No automatic AllCalls switch has been needed in this browser session.';
 }catch{document.getElementById('status').textContent='Protection connection unavailable';}
}
refresh();setInterval(refresh,1000);

async function changeSettings(){
 if(changing)return;
 changing=true;
 const enabled=document.getElementById('enabled'),message=document.getElementById('settings-message');
 enabled.disabled=true;message.textContent='Waiting for Wayfinder to confirm…';
 try{
  const result=await chrome.runtime.sendMessage({type:'configure',enabled:enabled.checked,...(document.getElementById('workspace').value?{wayfinderTabId:Number(document.getElementById('workspace').value)}:{})});
  if(!result?.accepted)throw new Error(result?.error||'Wayfinder has not confirmed this change.');
  message.textContent='Settings confirmed by Wayfinder.';
 }catch(error){message.textContent='Change not confirmed: '+error.message;}
 finally{changing=false;enabled.disabled=false;await refresh();}
}
document.getElementById('enabled').addEventListener('change',changeSettings);

const workspace=document.getElementById('workspace');
workspace.addEventListener('change',()=>{document.getElementById('workspace-open').disabled=!workspace.value;});
document.getElementById('workspace-open').addEventListener('click',async()=>{
 try{
  const result=await chrome.runtime.sendMessage({type:'focus-workspace',wayfinderTabId:Number(workspace.value)});
  if(!result?.accepted)throw new Error(result?.error||'Could not open that workspace.');
  window.close();
 }catch(error){document.getElementById('settings-message').textContent=error.message;await refresh();}
});

// Support bundle: enumerated trace and state tokens from the service worker.
// Shown in a read-only box as well as copied, so it still works if the
// clipboard is unavailable in this profile.
document.getElementById('copy-diagnostics').addEventListener('click',async()=>{
 const message=document.getElementById('copy-message'),box=document.getElementById('diagnostics-text');
 message.textContent='Collecting…';
 try{
  const bundle=await chrome.runtime.sendMessage({type:'diagnostics'});
  if(!bundle||bundle.error)throw new Error(bundle?.error||'Diagnostics unavailable.');
  const text=JSON.stringify(bundle,null,1);
  box.value=text;box.hidden=false;
  try{await navigator.clipboard.writeText(text);message.textContent=`Copied ${bundle.trace?.length??0} trace entries. Paste them into the support thread.`;}
  catch{box.select();message.textContent='Clipboard blocked. Select the text below and copy it.';}
 }catch(error){message.textContent='Could not collect diagnostics: '+error.message;}
});
