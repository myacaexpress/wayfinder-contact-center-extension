const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const http=require('node:http');
const {Simulator}=require('./engine.cjs');
const {createServer}=require('./server.cjs');
async function setup(t){const s=new Simulator();t.after(()=>s.close());await s.act('enable');await s.act('tick');return s;}
test('real controller and reader pause and restore fake AllCalls',async t=>{
 const s=await setup(t);assert.equal((await s.act('wf-busy')).allcalls.delivery,'off');
 await s.act('wf-idle');const r=await s.act('tick');assert.equal(r.allcalls.delivery,'on');assert.ok(r.events.some(e=>e.message.includes('REAL reader clicked')));
});
test('manual AllCalls Offline prevents automatic resume',async t=>{
 const s=await setup(t);await s.act('wf-busy');await s.act('ac-off');await s.act('wf-idle');assert.equal((await s.act('tick')).allcalls.delivery,'off');
});
test('failed modeled restore retries; manual Break cancels',async t=>{
 const s=await setup(t);await s.act('ac-talk');await s.act('restore-fail');await s.act('ac-idle');
 let r=await s.act('tick');assert.equal(r.fake.state,'Offline');assert.equal(r.fake.ownWF,true);assert.equal(r.fake.attempts,1);
 r=await s.act('tick');assert.equal(r.fake.state,'Available');
 await s.act('ac-talk');await s.act('wf-break');await s.act('ac-idle');r=await s.act('tick');assert.equal(r.fake.state,'Break');assert.equal(r.fake.ownWF,false);
});
test('modeled pending blocks duplicate dispatch, then confirms and supports next cycle',async t=>{
 const s=await setup(t);await s.act('ac-talk');await s.act('restore-pending');await s.act('ac-idle');await s.act('tick');
 let r=await s.act('tick');assert.equal(r.fake.pending,true);assert.equal(r.fake.attempts,1);
 r=await s.act('confirm');assert.equal(r.fake.state,'Available');assert.equal(r.fake.ownWF,false);
 await s.act('ac-talk');await s.act('ac-idle');assert.equal((await s.act('tick')).fake.state,'Available');
});
test('modeled pending timeouts exhaust bounded restoration; manual Offline cancels pending',async t=>{
 const s=await setup(t);await s.act('ac-talk');await s.act('restore-pending');await s.act('ac-idle');await s.act('tick');
 for(let i=0;i<12;i++)await s.act('timeout');
 let r=await s.act('tick');assert.equal(r.fake.attempts,12);assert.equal(r.fake.ownWF,false);assert.equal(r.fake.state,'Offline');
 await s.act('reset');await s.act('enable');await s.act('tick');await s.act('ac-talk');await s.act('restore-pending');await s.act('ac-idle');await s.act('tick');
 await s.act('wf-off');r=await s.act('confirm');assert.equal(r.fake.state,'Offline');assert.equal(r.fake.pending,false);
});
test('real reader recovery, denied recovery and worker reload remain isolated',async t=>{
 const s=await setup(t);let r=await s.act('reader-missing');assert.ok(r.events.some(e=>e.kind==='recovery'));assert.equal(r.status.error,'');
 r=await s.act('reader-denied');assert.equal(r.status.result.diagnostics.reason,'unknown');assert.ok(r.events.some(e=>e.message.includes('denied')));
 await s.act('reload-reader');r=await s.act('reload-worker');assert.equal(r.status.settings.enabled,true);assert.equal(r.status.error,'');
});
test('real controller preserves Off and does not switch on disconnect/stale samples',async t=>{
 const s=await setup(t);await s.act('disconnect');let r=await s.act('wf-busy');assert.match(r.status.error,/Synthetic/);assert.equal(r.allcalls.delivery,'on');
 await s.act('reconnect');await s.act('disable');const count=s.events.filter(e=>e.kind==='request').length;
 await s.act('ac-talk');assert.equal(s.events.filter(e=>e.kind==='request').length,count);
 await s.act('enable');r=await s.act('stale');assert.equal(r.status.result.diagnostics.reason,'unknown');
});
test('controller has no network/process APIs; fake DOM network entry points fail closed',t=>{
 const s=new Simulator();t.after(()=>s.close());
 for(const key of ['fetch','WebSocket','XMLHttpRequest','require','process'])assert.equal(vm.runInContext(`typeof ${key}`,s.context),'undefined');
 for(const key of ['fetch','XMLHttpRequest','WebSocket','EventSource'])assert.throws(()=>s.dom.window[key]('https://wayfindercontactcenter.com'),/Network disabled/);
 assert.throws(()=>s.dom.window.navigator.sendBeacon('https://allcalls.io'),/Network disabled/);
});
function request(port,options={}){return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:'/',...options},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>resolve({code:res.statusCode,headers:res.headers,body}));});req.on('error',reject);req.end(options.body);});}
test('loopback server blocks cross-origin actions, hostile Host and unknown routes',async t=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());const port=server.address().port;
 let r=await request(port);assert.equal(r.code,200);assert.match(r.headers['content-security-policy'],/connect-src 'self'/);
 assert.equal((await request(port,{headers:{Host:'evil.example'}})).code,403);
 assert.equal((await request(port,{path:'/action',method:'POST',headers:{Origin:'https://allcalls.io','X-Simulator':'local-only'},body:'{"action":"enable"}'})).code,403);
 assert.equal((await request(port,{path:'/action',method:'POST',body:'{"action":"enable"}'})).code,404);
 assert.equal((await request(port,{path:'/../engine.cjs'})).code,404);
 r=await request(port,{path:'/action',method:'POST',headers:{'X-Simulator':'local-only'},body:'{"action":"enable"}'});assert.equal(r.code,200);assert.equal(JSON.parse(r.body).status.settings.enabled,true);
});

test('actual content-script refuses disabled fake switch and confirms readback after retry',async t=>{
 const s=await setup(t);await s.act('switch-block');let r=await s.act('wf-busy');
 assert.equal(r.allcalls.delivery,'on');assert.equal(r.status.lastSwitch.confirmed,false);
 assert.match(r.status.error,/not confirmed/);r=await s.act('switch-allow');
 assert.equal(r.allcalls.delivery,'off');assert.equal(r.status.lastSwitch.confirmed,true);
});
