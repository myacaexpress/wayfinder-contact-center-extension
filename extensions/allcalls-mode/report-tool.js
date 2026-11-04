let config;
const status=document.getElementById('status'),button=document.getElementById('capture');
document.getElementById('config').addEventListener('change',async event=>{
 config=null;button.disabled=true;status.textContent='';
 try {const file=event.target.files[0];if(!file||file.size>100000)throw Error();config=JSON.parse(await file.text());if(!config.source_id||!config.agency_label||!Array.isArray(config.agents))throw Error();button.disabled=false;status.textContent='Configuration loaded. Capture includes only its selected agents.';}catch{status.textContent='Choose a valid source configuration JSON file.';}
});
button.addEventListener('click',async()=>{
 button.disabled=true;status.textContent='Reading displayed report rows…';
 try {
  const tabs=(await chrome.tabs.query({url:'https://allcalls.io/agency/calls*'})).filter(t=>{const u=new URL(t.url);return u.pathname==='/agency/calls'&&!t.discarded;});
  if(tabs.length!==1)throw Error('Keep exactly one AllCalls agency Call Reporting tab open.');
  await chrome.scripting.executeScript({target:{tabId:tabs[0].id},files:['report-capture.js']});
  const result=await chrome.scripting.executeScript({target:{tabId:tabs[0].id},func:(config,at)=>{try{return {capture:globalThis.wayfinderCaptureAllCallsReport(document,config,at)};}catch(error){return {error:error.message};}},args:[config,new Date().toISOString()]});
  const value=result[0]?.result;if(!value?.capture)throw Error(value?.error||'Report capture failed.');
  const url=URL.createObjectURL(new Blob([JSON.stringify(value.capture,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='allcalls-report-capture.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  status.textContent=`Captured ${value.capture.calls.length} rows. Review and upload the file in Wayfinder Dispositions. This is not a complete historical backfill.`;
 }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
});
