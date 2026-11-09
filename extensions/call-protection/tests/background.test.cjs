const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
function harness(initialSettings={enabled:true}){
 let listener,stored={},local=initialSettings?{settings:initialSettings}:{};const sent=[];
 const config={ac:[{id:1,url:'https://allcalls.io/take-calls'}],wf:[{id:2,url:'https://www.wayfindercontactcenter.com/agent'}],target:'none',sample:{observed:'off',delivery:'off',measured_at:Math.floor(Date.now()/1000)}};
 const chrome={runtime:{id:'ext',getURL:p=>'chrome-extension://ext/'+p,onMessage:{addListener:fn=>listener=fn}},storage:{session:{get:async()=>stored,set:async value=>{stored={...stored,...structuredClone(value)};}},local:{get:async()=>local,set:async value=>{local={...local,...structuredClone(value)};}}},tabs:{query:async q=>q.active?config.wf.filter(t=>t.active):typeof q.url==='string'?config.ac:config.wf,sendMessage:async(id,msg)=>{sent.push({id,msg});if(config.hold&&msg.type==='wayfinder-request')await config.hold;if(msg.body?.action==='configure'){config.enabled=msg.body.enabled;config.returnAfterWrap=msg.body.enabled;}if(config.fail&&msg.type==='wayfinder-request')throw new Error('Synthetic connection failure');return msg.type==='read-observation'?config.sample:msg.type==='set-delivery'?(config.switchReply||{accepted:true}):{enabled:config.enabled!==false,return_after_wrap:config.returnAfterWrap===true,agent_id:'agent',mode:'auto',mcp_allowed:true,allcalls_target:config.target};},update:async(id,values)=>{sent.push({focus:id,values});},onRemoved:{addListener:()=>{}}},windows:{update:async(id,values)=>{sent.push({window:id,values});}}};
 vm.runInNewContext(readFileSync(__dirname+'/background.js','utf8'),{chrome,crypto:webcrypto,Date,URL,Promise,Error,Number,setTimeout,clearTimeout});
 const sender={id:'ext',url:'chrome-extension://ext/popup.html'};
 return {send:(m,s=sender)=>new Promise(resolve=>{if(listener(m,s,resolve)!==true)resolve({});}),sent,state:()=>stored.state,config};
}
const observation=()=>({type:'observation',observed:'waiting',delivery:'on',measured_at:Math.floor(Date.now()/1000)});
const agent={id:'ext',url:'https://allcalls.io/take-calls',tab:{id:1}};
test('connects automatically and pins the authenticated Wayfinder identity',async()=>{
 const h=harness();await h.send(observation(),agent);
 assert.equal(h.sent[0].msg.body.action,'sync');assert.equal(h.sent[0].msg.body.sequence,1);
 await h.send(observation(),agent);assert.equal(h.sent[1].msg.body.expected_agent_id,'agent');assert.equal(h.sent[1].msg.body.sequence,2);
});
test('only the unique Take Calls tab can submit observations',async()=>{
 const h=harness();
 for(const url of ['https://evil.example/take-calls','https://allcalls.io/agency/dashboard','https://allcalls.io/profile/licenses'])await h.send(observation(),{...agent,url});
 await h.send(observation(),{...agent,tab:{id:7}});assert.equal(h.sent.length,0);
 h.config.ac.push({id:3,url:agent.url});await h.send(observation(),agent);
 assert.equal(h.sent.length,1);assert.equal(h.sent[0].msg.body.source_issue,'multiple_allcalls_tabs');assert.equal(h.sent[0].msg.body.observed,'unknown');assert.equal(h.sent.filter(x=>x.msg.type==='set-delivery').length,0);
});
test('popup and arbitrary content messages cannot request mode switches',async()=>{
 const h=harness();await h.send({type:'mcp',finished:true},agent);await h.send({type:'connect'});assert.equal(h.sent.length,0);
});
test('stale evidence never authorizes idle',async()=>{
 const h=harness();await h.send({...observation(),measured_at:1},agent);
 assert.equal(h.sent[0].msg.body.observed,'unknown');assert.equal(h.sent[0].msg.body.delivery,'unknown');
});
test('only fixed server targets go to the paired AllCalls tab',async()=>{
 const h=harness();h.config.target='off';await h.send(observation(),agent);
 assert.equal(h.sent[1].id,1);assert.equal(h.sent[1].msg.target,'off');
 h.config.target='arbitrary-script';await h.send(observation(),agent);assert.equal(h.sent.length,3);
});

test('Off commands use dispatch time even when evidence is old',async()=>{
 const h=harness();h.config.target='off';await h.send({...observation(),measured_at:1},agent);
 assert.ok(Date.now()-h.sent[1].msg.issued_at<1000);
});

test('opening another Wayfinder dashboard preserves the already confirmed pairing',async()=>{
 const h=harness(); await h.send(observation(),agent);
 h.config.wf.push({id:4,url:'https://www.wayfindercontactcenter.com/agent'});
 await h.send(observation(),agent);
 assert.equal(h.state().error,'');
 assert.equal(h.sent.filter(x=>x.msg.type==='wayfinder-request').at(-1).id,2);
});
test('duplicate AllCalls tabs report the exact reason instead of generic waiting',async()=>{
 const h=harness(); await h.send(observation(),agent);
 h.config.ac.push({id:3,url:agent.url}); await h.send(observation(),agent);
 assert.equal(h.state().issue,'multiple_allcalls_tabs');
 assert.equal(h.state().allcallsCount,2);
});
test('Wayfinder heartbeat obtains a fresh Off sample even without AllCalls timers',async()=>{
 const h=harness();await h.send({type:'poll'},{id:'ext',url:'https://www.wayfindercontactcenter.com/agent',tab:{id:2}});
 assert.equal(h.sent[0].msg.type,'read-observation');
 assert.equal(h.sent[1].msg.body.observed,'off');
 assert.equal(h.sent[1].msg.body.delivery,'off');
});
test('popup status remains responsive and preserves acknowledgement during pending sync',async()=>{
 const h=harness();await h.send(observation(),agent);
 let release;h.config.hold=new Promise(r=>release=r);
 const pending=h.send(observation(),agent);
 await new Promise(r=>setImmediate(r));
 const status=await h.send({type:'status'});
 assert.equal(status.result.mcp_allowed,true);assert.ok(status.confirmedAt);
 release();await pending;
});
test('closed AllCalls is explicitly reported for Wayfinder-only operation',async()=>{
 const h=harness();h.config.ac=[];
 await h.send({type:'poll'},{id:'ext',url:'https://www.wayfindercontactcenter.com/agent',tab:{id:2}});
 assert.equal(h.sent[0].msg.body.observed,'unknown');
 assert.equal(h.sent[0].msg.body.source_issue,'allcalls_closed');
});
test('another visible dashboard can drive polling through the retained authenticated tab',async()=>{
 const h=harness();await h.send(observation(),agent);h.state().confirmedAt-=3000;
 h.config.wf.push({id:4,url:'https://www.wayfindercontactcenter.com/agent'});
 await h.send({type:'poll'},{id:'ext',url:'https://www.wayfindercontactcenter.com/agent',tab:{id:4}});
 assert.equal(h.sent[1].id,1);assert.equal(h.sent[1].msg.type,'read-observation');
 assert.equal(h.sent[2].id,2);assert.equal(h.sent[2].msg.body.observed,'off');
});

test('agent to manager navigation keeps the authenticated pairing and fresh checks',async()=>{
 const h=harness();await h.send(observation(),agent);
 h.config.wf[0].url='https://www.wayfindercontactcenter.com/manager#team';
 await h.send(observation(),agent);
 assert.equal(h.state().issue,'');
 assert.equal(h.sent.filter(x=>x.msg.type==='set-delivery').length,0);
 h.state().confirmedAt-=3000;
 await h.send({type:'poll'},{id:'ext',url:h.config.wf[0].url,tab:{id:2}});
 assert.equal(h.sent.at(-2).msg.type,'read-observation');
 assert.equal(h.sent.at(-1).id,2);
 assert.equal(h.sent.at(-1).msg.body.observed,'off');
});

test('confirmed Off persists and stops observation and polling mutations',async()=>{
 const h=harness();await h.send(observation(),agent);
 assert.equal((await h.send({type:'configure',enabled:false,returnAfterWrap:true})).accepted,true);
 const status=await h.send({type:'status'});assert.equal(status.settings.enabled,false);
 const count=h.sent.length;
 await h.send(observation(),agent);
 await h.send({type:'poll'},{id:'ext',url:'https://www.wayfindercontactcenter.com/agent',tab:{id:2}});
 assert.equal(h.sent.length,count);
});
test('only the popup can configure protection; enable reads current evidence',async()=>{
 const h=harness();await h.send({type:'configure',enabled:false,returnAfterWrap:false},agent);assert.equal(h.sent.length,0);
 await h.send({type:'configure',enabled:false,returnAfterWrap:false});
 h.config.sample={observed:'talking',delivery:'on',measured_at:Math.floor(Date.now()/1000)};
 await h.send({type:'configure',enabled:true,returnAfterWrap:true});
 assert.equal(h.sent.at(-2).msg.type,'read-observation');
 assert.equal(h.sent.at(-1).msg.body.observed,'talking');
 assert.equal(h.sent.at(-1).msg.body.return_after_wrap,undefined);
 assert.equal((await h.send({type:'status'})).settings.enabled,true);
});
test('an unconfirmed setting change is not saved or reported successful',async()=>{
 const h=harness();await h.send(observation(),agent);h.config.fail=true;
 const reply=await h.send({type:'configure',enabled:false,returnAfterWrap:true});
 assert.match(reply.error,/Synthetic connection failure/);
 assert.equal((await h.send({type:'status'})).settings.enabled,true);
 assert.equal(h.sent.filter(x=>x.msg.type==='set-delivery').length,0);
});

for(const target of [true,false])test(`lost ${target?'enable':'disable'} acknowledgement reconciles the authoritative setting`,async()=>{
 const h=harness();await h.send({type:'configure',enabled:!target,returnAfterWrap:false});
 h.config.fail=true;
 const reply=await h.send({type:'configure',enabled:target,returnAfterWrap:true});
 assert.ok(reply.error);
 let status=await h.send({type:'status'});
 assert.equal(status.settings.enabled,!target);assert.equal(status.settings.pending,true);
 h.config.fail=false;
 await h.send({type:'poll'},{id:'ext',url:'https://www.wayfindercontactcenter.com/agent',tab:{id:2}});
 status=await h.send({type:'status'});
 assert.equal(status.settings.enabled,target);assert.equal(status.settings.pending,false);
 assert.equal(status.settings.returnAfterWrap,target);
 assert.equal(h.sent.at(-1).msg.body.action,'sync');
});

test('logged-out AllCalls is distinct from an unreadable or other page',async()=>{
 const h=harness();const sender={id:'ext',url:'https://www.wayfindercontactcenter.com/agent',tab:{id:2}};
 for(const [url,issue] of [['https://allcalls.io/login','allcalls_logged_out'],['https://allcalls.io/agency/dashboard','allcalls_tab_missing']]){
  h.config.ac=[{id:1,url}];await h.send({type:'poll'},sender);
  assert.equal(h.sent.at(-1).msg.body.source_issue,issue);
  await new Promise(r=>setImmediate(r));
 }
 h.config.ac=[{id:1,url:'https://allcalls.io/take-calls'}];h.state().confirmedAt=0;
 await h.send({type:'poll'},sender);
 assert.equal(h.sent.at(-1).msg.body.source_issue,'none');
 assert.equal(h.sent.at(-1).msg.body.observed,'off');
});

test('transport failures do not perform an unrecorded AllCalls pause',async()=>{
 const h=harness();h.config.fail=true;
 await h.send(observation(),agent);
 assert.match(h.state().error,/Synthetic connection failure/);
 assert.equal(h.sent.filter(x=>x.msg.type==='set-delivery').length,0);
});
test('document session identity is forwarded for bounded restoration ownership',async()=>{
 const h=harness();await h.send({...observation(),allcalls_session:'78d5fb8b-efc6-4b60-b21c-03a7130b9505'},agent);
 assert.equal(h.sent[0].msg.body.allcalls_session,'78d5fb8b-efc6-4b60-b21c-03a7130b9505');
});

test('fresh install exposes duplicate workspaces and accepts an explicit choice',async()=>{
 const h=harness();h.config.wf.push({id:4,url:'https://www.wayfindercontactcenter.com/manager'});
 const status=await h.send({type:'status'});
 assert.equal(status.needsWorkspace,true);assert.equal(status.workspaces.length,2);
 const blocked=await h.send({type:'configure',enabled:false});
 assert.match(blocked.error,/Choose your Wayfinder workspace/);assert.equal(h.sent.length,0);
 const accepted=await h.send({type:'configure',enabled:false,wayfinderTabId:4});
 assert.equal(accepted.accepted,true);assert.equal(h.sent[0].id,4);assert.equal(h.sent[0].msg.body.enabled,false);
});
test('workspace choice cannot target an arbitrary or closed tab and retains account pin',async()=>{
 const h=harness();await h.send(observation(),agent);
 const denied=await h.send({type:'configure',enabled:false,wayfinderTabId:999});
 assert.match(denied.error,/no longer open/);
 h.config.wf.push({id:4,url:'https://www.wayfindercontactcenter.com/manager'});
 await h.send({type:'configure',enabled:false,wayfinderTabId:4});
 assert.equal(h.sent.at(-1).msg.body.expected_agent_id,'agent');
});


test('new installation defaults off and never syncs or switches providers until opted in',async()=>{
 const h=harness(null);
 assert.equal((await h.send({type:'status'})).settings.enabled,false);
 await h.send(observation(),agent);
 await h.send({type:'poll'},{id:'ext',url:'https://www.wayfindercontactcenter.com/agent',tab:{id:2}});
 assert.equal(h.sent.length,0);
 const reply=await h.send({type:'configure',enabled:true});
 assert.equal(reply.accepted,true);
 assert.equal((await h.send({type:'status'})).settings.enabled,true);
 assert.equal(h.sent.find(x=>x.msg.body?.action==='configure').msg.body.enabled,true);
});
for(const enabled of [true,false])test(`saved ${enabled} preference survives new default`,async()=>{
 const h=harness({enabled});
 assert.equal((await h.send({type:'status'})).settings.enabled,enabled);
});

test('current Wayfinder tab resolves initial ambiguity without overriding a retained pairing',async()=>{
 const h=harness();h.config.wf=[{id:2,url:'https://wayfindercontactcenter.com/agent',windowId:8,index:0},{id:3,url:'https://wayfindercontactcenter.com/agent',active:true,windowId:8,index:2}];
 const status=await h.send({type:'status'});assert.equal(status.wayfinderTab,3);assert.equal(status.workspaces[1].current,true);assert.equal(status.workspaces[1].position,3);
 await h.send(observation(),agent);h.config.wf[0].active=true;h.config.wf[1].active=false;
 assert.equal((await h.send({type:'status'})).wayfinderTab,3);
});
test('jump focuses only an existing allowed workspace and never configures protection',async()=>{
 const h=harness();h.config.wf[0].windowId=8;
 assert.equal((await h.send({type:'focus-workspace',wayfinderTabId:2})).accepted,true);
 assert.deepEqual(h.sent.map(x=>x.focus||x.window),[2,8]);
 assert.match((await h.send({type:'focus-workspace',wayfinderTabId:999})).error,/no longer open/);
 const before=h.sent.length;await h.send({type:'focus-workspace',wayfinderTabId:2},agent);assert.equal(h.sent.length,before);
});

test('a suggested replacement tab is not labeled as a confirmed pairing',async()=>{
 const h=harness();await h.send(observation(),agent);
 h.config.wf=[{id:9,url:'https://wayfindercontactcenter.com/agent',active:true}];
 const status=await h.send({type:'status'});assert.equal(status.wayfinderTab,9);assert.equal(status.workspaces[0].paired,false);
});

// Diagnostics trace and support bundle.
test('trace records sync, switch outcome and reader cause without payloads or identities',async()=>{
 const h=harness();h.config.target='off';h.config.switchReply={accepted:false,reason:'observed_unknown:no_idle_label'};
 await h.send({...observation(),cause:'idle_label'},agent);
 const kinds=(await h.send({type:'diagnostics'})).trace.map(e=>e.k);
 assert.deepEqual(kinds.filter(k=>k!=='worker_start'),['observation','sync','sync_result','switch']);
 const bundle=await h.send({type:'diagnostics'});
 const sw=bundle.trace.find(e=>e.k==='switch');
 assert.equal(sw.target,'off');assert.equal(sw.accepted,false);assert.equal(sw.detail,'observed_unknown:no_idle_label');assert.ok(Number.isInteger(sw.ms));
 assert.equal(bundle.trace.find(e=>e.k==='observation').cause,'idle_label');
 assert.equal(bundle.state.lastSwitch.detail,'observed_unknown:no_idle_label');
 assert.match(h.state().error,/not confirmed \(observed_unknown:no_idle_label\)/);
 assert.equal(bundle.state.cause,'idle_label');
 const text=JSON.stringify(bundle);
 assert.ok(!text.includes('agent_id')&&!text.includes('clientId')&&!text.includes('identity'),'bundle excludes identities');
 assert.equal(bundle.version,'unknown');assert.equal(bundle.extension_id,'ext');
});
test('trace is bounded, records transitions only, and is popup-only',async()=>{
 const h=harness();
 for(let i=0;i<100;i++)await h.send({...observation(),observed:i%2?'waiting':'off',delivery:i%2?'on':'off',cause:'idle_label'},agent);
 const bundle=await h.send({type:'diagnostics'});
 assert.ok(bundle.trace.length<=80);assert.equal(bundle.trace.at(-1).k,'sync_result');
 const steady=harness();for(let i=0;i<5;i++)await steady.send({...observation(),cause:'idle_label'},agent);
 assert.equal((await steady.send({type:'diagnostics'})).trace.filter(e=>e.k==='observation').length,1);
 assert.deepEqual(await h.send({type:'diagnostics'},agent),{});
 assert.deepEqual(await h.send({type:'diagnostics'},{id:'other',url:'chrome-extension://ext/popup.html'}),{});
});
test('a transport failure on the switch command is traced and still fails the sync',async()=>{
 const h=harness();h.config.target='off';
 h.config.switchReply=Promise.reject(new Error('Calling tab did not respond within 12 seconds. Refresh that tab.'));
 h.config.switchReply.catch(()=>{});
 await h.send(observation(),agent);
 const bundle=await h.send({type:'diagnostics'});
 assert.equal(bundle.trace.find(e=>e.k==='switch').detail,'transport');
 assert.match(bundle.state.lastSwitch.detail,/^transport:Calling tab did not respond/);
 assert.equal(bundle.state.lastSwitch.confirmed,false);
 assert.equal(h.state().result,null);assert.match(h.state().error,/did not respond/);
 assert.equal(bundle.trace.find(e=>e.k==='sync_result'&&e.ok===false).error.startsWith('Calling tab'),true);
});
