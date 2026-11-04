// DOM adapter injected in the isolated world only after an authenticated claim.
// The bridge binds the job to the exact contact tab and signed-in vendor account.
// Identity is compared only in memory; outputs contain fixed enums and an opaque ID.
const attemptsByDocument = new WeakMap();
const ORIGIN = 'https://connect.integrity.com';
const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
const mbi = value => normalize(value).replace(/[ -]/g, '');
function birthDate(value) {
 const text = String(value || '').trim();
 const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
 const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
 if (!iso && !us) return null;
 const [, year, month, day] = iso || [null, us[3], us[1], us[2]];
 const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
 return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === `${year}-${month}-${day}` ? `${year}-${month}-${day}` : null;
}
function visible(element) {
 if (!element || element.closest('[hidden],[aria-hidden="true"]')) return false;
 const style = element.ownerDocument.defaultView.getComputedStyle(element);
 return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}
function name(element) {
 const doc = element.ownerDocument;
 const labelled = element.getAttribute('aria-labelledby');
 if (labelled) return normalize(labelled.split(/\s+/).map(id => doc.getElementById(id)?.textContent || '').join(' '));
 return normalize(element.getAttribute('aria-label') || (element.labels?.length ? Array.from(element.labels, label => label.textContent).join(' ') : element.textContent));
}
const matching = (root, selector, predicate) => Array.from(root.querySelectorAll(selector)).filter(element => visible(element) && predicate(element));
const unique = items => items.length === 1 ? items[0] : null;
function contextError(doc, leadId) {
 try {
  if (doc.defaultView.location.origin !== ORIGIN || doc.defaultView.top !== doc.defaultView) return 'wrong_context';
  if (/\/(?:login|signin|sign-in|auth)(?:\/|$)/i.test(doc.defaultView.location.pathname) || matching(doc, 'input[type="password"]', () => true).length) return 'login_required';
  if (doc.defaultView.location.pathname !== `/agent/clients/contact/${leadId}/overview`) return 'wrong_contact';
 } catch { return 'wrong_context'; }
 return null;
}
function dialogIdentity(dialog) {
 return {
  firstName: unique(matching(dialog, 'input', field => name(field) === 'FIRST NAME')),
  lastName: unique(matching(dialog, 'input', field => name(field) === 'LAST NAME')),
  dob: unique(matching(dialog, 'input', field => field.placeholder === 'MM/DD/YYYY')),
  mbi: unique(matching(dialog, 'input', field => name(field) === 'MBI' || field.placeholder === '1AC2-CD3-EF45')),
 };
}
function identityError(fields, expected) {
 if (Object.values(fields).some(field => !field)) return 'identity_ambiguous';
 if (Object.values(fields).some(field => !field.value.trim())) return 'identity_missing';
 if (normalize(fields.firstName.value) !== normalize(expected.firstName) || normalize(fields.lastName.value) !== normalize(expected.lastName) || birthDate(fields.dob.value) !== birthDate(expected.dob) || mbi(fields.mbi.value) !== mbi(expected.mbi)) return 'identity_mismatch';
 return null;
}
export function createIntegrityVerifyAdapter(doc, {enabled = false, now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms))} = {}) {
 if (!attemptsByDocument.has(doc)) attemptsByDocument.set(doc, {attempts: new Set(), busy: false});
 const state = attemptsByDocument.get(doc), attempts = state.attempts;
 return {
  async run(job) {
   const result = (status, code) => ({status, code, ...(typeof job?.requestId === 'string' && /^[\w-]{1,128}$/.test(job.requestId) ? {requestId: job.requestId} : {})});
   const blocked = code => result('blocked', code);
   if (!enabled) return blocked('disabled');
   const expected = job?.expected;
   if (!job || typeof job.leadId !== 'string' || !/^[0-9]{1,20}$/.test(job.leadId) || typeof job.requestId !== 'string' || !/^[\w-]{1,128}$/.test(job.requestId) || !expected || !['firstName','lastName'].every(key => typeof expected[key] === 'string' && expected[key].trim() && expected[key].length <= 100) || !birthDate(expected.dob) || !/^[A-Z0-9]{11}$/.test(mbi(expected.mbi)) || !Number.isFinite(job.expiresAt) || !Number.isFinite(job.issuedAt) || job.issuedAt > now() || job.expiresAt - job.issuedAt > 300000 || job.expiresAt <= job.issuedAt) return blocked('invalid_job');
   const guard = () => contextError(doc, job.leadId) || (job.expiresAt <= now() ? 'expired_job' : null);
   const invalid = guard();
   if (invalid) return blocked(invalid);
   if (attempts.has(job.requestId)) return blocked('duplicate_job');
   if (state.busy) return blocked('busy');
   if (attempts.size >= 1000) return blocked('attempt_limit');
   // Consume before any click: uncertain outcomes must never replay automatically.
   attempts.add(job.requestId); state.busy = true;
   try {
    let dialogs = matching(doc, '[role="dialog"]', () => true);
    if (!dialogs.length) {
     const open = unique(matching(doc, 'button,[role="button"]', button => name(button) === 'VERIFY'));
     if (!open || open.disabled || open.getAttribute('aria-disabled') === 'true') return blocked('verify_unavailable');
     open.click();
     for (let i = 0; i < 40; i++) {
      const error = guard(); if (error) return blocked(error);
      dialogs = matching(doc, '[role="dialog"]', () => true);
      if (dialogs.length) break;
      await wait(50);
     }
    }
    const dialog = unique(dialogs);
    if (!dialog || matching(dialog, 'h1,h2,h3,h4,h5,h6,[role="heading"]', heading => name(heading) === 'BENEFIT ELIGIBILITY CHECK').length !== 1) return blocked('dialog_unrecognized');
    const fields = dialogIdentity(dialog);
    const mismatch = identityError(fields, expected); if (mismatch) return blocked(mismatch);
    const submit = unique(matching(dialog, 'button,[role="button"]', button => name(button) === 'RUN ELIGIBILITY CHECK'));
    if (!submit || submit.disabled || submit.getAttribute('aria-disabled') === 'true') return blocked('submit_unavailable');
    const error = guard() || (!dialog.isConnected ? 'dialog_unrecognized' : identityError(dialogIdentity(dialog), expected));
    if (error) return blocked(error);
    try { submit.click(); } catch { return result('pending', 'submission_unconfirmed'); }
    return result('pending', 'submitted');
   } catch { return blocked('page_unreadable'); }
   finally { state.busy = false; }
  },
 };
}

// Read one visible NPN row, not concatenated menu text: adjacent navigation
// items have no textContent separator. Keep exact numeric value and ambiguity
// checks; never infer an account from the contact card or a partial prefix.
export function readProfileNpn(menu) {
 if(!visible(menu))return null;
 const nodes=[menu,...menu.querySelectorAll('*')];
 const labels=nodes.filter(visible).reduce((count,element)=>count+[...element.childNodes].filter(node=>node.nodeType===3).reduce((n,node)=>n+[...node.textContent.matchAll(/\bNPN:/g)].length,0),0);
 if(labels!==1)return null;
 const rows=nodes.filter(element=>visible(element)&&/^NPN:\s*[0-9]{1,20}$/.test(String(element.textContent||'').trim()));
 const leaves=rows.filter(row=>!rows.some(other=>other!==row&&row.contains(other)));
 if(leaves.length!==1)return null;
 const row=leaves[0];
 // A visible parent must not make hidden account text count as evidence.
 if([...row.querySelectorAll('*')].some(child=>String(child.textContent||'').trim()&&!visible(child)))return null;
 return /^NPN:\s*([0-9]{1,20})$/.exec(row.textContent.trim())[1];
}

// Account identity comes from the observed Profile menu, never a contact name.
export async function inspectIntegrityVerifyContext(doc, leadId, {wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
 const blocked={ready:false,agentNpn:null};
 if(typeof leadId!=='string'||!/^[0-9]{1,20}$/.test(leadId)||contextError(doc,leadId))return blocked;
 const open=matching(doc,'button,[role="button"]',button=>name(button)==='VERIFY');
 const dialogs=matching(doc,'[role="dialog"]',()=>true);
 const ready=dialogs.length===0?open.length===1&&!open[0].disabled:dialogs.length===1&&matching(dialogs[0],'h1,h2,h3,h4,h5,h6,[role="heading"]',heading=>name(heading)==='BENEFIT ELIGIBILITY CHECK').length===1;
 if(!ready)return blocked;
 let opened=false,menu=null;
 try{
  let menus=matching(doc,'[role="menu"]',()=>true);
  if(!menus.length){
   const profile=unique(matching(doc,'button',button=>name(button)==='PROFILE MENU'&&button.getAttribute('aria-haspopup')==='true'));
   if(!profile||profile.disabled)return blocked;
   profile.click();opened=true;
   for(let i=0;i<40;i++){
    if(contextError(doc,leadId))return blocked;
    menus=matching(doc,'[role="menu"]',()=>true);if(menus.length)break;
    await wait(50);
   }
  }
  menu=unique(menus);if(!menu||contextError(doc,leadId))return blocked;
  const agentNpn=readProfileNpn(menu);
  return agentNpn?{ready:true,agentNpn}:blocked;
 }catch{return blocked;}
 finally{if(opened&&menu)menu.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));}
}
