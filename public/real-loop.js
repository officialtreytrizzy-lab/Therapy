(function () {
  'use strict';

  const previousRender = window.render;
  const LOOP_ROUTE = '/real-loop';
  const SAFETY_ROUTE = '/safety';
  let escapeCount = 0;
  let escapeTimer = null;

  function path() {
    return window.location.pathname.replace(/\/$/, '') || '/';
  }

  function loops() {
    if (!Array.isArray(state.realLoops)) state.realLoops = [];
    return state.realLoops;
  }

  function field(id) {
    return String(document.getElementById(id)?.value || '').trim();
  }

  function statusLabel(loop) {
    if (loop.status === 'verified') return 'Verified';
    if (loop.status === 'paused-for-safety') return 'Safety pause';
    return 'Testing';
  }

  function formatDate(value) {
    try {
      return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'Saved';
    }
  }

  function option(value, label, selected) {
    return `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`;
  }

  function stageRow() {
    return `<div class="loop-stage-row" aria-label="The Real Loop stages">
      <span>Regulate</span><span>Evidence</span><span>Perspective</span><span>Action</span><span>Test</span><span>Verify</span><span>Update</span>
    </div>`;
  }

  function historyMarkup() {
    const items = loops().slice(0, 8);
    if (!items.length) {
      return `<div class="loop-empty"><strong>No loops yet</strong>Your first relationship experiment will appear here.</div>`;
    }
    return `<div class="loop-history-list">${items.map(loop => `
      <a class="loop-history-item" href="/real-loop?followup=${encodeURIComponent(loop.id)}" data-link>
        <span><i class="loop-status">${escapeHtml(statusLabel(loop))}</i>${escapeHtml(formatDate(loop.createdAt))}</span>
        <strong>${escapeHtml(loop.topic || 'Relationship issue')}</strong>
        <p>${escapeHtml(loop.action || loop.facts || 'Open the loop to review it.')}</p>
      </a>`).join('')}</div>`;
  }

  function realLoopPage() {
    const id = new URLSearchParams(window.location.search).get('followup');
    const existing = id ? loops().find(loop => String(loop.id) === String(id)) : null;
    if (existing) return followupPage(existing);

    return appLayout(`<main class="page experience-page real-loop-page">
      <section class="real-loop-hero">
        <span class="mini-kicker">The defining relationship-change mechanism</span>
        <h1>Turn the conflict into something you can test.</h1>
        <p>Separate facts from assumptions, choose one action under your control, then return with what actually happened. Your raw answers stay private unless you deliberately enter a shared session.</p>
        ${stageRow()}
      </section>
      <section class="loop-layout">
        <div class="loop-form-card">
          <div class="loop-section">
            <div class="loop-section-head"><span class="loop-section-num">01</span><div><h2>Regulate first</h2><p>Do not make a major relationship move while your nervous system is driving the decision.</p></div></div>
            <div class="loop-field"><label for="loopTopic">What issue are you working through?<small>One issue, not the whole relationship</small></label><input id="loopTopic" placeholder="Example: We keep avoiding the same money conversation."></div>
            <div class="loop-grid-2">
              <div class="loop-field"><label for="loopIntensity">Current intensity<small>1 calm · 10 flooded</small></label><div class="loop-intensity"><input id="loopIntensity" type="range" min="1" max="10" value="5" oninput="document.getElementById('loopIntensityValue').value=this.value"><output id="loopIntensityValue">5</output></div></div>
              <div class="loop-field"><label for="loopSafety">Is ordinary relationship work safe right now?</label><select id="loopSafety">${option('none','No immediate safety concern','none')}${option('fear','I feel afraid or intimidated','none')}${option('coercion','Control, coercion, or stalking may be present','none')}${option('violence','Threats or physical/sexual violence may be present','none')}${option('self-harm','Self-harm or harm-to-others concern','none')}</select></div>
            </div>
          </div>
          <div class="loop-section">
            <div class="loop-section-head"><span class="loop-section-num">02</span><div><h2>Establish the evidence</h2><p>Keep what happened separate from what you believe it means.</p></div></div>
            <div class="loop-field"><label for="loopFacts">Camera facts<small>What could a neutral witness, message, or record confirm?</small></label><textarea id="loopFacts" placeholder="At 7:15 I asked when we could review the budget. They said not tonight and left the room."></textarea></div>
            <div class="loop-grid-2">
              <div class="loop-field"><label for="loopImpact">Impact on you</label><textarea id="loopImpact" placeholder="I felt alone with a shared responsibility and lost confidence that the conversation would happen."></textarea></div>
              <div class="loop-field"><label for="loopInterpretation">Your interpretation<small>Label the meaning as a meaning, not a fact</small></label><textarea id="loopInterpretation" placeholder="I interpreted it as them not caring about our financial future."></textarea></div>
            </div>
            <div class="loop-field"><label for="loopUnknowns">What is still unknown?</label><textarea id="loopUnknowns" placeholder="I do not know whether they were overwhelmed, avoiding accountability, or needed a different time."></textarea></div>
          </div>
          <div class="loop-section">
            <div class="loop-section-head"><span class="loop-section-num">03</span><div><h2>Hold another possible truth</h2><p>This does not excuse harm. It stops an unverified assumption from becoming the verdict.</p></div></div>
            <div class="loop-field"><label for="loopAlternative">Strongest fair alternative explanation<small>A hypothesis, never the absent person's confirmed truth</small></label><textarea id="loopAlternative" placeholder="They may have been too activated to talk productively and did not know how to request a specific later time."></textarea></div>
            <div class="loop-field"><label for="loopEvidenceNeeded">What evidence would confirm or weaken that hypothesis?</label><textarea id="loopEvidenceNeeded" placeholder="A direct answer about what stopped the conversation and whether they will schedule a time within 72 hours."></textarea></div>
          </div>
          <div class="loop-section">
            <div class="loop-section-head"><span class="loop-section-num">04</span><div><h2>Choose one controllable action</h2><p>The action must be observable, time-bounded, and under your control.</p></div></div>
            <div class="loop-field"><label for="loopAction">What exactly will you do?</label><textarea id="loopAction" placeholder="I will ask for one 20-minute budget conversation and offer two specific times without accusing them of a motive."></textarea></div>
            <div class="loop-grid-2">
              <div class="loop-field"><label for="loopWindow">Evidence window</label><select id="loopWindow">${option('24 hours','Within 24 hours','72 hours')}${option('72 hours','Within 72 hours','72 hours')}${option('7 days','Within 7 days','72 hours')}</select></div>
              <div class="loop-field"><label for="loopPrediction">Your prediction</label><input id="loopPrediction" placeholder="They will still avoid choosing a time."></div>
            </div>
          </div>
          <div class="loop-submit">
            <span>🔒 Owner-only plan. AI hypotheses are labeled and temporary.</span>
            <button class="btn btn-primary" onclick="saveRealLoop()">Start the experiment</button>
          </div>
        </div>
        <aside class="loop-side-rail">
          <div class="loop-side-card">
            <span class="mini-kicker">Why this is different</span>
            <h2>Advice is not the finish line.</h2>
            <p>The app checks whether you attempted the behavior, what observable response followed, and which assumptions became stronger, weaker, or remained unknown.</p>
          </div>
          <div class="loop-callout">
            <strong>No forced 50/50 blame</strong>
            <p>The Guide can challenge your certainty while still naming conduct that is directly evidenced as unfair, deceptive, controlling, or unsafe.</p>
          </div>
          <div class="loop-history-card"><span class="mini-kicker">Private evidence log</span><h2>Your recent loops</h2><p>Return after the evidence window and verify what happened.</p>${historyMarkup()}</div>
          <button class="btn btn-secondary" onclick="navigate('/safety')">Support & Safety Center</button>
        </aside>
      </section>
      <div class="safety-disclosure"><strong>AI disclosure:</strong> The Guide is an artificial-intelligence relationship-wellness tool. It is not a person, therapist, qualified mental-health professional, emergency service, diagnosis system, or substitute for licensed care.</div>
    </main>`);
  }

  function followupPage(loop) {
    const verified = loop.status === 'verified';
    return appLayout(`<main class="page experience-page real-loop-page">
      <section class="real-loop-hero">
        <span class="mini-kicker">${verified ? 'Verified relationship evidence' : 'Return to the experiment'}</span>
        <h1>${escapeHtml(loop.topic || 'Relationship experiment')}</h1>
        <p>${verified ? 'This result is stored as your owner-only report, not as a universal fact about the other person.' : `Your evidence window was ${escapeHtml(loop.window || '72 hours')}. Record what actually happened before drawing the next conclusion.`}</p>
        ${stageRow()}
      </section>
      <section class="loop-layout">
        <div class="loop-followup-card">
          <span class="mini-kicker">Original evidence and plan</span>
          <div class="loop-evidence-grid">
            <article><small>Camera facts</small><p>${escapeHtml(loop.facts || 'Not entered')}</p></article>
            <article><small>Your interpretation</small><p>${escapeHtml(loop.interpretation || 'Not entered')}</p></article>
            <article><small>Alternative hypothesis</small><p>${escapeHtml(loop.alternative || 'Not entered')}</p></article>
            <article><small>Controllable action</small><p>${escapeHtml(loop.action || 'Not entered')}</p></article>
            <article><small>Prediction</small><p>${escapeHtml(loop.prediction || 'Not entered')}</p></article>
            <article><small>Evidence needed</small><p>${escapeHtml(loop.evidenceNeeded || 'Not entered')}</p></article>
          </div>
          ${loop.guideResponse ? `<div class="loop-guide-response"><strong>Private Guide reflection</strong><p>${escapeHtml(loop.guideResponse)}</p></div>` : ''}
          ${verified ? verifiedResult(loop) : followupForm(loop)}
        </div>
        <aside class="loop-side-rail">
          <div class="loop-side-card"><span class="mini-kicker">Evidence rule</span><h2>Report what occurred.</h2><p>Do not mark your prediction “proved” merely because you still feel convinced. Name the observable response, then decide whether the prediction was supported, weakened, or remains unknown.</p></div>
          <button class="btn btn-secondary" onclick="navigate('/real-loop')">Start another Real Loop</button>
          <button class="btn btn-secondary" onclick="navigate('/safety')">Support & Safety Center</button>
        </aside>
      </section>
    </main>`);
  }

  function followupForm(loop) {
    return `<div class="loop-section">
      <div class="loop-section-head"><span class="loop-section-num">06</span><div><h2>Verify the result</h2><p>Complete this from observable evidence, not the outcome you hoped for.</p></div></div>
      <div class="loop-grid-2">
        <div class="loop-field"><label for="loopCompleted">Did you complete your action?</label><select id="loopCompleted">${option('yes','Yes','yes')}${option('partly','Partly','yes')}${option('no','No','yes')}${option('unsafe','It became unsafe or inappropriate','yes')}</select></div>
        <div class="loop-field"><label for="loopPredictionResult">What happened to the prediction?</label><select id="loopPredictionResult">${option('supported','Supported by the observed result','unknown')}${option('weakened','Weakened by the observed result','unknown')}${option('mixed','Mixed evidence','unknown')}${option('unknown','Still unknown','unknown')}</select></div>
      </div>
      <div class="loop-field"><label for="loopObserved">What observably happened?</label><textarea id="loopObserved" placeholder="State what was said or done, including timing and follow-through. Avoid guessing the other person's motive."></textarea></div>
      <div class="loop-field"><label for="loopLearning">What did you learn about your behavior, the situation, or the relationship?</label><textarea id="loopLearning" placeholder="Example: The conversation happened when I made the request specific, but we still avoided deciding who owns each expense."></textarea></div>
      <div class="loop-field"><label for="loopNextAction">What is the next smallest useful action?</label><textarea id="loopNextAction" placeholder="Example: Write the three expense categories that still need an owner and review them Sunday."></textarea></div>
      <div class="loop-submit"><span>Only your direct report is saved as evidence.</span><button class="btn btn-primary" onclick="verifyRealLoop('${escapeHtml(String(loop.id))}')">Save verified result</button></div>
    </div>`;
  }

  function verifiedResult(loop) {
    return `<div class="loop-section">
      <div class="loop-section-head"><span class="loop-section-num">✓</span><div><h2>Result recorded</h2><p>This is your owner-only observation and can be corrected by running a new loop.</p></div></div>
      <div class="loop-evidence-grid">
        <article><small>Action completion</small><p>${escapeHtml(loop.completed || 'Not recorded')}</p></article>
        <article><small>Prediction status</small><p>${escapeHtml(loop.predictionResult || 'Unknown')}</p></article>
        <article><small>Observed result</small><p>${escapeHtml(loop.observed || 'Not recorded')}</p></article>
        <article><small>Learning</small><p>${escapeHtml(loop.learning || 'Not recorded')}</p></article>
      </div>
      ${loop.followupGuideResponse ? `<div class="loop-guide-response"><strong>Private Guide follow-up</strong><p>${escapeHtml(loop.followupGuideResponse)}</p></div>` : ''}
      <div class="hero-actions"><button class="btn btn-primary" onclick="navigate('/real-loop')">Run another experiment</button><button class="btn btn-secondary" onclick="navigate('/reflect')">Continue in private check-in</button></div>
    </div>`;
  }

  function safetyPage() {
    return appLayout(`<main class="page experience-page safety-page">
      <button class="quick-exit" onclick="quickSafetyExit()">Quick exit</button>
      <section class="safety-hero">
        <span class="mini-kicker">Tennessee support and safety</span>
        <h1>Your safety matters more than finishing the exercise.</h1>
        <p>If there is fear, coercive control, stalking, threats, physical or sexual violence, or danger from confronting someone, stop ordinary couple exercises. Use a safer device when possible and contact trained human support.</p>
      </section>
      <section class="safety-grid">
        <article class="safety-card emergency"><span class="mini-kicker">Immediate danger</span><h2>Emergency services</h2><span class="safety-number">911</span><p>Call 911 when there is immediate danger, a life-threatening situation, or urgent violence.</p><div class="safety-actions"><a class="urgent" href="tel:911">Call 911</a></div></article>
        <article class="safety-card"><span class="mini-kicker">Tennessee crisis support · 24/7</span><h2>988 Suicide & Crisis Lifeline</h2><span class="safety-number">Call or text 988 · press 0</span><p>Tennesseans can press 0 to reach a local trained crisis counselor. Tennessee also provides statewide mobile crisis response.</p><div class="safety-actions"><a class="green" href="tel:988">Call 988</a><a href="sms:988">Text 988</a><a href="https://www.tn.gov/behavioral-health/crisis.html" target="_blank" rel="noreferrer">TN crisis services</a></div></article>
        <article class="safety-card warning"><span class="mini-kicker">Relationship abuse · 24/7</span><h2>National Domestic Violence Hotline</h2><span class="safety-number">800-799-7233</span><p>Live advocates provide confidential support, safety planning, crisis intervention, and local referrals. Text START to 88788.</p><div class="safety-actions"><a class="urgent" href="tel:18007997233">Call hotline</a><a href="sms:88788?body=START">Text START</a><a href="https://www.thehotline.org/get-help/" target="_blank" rel="noreferrer">Open help site</a></div></article>
        <article class="safety-card"><span class="mini-kicker">Tennessee non-emergency help</span><h2>Behavioral Health Helpline</h2><span class="safety-number">800-560-5767</span><p>For concerns, information, and connection to Tennessee behavioral-health services when it is not an immediate emergency.</p><div class="safety-actions"><a class="green" href="tel:18005605767">Call helpline</a><a href="https://www.tn.gov/behavioral-health.html" target="_blank" rel="noreferrer">TN resources</a></div></article>
        <article class="safety-card"><span class="mini-kicker">Treatment access</span><h2>Behavioral Health Safety Net</h2><p>Tennessee's Behavioral Health Safety Net provides essential outpatient mental-health services for eligible uninsured adults across all 95 counties, including telehealth where needed.</p><div class="safety-actions"><a href="https://www.tn.gov/behavioral-health/bhsn/safety-net-eligibility-requirements.html" target="_blank" rel="noreferrer">Check eligibility</a></div></article>
        <article class="safety-card"><span class="mini-kicker">Substance-use referral</span><h2>Tennessee REDLINE</h2><span class="safety-number">800-889-9789</span><p>Free, confidential referral to addiction treatment and substance-use services in Tennessee.</p><div class="safety-actions"><a href="tel:18008899789">Call REDLINE</a><a href="sms:18008899789">Text REDLINE</a></div></article>
      </section>
      <div class="safety-disclosure"><strong>Important:</strong> US, FOR REAL is relationship-wellness software. Its AI Guide is not a qualified mental-health professional and does not provide therapy, psychotherapy, diagnosis, emergency response, legal advice, or medical care. Tennessee law prohibits representing an AI system as a qualified mental-health professional. Use licensed professionals and emergency resources when those services are needed.</div>
    </main>`);
  }

  window.saveRealLoop = async function () {
    const topic = field('loopTopic');
    const facts = field('loopFacts');
    const action = field('loopAction');
    if (!topic || !facts || !action) {
      toast('Add the issue, camera facts, and one controllable action.');
      return;
    }
    const safety = field('loopSafety') || 'none';
    const loop = {
      id: String(Date.now()),
      topic,
      intensity: Number(field('loopIntensity')) || 5,
      safety,
      facts,
      impact: field('loopImpact'),
      interpretation: field('loopInterpretation'),
      unknowns: field('loopUnknowns'),
      alternative: field('loopAlternative'),
      evidenceNeeded: field('loopEvidenceNeeded'),
      action,
      window: field('loopWindow') || '72 hours',
      prediction: field('loopPrediction'),
      status: safety === 'none' ? 'testing' : 'paused-for-safety',
      private: true,
      createdAt: new Date().toISOString(),
    };
    loops().unshift(loop);
    state.realLoops = loops().slice(0, 100);
    save();

    if (safety !== 'none') {
      toast('The relationship experiment was paused for safety.');
      navigate('/safety');
      return;
    }

    toast('Relationship experiment saved privately.');
    navigate(`/real-loop?followup=${encodeURIComponent(loop.id)}`);
    try {
      if (window.USFRFirebase?.getState?.().user) {
        const result = await window.USFRFirebase.guideCall('privateCoach', {
          type: 'real-loop-plan',
          context: 'owner-only relationship experiment using facts, hypotheses, and a controllable action',
          content: `Issue: ${loop.topic}\nIntensity: ${loop.intensity}/10\nCamera facts: ${loop.facts}\nImpact: ${loop.impact}\nInterpretation: ${loop.interpretation}\nUnknowns: ${loop.unknowns}\nAlternative hypothesis: ${loop.alternative}\nEvidence needed: ${loop.evidenceNeeded}\nAction: ${loop.action}\nEvidence window: ${loop.window}\nPrediction: ${loop.prediction}`,
        });
        loop.guideResponse = result?.response || '';
        save();
        if (path() === LOOP_ROUTE) render();
      }
    } catch (error) {
      console.warn('Private Real Loop coaching unavailable', error);
    }
  };

  window.verifyRealLoop = async function (id) {
    const loop = loops().find(item => String(item.id) === String(id));
    if (!loop) return toast('That relationship experiment could not be found.');
    const observed = field('loopObserved');
    if (!observed) return toast('Record the observable result before saving.');
    loop.completed = field('loopCompleted');
    loop.predictionResult = field('loopPredictionResult');
    loop.observed = observed;
    loop.learning = field('loopLearning');
    loop.nextAction = field('loopNextAction');
    loop.status = 'verified';
    loop.verifiedAt = new Date().toISOString();
    save();
    toast('Verified result saved privately.');
    render();
    try {
      if (window.USFRFirebase?.getState?.().user) {
        const result = await window.USFRFirebase.guideCall('privateCoach', {
          type: 'real-loop-result',
          context: 'owner-only verification of a relationship behavior experiment',
          content: `Issue: ${loop.topic}\nOriginal prediction: ${loop.prediction}\nAction: ${loop.action}\nCompletion: ${loop.completed}\nObserved result: ${loop.observed}\nPrediction status: ${loop.predictionResult}\nLearning: ${loop.learning}\nNext action: ${loop.nextAction}`,
        });
        loop.followupGuideResponse = result?.response || '';
        save();
        if (path() === LOOP_ROUTE) render();
      }
    } catch (error) {
      console.warn('Private Real Loop follow-up unavailable', error);
    }
  };

  window.quickSafetyExit = function () {
    window.location.replace('https://www.google.com');
  };

  function decorateNavigation() {
    const current = path();
    const desktopNav = document.querySelector('.premium-nav');
    if (desktopNav && !desktopNav.querySelector('[href="/real-loop"]')) {
      const link = document.createElement('a');
      link.href = '/real-loop';
      link.dataset.link = '';
      link.className = current === LOOP_ROUTE ? 'active' : '';
      link.innerHTML = '<span class="nav-icon">↻</span><span>The Real Loop</span><i class="real-loop-nav-badge">NEW</i>';
      const calibrator = desktopNav.querySelector('[href="/calibrate"]');
      calibrator?.insertAdjacentElement('afterend', link);
    }

    const moreGrid = document.querySelector('.more-menu-grid');
    if (moreGrid && !moreGrid.querySelector('[href="/real-loop"]')) {
      const loopLink = document.createElement('a');
      loopLink.href = '/real-loop';
      loopLink.dataset.link = '';
      loopLink.className = `more-menu-link ${current === LOOP_ROUTE ? 'active' : ''}`;
      loopLink.innerHTML = '<span class="more-menu-icon">↻</span><span><strong>The Real Loop</strong><small>Test what changes the relationship</small></span>';
      const safetyLink = document.createElement('a');
      safetyLink.href = '/safety';
      safetyLink.dataset.link = '';
      safetyLink.className = `more-menu-link support-menu-link ${current === SAFETY_ROUTE ? 'active' : ''}`;
      safetyLink.innerHTML = '<span class="more-menu-icon">!</span><span><strong>Support & Safety</strong><small>Tennessee crisis and human support</small></span>';
      moreGrid.append(loopLink, safetyLink);
    }

    const quickGrid = document.querySelector('.dashboard-page .quick-grid');
    if (quickGrid && !quickGrid.querySelector('.real-loop-dashboard-card')) {
      const card = document.createElement('button');
      card.className = 'quick-card real-loop-dashboard-card';
      card.onclick = () => navigate('/real-loop');
      card.innerHTML = '<span class="quick-icon">↻</span><span><small>Evidence loop</small><strong>Test what actually changes</strong><p>Separate facts from assumptions, run one behavior experiment, then verify the outcome.</p></span><span class="quick-arrow">›</span>';
      quickGrid.appendChild(card);
    }

    const accountPanel = document.querySelector('.fb2');
    if (accountPanel && !accountPanel.querySelector('.usfr-ai-disclosure')) {
      const disclosure = document.createElement('div');
      disclosure.className = 'usfr-ai-disclosure';
      disclosure.innerHTML = '<strong>AI relationship-wellness disclosure:</strong> The Guide is software, not a person, therapist, qualified mental-health professional, emergency service, or substitute for licensed care.';
      accountPanel.appendChild(disclosure);
    }
  }

  function afterRender() {
    requestAnimationFrame(decorateNavigation);
  }

  window.render = function () {
    if (path() === LOOP_ROUTE) {
      document.getElementById('app').innerHTML = realLoopPage();
      afterRender();
      return;
    }
    if (path() === SAFETY_ROUTE) {
      document.getElementById('app').innerHTML = safetyPage();
      afterRender();
      return;
    }
    previousRender();
    afterRender();
  };

  document.addEventListener('keydown', event => {
    if (path() !== SAFETY_ROUTE || event.key !== 'Escape') return;
    escapeCount += 1;
    clearTimeout(escapeTimer);
    escapeTimer = setTimeout(() => { escapeCount = 0; }, 1200);
    if (escapeCount >= 2) quickSafetyExit();
  });

  window.addEventListener('popstate', () => {
    if ([LOOP_ROUTE, SAFETY_ROUTE].includes(path())) render();
  });

  render();
})();