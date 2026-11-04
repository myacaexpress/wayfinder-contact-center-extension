const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {JSDOM}=require('jsdom');
async function render(state){
 const dom=new JSDOM(readFileSync(__dirname+'/popup.html','utf8'),{runScripts:'outside-only'});
 dom.window.chrome={runtime:{sendMessage:async()=>state}};
 dom.window.eval(readFileSync(__dirname+'/popup.js','utf8'));
 await new Promise(resolve=>setImmediate(resolve));
 const text=dom.window.document.body.textContent;dom.window.close();return text;
}
test('popup distinguishes stale confirmation from AllCalls Offline and shows exact tab issue',async()=>{
 const text=await render({settings:{enabled:true},observed:'off',delivery:'off',confirmedAt:Date.now()-60000,result:{mcp_allowed:true},issue:'multiple_allcalls_tabs',allcallsCount:2,wayfinderCount:1});
 assert.match(text,/Multiple AllCalls Take Calls tabs/);assert.match(text,/AllCalls observedOffline/);
 assert.doesNotMatch(text,/Automatic protection active/);assert.match(text,/2 AllCalls/);
});
test('popup reports server failure without implying AllCalls is busy',async()=>{
 const text=await render({settings:{enabled:true},observed:'off',delivery:'off',confirmedAt:Date.now(),result:{mcp_allowed:false,diagnostics:{reason:'provider_unavailable',reason_text:'Amazon Connect status could not be confirmed.',wayfinder_state:'unknown'}}});
 assert.match(text,/Amazon Connect status could not be confirmed/);assert.match(text,/provider_unavailable/);
});
test('Off is explicit and never described as active despite cached healthy status',async()=>{
 const text=await render({settings:{enabled:false,returnAfterWrap:true},confirmedAt:Date.now(),result:{enabled:false,mcp_allowed:true}});
 assert.match(text,/Automatic protection is off/);assert.match(text,/Manage both systems yourself/);assert.doesNotMatch(text,/Automatic protection active/);
});
test('toggle waits for acknowledgement and reverts on failure',async()=>{
 const dom=new JSDOM(readFileSync(__dirname+'/popup.html','utf8'),{runScripts:'outside-only'});
 assert.equal(dom.window.document.querySelectorAll('[role="switch"]').length,1);
 const requests=[];
 dom.window.chrome={runtime:{sendMessage:async m=>{requests.push(m);return m.type==='status'?{settings:{enabled:true,returnAfterWrap:false}}:{error:'Synthetic failure'};}}};
 dom.window.eval(readFileSync(__dirname+'/popup.js','utf8'));
 await new Promise(r=>setImmediate(r));
 const control=dom.window.document.getElementById('enabled');control.click();
 await new Promise(r=>setImmediate(r));
 assert.equal(requests.find(m=>m.type==='configure').enabled,false);
 assert.equal(control.checked,true);assert.equal(control.disabled,false);
 assert.match(dom.window.document.getElementById('settings-message').textContent,/Change not confirmed: Synthetic failure/);
 dom.window.close();
});

test('variant controls precede collapsed diagnostics and workspace selection is sent with toggle',async(t)=>{
 const dom=new JSDOM(readFileSync(__dirname+'/popup.html','utf8'),{runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 const requests=[];
 dom.window.chrome={runtime:{sendMessage:async m=>{requests.push(m);return m.type==='status'?{settings:{enabled:true},needsWorkspace:true,workspaces:[{id:4,title:'Manager'}]}:{accepted:true};}}};
 dom.window.eval(readFileSync(__dirname+'/popup.js','utf8'));await new Promise(r=>setImmediate(r));
 const doc=dom.window.document;
 assert.equal(doc.querySelector('.controls').nextElementSibling.tagName,'DETAILS');
 assert.equal(doc.getElementById('integrity-access'),null);
 assert.equal(doc.querySelector('details').open,false);
 assert.equal(doc.getElementById('workspace-choice').hidden,false);
 doc.getElementById('workspace').value='4';doc.getElementById('enabled').click();await new Promise(r=>setImmediate(r));
 assert.equal(requests.find(m=>m.type==='configure').wayfinderTabId,4);dom.window.close();
});


test('initial popup markup and missing preferences display Off without an On flash',async()=>{
 const dom=new JSDOM(readFileSync(__dirname+'/popup.html','utf8'),{runScripts:'outside-only'});
 assert.equal(dom.window.document.getElementById('enabled').checked,false);
 dom.window.close();
 assert.match(await render({}),/Automatic protection is off/);
});

test('current workspace is selected with recognizable position and jump sends its exact id',async(t)=>{
 const dom=new JSDOM(readFileSync(__dirname+'/popup.html','utf8'),{runScripts:'outside-only'});
 const requests=[];const close=dom.window.close.bind(dom.window);dom.window.close=()=>{};
 t.after(close);
 dom.window.chrome={runtime:{sendMessage:async m=>{requests.push(m);return m.type==='status'?{settings:{enabled:false},needsWorkspace:true,wayfinderTab:42,workspaces:[{id:42,title:'Agent workspace',current:true,window:2,position:3}]}:{accepted:true};}}};
 dom.window.eval(readFileSync(__dirname+'/popup.js','utf8'));await new Promise(r=>setImmediate(r));
 const doc=dom.window.document;assert.equal(doc.getElementById('workspace').value,'42');
 assert.match(doc.getElementById('workspace').textContent,/This tab · Agent workspace · Window 2, tab 3/);
 assert.doesNotMatch(doc.getElementById('workspace').textContent,/42/);
 doc.getElementById('workspace-open').click();await new Promise(r=>setImmediate(r));
 assert.equal(requests.find(m=>m.type==='focus-workspace').wayfinderTabId,42);
 assert.equal(requests.some(m=>m.type==='configure'),false);
 assert.doesNotMatch(doc.body.textContent,/Integrity|No protection workspace selection is needed/);
 close();
});
