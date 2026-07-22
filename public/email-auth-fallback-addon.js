(function(){
'use strict';
const AUTH_CONTINUE_URL='https://couple-wellness-v-ideo-e-dit.vercel.app/dashboard';
const originalFetch=window.fetch.bind(window);

function requestUrl(input){return typeof input==='string'?input:input?.url||''}
function isAuthEmailRequest(input){
  const value=requestUrl(input);
  try{return new URL(value,location.origin).pathname==='/api/auth-email-link'}catch{return value.includes('/api/auth-email-link')}
}
function isFirebaseEmailLinkRequest(input){return requestUrl(input).includes('accounts:sendOobCode')}

function withVerifiedContinuation(init){
  if(!init||typeof init.body!=='string')return init;
  try{
    const payload=JSON.parse(init.body);
    if(payload?.requestType!=='EMAIL_SIGNIN'&&!('continueUrl' in payload))return init;
    return{...init,body:JSON.stringify({...payload,continueUrl:AUTH_CONTINUE_URL})};
  }catch{return init}
}

window.fetch=async function(input,init){
  const requestInit=isFirebaseEmailLinkRequest(input)?withVerifiedContinuation(init):init;
  const response=await originalFetch(input,requestInit);
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

window.USFREmailAuthFallback={continueUrl:AUTH_CONTINUE_URL};
})();
