const {test}=require('node:test');
const assert=require('node:assert/strict');
require('./detector.js');
const detect=globalThis.wayfinderAllCallsDetect;
test('positive off evidence is required',()=>{
 assert.equal(detect({statuses:["You're Off – No Calls Will Be Sent"]}),'off');
 for(const statuses of [[],['Offline'],['Ready'],['Loading'],['Changed UI']])assert.equal(detect({statuses}),'unknown');
});
test('busy wins even while delivery is off',()=>{
 for(const [label,state] of [['Ringing','ringing'],['Talking','talking'],['Dispositioning','wrap']])
 assert.equal(detect({statuses:["You're Off – No Calls Will Be Sent"],busyLabels:[label]}),state);
});
test('agency summaries never authorize an individual agent',()=>{
 assert.equal(detect({agency:true,statuses:["You're Off – No Calls Will Be Sent"]}),'unknown');
});
