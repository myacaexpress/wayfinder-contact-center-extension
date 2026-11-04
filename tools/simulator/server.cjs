const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {Simulator,actions}=require('./engine.cjs');
function createServer(){
 const sim=new Simulator();let queue=Promise.resolve();
 const server=http.createServer(async(req,res)=>{
  const host=`127.0.0.1:${server.address().port}`;
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const reply=(code,data,type='application/json')=>{res.writeHead(code,{'Content-Type':type});res.end(type==='application/json'?JSON.stringify(data):data);};
  if(req.headers.host!==host||(req.headers.origin&&req.headers.origin!==`http://${host}`))return reply(403,{error:'Loopback origin only'});
  if(req.method==='GET'&&['/','/app.js','/style.css'].includes(req.url)){
   const file=req.url==='/'?'index.html':req.url.slice(1);return reply(200,fs.readFileSync(path.join(__dirname,file)),file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
  }
  if(req.method==='GET'&&req.url==='/state')return reply(200,await sim.snapshot());
  if(req.method==='POST'&&req.url==='/action'&&req.headers['x-simulator']==='local-only'){
   let body='';for await(const part of req){body+=part;if(body.length>1024)return reply(413,{error:'Too large'});}
   try {const data=JSON.parse(body);if(!actions.includes(data.action))return reply(400,{error:'Unknown action'});
    const task=queue.then(()=>sim.act(data.action));queue=task.catch(()=>{});return reply(200,await task);
   }catch(error){return reply(400,{error:error.message});}
  }
  reply(404,{error:'Not found'});
 });
 server.on('close',()=>sim.close());return server;
}
if(require.main===module){const port=Number(process.env.SIMULATOR_PORT||4313);const server=createServer();server.listen(port,'127.0.0.1',()=>console.log(`Local simulator: http://127.0.0.1:${server.address().port}\nNo extension installation or real account needed. Ctrl+C stops it.`));}
module.exports={createServer};
