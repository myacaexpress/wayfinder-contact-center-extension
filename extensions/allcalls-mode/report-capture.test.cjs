const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const variants=[path.join(__dirname,'report-capture.js'),path.join(__dirname,'../call-protection/src/report-capture.js')];
function fixture(script, overrides={}) {
 const headers=['ID','Direction','Agent Name','Call Date','CallerID','Call Length','Disposition','AI Disposition','Cost','Call Type','Recording'];
 const values=['900101','Inbound','Synthetic Agent','1 hour ago (10:00:00 10/20/2026)','SYNTHETIC-PRIVATE-PHONE','02:10','Follow-Up Needed','Enrolled','$14.00','Medicare Raw Calls','SYNTHETIC-PRIVATE-URL'];
 for(const [key,value] of Object.entries(overrides))values[headers.indexOf(key)]=value;
 const dom=new JSDOM(`<title>Calls - Synthetic Agency</title><select><option selected>Agency View</option><option>Personal Spend</option></select><div aria-label="Call details"><table><thead><tr>${headers.map(v=>`<th>${v}</th>`).join('')}</tr></thead><tbody><tr>${values.map(v=>`<td>${v}</td>`).join('')}</tr></tbody></table></div><p>SYNTHETIC-PRIVATE-NOTE</p>`,{runScripts:'outside-only'});
 dom.window.eval(fs.readFileSync(script,'utf8'));
 const config={source_id:'00000000-0000-4000-8000-000000000001',agency_label:'Synthetic Agency',agents:[{source_agent_name:'Synthetic Agent',source_agent_id:'900001',agent_id:'00000000-0000-4000-8000-000000000002'}]};
 return {dom,config,read:()=>dom.window.wayfinderCaptureAllCallsReport(dom.window.document,config,'2026-10-20T17:00:00Z')};
}
for(const script of variants){
 test(`${script}: only allowlisted fields leave the page`,()=>{
  const f=fixture(script),result=f.read();assert.equal(result.calls[0].cost_cents,1400);assert.equal(result.calls[0].duration_seconds,130);assert.equal(result.calls[0].human_disposition,'Follow-Up Needed');assert.equal(result.calls[0].ai_disposition,'Enrolled');assert.equal(result.calls[0].enrollment_count,null);
  assert.equal(result.coverage,'visible_rows');assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);f.dom.window.close();
 });
 test(`${script}: fail closed on missing IDs, unknown outcomes, mismatched agency and spend view`,()=>{
  for(const changes of [{'ID':''},{'Disposition':'SYNTHETIC-PRIVATE-NOTE'},{'Call Date':'today'},{'Cost':'free'},{'Call Length':'02:99'}]){const f=fixture(script,changes);assert.throws(f.read);f.dom.window.close();}
  const f=fixture(script);f.config.agency_label='Other Agency';assert.throws(f.read,/agency/);f.config.agency_label='Synthetic Agency';f.dom.window.document.querySelector('select').selectedIndex=1;assert.throws(f.read,/Agency View/);f.dom.window.close();
 });
 test(`${script}: enrollment badge and LIVE stay distinct`,()=>{
  const f=fixture(script,{'Disposition':'Enrolled (2) 2 enrollments recorded for this call.','AI Disposition':'Ai Dispo Missing','Call Length':'LIVE'});const c=f.read().calls[0];assert.equal(c.enrollment_count,2);assert.equal(c.human_disposition,'Enrolled');assert.equal(c.ai_disposition,null);assert.equal(c.duration_seconds,null);f.dom.window.close();
 });
 test(`${script}: unselected agents are excluded and duplicate IDs rejected`,()=>{
  const f=fixture(script);f.config.agents=[];assert.throws(f.read);f.config.agents=[{source_agent_name:'Synthetic Agent'}];const tbody=f.dom.window.document.querySelector('tbody');tbody.append(tbody.firstChild.cloneNode(true));assert.throws(f.read,/Duplicate/);f.dom.window.close();
 });
}
