const STORAGE_KEY = 'us-for-real-user-v4';
const LEGACY_STORAGE_KEYS = ['us-for-real-preview-v3'];
const now = () => new Date().toISOString();
const daysFromNow = n => new Date(Date.now() + n * 86400000).toISOString();
const defaultState = {
  profile:{displayName:'',partnerName:'',pronouns:'',tone:'direct',onboarded:false},
  connectionScore:null,
  weeklyStreak:0,
  sessions:[],
  messages:{},
  goals:[],
  agreements:[],
  memories:[],
  appreciations:[],
  missions:{
    active:null,
    available:[
      {id:1,title:'The 5-Minute Check-in',description:'For 7 days, ask each other: How are you, really?',category:'Connection',difficulty:'easy'},
      {id:3,title:'One New Thing Together',description:'Try one thing neither of you has done before.',category:'Adventure',difficulty:'easy'},
      {id:4,title:'The Phone-Free Evening',description:'Spend at least two uninterrupted hours together.',category:'Presence',difficulty:'medium'},
      {id:5,title:'Letters to Each Other',description:'Write what has been difficult to say out loud, then exchange.',category:'Depth',difficulty:'medium'},
      {id:6,title:'The Listening Challenge',description:'Reflect what you heard before sharing your own view.',category:'Communication',difficulty:'challenging'}
    ],
    completed:[]
  },
  decks:[
    {id:1,title:'Joy & Laughter',category:'Joy',description:'Rediscover what makes both of you genuinely happy.',count:8,intensity:'Light'},
    {id:2,title:'Love & Affection',category:'Love',description:'Explore how you give and receive love.',count:8,intensity:'Medium'},
    {id:3,title:'Dreams & Future',category:'Dreams',description:'Where do you both want to go from here?',count:8,intensity:'Deep'},
    {id:4,title:'Black Identity & Culture',category:'Identity',description:'How does being Black shape who you are together?',count:8,intensity:'Deep'},
    {id:5,title:'Gay Identity & Community',category:'Identity',description:'Your experiences as gay men, together and separately.',count:8,intensity:'Deep'},
    {id:6,title:'Conflict & Repair',category:'Growth',description:'Understand how you both move through difficulty.',count:8,intensity:'Deep'},
    {id:7,title:'Money & Ambition',category:'Life',description:'Financial values, goals, and the life you want to build.',count:8,intensity:'Medium'},
    {id:8,title:'Masculinity & Self',category:'Identity',description:'What does manhood mean to each of you?',count:8,intensity:'Deep'},
    {id:9,title:'Intimacy & Touch',category:'Intimacy',description:'How you connect physically and emotionally.',count:6,intensity:'Intimate'}
  ],
  deckAnswers:{},
  checkins:[],
  privateTasks:[],
  gameResponses:[],
  cloudSessions:[],
  dataVersion:4
};
// Cross-account privacy: all cached relationship data is namespaced by the signed-in
// Firebase UID so two people sharing one browser can never see each other's cache,
// and nothing from a signed-out session can sync into a different account's couple.
const USFRLocal={
  uid:null,
  key(){return `${STORAGE_KEY}::${this.uid||'anon'}`},
  migrateLegacy(){try{const legacy=localStorage.getItem(STORAGE_KEY);if(legacy!=null){const anonKey=`${STORAGE_KEY}::anon`;if(localStorage.getItem(anonKey)==null)localStorage.setItem(anonKey,legacy);localStorage.removeItem(STORAGE_KEY)}}catch{}},
  clearAll(){try{for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k&&(k===STORAGE_KEY||k.startsWith(STORAGE_KEY+'::')))localStorage.removeItem(k)}}catch{}}
};
window.USFRLocal=USFRLocal;
let state = loadState();
let currentTab = {};
function loadState(){for(const key of LEGACY_STORAGE_KEYS)localStorage.removeItem(key);USFRLocal.migrateLegacy();try{const stored=JSON.parse(localStorage.getItem(USFRLocal.key())||'{}');return {...structuredClone(defaultState),...stored,profile:{...defaultState.profile,...(stored.profile||{})},missions:{...defaultState.missions,...(stored.missions||{})}}}catch{return structuredClone(defaultState)}}
function save(){localStorage.setItem(USFRLocal.key(),JSON.stringify(state))}
// Switches the active local bucket when the signed-in user changes. Called by the
// Firebase client on every auth-state change (including sign-out → null).
window.__usfrSetActiveUser=function(uid){const next=uid||null;if(USFRLocal.uid===next)return;USFRLocal.uid=next;state=loadState();if(typeof render==='function')render()};
function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function dateShort(v){return new Date(v).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}
function sessionName(t){return ({talk_it_out:'Talk It Out',speaker_listener:'Speaker & Listener',cool_down:'Cool Down',repair:'Repair After Argument',decision_room:'Decision Room',weekly_meeting:'Weekly Meeting',private_coaching:'Private Reflection',discovery:'Discovery Session',custom_session:'Custom Session',live_session:'Live Couple Session'})[t]||t}
function icon(n){return `<span class="nav-icon">${n}</span>`}
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(window.__toastTimer);window.__toastTimer=setTimeout(()=>el.classList.remove('show'),2400)}
function navigate(path){history.pushState({},'',path);render();window.scrollTo({top:0,behavior:'smooth'})}
function navLink(path,label,ico){const active=location.pathname===path||location.pathname.startsWith(path+'/');return `<a href="${path}" data-link class="${active?'active':''}">${icon(ico)}<span>${label}</span></a>`}
function appLayout(content){return `<div class="mobile-overlay" id="overlay" onclick="toggleMenu(false)"></div><div class="app-shell"><aside class="sidebar" id="sidebar"><div class="side-head"><a href="/dashboard" data-link class="logo"><span class="logo-main">US,</span><span class="logo-sub">FOR REAL</span></a><div class="preview-chip">● Interactive preview</div></div><nav class="nav">${navLink('/dashboard','Dashboard','♡')}${navLink('/sessions','Sessions','◉')}${navLink('/reflect','Reflect','◇')}${navLink('/discover','Discover','✦')}${navLink('/missions','Missions','⚑')}${navLink('/progress','Progress','⌁')}${navLink('/appreciations','Appreciations','✧')}<div style="height:10px"></div>${navLink('/goals','Goals','◎')}${navLink('/agreements','Agreements','≋')}${navLink('/memories','Memory Bank','▣')}</nav><div class="side-bottom"><a href="/settings" data-link class="profile-link"><div class="avatar">${escapeHtml(state.profile.displayName.charAt(0)||'U')}</div><div class="profile-meta"><strong>${escapeHtml(state.profile.displayName)}</strong><span>Settings</span></div></a></div></aside><div class="main-wrap"><div class="mobile-head"><a href="/dashboard" data-link class="logo"><span class="logo-main">US,</span><span class="logo-sub">FOR REAL</span></a><button class="menu-btn" onclick="toggleMenu()">☰</button></div>${content}</div></div>`}
window.toggleMenu=function(force){const s=document.getElementById('sidebar'),o=document.getElementById('overlay');if(!s)return;const open=force===undefined?!s.classList.contains('open'):force;s.classList.toggle('open',open);o.classList.toggle('show',open)}
function landing(){return `<div class="landing"><header class="landing-head"><a href="/" data-link class="logo"><span class="logo-main">US,</span><span class="logo-sub">FOR REAL</span></a><div class="landing-nav"><a href="/dashboard" data-link class="text-link">Sign In</a><a href="/onboarding" data-link class="pill-link">Create Our Space</a></div></header><main class="hero"><div class="hero-inner"><div class="eyebrow"><i></i>For modern Black gay couples</div><h1>Love deserves a space where <em>both of you</em> can be heard.</h1><p class="lead">An intimate digital sanctuary to communicate, understand each other, resolve conflict, and build a healthier relationship together.</p><div class="actions"><button class="btn btn-primary" onclick="navigate('/onboarding')">Create Our Space</button><button class="btn btn-secondary" onclick="document.getElementById('how-it-works').scrollIntoView({behavior:'smooth'})">See How It Works</button></div><p class="footnote">Private by design. Balanced by default. Built for both of you.</p></div></main><section class="feature-section" id="how-it-works"><div class="feature-grid"><article class="feature-card"><div class="feature-num">1</div><h3>Guided Sessions</h3><p>Structured conversations that slow escalation and help both partners communicate clearly.</p></article><article class="feature-card"><div class="feature-num">2</div><h3>Deeper Understanding</h3><p>Discovery decks, reflection prompts, and partner-aware exercises built for real connection.</p></article><article class="feature-card"><div class="feature-num">3</div><h3>Shared Growth</h3><p>Goals, agreements, appreciations, relationship memory, and follow-up practices in one place.</p></article></div></section><footer>© 2026 US, FOR REAL. Relationship-wellness support, not emergency or licensed clinical care.</footer></div>`}
function onboarding(){return `<div class="onboarding"><div class="card onboarding-card"><div class="step-dots"><span class="step-dot active"></span><span class="step-dot active"></span><span class="step-dot"></span></div><h1>Build your space together.</h1><p class="intro">Start with the basics. These preferences shape how the Guide supports your relationship.</p><div class="form-grid"><div class="field"><label>Your display name</label><input id="obName" value="${escapeHtml(state.profile.displayName)}"></div><div class="field"><label>Pronouns</label><input id="obPronouns" value="${escapeHtml(state.profile.pronouns)}" placeholder="e.g. he/him"></div><div class="field"><label>Relationship structure</label><select id="obStructure"><option>Monogamous</option><option>Open</option><option>Polyamorous</option><option>Custom</option></select></div><div class="field"><label>Guide tone</label><select id="obTone"><option value="warm">Warm & empathetic</option><option value="direct" selected>Direct & clear</option><option value="accountability">Accountability</option><option value="spiritual">Soulful</option></select></div></div><div class="section-gap card card-pad"><h3 class="card-title">What matters most right now?</h3><div class="radio-row"><button class="choice selected">Communicating better</button><button class="choice">Rebuilding trust</button><button class="choice">Growing closer</button><button class="choice">Handling conflict</button></div></div><div class="actions"><button class="btn btn-secondary" onclick="navigate('/')">Back</button><button class="btn btn-primary" onclick="finishOnboarding()">Enter Our Space</button></div></div></div>`}
window.finishOnboarding=function(){state.profile.displayName=document.getElementById('obName').value.trim()||'Trey';state.profile.pronouns=document.getElementById('obPronouns').value.trim()||'he/him';state.profile.tone=document.getElementById('obTone').value;state.profile.onboarded=true;save();navigate('/dashboard');toast('Your space is ready.')}