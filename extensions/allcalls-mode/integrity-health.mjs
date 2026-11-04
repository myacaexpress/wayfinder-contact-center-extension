import {readProfileNpn} from './integrity-verify.mjs';
// Read only the observed Medical Profile cards. No hidden app state, vendor
// requests, credentials, storage, writes, eligibility or enrollment actions.
const ORIGIN='https://connect.integrity.com';
const norm=value=>String(value||'').trim().replace(/\s+/g,' ');
const visible=element=>element&&!element.closest('[hidden],[aria-hidden="true"]')&&element.getClientRects().length>0&&element.ownerDocument.defaultView.getComputedStyle(element).visibility!=='hidden';
const all=(root,selector)=>Array.from(root.querySelectorAll(selector)).filter(visible);
const one=items=>items.length===1?items[0]:null;
const text=(element,max=500)=>{const value=norm(element?.textContent);if(!value||value.length>max)throw Error('unsupported_layout');return value;};
function context(doc,job,now,identity=true){
 const win=doc.defaultView;
 if(win.top!==win||win.location.origin!==ORIGIN||win.location.pathname!==`/agent/clients/contact/${job.leadId}/health`)throw Error('wrong_contact');
 if(job.expiresAt<=now())throw Error('expired');
 if(all(doc,'[role="dialog"],input[type="password"]').length)throw Error('page_not_ready');
 const heading=one(all(doc,'h2').filter(e=>norm(e.textContent)===job.name));
 if(identity&&!heading)throw Error('contact_mismatch');
}
function section(doc,label){
 const heading=one(all(doc,'h3').filter(e=>label==='Conditions'?norm(e.textContent)==='Conditions':new RegExp(`^${label}\\s*\\(\\d+\\)$`).test(norm(e.textContent))));
 if(!heading)throw Error('lists_not_ready');
 const countText=label==='Conditions'?norm(one(all(heading.parentElement,'div[class*="_infoIcon_"]'))?.textContent):norm(heading.textContent);
 const match=countText.match(/\((\d+)\)$/);if(!match)throw Error('lists_not_ready');
 const count=Number(match[1]);
 if(count>50)throw Error('list_limit');
 const root=heading.closest('section');if(!root)throw Error('unsupported_layout');
 const rows=all(root,label==='Conditions'?'tbody tr':'div[class*="_providerContainer_"]');
 if(rows.length!==count)throw Error('incomplete_list');
 if(!count&&!norm(root.textContent).replace(/\s+\./g,'.').includes(`This contact has no ${label.toLowerCase()}.`))throw Error('lists_not_ready');
 return rows;
}
export async function readIntegrityHealth(doc,job,{now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const blocked=code=>({status:'blocked',code});
 if(!job||!/^[1-9][0-9]{0,18}$/.test(job.leadId||'')||!/^[0-9]{1,20}$/.test(job.agentNpn||'')||typeof job.name!=='string'||!job.name.trim()||job.name.length>401||!Number.isFinite(job.issuedAt)||!Number.isFinite(job.expiresAt)||job.issuedAt>now()||job.expiresAt<=job.issuedAt||job.expiresAt-job.issuedAt>120000)return blocked('invalid_request');
 let opened=false,menu;
 try{
  context(doc,job,now);
  // The signed-in NPN is observed in the profile menu, never inferred from the
  // selected client's card or a browser storage value.
  menu=one(all(doc,'[role="menu"]'));
  if(!menu){
   const profile=one(all(doc,'button[aria-label="Profile menu"][aria-haspopup="true"]'));
   if(!profile)return blocked('account_unverified');
   profile.click();opened=true;
   for(let i=0;i<40;i++){context(doc,job,now,false);menu=one(all(doc,'[role="menu"]'));if(menu)break;await wait(50);}
  }
  const agentNpn=readProfileNpn(menu);
  if(!agentNpn||agentNpn!==job.agentNpn)return blocked('account_mismatch');
  if(opened&&menu){menu.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));opened=false;await wait(50);}
  context(doc,job,now);
  const medications=section(doc,'Prescriptions').map(row=>({name:text(one(all(row,'h4'))),supply:text(one(all(row,'div[class*="_prescription_package_"]')),200)}));
  const doctors=section(doc,'Providers').map(row=>{
   const name=text(one(all(row,'h6'))),addresses=all(row,'[data-testid^="providers-list-address-text-"]').map(e=>text(e));
   if(!addresses.length||addresses.length>20)throw Error('incomplete_provider');
   return {name,addresses};
  });
  const pharmacies=section(doc,'Pharmacy').map(row=>{
   const name=text(one(all(row,'div[class*="_name_"]')));
   const addressElement=one(all(row,'div[class*="_address_"]'));
   if(!addressElement)throw Error('incomplete_pharmacy');
   const address=norm(Array.from(addressElement.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent).join(' '));
   if(!address||address.length>500)throw Error('incomplete_pharmacy');
   const phones=all(row,'div[class*="_phone_"]'),primary=all(row,'div[class*="_primaryTag_"]');
   if(phones.length>1||primary.length>1||primary.length&&text(primary[0])!=='Primary')throw Error('incomplete_pharmacy');
   return {name,address,phone:phones.length?text(phones[0],100):'',primary:primary.length===1};
  });
  const conditions=section(doc,'Conditions').map(row=>({name:text(one(all(row,'div[class*="_conditionNameCell_"]')))}));
  context(doc,job,now);
  return {status:'complete',source:'integrity_browser',leadId:job.leadId,observedAt:now(),medications,doctors,pharmacies,conditions};
 }catch(error){return blocked(['wrong_contact','expired','page_not_ready','contact_mismatch','lists_not_ready','list_limit','unsupported_layout','incomplete_list','incomplete_provider','incomplete_pharmacy'].includes(error.message)?error.message:'page_unreadable');}
 finally{if(opened&&menu)menu.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));}
}
