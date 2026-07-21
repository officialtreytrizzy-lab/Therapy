/* Firebase identity, partner linking, and living couple dossier integration. */
(function () {
  'use strict';

  const SDK = '12.16.0';
  const state = {
    ready: false,
    configured: false,
    user: null,
    profile: null,
    invites: { incoming: [], outgoing: [] },
    api: null,
    unsubscribe: null,
  };

  const css = `
    .firebase-account-trigger{width:100%;margin-top:10px;border:1px solid rgba(99,213,141,.24);background:rgba(99,213,141,.07);color:#dff7e7;border-radius:14px;padding:11px 12px;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:10px;font:600 12px/1.2 "DM Sans",system-ui}
    .firebase-account-trigger span:last-child{color:#63d58d;font-variant-numeric:tabular-nums}
    .firebase-modal-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(3,5,4,.72);backdrop-filter:blur(18px);display:grid;place-items:end center;padding:18px env(safe-area-inset-right) calc(18px + env(safe-area-inset-bottom)) env(safe-area-inset-left)}
    .firebase-modal{width:min(720px,100%);max-height:min(88dvh,850px);overflow:auto;border:1px solid rgba(255,255,255,.12);border-radius:28px;background:linear-gradient(160deg,rgba(28,33,30,.98),rgba(11,14,12,.99));box-shadow:0 35px 110px rgba(0,0,0,.58);color:#f3eee4;padding:22px}
    .firebase-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px}.firebase-modal-head h2{font:700 30px/1 "Cormorant Garamond",Georgia,serif;margin:0 0 5px}.firebase-close{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#fff;width:42px;height:42px;border-radius:50%;font-size:20px}
    .firebase-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.firebase-field{display:flex;flex-direction:column;gap:6px}.firebase-field.full{grid-column:1/-1}.firebase-field label{font-size:12px;color:#b9b3aa;font-weight:600}.firebase-field input,.firebase-field textarea,.firebase-field select{width:100%;min-height:46px;border:1px solid rgba(255,255,255,.12);border-radius:13px;background:#0e1210;color:#f3eee4;padding:12px;font:16px/1.35 "DM Sans",system-ui;outline:none}.firebase-field textarea{min-height:88px;resize:vertical}.firebase-field input:focus,.firebase-field textarea:focus{border-color:rgba(99,213,141,.65);box-shadow:0 0 0 3px rgba(99,213,141,.09)}
    .firebase-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.firebase-btn{border:0;border-radius:999px;min-height:44px;padding:0 18px;font-weight:700}.firebase-btn.primary{background:#63d58d;color:#06120a}.firebase-btn.secondary{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);color:#f3eee4}.firebase-btn.danger{background:rgba(211,107,98,.13);border:1px solid rgba(211,107,98,.3);color:#ffd1cd}
    .firebase-panel{border:1px solid rgba(255,255,255,.1);border-radius:18px;background:rgba(255,255,255,.025);padding:16px;margin-top:14px}.firebase-panel h3{margin:0 0 7px;font-size:16px}.firebase-muted{color:#aaa398;font-size:13px;line-height:1.5}.member-code{font:700 clamp(28px,8vw,46px)/1 "DM Sans",system-ui;letter-spacing:.12em;color:#8ee9ad;font-variant-numeric:tabular-nums;margin:12px 0}.status-pill{display:inline-flex;padding:6px 10px;border-radius:999px;background:rgba(99,213,141,.1);color:#8ee9ad;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}.invite-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid rgba(255,255,255,.08)}
    .firebase-error{margin-top:12px;padding:11px 12px;border-radius:12px;background:rgba(211,107,98,.12);border:1px solid rgba(211,107,98,.3);color:#ffd3cf;font-size:13px}.firebase-success{margin-top:12px;padding:11px 12px;border-radius:12px;background:rgba(99,213,141,.1);border:1px solid rgba(99,213,141,.24);color:#dff7e7;font-size:13px}
    @media(max-width:620px){.firebase-modal-backdrop{padding:0;place-items:end stretch}.firebase-modal{border-radius:24px 24px 0 0;max-height:92dvh;padding:18px 16px calc(20px + env(safe-area-inset-bottom))}.firebase-grid{grid-template-columns:1fr}.firebase-field.full{grid-column:auto}.member-code{font-size:34px}.firebase-actions .firebase-btn{flex:1}}
  `;

  function injectStyles() {
    if (document.getElementById('firebase-account-styles')) return;
    const style = document.createElement('style');
    style.id = 'firebase-account-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function notify(message, type = 'success') {
    const existing = document.getElementById('firebase-message');
    if (existing) existing.remove();
    const body = document.querySelector('.firebase-modal');
    if (!body) return;
    const div = document.createElement('div');
    div.id = 'firebase-message';
    div.className = type === 'error' ? 'firebase-error' : 'firebase-success';
    div.textContent = message;
    body.prepend(div);
  }

  async function loadFirebase() {
    let payload;
    try {
      const response = await fetch('/api/firebase-config', { cache: 'no-store' });
      payload = await response.json();
    } catch (error) {
      console.warn('Firebase config endpoint unavailable', error);
      return;
    }
    state.configured = Boolean(payload && payload.configured && payload.config);
    if (!state.configured) {
      state.ready = true;
      installAccountTrigger();
      return;
    }

    const base = `https://www.gstatic.com/firebasejs/${SDK}`;
    const [appMod, authMod, firestoreMod, functionsMod, appCheckMod] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-auth.js`),
      import(`${base}/firebase-firestore.js`),
      import(`${base}/firebase-functions.js`),
      import(`${base}/firebase-app-check.js`),
    ]);

    const app = appMod.initializeApp(payload.config);
    const auth = authMod.initializeAuth(app, {
      persistence: [authMod.indexedDBLocalPersistence, authMod.browserLocalPersistence, authMod.browserSessionPersistence],
      popupRedirectResolver: authMod.browserPopupRedirectResolver,
    });
    const db = firestoreMod.getFirestore(app);
    const functions = functionsMod.getFunctions(app, payload.config.functionsRegion || 'us-central1');
    if (payload.config.appCheckSiteKey) {
      appCheckMod.initializeAppCheck(app, {
        provider: new appCheckMod.ReCaptchaEnterpriseProvider(payload.config.appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    }

    state.api = { appMod, authMod, firestoreMod, functionsMod, appCheckMod, app, auth, db, functions };
    state.ready = true;
    authMod.onAuthStateChanged(auth, onAuthChanged);
    installAccountTrigger();
    window.USFRFirebase = { state, open: openAccountCenter };
  }

  async function onAuthChanged(user) {
    state.user = user || null;
    state.profile = null;
    state.invites = { incoming: [], outgoing: [] };
    if (state.unsubscribe) {
      state.unsubscribe();
      state.unsubscribe = null;
    }
    if (user) {
      try {
        await call('provisionProfile', {
          displayName: user.displayName || user.email?.split('@')[0] || 'Member',
          pronouns: '',
        });
        const { doc, onSnapshot } = state.api.firestoreMod;
        state.unsubscribe = onSnapshot(doc(state.api.db, 'users', user.uid), snapshot => {
          state.profile = snapshot.exists() ? snapshot.data() : null;
          installAccountTrigger(true);
          if (document.querySelector('.firebase-modal-backdrop')) renderModal();
        });
        await refreshInvites();
      } catch (error) {
        console.error('Firebase profile setup failed', error);
      }
    }
    installAccountTrigger(true);
    if (document.querySelector('.firebase-modal-backdrop')) renderModal();
  }

  async function call(name, data) {
    const fn = state.api.functionsMod.httpsCallable(state.api.functions, name);
    const result = await fn(data || {});
    return result.data;
  }

  async function refreshInvites() {
    if (!state.user) return;
    try {
      state.invites = await call('listPendingInvites', {});
    } catch (error) {
      console.warn('Could not load partner invites', error);
    }
  }

  function triggerLabel() {
    if (!state.configured) return ['Account', 'Firebase setup'];
    if (!state.user) return ['Account', 'Sign in'];
    if (!state.profile) return ['Account', 'Loading…'];
    return ['Member ID', state.profile.memberCode ? `#${state.profile.memberCode}` : 'Creating…'];
  }

  function installAccountTrigger(force) {
    injectStyles();
    const targets = document.querySelectorAll('.side-bottom, .mobile-head');
    targets.forEach((target, index) => {
      let button = target.querySelector('.firebase-account-trigger');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'firebase-account-trigger';
        button.addEventListener('click', openAccountCenter);
        if (index === 0) target.appendChild(button);
        else {
          button.style.width = 'auto';
          button.style.margin = '0 8px 0 auto';
          button.style.padding = '9px 10px';
          target.insertBefore(button, target.lastElementChild);
        }
      }
      const [left, right] = triggerLabel();
      button.innerHTML = `<span>${escapeHtml(left)}</span><span>${escapeHtml(right)}</span>`;
    });
    if (force) requestAnimationFrame(() => installAccountTrigger(false));
  }

  function openAccountCenter() {
    if (!document.querySelector('.firebase-modal-backdrop')) {
      const wrap = document.createElement('div');
      wrap.className = 'firebase-modal-backdrop';
      wrap.id = 'firebase-account-center';
      wrap.addEventListener('click', event => {
        if (event.target === wrap) closeAccountCenter();
      });
      document.body.appendChild(wrap);
    }
    renderModal();
  }

  function closeAccountCenter() {
    document.getElementById('firebase-account-center')?.remove();
  }

  function modalShell(content, subtitle) {
    return `<section class="firebase-modal" role="dialog" aria-modal="true" aria-label="Account and relationship center">
      <div class="firebase-modal-head"><div><h2>Our Account Space</h2><div class="firebase-muted">${escapeHtml(subtitle || 'Identity, partner linking, and Guide context.')}</div></div><button class="firebase-close" type="button" data-fb-action="close" aria-label="Close">×</button></div>
      ${content}
    </section>`;
  }

  function renderModal() {
    const wrap = document.getElementById('firebase-account-center');
    if (!wrap) return;
    if (!state.ready) {
      wrap.innerHTML = modalShell('<div class="firebase-panel">Connecting securely…</div>');
      bindModal();
      return;
    }
    if (!state.configured) {
      wrap.innerHTML = modalShell(`
        <div class="firebase-panel"><h3>Firebase is selected</h3><p class="firebase-muted">The app code, Firestore schema, partner-link handshake, security rules, and living Guide dossier are ready. Add the Firebase web configuration to Vercel to activate real accounts.</p></div>
      `, 'Backend configuration is waiting for Firebase project credentials.');
      bindModal();
      return;
    }
    if (!state.user) {
      wrap.innerHTML = modalShell(authView(), 'Create an account or sign back in.');
      bindModal();
      return;
    }
    wrap.innerHTML = modalShell(profileView(), 'Your permanent member ID and relationship connection.');
    bindModal();
  }

  function authView() {
    return `<div class="firebase-grid">
      <div class="firebase-field full"><label>Email</label><input id="fb-email" type="email" autocomplete="email" placeholder="you@example.com"></div>
      <div class="firebase-field full"><label>Password</label><input id="fb-password" type="password" autocomplete="current-password" minlength="8" placeholder="At least 8 characters"></div>
    </div>
    <div class="firebase-actions"><button class="firebase-btn primary" data-fb-action="signup">Create account</button><button class="firebase-btn secondary" data-fb-action="signin">Sign in</button></div>`;
  }

  function inviteView() {
    const incoming = state.invites.incoming || [];
    const outgoing = state.invites.outgoing || [];
    let html = '';
    if (incoming.length) {
      html += `<div class="firebase-panel"><h3>Partner requests</h3>${incoming.map(invite => `<div class="invite-row"><div><strong>${escapeHtml(invite.fromDisplayName || 'A member')}</strong><div class="firebase-muted">Member #${escapeHtml(invite.fromMemberCode)}</div></div><div class="firebase-actions" style="margin:0"><button class="firebase-btn primary" data-fb-action="accept" data-invite="${escapeHtml(invite.id)}">Accept</button><button class="firebase-btn secondary" data-fb-action="decline" data-invite="${escapeHtml(invite.id)}">Decline</button></div></div>`).join('')}</div>`;
    }
    if (outgoing.length) {
      html += `<div class="firebase-panel"><h3>Pending request</h3>${outgoing.map(invite => `<div class="invite-row"><div><strong>${escapeHtml(invite.toDisplayName || 'Partner')}</strong><div class="firebase-muted">Waiting for them to accept.</div></div><span class="status-pill">Pending</span></div>`).join('')}</div>`;
    }
    return html;
  }

  function profileView() {
    const profile = state.profile || {};
    const linked = profile.relationshipStatus === 'linked' && profile.coupleId;
    const pending = profile.relationshipStatus === 'pending';
    return `<div class="firebase-panel"><span class="status-pill">${escapeHtml(profile.relationshipStatus || 'setting up')}</span><div class="member-code">${profile.memberCode ? `#${escapeHtml(profile.memberCode)}` : 'Creating ID…'}</div><p class="firebase-muted">This permanent 8-digit number is how a partner can find your account. Your email and Firebase UID are never used as the public partner code.</p></div>
      ${inviteView()}
      ${!linked ? `<div class="firebase-panel"><h3>${pending ? 'Add another request' : 'Stay solo or link a partner'}</h3><p class="firebase-muted">You can use the app by yourself. To become a linked couple, enter your partner’s member ID. They must accept before either account is joined.</p><div class="firebase-field"><label>Partner’s 8-digit member ID</label><input id="fb-partner-code" inputmode="numeric" maxlength="8" pattern="[0-9]*" placeholder="12345678"></div><div class="firebase-actions"><button class="firebase-btn primary" data-fb-action="link">Send link request</button></div></div>` : `<div class="firebase-panel"><h3>Linked couple</h3><p class="firebase-muted">Both profiles now share couple sessions, goals, agreements, and the living Guide dossier. Private reflections remain separate.</p></div>${coupleIntakeView()}`}
      ${personalIntakeView()}
      <div class="firebase-actions"><button class="firebase-btn secondary" data-fb-action="refresh">Refresh</button><button class="firebase-btn danger" data-fb-action="signout">Sign out</button></div>`;
  }

  function personalIntakeView() {
    const intake = state.profile?.personalIntake || {};
    return `<div class="firebase-panel"><h3>Your therapist-style intake</h3><p class="firebase-muted">These details help the Guide understand how you communicate and repair. They are attached to your own profile.</p><div class="firebase-grid">
      <div class="firebase-field"><label>Love language</label><input id="fb-love-language" value="${escapeHtml(intake.loveLanguage || '')}" placeholder="Words, touch, time…"></div>
      <div class="firebase-field"><label>Conflict style</label><input id="fb-conflict-style" value="${escapeHtml(intake.conflictStyle || '')}" placeholder="I pursue, withdraw, fix…"></div>
      <div class="firebase-field full"><label>What stress looks like in you</label><textarea id="fb-stress-signs">${escapeHtml(intake.stressSigns || '')}</textarea></div>
      <div class="firebase-field full"><label>What helps repair land</label><textarea id="fb-repair">${escapeHtml(intake.repairPreferences || '')}</textarea></div>
      <div class="firebase-field full"><label>Communication needs</label><textarea id="fb-communication">${escapeHtml(intake.communicationNeeds || '')}</textarea></div>
      <div class="firebase-field full"><label>Fun facts, one per line</label><textarea id="fb-fun-facts">${escapeHtml((intake.funFacts || []).join('\n'))}</textarea></div>
    </div><div class="firebase-actions"><button class="firebase-btn primary" data-fb-action="save-personal">Save my intake</button></div></div>`;
  }

  function coupleIntakeView() {
    return `<div class="firebase-panel"><h3>Help the Guide meet you as a couple</h3><p class="firebase-muted">The app uses this shared intake to create and continuously update a markdown-style Couple Guide Dossier.</p><div class="firebase-grid">
      <div class="firebase-field"><label>Anniversary</label><input id="fb-anniversary" type="date"></div>
      <div class="firebase-field"><label>Where did you meet?</label><input id="fb-where-met" placeholder="City, event, app, school…"></div>
      <div class="firebase-field full"><label>How did you meet?</label><textarea id="fb-how-met" placeholder="Tell the story in your own words."></textarea></div>
      <div class="firebase-field full"><label>What was the first date like?</label><textarea id="fb-first-date"></textarea></div>
      <div class="firebase-field full"><label>First impressions of each other</label><textarea id="fb-first-impression"></textarea></div>
      <div class="firebase-field full"><label>Favorite shared memory</label><textarea id="fb-favorite-memory"></textarea></div>
      <div class="firebase-field"><label>Relationship strengths, one per line</label><textarea id="fb-strengths"></textarea></div>
      <div class="firebase-field"><label>Shared values, one per line</label><textarea id="fb-values"></textarea></div>
      <div class="firebase-field"><label>Rituals and traditions</label><textarea id="fb-rituals"></textarea></div>
      <div class="firebase-field"><label>Hopes for the relationship</label><textarea id="fb-hopes"></textarea></div>
      <div class="firebase-field full"><label>What needs attention right now?</label><textarea id="fb-priorities"></textarea></div>
    </div><div class="firebase-actions"><button class="firebase-btn primary" data-fb-action="save-couple">Update our Guide dossier</button></div></div>`;
  }

  function lines(id) {
    return (document.getElementById(id)?.value || '').split('\n').map(value => value.trim()).filter(Boolean);
  }

  function firebaseMessage(error) {
    const code = error?.code ? String(error.code).replace('functions/', '').replace('auth/', '') : '';
    return error?.message ? String(error.message).replace(/^Firebase:\s*/i, '') : (code || 'Something went wrong.');
  }

  async function handleAction(action, element) {
    try {
      if (action === 'close') return closeAccountCenter();
      if (action === 'signup' || action === 'signin') {
        const email = document.getElementById('fb-email').value.trim();
        const password = document.getElementById('fb-password').value;
        if (!email || password.length < 8) throw new Error('Enter a valid email and a password with at least 8 characters.');
        if (action === 'signup') await state.api.authMod.createUserWithEmailAndPassword(state.api.auth, email, password);
        else await state.api.authMod.signInWithEmailAndPassword(state.api.auth, email, password);
        notify(action === 'signup' ? 'Account created. Your member ID is being assigned.' : 'Signed in.');
        return;
      }
      if (action === 'signout') {
        await state.api.authMod.signOut(state.api.auth);
        return;
      }
      if (action === 'refresh') {
        await refreshInvites();
        renderModal();
        return notify('Account information refreshed.');
      }
      if (action === 'link') {
        const partnerCode = document.getElementById('fb-partner-code').value.trim();
        const result = await call('requestPartnerLink', { partnerCode });
        await refreshInvites();
        renderModal();
        return notify(`Request sent to ${result.partnerDisplayName || 'your partner'}.`);
      }
      if (action === 'accept' || action === 'decline') {
        await call('respondToPartnerInvite', { inviteId: element.dataset.invite, accept: action === 'accept' });
        await refreshInvites();
        renderModal();
        return notify(action === 'accept' ? 'Profiles linked. Your shared couple space is ready.' : 'Request declined.');
      }
      if (action === 'save-personal') {
        await call('savePersonalIntake', {
          loveLanguage: document.getElementById('fb-love-language').value,
          conflictStyle: document.getElementById('fb-conflict-style').value,
          stressSigns: document.getElementById('fb-stress-signs').value,
          repairPreferences: document.getElementById('fb-repair').value,
          communicationNeeds: document.getElementById('fb-communication').value,
          funFacts: lines('fb-fun-facts'),
        });
        return notify('Your personal intake was saved.');
      }
      if (action === 'save-couple') {
        await call('saveCoupleIntake', {
          anniversary: document.getElementById('fb-anniversary').value || null,
          whereMet: document.getElementById('fb-where-met').value,
          howMet: document.getElementById('fb-how-met').value,
          firstDate: document.getElementById('fb-first-date').value,
          firstImpression: document.getElementById('fb-first-impression').value,
          favoriteSharedMemory: document.getElementById('fb-favorite-memory').value,
          strengths: lines('fb-strengths'),
          sharedValues: lines('fb-values'),
          rituals: lines('fb-rituals'),
          hopes: lines('fb-hopes'),
          currentPriorities: lines('fb-priorities'),
        });
        return notify('Couple intake saved. The Guide dossier has been rebuilt.');
      }
    } catch (error) {
      console.error(error);
      notify(firebaseMessage(error), 'error');
    }
  }

  function bindModal() {
    document.querySelectorAll('[data-fb-action]').forEach(element => {
      element.addEventListener('click', () => handleAction(element.dataset.fbAction, element));
    });
  }

  const observer = new MutationObserver(() => installAccountTrigger(false));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('DOMContentLoaded', () => {
    injectStyles();
    loadFirebase().catch(error => console.error('Firebase initialization failed', error));
  }, { once: true });
})();
