// Reliability audit 2026-10-27: `allcalls_reader_unavailable` with a fresh
// Wayfinder heartbeat means the AllCalls content script is dead or was never
// injected (extension update, client-side route into Take Calls). Recovery
// must be idempotent and must never reload the page.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {JSDOM}=require('jsdom');

function background({readerAlive=true,discarded=false,enabled=true,url="https://allcalls.io/take-calls",denied=false}={}){
 let listener,installed,stored={},local={settings:{enabled}};const sent=[],injected=[];
 const state={readerAlive,discarded};
 const sample={observed:'off',delivery:'off',measured_at:Math.floor(Date.now()/1000),manual_generation:0,allcalls_session:'s1'};
 const chrome={runtime:{id:'ext',getURL:p=>'chrome-extension://ext/'+p,onMessage:{addListener:fn=>listener=fn},onInstalled:{addListener:fn=>installed=fn}},
  storage:{session:{get:async()=>stored,set:async value=>{stored={...stored,...structuredClone(value)};}},local:{get:async()=>local,set:async value=>{local={...local,...structuredClone(value)};}}},
  scripting:{executeScript:async options=>{injected.push(options);if(denied)throw new Error("Synthetic permission denial");state.readerAlive=true;}},
  tabs:{query:async q=>typeof q.url==='string'?[{id:state.tabId||1,url:'https://allcalls.io/take-calls',discarded:state.discarded}]:[{id:2,url:'https://www.wayfindercontactcenter.com/agent'}],
   get:async id=>({id,url,discarded:state.discarded}),
   sendMessage:async(id,msg)=>{sent.push({id,msg});
    if(msg.type==='read-observation'){if(!state.readerAlive)throw new Error('Could not establish connection. Receiving end does not exist.');return sample;}
    if(msg.type==='ack-observation')return {accepted:true};
    return {enabled:true,agent_id:'agent',mode:'auto',mcp_allowed:true,allcalls_target:'none',diagnostics:{reason:'clear'}};},
   reload:async()=>{throw new Error('reload must never be used for recovery');},
   onRemoved:{addListener:()=>{}}},windows:{update:async()=>{}}};
 vm.runInNewContext(readFileSync(__dirname+'/background.js','utf8').replace(/^import .*\ninstallIntegrity(?:Verify|Health)Bridge\(chrome\);\n/gm,''),{chrome,crypto:webcrypto,Date,URL,Promise,Error,Number,setTimeout,clearTimeout});
 const poll=()=>new Promise(resolve=>{if(listener({type:'poll'},{id:'ext',url:'https://www.wayfindercontactcenter.com/agent',tab:{id:2}},resolve)!==true)resolve({});});
 const status=()=>new Promise(resolve=>listener({type:'status'},{id:'ext',url:'chrome-extension://ext/popup.html'},resolve));
 return {poll,status,sent,injected,installed:()=>installed(),state:()=>stored.state,config:state};
}

test('a dead reader is re-injected once and the same poll completes with a real observation',async()=>{
 const h=background({readerAlive:false});
 await h.poll();
 assert.equal(h.injected.length,1);assert.equal(h.injected[0].target.tabId,1);assert.equal(String(h.injected[0].files),'detector.js,allcalls.js');
 const sync=h.sent.find(x=>x.msg.type==='wayfinder-request');
 assert.equal(sync.msg.body.source_issue,'none');assert.equal(sync.msg.body.observed,'off');
 assert.equal(h.state().issue,'');
});

test('a discarded tab is reported, not injected or reloaded',async()=>{
 const h=background({readerAlive:false,discarded:true});
 await h.poll();
 assert.equal(h.injected.length,0);
 assert.equal(h.sent.find(x=>x.msg.type==='wayfinder-request').msg.body.source_issue,'allcalls_reader_unavailable');
});

test('an extension install or update re-injects every open AllCalls tab except discarded ones',async()=>{
 const h=background();
 h.installed();await new Promise(r=>setTimeout(r,0));
 assert.equal(h.injected.length,1);
 const d=background({discarded:true});d.installed();await new Promise(r=>setTimeout(r,0));assert.equal(d.injected.length,0);
});

function page(path){
 const dom=new JSDOM(`<h2>Take Calls</h2><section aria-label="Call status"><button role="switch" aria-label="Turn inbound calls on" aria-checked="false"></button><div>Offline</div></section>`,{url:'https://allcalls.io'+path,runScripts:'outside-only'});
 const w=dom.window;w.HTMLElement.prototype.getClientRects=()=>[{}];
 let manual;const add=w.document.addEventListener.bind(w.document);
 w.document.addEventListener=(name,fn,...args)=>{if(name==='click')manual=fn;return add(name,fn,...args);};
 const sent=[];let listeners=0,listener;w.chrome={runtime:{id:'ext',sendMessage:async msg=>{sent.push(msg);return{accepted:true};},onMessage:{addListener:fn=>{listeners++;listener=fn;}}}};
 const load=()=>{w.eval(readFileSync(__dirname+'/detector.js','utf8'));w.eval(readFileSync(__dirname+'/allcalls.js','utf8'));};
 return {w,sent,load,click:(target,isTrusted=true)=>manual({target,isTrusted}),listeners:()=>listeners,send:(m)=>new Promise(resolve=>{if(listener(m,{id:"ext"},resolve)!==true)resolve(undefined);}),close:()=>w.close()};
}

test('injecting the reader twice registers one listener and one sampler',()=>{
 const f=page('/take-calls');f.load();f.load();
 try{assert.equal(f.listeners(),1);assert.equal(f.sent.length,1);assert.equal(f.sent[0].observed,'off');}finally{f.close();}
});

test('a reader injected on another AllCalls page reports unknown there and reads Take Calls after a client-side route',async()=>{
 const f=page('/login');f.load();
 try{
  assert.equal(f.sent.length,0);
  f.w.history.pushState(null,'','/take-calls');
  await new Promise(r=>setTimeout(r,2100));
  assert.ok(f.sent.length>=1);assert.equal(f.sent.at(-1).observed,'off');assert.equal(f.sent.at(-1).delivery,'off');
 }finally{f.close();}
});


test('protection Off does not recover readers or send availability commands on update or poll',async()=>{
 const h=background({readerAlive:false,enabled:false});h.installed();await new Promise(r=>setTimeout(r,0));await h.poll();
 assert.equal(h.injected.length,0);assert.equal(h.sent.length,0);
});

test('a tab that navigated away is not injected or switched',async()=>{
 for(const url of ['https://allcalls.io/login','https://example.test/take-calls']){
  const h=background({readerAlive:false,url});await h.poll();
  assert.equal(h.injected.length,0);assert.equal(h.sent.some(x=>x.msg.type==='set-delivery'),false);
  assert.equal(h.sent.find(x=>x.msg.type==='wayfinder-request').msg.body.source_issue,'allcalls_reader_unavailable');
 }
});

test('injection denial remains explicit unknown and never generates a switch',async()=>{
 const h=background({readerAlive:false,denied:true});await h.poll();
 assert.equal(h.injected.length,1);assert.equal(h.sent.some(x=>x.msg.type==='set-delivery'),false);
 const sync=h.sent.find(x=>x.msg.type==='wayfinder-request').msg.body;
 assert.equal(sync.source_issue,'allcalls_reader_unavailable');assert.equal(sync.observed,'unknown');
});


test('after navigating away the reader rejects switch commands even if old controls remain',async()=>{
 const f=page('/take-calls');f.load();
 try{
  const session=f.sent[0].allcalls_session;let clicks=0;f.w.document.querySelector('button').addEventListener('click',()=>clicks++);
  f.w.history.pushState(null,'','/profile');
  const result=await f.send({type:'set-delivery',target:'off',issued_at:Date.now(),allcalls_session:session});
  assert.equal(result.accepted,false);assert.equal(clicks,0);
 }finally{f.close();}
});


test('popup retains a failed reader warning until that reader actually recovers',async()=>{
 const h=background({readerAlive:false,denied:true});await h.poll();
 const count=h.sent.length;
 for(let i=0;i<2;i++)assert.equal((await h.status()).issue,'allcalls_reader_unavailable');
 assert.equal(h.sent.length,count,'opening status must not issue commands or claim recovery');
 h.config.readerAlive=true;h.state().confirmedAt=0;await h.poll();
 assert.equal((await h.status()).issue,'');
 assert.equal(h.state().observed,'off');
});

test('popup does not carry a failed reader warning onto a different AllCalls tab',async()=>{
 const h=background({readerAlive:false,denied:true});await h.poll();
 h.config.tabId=3;
 assert.equal((await h.status()).issue,'');
 assert.equal(h.state().issue,'allcalls_reader_unavailable','status read does not mutate saved evidence');
});


for(const path of ['/login','/profile','/take-calls'])test('unrelated trusted clicks without a master control do not become manual availability changes: '+path,async()=>{
 const f=page(path),html=f.w.document.body.innerHTML;
 f.w.document.body.innerHTML='<button id="continue">Continue</button>';f.load();
 try{
  f.click(f.w.document.getElementById('continue'));
  assert.equal((await f.send({type:'read-observation'})).manual_generation,0);
  f.w.history.pushState(null,'','/take-calls');f.w.document.body.innerHTML=html;
  const reading=await f.send({type:'read-observation'});
  assert.equal(reading.observed,'off');assert.equal(reading.manual_generation,0);assert.equal(reading.manual_allcalls,false);
 }finally{f.close();}
});
test('trusted clicks outside Take Calls are ignored even when a stale master control remains',async()=>{
 const f=page('/profile');f.load();
 try{
  f.click(f.w.document.querySelector('button'));
  f.w.history.pushState(null,'','/take-calls');
  const reading=await f.send({type:'read-observation'});
  assert.equal(reading.observed,'off');assert.equal(reading.manual_generation,0);assert.equal(reading.manual_allcalls,false);
 }finally{f.close();}
});
test('only trusted master-control clicks on Take Calls record a manual choice',async()=>{
 const f=page('/take-calls');f.load();
 try{
  const master=f.w.document.querySelector('button');master.innerHTML='<span>Switch</span>';
  const other=f.w.document.createElement('button');other.textContent='Continue';f.w.document.body.append(other);
  f.click(other);f.click(master,false);
  assert.equal((await f.send({type:'read-observation'})).manual_generation,0);
  f.click(master.firstElementChild);
  const reading=await f.send({type:'read-observation'});
  assert.equal(reading.manual_generation,1);assert.equal(reading.manual_allcalls,true);
 }finally{f.close();}
});
