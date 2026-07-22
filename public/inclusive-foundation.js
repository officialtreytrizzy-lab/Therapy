(function () {
  'use strict';

  if (!Array.isArray(state.realLoops)) state.realLoops = [];

  state.missions.available = [
    {id:1,title:'The 5-Minute Check-in',description:'For 7 days, ask yourself or each other: How are you, really?',category:'Connection',difficulty:'easy'},
    {id:2,title:'One Clear Request',description:'Turn one recurring complaint into a specific, observable request.',category:'Communication',difficulty:'easy'},
    {id:3,title:'One New Thing Together',description:'Try one thing neither of you has done before, or plan it privately for a later invitation.',category:'Adventure',difficulty:'easy'},
    {id:4,title:'The Phone-Free Window',description:'Protect at least 30 uninterrupted minutes for attention and presence.',category:'Presence',difficulty:'medium'},
    {id:5,title:'Write What Is Hard to Say',description:'Prepare the truth privately before deciding whether, when, and how to share it.',category:'Depth',difficulty:'medium'},
    {id:6,title:'The Listening Challenge',description:'Reflect what you heard before sharing your own view.',category:'Communication',difficulty:'challenging'},
    {id:7,title:'Repair in One Action',description:'Choose one small behavior that makes accountability visible instead of merely promised.',category:'Repair',difficulty:'medium'}
  ];

  state.decks = [
    {id:1,title:'Joy & Laughter',category:'Joy',description:'Rediscover what brings genuine lightness into the relationship.',count:8,intensity:'Light'},
    {id:2,title:'Love & Affection',category:'Love',description:'Explore how care, affection, reassurance, and attention are given and received.',count:8,intensity:'Medium'},
    {id:3,title:'Dreams & Future',category:'Dreams',description:'Clarify the future each person wants and where those futures overlap.',count:8,intensity:'Deep'},
    {id:4,title:'Black Identity & Culture',category:'Identity',description:'An optional culturally specific deck about how Black identity can shape relationship life.',count:8,intensity:'Deep'},
    {id:5,title:'LGBTQ+ Identity & Community',category:'Identity',description:'An optional deck about identity, belonging, visibility, family, and community.',count:8,intensity:'Deep'},
    {id:6,title:'Conflict & Repair',category:'Growth',description:'Understand escalation, accountability, boundaries, and what makes repair believable.',count:8,intensity:'Deep'},
    {id:7,title:'Money & Ambition',category:'Life',description:'Explore financial values, pressure, earning, spending, support, and shared plans.',count:8,intensity:'Medium'},
    {id:8,title:'Masculinity & Self',category:'Identity',description:'An optional deck about masculinity, vulnerability, expectation, and self-definition.',count:8,intensity:'Deep'},
    {id:9,title:'Intimacy & Touch',category:'Intimacy',description:'Discuss physical affection, emotional closeness, desire, consent, and changing needs.',count:8,intensity:'Intimate'},
    {id:10,title:'Trust & Honesty',category:'Repair',description:'Work through secrecy, broken expectations, transparency, and rebuilding confidence.',count:8,intensity:'Deep'},
    {id:11,title:'Family, Friends & Outside Influence',category:'Life',description:'Clarify boundaries involving relatives, friends, community, and outside opinions.',count:8,intensity:'Medium'},
    {id:12,title:'Long Distance & Time Apart',category:'Connection',description:'Explore reassurance, routines, independence, availability, and reunion expectations.',count:8,intensity:'Medium'},
    {id:13,title:'Parenting & Caregiving',category:'Life',description:'Discuss labor, discipline, caregiving pressure, children, elders, and family priorities.',count:8,intensity:'Deep'},
    {id:14,title:'Communication Differences',category:'Access',description:'Explore neurodiversity, processing time, sensory needs, shutdown, directness, and accessibility.',count:8,intensity:'Deep'}
  ];
  state.dataVersion = Math.max(5, Number(state.dataVersion || 0));
  save();

  landing = function () {
    return `<div class="landing"><header class="landing-head"><a href="/" data-link class="logo"><span class="logo-main">US,</span><span class="logo-sub">FOR REAL</span></a><div class="landing-nav"><a href="/dashboard" data-link class="text-link">Sign In</a><a href="/onboarding" data-link class="pill-link">Create My Space</a></div></header><main class="hero"><div class="hero-inner"><div class="eyebrow"><i></i>For anyone trying to build a healthier relationship</div><h1>Your relationship deserves a space where <em>your truth</em> can get clearer.</h1><p class="lead">Use the app privately when your partner is not on it, or link two individual accounts when both people want to work together.</p><div class="actions"><button class="btn btn-primary" onclick="navigate('/onboarding')">Create My Space</button><button class="btn btn-secondary" onclick="document.getElementById('how-it-works').scrollIntoView({behavior:'smooth'})">See How It Works</button></div><p class="footnote">Private by design. Partner optional. Shared only by choice.</p></div></main><section class="feature-section" id="how-it-works"><div class="feature-grid"><article class="feature-card"><div class="feature-num">1</div><h3>Guided Sessions</h3><p>Work privately or together through structured sessions that slow escalation and create a useful next step.</p></article><article class="feature-card"><div class="feature-num">2</div><h3>Evidence Over Assumptions</h3><p>Separate observable facts, impact, interpretation, and unknowns before the app helps you decide what to do.</p></article><article class="feature-card"><div class="feature-num">3</div><h3>Verified Follow-through</h3><p>Turn advice into a small relationship experiment, return with the result, and update what the Guide believes.</p></article></div></section><footer>© 2026 US, FOR REAL. AI-assisted relationship wellness and guided self-help, not therapy, diagnosis, emergency response, or licensed clinical care.</footer></div>`;
  };

  onboarding = function () {
    return `<div class="onboarding"><div class="card onboarding-card"><div class="step-dots"><span class="step-dot active"></span><span class="step-dot active"></span><span class="step-dot"></span></div><h1>Build your relationship workspace.</h1><p class="intro">Begin privately with your own account. A partner connection is optional and can be added later without revealing your previous private work.</p><div class="form-grid"><div class="field"><label>Your display name</label><input id="obName" value="${escapeHtml(state.profile.displayName)}"></div><div class="field"><label>Pronouns</label><input id="obPronouns" value="${escapeHtml(state.profile.pronouns)}" placeholder="e.g. he/him"></div><div class="field"><label>Relationship structure</label><select id="obStructure"><option>Monogamous</option><option>Open</option><option>Polyamorous</option><option>Dating</option><option>Engaged</option><option>Married</option><option>Separated but working through issues</option><option>Custom</option></select></div><div class="field"><label>Guide tone</label><select id="obTone"><option value="warm">Warm & empathetic</option><option value="direct" selected>Direct & clear</option><option value="accountability">Accountability</option><option value="spiritual">Soulful</option></select></div></div><div class="section-gap card card-pad"><h3 class="card-title">What matters most right now?</h3><div class="radio-row"><button class="choice selected">Communicating better</button><button class="choice">Rebuilding trust</button><button class="choice">Growing closer</button><button class="choice">Handling conflict</button><button class="choice">Making a decision</button><button class="choice">Understanding myself</button></div></div><div class="actions"><button class="btn btn-secondary" onclick="navigate('/')">Back</button><button class="btn btn-primary" onclick="finishOnboarding()">Enter My Space</button></div></div></div>`;
  };

  window.finishOnboarding = function () {
    state.profile.displayName = document.getElementById('obName').value.trim() || 'Member';
    state.profile.pronouns = document.getElementById('obPronouns').value.trim();
    state.profile.tone = document.getElementById('obTone').value;
    state.profile.onboarded = true;
    save();
    navigate('/dashboard');
    toast('Your private relationship space is ready.');
  };

  if (typeof render === 'function') render();
})();