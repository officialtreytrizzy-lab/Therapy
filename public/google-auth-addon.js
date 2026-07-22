(function(){
'use strict';
const V='12.16.0';
const PRODUCTION_CONTINUATION_URL='https://couple-wellness-v-ideo-e-dit.vercel.app/dashboard';
const FALLBACK_CONFIG={projectId:'us-for-real-therapy',appId:'1:71136345766:web:74db974439d27f3070fe67',storageBucket:'us-for-real-therapy.firebasestorage.app',apiKey:'AIzaSyC6tA2wTtfD10Mb-SQ6Z2z08On1Od93EV0',authDomain:'us-for-real-therapy.firebaseapp.com',messagingSenderId:'71136345766'};
let busy=false;

function installStyle(){
  if(document.getElementById('google-auth-addon-css'))return;
  const style=document.createElement('style');
  style.id='google-auth-addon-css';
  style.textContent='.fb2-google-addon{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;background:#fff!important;color:#202124!important;border:1px solid #dadce0!important;box-shadow:0 1px 2px #00000024}.fb2-google-addon:hover{background:#f8fafd!important}.fb2-google-addon svg{width:18px;height:18px;flex:none}.fb2-google-divider{display:flex;align-items:center;gap:10px;margin:15px 0;color:#8f8a82;font-size:11px;text-transform:uppercase;letter-spacing:.12em}.fb2-google-divider:before,.fb2-google-divider:after{content:"";height:1px;background:#ffffff18;flex:1}';
  document.head.appendChild(style);
}

function googleIcon(){return '<svg viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.878 2.684-6.614Z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.181l-2.909-2.258c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z"/><path fill="#FBBC05" d="M3.963 10.707A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.167.281-1.707V4.961H.956A9 9 0 0 0 0 9c0 1.452.347 2.826.956 4.039l3.007-2.332Z"/><path fill="#EA4335" d="M9 3.579c1.321 0 2.507.454 3.441 1.346l2.581-2.581C13.463.892 11.426 0 9 0A9 9 0 0 0 .956 4.961l3.007 2.332C4.672 5.164 6.656 3.579 9 3.579Z"/></svg>'}

async function runtimeConfig(){
  try{
    const response=await fetch('/api/firebase-config',{cache:'no-store'});
    if(response.ok){const payload=await response.json();if(payload?.configured&&payload.config)return{...FALLBACK_CONFIG,...payload.config}}
  }catch{}
  return FALLBACK_CONFIG;
}

async function continueWithGoogle(button){
  if(busy)return;
  busy=true;
  const original=button.innerHTML;
  button.disabled=true;
  button.textContent='Opening Google…';
  try{
    const base=`https://www.gstatic.com/firebasejs/${V}`;
    const[appModule,authModule]=await Promise.all([import(`${base}/firebase-app.js`),import(`${base}/firebase-auth.js`)]);
    const app=appModule.getApps().length?appModule.getApp():appModule.initializeApp(await runtimeConfig());
    const auth=authModule.getAuth(app);
    const provider=new authModule.GoogleAuthProvider();
    provider.setCustomParameters({prompt:'select_account'});
    try{
      await authModule.signInWithPopup(auth,provider);
    }catch(error){
      if(['auth/popup-blocked','auth/operation-not-supported-in-this-environment','auth/cancelled-popup-request'].includes(error?.code)){
        await authModule.signInWithRedirect(auth,provider);
        return;
      }
      throw error;
    }
  }catch(error){
    console.error('Google sign-in failed',error);
    const panel=document.querySelector('.fb2');
    if(panel){
      let message=panel.querySelector('.google-auth-addon-error');
      if(!message){message=document.createElement('div');message.className='fb2-msg err google-auth-addon-error';panel.prepend(message)}
      message.textContent=error?.code==='auth/unauthorized-domain'?'Google sign-in is not enabled for this web address yet.':'Google sign-in could not open. Try again or use the secure email link.';
    }
  }finally{
    busy=false;
    if(document.contains(button)){button.disabled=false;button.innerHTML=original}
  }
}

function inject(){
  installStyle();
  const email=document.getElementById('fb2-email');
  if(!email||document.getElementById('google-auth-addon'))return;
  const field=email.closest('.fb2-field');
  if(!field)return;
  const wrap=document.createElement('div');
  wrap.id='google-auth-addon';
  wrap.innerHTML=`<div class="fb2-actions"><button type="button" class="fb2-btn fb2-google-addon" aria-label="Continue with Google">${googleIcon()}<span>Continue with Google</span></button></div><div class="fb2-google-divider"><span>or use email</span></div>`;
  const button=wrap.querySelector('button');
  button.addEventListener('click',()=>continueWithGoogle(button));
  field.before(wrap);
}

new MutationObserver(inject).observe(document.documentElement,{subtree:true,childList:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject,{once:true});else queueMicrotask(inject);
window.USFRGoogleAuth={continueUrl:PRODUCTION_CONTINUATION_URL,open:()=>document.querySelector('#google-auth-addon button')?.click()};
})();
