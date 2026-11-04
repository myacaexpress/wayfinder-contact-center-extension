const {test}=require('node:test');const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');const {readFileSync}=require('node:fs');const {webcrypto}=require('node:crypto');
const intake='11111111-1111-4111-8111-111111111111',jobId='22222222-2222-4222-8222-222222222222',requestId='33333333-3333-4333-8333-333333333333';
const wf='https://wayfindercontactcenter.com/agent',vendor='https://connect.integrity.com/agent/clients/contact/90000001/overview';
async function harness(){
 const {installIntegrityVerifyBridge}=await import('./integrity-verify-background.mjs');let listener;const calls=[];
 const config={permission:true,tabUrls:[vendor],ready:true,npn:'99999999',status:'prepared',createdUrl:vendor,tabStatus:'complete'};
 const meta=()=>({intakeId:intake,jobId,status:config.status,leadId:'90000001',agentNpn:'99999999',claimExpiresAt:new Date(Date.now()+60000).toISOString(),expiresAt:new Date(Date.now()+600000).toISOString()});
 const chrome={runtime:{id:'ext',getURL:p=>'chrome-extension://ext/'+p,onMessage:{addListener:fn=>{listener=fn;}}},permissions:{contains:async()=>config.permission},tabs:{query:async()=>config.tabUrls.map((url,i)=>({id:i+5,url})),create:async options=>{calls.push({kind:'create',options});config.tabUrls.push(config.createdUrl);return {id:config.tabUrls.length+4};},get:async id=>({id,url:config.tabUrls[id-5],status:config.tabStatus}),sendMessage:async(tab,msg,options)=>{calls.push({kind:'api',tab,msg,options});if(config.hold)await config.hold;if(msg.action==='prepare')return meta();return {...meta(),status:'claimed',action:'verify_eligibility',claimedAt:new Date().toISOString(),expected:{leadId:'90000001',agentNpn:'99999999',firstName:'Synthetic',lastName:'Example',dob:'1952-04-12',medicareNumber:'1AA1AA1AA11'}};}},scripting:{executeScript:async options=>{calls.push({kind:'script',options});return [{frameId:0,result:options.args.length===2?{ready:config.ready,agentNpn:config.npn}:{status:'pending',code:'submitted'}}];}}};
 installIntegrityVerifyBridge(chrome,{wait:async()=>{config.waits=(config.waits||0)+1;if(config.onWait)config.onWait();}});const sender={id:'ext',frameId:0,url:wf,tab:{id:1,url:wf}};
 return {calls,config,sender,send:(message={type:'integrity-verify-start',intakeId:intake,requestId},from=sender)=>new Promise(resolve=>{if(listener(message,from,resolve)!==true)resolve(undefined);})};
}
test('claims only after permitted unique bound tab and matching vendor account; final result has no identity',async()=>{
 const h=await harness();const result=await h.send();assert.deepEqual(result,{status:'pending',code:'submitted',jobId});
 assert.deepEqual(h.calls.map(c=>c.kind==='api'?c.msg.action:'script'),['prepare','script','claim','script']);
 assert.deepEqual(h.calls[2].msg.body,{intake_id:intake,job_id:jobId});assert.equal(h.calls[3].options.world,'ISOLATED');
 assert.equal(h.calls[3].options.args[1].expected.mbi,'1AA1AA1AA11');assert.doesNotMatch(JSON.stringify(result),/Synthetic|1952|1AA1/);
 const again=await h.send();assert.equal(again.code,'already_claimed');assert.equal(h.calls.filter(c=>c.kind==='api'&&c.msg.action==='claim').length,1);
});
test('denied optional permission never prepares or claims',async()=>{const h=await harness();h.config.permission=false;assert.equal((await h.send()).code,'permission_required');assert.equal(h.calls.length,0);});
test('wrong sender, iframe, wrong path, and non UUID input never touch vendor or API',async()=>{
 const h=await harness();for(const change of [{id:'other'},{frameId:1},{url:'https://evil.test/agent'},{url:wf+'/extra'},{tab:{id:1,url:'https://evil.test'}}])assert.equal((await h.send(undefined,{...h.sender,...change})).code,'invalid_request');
 assert.equal((await h.send({type:'integrity-verify-start',intakeId:'bad',requestId})).code,'invalid_request');assert.equal(h.calls.length,0);
});
for(const [title,patch,code] of [['duplicate tabs',{tabUrls:[vendor,vendor]},'ambiguous_contact_tab'],['unreadable',{ready:false},'contact_not_ready'],['missing account',{npn:null},'account_unverified'],['wrong account',{npn:'88888888'},'account_unverified']])test(title+' blocks before one-shot claim',async()=>{
 const h=await harness();Object.assign(h.config,patch);assert.equal((await h.send()).code,code);assert.equal(h.calls.filter(c=>c.kind==='api'&&c.msg.action==='claim').length,0);
});
test('simultaneous starts cannot race the same intake claim',async()=>{const h=await harness();let release;h.config.hold=new Promise(r=>{release=r;});const first=h.send();await Promise.resolve();assert.equal((await h.send()).code,'busy');release();await first;assert.equal(h.calls.filter(c=>c.kind==='api'&&c.msg.action==='claim').length,1);});
test('popup permission request is explicit, reports denial and never sends a verify command',async()=>{
 const dom=new JSDOM('<button id="integrity-access"></button><p id="integrity-access-status"></p>',{runScripts:'outside-only'});let calls=0;
 dom.window.chrome={permissions:{request:async options=>{calls++;assert.deepEqual(Array.from(options.origins),['https://connect.integrity.com/*']);return false;}}};
 dom.window.eval(readFileSync(__dirname+'/integrity-verify-popup.js','utf8'));assert.equal(calls,0);dom.window.document.querySelector('button').click();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);assert.match(dom.window.document.querySelector('p').textContent,/not enabled/);dom.window.close();
});
test('page bridge accepts only same-origin same-window fixed starts and strips extra fields',async()=>{
 const dom=new JSDOM('',{url:wf,runScripts:'outside-only'}),w=dom.window,sent=[];let listener;
 w.chrome={runtime:{id:'ext',onMessage:{addListener:fn=>{listener=fn;}},sendMessage:async message=>{sent.push(message);return {status:'blocked',code:'permission_required'};}}};
 Object.defineProperty(w,'crypto',{value:webcrypto});w.eval(readFileSync(__dirname+'/integrity-verify-wayfinder.js','utf8'));
 const data={type:'wayfinder-integrity-verify-start',requestId,intakeId:intake,url:'/admin',token:'not-forwarded'};
 w.dispatchEvent(new w.MessageEvent('message',{source:w,origin:'https://evil.test',data}));w.dispatchEvent(new w.MessageEvent('message',{source:null,origin:w.location.origin,data}));assert.equal(sent.length,0);
 w.dispatchEvent(new w.MessageEvent('message',{source:w,origin:w.location.origin,data}));await Promise.resolve();assert.deepEqual(JSON.parse(JSON.stringify(sent)),[{type:'integrity-verify-start',requestId,intakeId:intake}]);
 let reply;listener({type:'integrity-verify-api',action:'arbitrary',body:{intake_id:intake}},{id:'ext'},value=>{reply=value;});assert.equal(reply.error,'invalid_request');dom.window.close();
});

test('missing exact contact opens one inactive bound tab without navigating an unrelated contact',async()=>{
 const h=await harness(),unrelated=vendor.replace('90000001','90000002');h.config.tabUrls=[unrelated];
 assert.equal((await h.send()).status,'pending');assert.deepEqual(h.calls.find(c=>c.kind==='create').options,{url:vendor,active:false});
 assert.deepEqual(h.config.tabUrls,[unrelated,vendor]);assert.equal(h.calls.filter(c=>c.kind==='api'&&c.msg.action==='claim').length,1);
});
test('waits for created contact tab to finish loading before claim',async()=>{
 const h=await harness();h.config.tabUrls=[];h.config.tabStatus='loading';h.config.onWait=()=>{h.config.tabStatus='complete';};
 assert.equal((await h.send()).status,'pending');assert.equal(h.config.waits,1);
});
for(const [title,patch,code] of [['login redirect',{createdUrl:'https://connect.integrity.com/login'},'login_required'],['wrong route',{createdUrl:vendor.replace('overview','details')},'contact_not_ready'],['load timeout',{tabStatus:'loading'},'contact_not_ready']])test(title+' leaves one-shot claim untouched',async()=>{
 const h=await harness();h.config.tabUrls=[];Object.assign(h.config,patch);assert.equal((await h.send()).code,code);
 assert.equal(h.calls.filter(c=>c.kind==='api'&&c.msg.action==='claim').length,0);if(title==='load timeout')assert.equal(h.config.waits,40);
});
