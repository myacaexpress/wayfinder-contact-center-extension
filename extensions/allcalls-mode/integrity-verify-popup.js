// Host access is requested only during the user's explicit button click.
document.getElementById('integrity-access').addEventListener('click',async()=>{
 const status=document.getElementById('integrity-access-status');
 try{
  const granted=await chrome.permissions.request({origins:['https://connect.integrity.com/*']});
  status.textContent=granted?'Integrity access enabled. Keep Wayfinder open; saved MARx contacts can start verification automatically.':'Integrity access was not enabled.';
 }catch{status.textContent='Integrity access could not be enabled.';}
});
