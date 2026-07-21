const STORAGE_KEY = 'us-for-real-preview-v3';
const now = () => new Date().toISOString();
const daysFromNow = n => new Date(Date.now() + n * 86400000).toISOString();
const defaultState = {
  profile:{displayName:'Trey',pronouns:'he/him',tone:'direct',onboarded:true},
  connectionScore:78, weeklyStreak:4,
  sessions:[
    {id:101,type:'talk_it_out',status:'completed',topic:'Feeling unheard after a long week',intensity:6,createdAt:daysFromNow(-6),summary:'What we heard\nBoth partners were carrying stress and interpreting distance as rejection.\n\nCommon ground\nBoth want more reassurance and less guessing.\n\nAgreed next steps\nUse a 10-minute evening check-in three times this week.'},
    {id:102,type:'weekly_meeting',status:'active',topic:'Planning the week together',intensity:3,createdAt:daysFromNow(-1),summary:''},
    {id:103,type:'private_coaching',status:'completed',topic:'How to ask for more affection',intensity:4,createdAt:daysFromNow(-3),summary:'You identified that your request is about reassurance, not control. Try naming the feeling, the need, and one specific action.'}
  ],
  messages:{
    102:[
      {role:'guide',content:'Welcome to your Weekly Meeting. We’ll move through appreciation, logistics, pressure points, and one shared priority. Who wants to begin with one thing that felt good between you this week?',time:daysFromNow(-1)},
      {role:'user',content:'I appreciated how he checked on me before my meeting.',label:'Trey',time:daysFromNow(-1)},
      {role:'guide',content:'That sounds specific and meaningful. Before we move on, what did that check-in communicate to you emotionally?',time:daysFromNow(-1)}
    ]
  },
  goals:[
    {id:1,title:'Plan a weekend away',description:'Choose dates, budget, and location together.',category:'Quality Time',progress:55,status:'active',targetDate:daysFromNow(32)},
    {id:2,title:'Weekly money check-in',description:'Review spending without blame every Sunday.',category:'Finances',progress:75,status:'active',targetDate:daysFromNow(18)}
  ],
  agreements:[
    {id:1,title:'Pause before escalation',terms:'Either partner can call a 20-minute pause. We name when we will return to the conversation.',status:'active',reviewDate:daysFromNow(21)},
    {id:2,title:'No serious conflict by text',terms:'We can signal that something is wrong, but the full conversation happens by phone or in person.',status:'active',reviewDate:daysFromNow(45)}
  ],
  memories:[
    {id:1,title:'Reassurance during stress',content:'Trey tends to need direct reassurance when work stress makes communication shorter.',scope:'shared',category:'Emotional Needs',sensitivity:'medium'},
    {id:2,title:'Sunday reset',content:'A quiet Sunday dinner helps both partners reconnect before the week.',scope:'shared',category:'Rituals',sensitivity:'low'},
    {id:3,title:'Private reflection preference',content:'When upset, I need a little time to organize my thoughts before speaking.',scope:'private',category:'Communication',sensitivity:'medium'}
  ],
  appreciations:[
    {id:1,message:'I appreciate how you made room for me to vent without trying to fix everything.',delivery:'instant',createdAt:daysFromNow(-2)},
    {id:2,message:'You have been carrying a lot and still showing up for us. I see that.',delivery:'end_of_week',createdAt:daysFromNow(-5)}
  ],
  missions:{active:{id:2,title:'Appreciation Streak',description:'Send one specific appreciation every day this week.',category:'Appreciation',difficulty:'easy',progress:57},available:[
    {id:1,title:'The 5-Minute Check-in',description:'For 7 days, ask each other: How are you, really?',category:'Connection',difficulty:'easy'},
    {id:3,title:'One New Thing Together',description:'Try one thing neither of you has done before.',category:'Adventure',difficulty:'easy'},
    {id:4,title:'The Phone-Free Evening',description:'Spend at least two uninterrupted hours together.',category:'Presence',difficulty:'medium'},
    {id:5,title:'Letters to Each Other',description:'Write what has been difficult to say out loud, then exchange.',category:'Depth',difficulty:'medium'},
    {id:6,title:'The Listening Challenge',description:'Reflect what you heard before sharing your own view.',category:'Communication',difficulty:'challenging'}
  ],completed:[{id:10,title:'Shared Playlist',description:'Built a relationship playlist together.',category:'Joy',difficulty:'easy',progress:100}]},
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
  checkins:[{mood:7,connection:8,date:daysFromNow(-1)},{mood:8,connection:7,date:daysFromNow(-3)},{mood:6,connection:7,date:daysFromNow(-5)}]
};
let state = loadState();
let currentTab = {};
function loadState(){try{return {...structuredClone(defaultState),...JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}}catch{return structuredClone(defaultState)}}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}
function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function dateShort(v){return new Date(v).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}
function sessionName(t){return ({talk_it_out:'Talk It Out',speaker_listener:'Speaker & Listener',cool_down:'Cool Down',repair:'Repair After Argument',decision_room:'Decision Room',weekly_meeting:'Weekly Meeting',private_coaching:'Private Reflection',discovery:'Discovery Session'})[t]||t}
function icon(n){return `<span class="nav-icon">${n}</span>`}
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(window.__toastTimer);window.__toastTimer=setTimeout(()=>el.classList.remove('show'),2400)}
function navigate(path){history.pushState({},'',path);render();window.scrollTo({top:0,behavior:'smooth'})}
function navLink(path,label,ico){const active=location.pathname===path||location.pathname.startsWith(path+'/');return `<a href="${path}" data-link class="${active?'active':''}">${icon(ico)}<span>${label}</span></a>`}
function appLayout(content){return `<div class="mobile-overlay" id="overlay" onclick="toggleMenu(false)"></div><div class="app-shell"><aside class="sidebar" id="sidebar"><div class="side-head"><a href="/dashboard" data-link class="logo"><span class="logo-main">US,</span><span class="logo-sub">FOR REAL</span></a><div class="preview-chip">● Interactive preview</div></div><nav class="nav">${navLink('/dashboard','Dashboard','♡')}${navLink('/sessions','Sessions','◉')}${navLink('/reflect','Reflect','◇')}${navLink('/discover','Discover','✦')}${navLink('/missions','Missions','⚑')}${navLink('/progress','Progress','⌁')}${navLink('/appreciations','Appreciations','✧')}<div style="height:10px"></div>${navLink('/goals','Goals','◎')}${navLink('/agreements','Agreements','≋')}${navLink('/memories','Memory Bank','▣')}</nav><div class="side-bottom"><a href="/settings" data-link class="profile-link"><div class="avatar">${escapeHtml(state.profile.displayName.charAt(0)||'U')}</div><div class="profile-meta"><strong>${escapeHtml(state.profile.displayName)}</strong><span>Settings</span></div></a></div></aside><div class="main-wrap"><div class="mobile-head"><a href="/dashboard" data-link class="logo"><span class="logo-main">US,</span><span class="logo-sub">FOR REAL</span></a><button class="menu-btn" onclick="toggleMenu()">☰</button></div>${content}</div></div>`}
window.toggleMenu=function(force){const s=document.getElementById('sidebar'),o=document.getElementById('overlay');if(!s)return;const open=force===undefined?!s.classList.contains('open'):force;s.classList.toggle('open',open);o.classList.toggle('show',open)}
function landing(){return `<div class="landing"><header class="landing-head"><a href="/" data-link class="logo"><span class="logo-main">US,</span><span class="logo-sub">FOR REAL</span></a><div class="landing-nav"><a href="/dashboard" data-link class="text-link">Sign In</a><a href="/onboarding" data-link class="pill-link">Create Our Space</a></div></header><main class="hero"><div class="hero-inner"><div class="eyebrow"><i></i>For modern Black gay couples</div><h1>Love deserves a space where <em>both of you</em> can be heard.</h1><p class="lead">An intimate digital sanctuary to communicate, understand each other, resolve conflict, and build a healthier relationship together.</p><div class="actions"><button class="btn btn-primary" onclick="navigate('/onboarding')">Create Our Space</button><button class="btn btn-secondary" onclick="document.getElementById('how-it-works').scrollIntoView({behavior:'smooth'})">See How It Works</button></div><p class="footnote">Private by design. Balanced by default. Built for both of you.</p></div></main><section class="feature-section" id="how-it-works"><div class="feature-grid"><article class="feature-card"><div class="feature-num">1</div><h3>Guided Sessions</h3><p>Structured conversations that slow escalation and help both partners communicate clearly.</p></article><article class="feature-card"><div class="feature-num">2</div><h3>Deeper Understanding</h3><p>Discovery decks, reflection prompts, and partner-aware exercises built for real connection.</p></article><article class="feature-card"><div class="feature-num">3</div><h3>Shared Growth</h3><p>Goals, agreements, appreciations, relationship memory, and follow-up practices in one place.</p></article></div></section><footer>© 2026 US, FOR REAL. Relationship-wellness support, not emergency or licensed clinical care.</footer></div>`}
function onboarding(){return `<div class="onboarding"><div class="card onboarding-card"><div class="step-dots"><span class="step-dot active"></span><span class="step-dot active"></span><span class="step-dot"></span></div><h1>Build your space together.</h1><p class="intro">Start with the basics. These preferences shape how the Guide supports your relationship.</p><div class="form-grid"><div class="field"><label>Your display name</label><input id="obName" value="${escapeHtml(state.profile.displayName)}"></div><div class="field"><label>Pronouns</label><input id="obPronouns" value="${escapeHtml(state.profile.pronouns)}" placeholder="e.g. he/him"></div><div class="field"><label>Relationship structure</label><select id="obStructure"><option>Monogamous</option><option>Open</option><option>Polyamorous</option><option>Custom</option></select></div><div class="field"><label>Guide tone</label><select id="obTone"><option value="warm">Warm & empathetic</option><option value="direct" selected>Direct & clear</option><option value="accountability">Accountability</option><option value="spiritual">Soulful</option></select></div></div><div class="section-gap card card-pad"><h3 class="card-title">What matters most right now?</h3><div class="radio-row"><button class="choice selected">Communicating better</button><button class="choice">Rebuilding trust</button><button class="choice">Growing closer</button><button class="choice">Handling conflict</button></div></div><div class="actions"><button class="btn btn-secondary" onclick="navigate('/')">Back</button><button class="btn btn-primary" onclick="finishOnboarding()">Enter Our Space</button></div></div></div>`}
window.finishOnboarding=function(){state.profile.displayName=document.getElementById('obName').value.trim()||'Trey';state.profile.pronouns=document.getElementById('obPronouns').value.trim()||'he/him';state.profile.tone=document.getElementById('obTone').value;state.profile.onboarded=true;save();navigate('/dashboard');toast('Your space is ready.')}