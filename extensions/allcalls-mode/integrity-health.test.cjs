const {test}=require('node:test');const assert=require('node:assert/strict');const {JSDOM}=require('jsdom');
const NOW=1800000000000,job={leadId:'123',name:'Synthetic Contact',agentNpn:'12345678',issuedAt:NOW-1000,expiresAt:NOW+60000};
// Minimal reproduction of observed Medical Profile section/card tags, class
// prefixes, counts and address test IDs. Values are synthetic/public fixtures.
const html=`<h2>Synthetic Contact</h2><div role="menu">NPN: 12345678</div><section><h3>Prescriptions (2)</h3><div class="_providerContainer_x"><h4>atorvastatin calcium TAB 20MG</h4><div class="_prescription_package_x">30 tablet per month</div><button>Edit</button></div><div class="_providerContainer_x"><h4>potassium chloride er TAB 10MEQ CR</h4><div class="_prescription_package_x">30 tablet extended-release per month</div><button>Edit</button></div></section><section><h3>Providers (1)</h3><div class="_providerContainer_x"><h6>Synthetic Doctor</h6><div data-testid="providers-list-address-text-1">1 Test St, Houston, TX,77008</div><button>Edit</button></div></section><section><h3>Pharmacy (1)</h3><div class="_providerContainer_x"><div class="_name_x">Synthetic Pharmacy</div><div class="_phone_x">202-555-0101</div><div class="_address_x">1 Test St<div class="_primaryTag_x">Primary</div></div></div></section><section><div><h3>Conditions</h3><div class="_infoIcon_x">(1)</div></div><table><tbody><tr><td><div class="_conditionNameCell_x">Synthetic condition</div></td><td><button>Edit</button></td></tr></tbody></table></section>`;
async function read(markup=html,patch={},url='https://connect.integrity.com/agent/clients/contact/123/health'){
 const {readIntegrityHealth}=await import('./integrity-health.mjs');const dom=new JSDOM(markup,{url});dom.window.HTMLElement.prototype.getClientRects=function(){return this.style.display==='none'?[]:[{}];};let clicks=0;dom.window.document.addEventListener('click',()=>clicks++);
 const result=await readIntegrityHealth(dom.window.document,{...job,...patch},{now:()=>NOW,wait:async()=>{}});dom.window.close();return {result,clicks};
}
test('reads all counted saved prescriptions with supply and doctors without writes',async()=>{const {result,clicks}=await read();assert.equal(result.status,'complete');assert.equal(result.medications.length,2);assert.equal(result.medications[1].name,'potassium chloride er TAB 10MEQ CR');assert.equal(result.medications[1].supply,'30 tablet extended-release per month');assert.equal(result.doctors[0].addresses[0],'1 Test St, Houston, TX,77008');assert.equal(clicks,0);});
for(const [title,markup,patch] of [
 ['wrong account',html.replace('NPN: 12345678','NPN: 87654321'),{}],
 ['wrong name',html,{name:'Other Contact'}],
 ['count mismatch',html.replace('Prescriptions (2)','Prescriptions (3)'),{}],
 ['missing supply',html.replace('_prescription_package_x','changed'),{}],
 ['missing address',html.replace('providers-list-address-text-1','changed'),{}],
 ['hidden card',html.replace('<h4>','<h4 hidden>'),{}],
 ['edit dialog',html+'<div role="dialog">Edit</div>',{}],
 ['expired',html,{expiresAt:NOW-1}],
 ['oversized',html.replace('Prescriptions (2)','Prescriptions (51)'),{}],
])test(title+' blocks whole import',async()=>{const {result,clicks}=await read(markup,patch);assert.equal(result.status,'blocked');assert.equal(result.medications,undefined);assert.equal(clicks,0);});
test('rejects wrong contact URL',async()=>{assert.equal((await read(html,{},'https://connect.integrity.com/agent/clients/contact/456/health')).result.status,'blocked');});
test('zero requires loaded explicit empty text, not only zero header',async()=>{const zero='<h2>Synthetic Contact</h2><div role="menu">NPN: 12345678</div><section><h3>Prescriptions (0)</h3>This contact has no prescriptions.</section><section><h3>Providers (0)</h3>This contact has no providers.</section><section><h3>Pharmacy (0)</h3>This contact has no pharmacy .</section><section><div><h3>Conditions</h3><div class="_infoIcon_x">(0)</div></div>This contact has no conditions.</section>';assert.equal((await read(zero)).result.status,'complete');assert.equal((await read(zero.replace('This contact has no prescriptions.',''))).result.status,'blocked');});

test('imports all saved pharmacy fields and conditions without actions',async()=>{
 const {result,clicks}=await read();assert.equal(result.status,'complete');
 assert.deepEqual(result.pharmacies,[{name:'Synthetic Pharmacy',address:'1 Test St',phone:'202-555-0101',primary:true}]);
 assert.deepEqual(result.conditions,[{name:'Synthetic condition'}]);assert.equal(clicks,0);
});
for(const [label,markup] of [
 ['pharmacy count',html.replace('Pharmacy (1)','Pharmacy (2)')],
 ['condition count',html.replace('>(1)</div>','>(2)</div>')],
 ['pharmacy missing',html.replace('Pharmacy (1)','Unknown (1)')],
 ['conditions missing',html.replace('>Conditions<','>Unknown<')],
 ['missing pharmacy address',html.replace('_address_x','unsupported')],
 ['hidden condition',html.replace('class="_conditionNameCell_x"','hidden class="_conditionNameCell_x"')],
 ['missing condition count',html.replace('_infoIcon_x','unknown')],
 ['oversized condition',html.replace('Synthetic condition','X'.repeat(501))],
])test(label+' cannot produce partial success',async()=>{const {result}=await read(markup);assert.equal(result.status,'blocked');assert.equal(result.pharmacies,undefined);});
test('pharmacy phone and primary marker may be absent, but are not invented',async()=>{
 const {result}=await read(html.replace('<div class="_phone_x">202-555-0101</div>','').replace('<div class="_primaryTag_x">Primary</div>',''));
 assert.equal(result.status,'complete');assert.equal(result.pharmacies[0].phone,'');assert.equal(result.pharmacies[0].primary,false);
});

for(const [label,rows,complete] of [
 ['adjacent Account navigation','<div><div><p>NPN: </p></div><div>12345678</div></div><button>Account</button>',true],
 ['different signed-in account','<div><p>NPN: </p><div>87654321</div></div><button>Account</button>',false],
 ['ambiguous rows','<div>NPN: 12345678</div><div>NPN: 87654321</div>',false],
 ['valid row plus malformed NPN','<div>NPN: 12345678</div><div>NPN: unavailable</div>',false],
 ['hidden NPN','<div><p>NPN: </p><span hidden>12345678</span></div>',false],
 ['unseparated malformed row','<div>NPN: 12345678Account</div>',false],
])test('health profile row: '+label,async()=>{
 const {result}=await read(html.replace('<div role="menu">NPN: 12345678</div>',`<div role="menu">${rows}</div>`));
 assert.equal(result.status,complete?'complete':'blocked');if(!complete)assert.equal(result.medications,undefined);
});
