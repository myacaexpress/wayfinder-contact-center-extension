const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {JSDOM}=require('jsdom');
function fixture(checked=false,label='Offline',extra='',controlLabel='Turn inbound calls on',html=null){
 const dom=new JSDOM(html||`<h2>Take Calls</h2><section aria-label="Call status"><button role="switch" aria-checked="${checked}" aria-label="${controlLabel}"></button><div>${label}</div></section>${extra}`,{url:'https://allcalls.io/take-calls',runScripts:'outside-only'});
 const w=dom.window;w.HTMLElement.prototype.getClientRects=()=>[{}];let listener,manual;
 const add=w.document.addEventListener.bind(w.document);
 w.document.addEventListener=(name,fn,...args)=>{if(name==='click')manual=fn;return add(name,fn,...args);};
 const sent=[];w.chrome={runtime:{id:'ext',sendMessage:async msg=>{sent.push(msg);return{accepted:true};},onMessage:{addListener:fn=>listener=fn}}};
 w.eval(readFileSync(__dirname+'/detector.js','utf8'));w.eval(readFileSync(__dirname+'/allcalls.js','utf8'));
 const control=w.document.querySelector('[role=switch]');let clicks=0;
 control.addEventListener('click',()=>{clicks++;control.setAttribute('aria-checked',String(control.getAttribute('aria-checked')!=='true'));});
 return {busy:label=>{const el=w.document.createElement('div');el.textContent=label;w.document.body.append(el);},states:()=>Array.from(w.document.querySelectorAll('[role=switch]')).map(el=>el.getAttribute('aria-checked')),read:()=>new Promise(resolve=>listener({type:'read-observation'},{id:'ext'},resolve)),ack:(g,allcalls_session=sent[0].allcalls_session)=>new Promise(resolve=>listener({type:'ack-observation',manual_generation:g,allcalls_session},{id:'ext'},resolve)),sent,clicks:()=>clicks,manual:()=>manual({isTrusted:true,target:control}),command:(target,issued_at=Date.now(),allcalls_session=sent[0].allcalls_session)=>new Promise(resolve=>{const async=listener({type:'set-delivery',target,issued_at,allcalls_session},{id:'ext'},resolve);if(!async)resolve({accepted:false});}),close:()=>w.close()};
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
 const f=fixture(false,'Offline','<button role="switch" aria-label="Turn inbound calls off" aria-checked="false"></button>');assert.equal(f.sent[0].observed,'unknown');f.close();
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

for(const label of ['Offline – Inbound calls are off', "You're Off – No Calls Will Be Sent"])test('structured Off survives wording: '+label,()=>{
 const f=fixture(false,label);try{assert.equal(f.sent[0].observed,'off');assert.equal(f.clicks(),0);}finally{f.close();}
});
test('inbound control is distinct from MedCare and Raw Calls campaign switches',async()=>{
 const f=fixture(false,'Offline – Inbound calls are off','<div>MedCare Inbound Calls<button role="switch" aria-checked="false"></button></div><div>Medicare Raw Calls<button role="switch" aria-checked="true"></button></div>','Turn inbound calls on');
 try{assert.equal(f.sent[0].observed,'off');assert.equal(f.sent[0].delivery,'off');assert.equal((await f.command('on')).accepted,true);assert.equal(f.clicks(),1);assert.deepEqual(f.states(),['true','false','true']);}finally{f.close();}
});
test('busy state wins with renamed offline banner and extra campaign controls',()=>{
 const f=fixture(false,'Offline – Inbound calls are off','<div>On a call</div><button role="switch" aria-checked="true"></button>','Turn inbound calls on');
 try{assert.equal(f.sent[0].observed,'talking');assert.equal(f.clicks(),0);}finally{f.close();}
});

test('legacy fallback never selects a campaign switch in settings',()=>{
 const f=fixture(false,'Offline','<h4>Campaign settings</h4><div>MedCare Inbound Calls</div>','');
 try{assert.equal(f.sent[0].delivery,'unknown');assert.equal(f.clicks(),0);}finally{f.close();}
});

for(const busy of ['Ringing','Incoming call','Talking','On a call','Dispositioning','After-call work'])test('call starts after idle sample: recheck refuses Off for '+busy,async()=>{
 const f=fixture(true,'Waiting');
 try{assert.equal((await f.read()).observed,'waiting');f.busy(busy);assert.equal((await f.command('off')).accepted,false);assert.equal(f.clicks(),0);}finally{f.close();}
});

for(const evidence of ['<div> On   Call </div>','<div><svg></svg>Connected 0:42</div>','<button aria-label="End call"></button>','<div role="status">00:42</div>'])test('structural busy beats inbound Off: '+evidence,async()=>{
 const f=fixture(false,'Offline – Inbound calls are off',evidence);
 try{assert.equal((await f.read()).observed,'talking');assert.equal((await f.command('on')).accepted,false);assert.equal(f.clicks(),0);}finally{f.close();}
});
test('switch Off with unfamiliar status is not positive idle',()=>{
 const f=fixture(false,'Vendor wording changed');try{assert.equal(f.sent[0].observed,'unknown');}finally{f.close();}
});
test('stray Waiting outside the inbound status section never authorizes a switch',async()=>{
 const f=fixture(true,'Unrecognized status','<div>Waiting</div>');
 try{assert.equal(f.sent[0].observed,'unknown');assert.equal((await f.command('off')).accepted,false);assert.equal(f.clicks(),0);}finally{f.close();}
});
test('unlabelled sole campaign control cannot be read or clicked',async()=>{
 const f=fixture(true,'Waiting','<div>MedCare Inbound Calls</div>','');
 try{assert.equal(f.sent[0].delivery,'unknown');assert.equal((await f.command('off')).accepted,false);assert.equal(f.clicks(),0);}finally{f.close();}
});

test('real sanitized Offline card produces idle without a synthetic aria-labelled section',()=>{
 const f=fixture(false,'Offline','','',readFileSync(__dirname+'/fixtures/allcalls-offline-2026-11-05.html','utf8'));
 try{assert.equal(f.sent[0].observed,'off');assert.equal(f.sent[0].delivery,'off');assert.equal(f.clicks(),0);}finally{f.close();}
});
for(const modal of ['<div role="dialog"><h2>Incoming call</h2><button>Accept</button><button>Decline</button></div>','<div role="dialog"><button aria-label="Answer call"></button></div>'])test('ringing dialog overrides underlying idle card: '+modal,async()=>{
 const f=fixture(true,'Waiting',modal);try{assert.equal(f.sent[0].observed,'ringing');assert.equal((await f.command('off')).accepted,false);assert.equal(f.clicks(),0);}finally{f.close();}
});
test('Call Status table header cannot turn application container into idle region',()=>{
 const f=fixture(true,'','','', '<h2>Take Calls</h2><div><div><button role="switch" aria-label="Turn inbound calls off" aria-checked="true"></button></div><table><tr><th>Call Status</th></tr></table><div>Waiting</div></div>');
 try{assert.equal(f.sent[0].observed,'unknown');}finally{f.close();}
});
test('external Offline banner is not evidence inside a missing status card',()=>{
 const f=fixture(false,'','','','<h2>Take Calls</h2><div>Offline – Inbound calls are off</div><div><button role="switch" aria-label="Turn inbound calls on" aria-checked="false"></button></div>');
 try{assert.equal(f.sent[0].observed,'unknown');}finally{f.close();}
});

for(const markup of [
 '<button>Answer</button>', '<button>Accept</button>', '<button>Decline</button>', '<button>Reject</button>',
 '<div role="dialog" aria-label="Cookie consent"><button>Accept</button><button>Decline</button></div>',
 '<div role="dialog"><h2>Team invitation</h2><button>Accept</button><button>Reject</button></div>',
 '<div role="alertdialog" aria-label="Permission request"><div role="button" aria-label="Accept"></div></div>',
 '<dialog open><button>Accept</button><button>Decline</button></dialog>',
 '<div role="dialog" aria-label="Incoming callback preferences"><button>Accept</button></div>',
 '<nav><button>Answer call</button></nav>',
 '<table><tr><td><button>Reject call</button></td></tr></table>'
])test('unrelated controls do not invent ringing: '+markup,async()=>{
 for(const [checked,label,expected] of [[true,'Waiting','waiting'],[false,'Offline','off'],[true,'Unfamiliar','unknown']]){
  const f=fixture(checked,label,markup);
  try{assert.equal(f.sent[0].observed,expected);assert.equal((await f.read()).observed,expected);assert.equal(f.clicks(),0);}finally{f.close();}
 }
});
test('consent controls leave verified idle switching available',async()=>{
 const f=fixture(true,'Waiting','<div role="dialog" aria-label="Cookie consent"><button>Accept</button><button>Decline</button></div>');
 try{assert.equal((await f.command('off')).accepted,true);assert.equal(f.clicks(),1);}finally{f.close();}
});
for(const label of ['Answer call','Accept call','Decline call','Reject call','Answer incoming call','Accept incoming call','Decline incoming call','Reject incoming call'])test('explicit call action remains ringing: '+label,async()=>{
 const f=fixture(true,'Waiting',`<button aria-label="${label}"></button>`);
 try{assert.equal(f.sent[0].observed,'ringing');assert.equal((await f.command('off')).accepted,false);assert.equal(f.clicks(),0);}finally{f.close();}
});
for(const markup of [
 '<div role="dialog" aria-label="Incoming call"><button>Accept</button><button>Decline</button></div>',
 '<div role="alertdialog" aria-label="Ringing"><div role="button" aria-label="Answer"></div></div>',
 '<dialog open aria-label="Incoming call"><button>Reject</button></dialog>',
 '<div role="dialog" aria-labelledby="call-title"><h4 id="call-title">Incoming call</h4><button>Accept</button></div>',
 '<span id="hidden-call-title" style="visibility:hidden">Incoming call</span><div role="dialog" aria-labelledby="hidden-call-title"><button>Accept</button><button>Decline</button></div>'
])test('generic action requires a call-labelled dialog: '+markup,async()=>{
 const f=fixture(false,'Offline',markup);
 try{assert.equal(f.sent[0].observed,'ringing');assert.equal((await f.command('on')).accepted,false);assert.equal(f.clicks(),0);}finally{f.close();}
});

function onlineFixture(extra=''){
 return fixture(true,'','','',readFileSync(__dirname+'/fixtures/allcalls-online-2026-11-06.html','utf8')+extra);
}
test('captured Online card is waiting and confirms the requested OFF readback',async()=>{
 const f=onlineFixture();
 try{assert.equal(f.sent[0].observed,'waiting');assert.equal(f.sent[0].delivery,'on');assert.equal(f.clicks(),0);assert.equal((await f.command('off')).accepted,true);assert.equal(f.clicks(),1);assert.equal((await f.read()).delivery,'off');assert.equal((await f.command('off')).accepted,true);assert.equal(f.clicks(),1);}finally{f.close();}
});
for(const [evidence,state] of [['<div role="dialog"><h2>Incoming call</h2></div>','ringing'],['<button>End call</button>','talking'],['<div>Wrap-up</div>','wrap']])test('busy evidence overrides captured Online wording: '+state,async()=>{
 const f=onlineFixture(evidence);try{assert.equal((await f.read()).observed,state);assert.equal((await f.command('off')).accepted,false);assert.equal(f.clicks(),0);}finally{f.close();}
});
test('call beginning after captured Online sample prevents OFF',async()=>{
 const f=onlineFixture();try{assert.equal((await f.read()).observed,'waiting');f.busy('Talking');assert.equal((await f.command('off')).accepted,false);assert.equal(f.clicks(),0);}finally{f.close();}
});
test('new Online wording outside status card cannot authorize OFF',async()=>{
 const f=fixture(true,'Unrecognized status','<div>Online – Waiting for inbound calls</div>');try{assert.equal((await f.read()).observed,'unknown');assert.equal((await f.command('off')).accepted,false);assert.equal(f.clicks(),0);}finally{f.close();}
});
test('Online wording with an Off switch is inconsistent, not idle permission',async()=>{
 const f=fixture(false,'Online – Waiting for inbound calls');try{assert.equal((await f.read()).observed,'unknown');assert.equal((await f.command('on')).accepted,false);assert.equal(f.clicks(),0);}finally{f.close();}
});
