// Developer-only: real extension scripts, fake browser and backend. No provider I/O.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const {JSDOM} = require('jsdom');
const source = path.resolve(__dirname, '../../extensions/call-protection/src');
const read = name => fs.readFileSync(path.join(source, name), 'utf8');
const actions = ['tick','enable','disable','ac-idle','ac-ring','ac-talk','ac-wrap','ac-off','wf-idle','wf-busy','wf-break','wf-off','restore-fail','restore-pending','confirm','timeout','disconnect','reconnect','reader-missing','reader-denied','reload-reader','reload-worker','switch-block','switch-allow','stale','reset'];
class Simulator {
  constructor() { this.reset(); }
  log(kind, message) { this.events.push({at: this.now, kind, message}); this.events = this.events.slice(-150); }
  reset() {
    this.dom?.window.close(); this.now = Date.now(); this.events = []; this.local = {}; this.session = {};
    this.fake = {enabled:false, state:'Available', busy:false, ownWF:false, ownAC:false, clear:0, attempts:0, pending:false, attention:false, fault:'none', disconnected:false, denied:false};
    this.makeReader(); this.makeWorker(); this.log('boundary','LOCAL simulation only. No real tabs, credentials, provider or production HTTP clients.');
  }
  clock() { const self=this; return class extends Date { constructor(...args){super(...(args.length?args:[self.now]));} static now(){return self.now;} }; }
  makeReader() {
    this.dom?.window.close(); this.readerPresent=true;
    this.dom = new JSDOM('<h2>Take Calls</h2><button role="switch" aria-checked="true">Fake delivery</button><div id="label">Waiting</div>', {url:'https://allcalls.io/take-calls',runScripts:'outside-only'});
    const w=this.dom.window; w.Date=this.clock(); w.HTMLElement.prototype.getClientRects=()=>[{}];
    const blocked=()=>{throw new Error('Network disabled in simulator');};
    w.fetch=blocked; w.XMLHttpRequest=blocked; w.WebSocket=blocked; w.EventSource=blocked; w.navigator.sendBeacon=blocked;
    w.setInterval=()=>0; w.setTimeout=fn=>{queueMicrotask(fn);return 0;};
    const add=w.document.addEventListener.bind(w.document);
    w.document.addEventListener=(name,fn,...args)=>{if(name==='click')this.manualClick=fn;return add(name,fn,...args);};
    w.chrome={runtime:{id:'sim',sendMessage:async()=>({accepted:false}),onMessage:{addListener:fn=>{this.reader=fn;}}}};
    w.eval(read('detector.js')); w.eval(read('allcalls.js'));
    this.control=w.document.querySelector('button');
    this.control.addEventListener('click',()=>{
      const on=this.control.getAttribute('aria-checked')!=='true'; this.setAC(on?'Waiting':'Offline',on);
      this.log('command',`REAL reader clicked FAKE AllCalls delivery ${on?'ON':'OFF'}`);
    });
  }
  setAC(label,on) {this.control.setAttribute('aria-checked',String(on));this.dom.window.document.getElementById('label').textContent=label;}
  readerMessage(m) {return new Promise(resolve=>{const async=this.reader(m,{id:'sim'},resolve);if(!async&&m.type==='set-delivery')resolve({accepted:false});});}
  makeWorker() {
    const ac={id:1,url:'https://allcalls.io/take-calls'},wf={id:2,url:'https://wayfindercontactcenter.com/agent'};
    const chrome={runtime:{id:'sim',getURL:p=>'chrome-extension://sim/'+p,onMessage:{addListener:fn=>this.listener=fn},onInstalled:{addListener:()=>{}}},
      storage:{local:{get:async()=>structuredClone(this.local),set:async v=>Object.assign(this.local,structuredClone(v))},session:{get:async()=>structuredClone(this.session),set:async v=>Object.assign(this.session,structuredClone(v))}},
      tabs:{query:async q=>q.active?[wf]:typeof q.url==='string'?[ac]:[wf],get:async()=>ac,onRemoved:{addListener:()=>{}},
        sendMessage:async(id,m)=>{
          if(id===1){if(!this.readerPresent)throw new Error('Synthetic missing reader');return this.readerMessage(m);}
          if(id!==2||m.type!=='wayfinder-request')throw new Error('No such mock destination');
          this.log('request',`REAL controller → FAKE Wayfinder: ${m.body.action}, ${m.body.observed}/${m.body.delivery}`);
          if(this.fake.disconnected)throw new Error('Synthetic Wayfinder connection failure');
          return this.backend(m.body);
        }},scripting:{executeScript:async()=>{if(this.fake.denied){this.log('recovery','FAKE Chrome denied reader reinjection');throw new Error('Synthetic permission denial');}this.readerPresent=true;this.log('recovery','REAL controller requested reader reinjection into FAKE tab');}}};
    this.context=vm.createContext({chrome,crypto:webcrypto,Date:this.clock(),URL,Promise,Error,Number,setTimeout,clearTimeout},{codeGeneration:{strings:false,wasm:false}});
    vm.runInContext(read('background.js'),this.context,{timeout:1000});
  }
  send(m,sender={id:'sim',url:'chrome-extension://sim/popup.html'}) {return new Promise(resolve=>{if(this.listener(m,sender,resolve)!==true)resolve({});});}
  backend(b) {
    // Explicit behavioral model, NOT the Python production service.
    const f=this.fake; let target='none',reason='clear';
    if(b.action==='configure'){f.enabled=b.enabled;f.ownWF=f.ownAC=false;f.pending=false;f.attention=false;f.attempts=0;f.clear=0;}
    if(!f.enabled)return this.result('none','protection_off');
    if(b.manual_allcalls)f.ownAC=false;
    if(f.session&&f.session!==b.allcalls_session){f.ownAC=false;this.log('model','New AllCalls document: discard automatic resume ownership');}
    f.session=b.allcalls_session;
    if(b.observed==='unknown'||b.delivery==='unknown') {reason='unknown';f.clear=0;}
    else if(f.busy||['ringing','talking','wrap'].includes(b.observed)) {
      reason=f.busy?'wayfinder_busy':'allcalls_'+b.observed; f.clear=0;
      if(f.busy&&b.delivery==='on'&&!['ringing','talking','wrap'].includes(b.observed)){f.ownAC=true;target='off';}
      if(!f.busy&&f.state==='Available'&&['ringing','talking','wrap'].includes(b.observed)){f.state='Offline';f.ownWF=true;this.log('model','FAKE backend paused FAKE Wayfinder; owns restoration');}
    } else {
      f.clear=Math.min(2,f.clear+1);
      if(f.clear<2)reason='confirming_idle';
      else {
        if(f.ownAC&&b.delivery==='off')target='on';
        if(b.delivery==='on')f.ownAC=false;
        if(f.ownWF&&f.state==='Offline') {
          if(!f.pending){
            f.attempts++;f.attention=true;
            if(f.fault==='fail'){this.log('model',`FAKE provider FAILED restore attempt ${f.attempts}/12`);f.fault='none';}
            else if(f.fault==='pending'){f.pending=true;this.log('model',`FAKE provider PENDING restore attempt ${f.attempts}/12`);}
            else {f.state='Available';f.ownWF=false;f.attention=false;f.attempts=0;this.log('model','FAKE provider confirmed Wayfinder restoration');}
            if(f.attempts>=12&&!f.pending)f.ownWF=false;
          }
          if(f.state==='Offline')reason='restore_unconfirmed';
        }
      }
    }
    if(reason==='clear'&&f.attention)reason='restore_unconfirmed';
    return this.result(target,reason);
  }
  result(target,reason) {const f=this.fake;return {agent_id:'synthetic-agent',enabled:f.enabled,return_after_wrap:false,mode:f.enabled?'auto':'off',mcp_allowed:f.enabled&&reason==='clear',allcalls_target:target,diagnostics:{reason,reason_text:reason,wayfinder_state:f.state}};}
  async tick(stale=false) {
    this.now+=3000;
    if(stale){const s=await this.readerMessage({type:'read-observation'});await this.send({type:'observation',...s,measured_at:1},{id:'sim',url:'https://allcalls.io/take-calls',tab:{id:1}});}
    else await this.send({type:'poll'},{id:'sim',url:'https://wayfindercontactcenter.com/agent',tab:{id:2}});
  }
  async act(action) {
    if(!actions.includes(action))throw new Error('Unknown simulator action');
    this.log('click',action);
    const f=this.fake;
    if(action==='reset'){this.reset();return this.snapshot();}
    if(action==='enable'||action==='disable')await this.send({type:'configure',enabled:action==='enable'});
    else if(action==='tick'||action==='stale')await this.tick(action==='stale');
    else if(action.startsWith('ac-')){
      const labels={'ac-idle':'Waiting','ac-ring':'Ringing','ac-talk':'Talking','ac-wrap':'Dispositioning','ac-off':'Offline'};
      this.setAC(labels[action],action!=='ac-off');
      if(action==='ac-off')this.manualClick({isTrusted:true,target:this.control});
      await this.tick();
    }else if(['wf-idle','wf-busy','wf-off','wf-break'].includes(action)){
      f.busy=action==='wf-busy';
      if(action==='wf-off'||action==='wf-break'){f.state=action==='wf-off'?'Offline':'Break';f.ownWF=false;f.pending=false;f.attention=false;f.attempts=0;}
      if(action==='wf-idle'&&!f.ownWF)f.state='Available';
      await this.tick();
    }else if(action==='restore-fail'||action==='restore-pending'){f.fault=action==='restore-fail'?'fail':'pending';}
    else if(action==='confirm'){
      if(f.pending){f.pending=false;f.ownWF=false;f.attention=false;f.state='Available';f.attempts=0;f.fault='none';this.log('model','FAKE provider-only confirmation clears pending ownership');}await this.tick();
    }else if(action==='timeout'){
      if(f.pending){f.pending=false;if(f.attempts>=12)f.ownWF=false;this.log('model','FAKE pending restore expired');}this.now+=61000;await this.tick();
    }else if(action==='switch-block'||action==='switch-allow'){this.control.disabled=action==='switch-block';this.log('fixture',this.control.disabled?'FAKE switch disabled: actual reader must refuse click':'FAKE switch enabled');await this.tick();}
    else if(action==='disconnect')f.disconnected=true;
    else if(action==='reconnect'){f.disconnected=false;await this.tick();}
    else if(action==='reader-missing'){this.readerPresent=false;f.denied=false;await this.tick();}
    else if(action==='reader-denied'){this.readerPresent=false;f.denied=true;await this.tick();}
    else if(action==='reload-reader'){const on=this.control.getAttribute('aria-checked')==='true';this.makeReader();this.setAC(on?'Waiting':'Offline',on);f.denied=false;await this.tick();}
    else if(action==='reload-worker'){this.session={};this.makeWorker();this.log('recovery','REAL controller recreated; mock local settings retained, session cleared');await this.tick();}
    return this.snapshot();
  }
  async snapshot() {const status=await this.send({type:'status'});return {status,fake:{...this.fake},allcalls:{label:this.dom.window.document.getElementById('label').textContent,delivery:this.control.getAttribute('aria-checked')==='true'?'on':'off'},events:this.events,source:'Unmodified 0.3.13 background.js + detector.js + allcalls.js; modeled backend'};}
  close(){this.dom.window.close();}
}
module.exports={Simulator,actions};
