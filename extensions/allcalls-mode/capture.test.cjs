const {test}=require('node:test');const assert=require('node:assert/strict');
test('capture accepts only bounded public UHC tickets and PDF bytes',async()=>{
 const {ticket,pdfBytes}=await import('./capture-core.mjs');
 const good={plan:'H2802-049-0',year:2027,url:'https://www.uhc.com/medicare/alphadog/AAMO27HP0412693_000',token:'a'.repeat(43)};
 assert.deepEqual(ticket(JSON.stringify(good)),good);
 assert.equal(ticket(JSON.stringify({...good,kind:"anoc"})).kind,"anoc");
 assert.throws(()=>ticket(JSON.stringify({...good,kind:"other"})));
 for(const patch of [{url:'https://evil.test/pdf'},{url:good.url+'?token=secret'},{year:2026.1},{token:'short'}])assert.throws(()=>ticket(JSON.stringify({...good,...patch})));
 await assert.rejects(pdfBytes(new Blob(['<html>Login</html>'])));
 assert.equal((await pdfBytes(new Blob(['%PDF-synthetic']))).length,14);
});
