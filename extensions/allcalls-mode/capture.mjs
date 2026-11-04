import {ticket,pdfBytes,MAX_PDF} from './capture-core.mjs';
const el=id=>document.getElementById(id);
async function send(t,bytes){
 const r=await fetch('http://127.0.0.1:8768/api/research/capture',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/pdf','X-Wayfinder-Capture':t.token},body:bytes,signal:AbortSignal.timeout(90000)});
 const d=await r.json();if(!r.ok)throw Error(d.error||'Capture failed.');
 el('status').textContent=`${d.plan} / ${d.year}: ${d.message} Verification: ${d.identity_method}. SHA-256: ${d.sha256}`;
 el('code').value='';
}
async function run(download){
 try{
  const t=ticket(el('code').value);el('source').href=t.url;el('source').hidden=false;
  // Request permissions directly in this user click; never capture calling tabs.
  const granted=await chrome.permissions.request({origins:download?['https://www.uhc.com/*','http://127.0.0.1/*']:['http://127.0.0.1/*']});
  if(!granted)throw Error('Capture permission was not granted.');
  el('fetch').disabled=el('upload').disabled=true;el('status').textContent='Reading public PDF…';
  let bytes;
  if(download){
   const r=await fetch(t.url,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)});
   if(!r.ok)throw Error(`UHC returned HTTP ${r.status}. Save the PDF from the normal Chrome viewer and use Verify saved PDF.`);
   const reader=r.body.getReader(),chunks=[];let length=0;
   while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>MAX_PDF){await reader.cancel();throw Error('PDF exceeds 25 MB.');}chunks.push(value);}
   bytes=await pdfBytes(new Blob(chunks));
  }else{
   const file=el('file').files[0];if(!file)throw Error('Select the saved public UHC PDF.');bytes=await pdfBytes(file);
  }
  el('status').textContent='Verifying year, plan ID and source excerpts…';await send(t,bytes);
 }catch(e){el('status').textContent=e.message;}
 finally{el('fetch').disabled=el('upload').disabled=false;}
}
el('fetch').addEventListener('click',()=>run(true));el('upload').addEventListener('click',()=>run(false));
