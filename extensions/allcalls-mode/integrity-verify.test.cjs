const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const NOW = 1800000000000;
const expected = {firstName:'Synthetic',lastName:'Example',dob:'1952-04-12',mbi:'1AA1AA1AA11'};
const job = (patch={}) => ({requestId:'synthetic-job',leadId:'90000001',issuedAt:NOW-1000,expiresAt:NOW+60000,expected:{...expected},...patch});
const dialogHtml = `<div role="dialog"><h2>Benefit Eligibility Check</h2><h3>Run an Eligibility Check</h3><label>First Name<input value="Synthetic"></label><label>Last Name<input value="Example"></label><input placeholder="MM/DD/YYYY" value="04/12/1952"><label>MBI<input placeholder="1AC2-CD3-EF45" value="1AA1-AA1-AA11"></label><button>Run Eligibility Check</button></div>`;
async function fixture({url='https://connect.integrity.com/agent/clients/contact/90000001/overview',html='<button>Verify</button>',enabled=true,wait,now=()=>NOW}={}) {
 const {createIntegrityVerifyAdapter} = await import('./integrity-verify.mjs');
 const dom = new JSDOM(html,{url}), doc=dom.window.document;
 dom.window.HTMLElement.prototype.getClientRects=()=>[{}];
 let opens=0,submits=0;
 doc.addEventListener('click',event=>{
  if(event.target.textContent==='Verify') {opens++;doc.body.insertAdjacentHTML('beforeend',dialogHtml);}
  if(event.target.textContent==='Run Eligibility Check')submits++;
 });
 const options={enabled,now,wait:wait||(()=>Promise.resolve())};
 return {doc,dom,adapter:createIntegrityVerifyAdapter(doc,options),another:()=>createIntegrityVerifyAdapter(doc,options),opens:()=>opens,submits:()=>submits};
}
test('disabled by default; importing adapter installs no event handlers or network bridge',async()=>{
 const f=await fixture(); // Exercise constructor defaults explicitly.
 const {createIntegrityVerifyAdapter}=await import('./integrity-verify.mjs');
 assert.deepEqual(await createIntegrityVerifyAdapter(f.doc).run(job()),{status:'blocked',code:'disabled',requestId:'synthetic-job'});
 assert.equal(f.opens(),0);f.dom.window.close();
});
test('opens observed Verify dialog, checks all identity fields, and reports pending only',async()=>{
 const f=await fixture();const result=await f.adapter.run(job());
 assert.deepEqual(result,{status:'pending',code:'submitted',requestId:'synthetic-job'});assert.equal(f.opens(),1);assert.equal(f.submits(),1);
 assert.doesNotMatch(JSON.stringify(result),/Synthetic|Example|1952|1AA1|verified/);
 assert.equal((await f.another().run(job())).code,'duplicate_job');assert.equal(f.submits(),1);f.dom.window.close();
});
for(const field of ['firstName','lastName','dob','mbi'])test(`rejects mismatched ${field} without final click`,async()=>{
 const f=await fixture({html:dialogHtml});const replacement={firstName:'Different',lastName:'Different',dob:'1950-01-01',mbi:'2BB2BB2BB22'};
 assert.equal((await f.adapter.run(job({expected:{...expected,[field]:replacement[field]}}))).code,'identity_mismatch');assert.equal(f.submits(),0);f.dom.window.close();
});
test('does not fill a blank identity and mistake its own input for contact confirmation',async()=>{
 const f=await fixture({html:dialogHtml});f.doc.querySelector('input').value='';
 assert.equal((await f.adapter.run(job())).code,'identity_missing');assert.equal(f.doc.querySelector('input').value,'');assert.equal(f.submits(),0);f.dom.window.close();
});
for(const [title,html,code] of [
 ['duplicate name fields',dialogHtml.replace('</div>','<label>First Name<input value="Synthetic"></label></div>'),'identity_ambiguous'],
 ['duplicate dialogs',dialogHtml+dialogHtml,'dialog_unrecognized'],
 ['wrong dialog',dialogHtml.replace('Benefit Eligibility Check','Unknown dialog'),'dialog_unrecognized'],
 ['disabled submit',dialogHtml.replace('<button>Run','<button disabled>Run'),'submit_unavailable'],
 ['duplicate Verify buttons','<button>Verify</button><button>Verify</button>','verify_unavailable'],
 ['login','<input type="password"><button>Verify</button>','login_required'],
])test(title,async()=>{const f=await fixture({html});assert.equal((await f.adapter.run(job())).code,code);assert.equal(f.submits(),0);f.dom.window.close();});
for(const url of ['https://evil.test','http://connect.integrity.com','https://connect.integrity.com.evil.test','https://connect.integrity.com/login'])test(`rejects context ${url}`,async()=>{
 const f=await fixture({url});assert.equal((await f.adapter.run(job())).status,'blocked');assert.equal(f.opens(),0);f.dom.window.close();
});
test('expired, future and unbounded jobs never click',async()=>{
 const f=await fixture();for(const patch of [{expiresAt:NOW-1},{issuedAt:NOW+1},{expiresAt:NOW+600000},{expected:{...expected,dob:'1952-02-31'}},{requestId:'invalid/id'}])assert.equal((await f.adapter.run(job(patch))).status,'blocked');
 assert.equal(f.opens(),0);f.dom.window.close();
});
test('expiry after opening prevents final click and cannot replay',async()=>{
 let current=NOW;const f=await fixture({now:()=>current});f.doc.querySelector('button').addEventListener('click',()=>{current=NOW+60001;});
 assert.equal((await f.adapter.run(job())).code,'expired_job');assert.equal(f.submits(),0);current=NOW;
 assert.equal((await f.adapter.run(job())).code,'duplicate_job');assert.equal(f.opens(),1);f.dom.window.close();
});
test('uncertain submission stays pending and the consumed job is never replayed',async()=>{
 const f=await fixture({html:dialogHtml});f.doc.querySelector('button').click=()=>{throw new Error('Sensitive page error must not be returned');};
 assert.deepEqual(await f.adapter.run(job()),{status:'pending',code:'submission_unconfirmed',requestId:'synthetic-job'});
 assert.equal((await f.adapter.run(job())).code,'duplicate_job');f.dom.window.close();
});
test('same-document concurrent adapter instances cannot issue duplicate or competing clicks',async()=>{
 let release;const f=await fixture({wait:()=>new Promise(resolve=>{release=resolve;})});
 // Simulate a delayed dialog mount after the overview click.
 f.doc.querySelector('button').click=()=>{};
 const first=f.adapter.run(job());await Promise.resolve();
 assert.equal((await f.another().run(job())).code,'duplicate_job');
 assert.equal((await f.another().run(job({requestId:'another-job'}))).code,'busy');
 f.doc.body.insertAdjacentHTML('beforeend',dialogHtml);release();assert.equal((await first).status,'pending');assert.equal(f.submits(),1);f.dom.window.close();
});

for(const path of ['/agent/clients/contact/90000002/overview','/agent/clients/contact/90000001/overview/','/agent/clients/contact/90000001/details'])test(`requires exact job lead route: ${path}`,async()=>{
 const f=await fixture({url:`https://connect.integrity.com${path}`});
 assert.equal((await f.adapter.run(job())).code,'wrong_contact');assert.equal(f.opens(),0);assert.equal(f.submits(),0);f.dom.window.close();
});
test('requires a numeric string lead ID on every job',async()=>{
 const f=await fixture();for(const leadId of [undefined,90000001,'','../90000001','abc'])assert.equal((await f.adapter.run(job({leadId}))).code,'invalid_job');
 assert.equal(f.opens(),0);f.dom.window.close();
});
test('navigation to another contact while waiting blocks final click despite matching dialog fields',async()=>{
 let release;const f=await fixture({wait:()=>new Promise(resolve=>{release=resolve;})});
 f.doc.querySelector('button').click=()=>{};
 const pending=f.adapter.run(job());await Promise.resolve();
 f.dom.window.history.replaceState({},'', '/agent/clients/contact/90000002/overview');
 f.doc.body.insertAdjacentHTML('beforeend',dialogHtml);release();
 assert.equal((await pending).code,'wrong_contact');assert.equal(f.submits(),0);f.dom.window.close();
});
test('rechecks route immediately before submitting an already open dialog',async()=>{
 const f=await fixture({html:dialogHtml});let reads=0;
 Object.defineProperty(f.doc.querySelector('button'),'disabled',{get(){reads++;f.dom.window.history.replaceState({},'', '/agent/clients/contact/90000002/overview');return false;}});
 assert.equal((await f.adapter.run(job())).code,'wrong_contact');assert.equal(reads,1);assert.equal(f.submits(),0);f.dom.window.close();
});
test('observed Profile menu reveals only NPN and is closed after reading',async()=>{
 const {inspectIntegrityVerifyContext}=await import('./integrity-verify.mjs');const f=await fixture();
 f.doc.body.insertAdjacentHTML('beforeend','<button aria-label="Profile menu" aria-haspopup="true">SE</button>');
 let closed=false;f.doc.querySelector('[aria-label="Profile menu"]').addEventListener('click',()=>{
  f.doc.body.insertAdjacentHTML('beforeend','<div role="menu"><div>Synthetic Agent</div><div><div><p>NPN: </p></div><div>99999999</div></div><button>Account</button><button>Sign Out</button></div>');
  f.doc.querySelector('[role="menu"]').addEventListener('keydown',event=>{if(event.key==='Escape'){closed=true;event.currentTarget.remove();}});
 });
 assert.deepEqual(await inspectIntegrityVerifyContext(f.doc,'90000001'),{ready:true,agentNpn:'99999999'});assert.equal(closed,true);f.dom.window.close();
});
for(const text of ['Synthetic Account','NPN: 99999999 NPN: 88888888'])test('missing or ambiguous account NPN blocks: '+text,async()=>{
 const {inspectIntegrityVerifyContext}=await import('./integrity-verify.mjs');const f=await fixture({html:`<button>Verify</button><div role="menu">${text}</div>`});
 assert.deepEqual(await inspectIntegrityVerifyContext(f.doc,'90000001'),{ready:false,agentNpn:null});f.dom.window.close();
});

for(const [label,rows,expected] of [
 ['adjacent menu navigation','<div><div><p>NPN: </p></div><div>99999999</div></div><button>Account</button>','99999999'],
 ['two account rows','<div>NPN: 99999999</div><div>NPN: 88888888</div>',null],
 ['duplicate identical rows','<div>NPN: 99999999</div><div>NPN: 99999999</div>',null],
 ['valid row plus malformed second NPN','<div>NPN: 99999999</div><div>NPN: unavailable</div>',null],
 ['nested conflicting account label','<div>NPN: 88888888<div>NPN: 99999999</div></div>',null],
 ['hidden number','<div><p>NPN: </p><span hidden>99999999</span></div>',null],
 ['numeric prefix of malformed value','<div>NPN: 99999999Account</div>',null],
 ['too many digits','<div>NPN: 123456789012345678901</div>',null],
])test('Verify account extraction: '+label,async()=>{
 const {inspectIntegrityVerifyContext}=await import('./integrity-verify.mjs');
 const f=await fixture({html:`<button>Verify</button><div role="menu">${rows}</div>`});
 assert.deepEqual(await inspectIntegrityVerifyContext(f.doc,'90000001'),{ready:!!expected,agentNpn:expected});f.dom.window.close();
});
