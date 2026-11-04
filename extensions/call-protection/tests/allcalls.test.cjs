const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {JSDOM}=require('jsdom');
function fixture(checked=false,label='Offline',extra=''){
 const dom=new JSDOM(`<h2>Take Calls</h2><button role="switch" aria-checked="${checked}"></button><div>${label}</div>${extra}`,{url:'https://allcalls.io/take-calls',runScripts:'outside-only'});
 const w=dom.window;w.HTMLElement.prototype.getClientRects=()=>[{}];let listener,manual;
 const add=w.document.addEventListener.bind(w.document);
 w.document.addEventListener=(name,fn,...args)=>{if(name==='click')manual=fn;return add(name,fn,...args);};
 const sent=[];w.chrome={runtime:{id:'ext',sendMessage:async msg=>{sent.push(msg);return{accepted:true};},onMessage:{addListener:fn=>listener=fn}}};
 w.eval(readFileSync(__dirname+'/detector.js','utf8'));w.eval(readFileSync(__dirname+'/allcalls.js','utf8'));
 const control=w.document.querySelector('[role=switch]');let clicks=0;
 control.addEventListener('click',()=>{clicks++;control.setAttribute('aria-checked',String(control.getAttribute('aria-checked')!=='true'));});
 return {read:()=>new Promise(resolve=>listener({type:'read-observation'},{id:'ext'},resolve)),ack:(g,allcalls_session=sent[0].allcalls_session)=>new Promise(resolve=>listener({type:'ack-observation',manual_generation:g,allcalls_session},{id:'ext'},resolve)),sent,clicks:()=>clicks,manual:()=>manual({isTrusted:true,target:control}),command:(target,issued_at=Date.now(),allcalls_session=sent[0].allcalls_session)=>new Promise(resolve=>{const async=listener({type:'set-delivery',target,issued_at,allcalls_session},{id:'ext'},resolve);if(!async)resolve({accepted:false});}),close:()=>w.close()};
}
test('observes actual Take Calls switch without a connect button',()=>{
 const f=fixture();assert.equal(f.sent[0].observed,'off');assert.equal(f.sent[0].delivery,'off');assert.equal(f.clicks(),0);f.close();
});
test('busy text wins over Off and prevents automatic On',async()=>{
 const f=fixture(false,'Offline','<div>Talking</div>');assert.equal(f.sent[0].observed,'talking');
 assert.equal((await f.command('on')).accepted,false);assert.equal(f.clicks(),0);f.close();
});
test('verified switch Off is confirmed and idempotent',async()=>{
 const f=fixture(true,'Waiting');assert.equal((await f.command('off')).accepted,true);assert.equal(f.clicks(),1);
 assert.equal((await f.command('off')).accepted,true);assert.equal(f.clicks(),1);f.close();
});
test('stale commands and manual overrides cannot enable delivery',async()=>{
 const f=fixture();await f.command('on',1);assert.equal(f.clicks(),0);f.manual();
 assert.equal((await f.command('on')).accepted,false);assert.equal(f.clicks(),0);f.close();
});
test('ambiguous switches and unfamiliar labels stay unknown',()=>{
 const f=fixture(false,'Offline','<button role="switch" aria-checked="false"></button>');assert.equal(f.sent[0].observed,'unknown');f.close();
 const g=fixture(true,'New vendor wording');assert.equal(g.sent[0].observed,'unknown');g.close();
});

test('pull acknowledgement clears only the observed manual click generation',async()=>{
 const f=fixture();
 await Promise.resolve();await Promise.resolve();
 f.manual();const first=await f.read();assert.equal(first.manual_allcalls,true);
 f.manual();await f.ack(first.manual_generation);
 assert.equal((await f.read()).manual_allcalls,true);
 const latest=await f.read();await f.ack(latest.manual_generation);
 assert.equal((await f.read()).manual_allcalls,false);f.close();
});

test('recognizes the observed AllCalls Online - Taking Calls label without switching off',()=>{
 const f=fixture(true,'Online - Taking Calls');
 assert.equal(f.sent[0].observed,'waiting');assert.equal(f.sent[0].delivery,'on');assert.equal(f.clicks(),0);f.close();
 const busy=fixture(true,'Online - Taking Calls','<div>Incoming call</div>');
 assert.equal(busy.sent[0].observed,'ringing');busy.close();
});

for(const label of ['Ringing','Talking','Dispositioning','Unfamiliar'])test('never switches AllCalls Off during '+label,async()=>{
 const f=fixture(true,label);
 try{assert.equal((await f.command('off')).accepted,false);assert.equal(f.clicks(),0);}finally{f.close();}
});
test('each page reader reports a stable unique session',async()=>{
 const a=fixture(),b=fixture();
 try{const first=await a.read();assert.equal((await a.read()).allcalls_session,first.allcalls_session);assert.notEqual((await b.read()).allcalls_session,first.allcalls_session);}finally{a.close();b.close();}
});

test('commands from a prior document cannot change the new document',async()=>{
 const a=fixture(),b=fixture();
 try{const old=(await a.read()).allcalls_session;assert.equal((await b.command('on',Date.now(),old)).accepted,false);assert.equal(b.clicks(),0);}finally{a.close();b.close();}
});

test('prior document acknowledgement cannot clear a new manual choice',async()=>{
 const a=fixture(),b=fixture();
 try{await Promise.resolve();await Promise.resolve();b.manual();const old=(await a.read()).allcalls_session;assert.equal((await b.ack(1,old)).accepted,false);assert.equal((await b.read()).manual_allcalls,true);}finally{a.close();b.close();}
});
