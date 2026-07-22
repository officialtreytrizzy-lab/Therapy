(function(){
'use strict';
const originalFetch=window.fetch.bind(window);

function isAuthEmailRequest(input){
  const value=typeof input==='string'?input:input?.url||'';
  try{return new URL(value,location.origin).pathname==='/api/auth-email-link'}catch{return value.includes('/api/auth-email-link')}
}

window.fetch=async function(input,init){
  const response=await originalFetch(input,init);
  if(!isAuthEmailRequest(input)||response.ok||response.status===429)return response;

  let code='';
  try{code=String((await response.clone().json())?.error?.code||'')}catch{}
  const shouldUseFirebase=response.status===404||response.status>=500||code==='EAUTH';
  if(!shouldUseFirebase)return response;

  return new Response(JSON.stringify({
    error:{
      code:'custom-email-not-configured',
      message:'The legacy SMTP sender is unavailable; use Firebase custom SMTP.'
    }
  }),{
    status:404,
    headers:{'content-type':'application/json','x-usfr-auth-fallback':'firebase-ionos'}
  });
};
})();
