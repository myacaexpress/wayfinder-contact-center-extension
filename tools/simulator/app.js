const $=id=>document.getElementById(id);
function render(s){
 $('summary').textContent=`Simulated protection: ${s.status.settings?.enabled?'ON':'OFF'} · ${s.status.error||s.status.issue||s.status.result?.diagnostics?.reason||'not connected'}`;
 $('ac').textContent=`${s.allcalls.label} · delivery ${s.allcalls.delivery.toUpperCase()}`;
 $('wf').textContent=`${s.fake.state}${s.fake.busy?' · call active':''}`;
 $('ownership').textContent=`Owned restores: Wayfinder ${s.fake.ownWF?'yes':'no'}, AllCalls ${s.fake.ownAC?'yes':'no'} · Attempts ${s.fake.attempts}/12 · Pending ${s.fake.pending?'yes':'no'} · Next result ${s.fake.fault}`;
 $('source').textContent=s.source;
 $('log').textContent=s.events.map(e=>`${new Date(e.at).toISOString().slice(11,19)} [${e.kind}] ${e.message}`).join('\n');$('log').scrollTop=$('log').scrollHeight;
}
async function request(action){
 const buttons=[...document.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);$('error').textContent='';
 try{const r=await fetch(action?'/action':'/state',action?{method:'POST',headers:{'Content-Type':'application/json','X-Simulator':'local-only'},body:JSON.stringify({action})}:{});const s=await r.json();if(!r.ok)throw new Error(s.error);render(s);}catch(e){$('error').textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);}
}
document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>request(b.dataset.action)));
request();
