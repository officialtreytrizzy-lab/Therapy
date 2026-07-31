(function consentGate() {
  'use strict';

  const POLICY_VERSION = '2026-07-31.1';
  const FIREBASE_VERSION = '12.16.0';
  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  const blockedElements = new Set();
  let backgroundObserver = null;
  let focusListener = null;
  let keyListener = null;
  let previouslyFocused = null;
  let saving = false;

  function storageKey(uid) {
    return `usfr-policy-consent:${uid}`;
  }

  function state() {
    return window.USFRFirebase?.getState?.() || null;
  }

  function accepted(current) {
    const uid = current?.user?.uid;
    if (!uid) return false;
    return current.profile?.policyConsentVersion === POLICY_VERSION
      || localStorage.getItem(storageKey(uid)) === POLICY_VERSION;
  }

  function element(tag, options = {}) {
    const node = document.createElement(tag);
    if (options.className) node.className = options.className;
    if (options.text) node.textContent = options.text;
    if (options.type) node.type = options.type;
    if (options.href) node.href = options.href;
    if (options.id) node.id = options.id;
    return node;
  }

  function shouldBlock(element, gate) {
    return element !== gate && !['SCRIPT', 'NOSCRIPT'].includes(element.tagName);
  }

  function blockElement(element) {
    if (element.hasAttribute('inert')) return;
    element.setAttribute('inert', '');
    blockedElements.add(element);
  }

  function blockBackground(gate) {
    document.body.classList.add('consent-open');
    [...document.body.children]
      .filter(element => shouldBlock(element, gate))
      .forEach(blockElement);

    backgroundObserver?.disconnect();
    backgroundObserver = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && shouldBlock(node, gate)) blockElement(node);
        }
      }
    });
    backgroundObserver.observe(document.body, { childList: true });
  }

  function releaseBackground() {
    backgroundObserver?.disconnect();
    backgroundObserver = null;
    for (const element of blockedElements) {
      if (element.isConnected) element.removeAttribute('inert');
    }
    blockedElements.clear();
    document.body.classList.remove('consent-open');
  }

  function focusableElements(dialog) {
    return [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter(element => {
      if (!(element instanceof HTMLElement)) return false;
      if (element.hidden || element.closest('[hidden],[inert]')) return false;
      return element.getClientRects().length > 0;
    });
  }

  function containFocus(gate, dialog) {
    stopFocusContainment();
    keyListener = event => {
      if (event.key !== 'Tab') return;
      const focusable = focusableElements(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    focusListener = event => {
      if (gate.contains(event.target)) return;
      const target = focusableElements(dialog)[0] || dialog;
      target.focus();
    };
    document.addEventListener('keydown', keyListener, true);
    document.addEventListener('focusin', focusListener, true);
  }

  function stopFocusContainment() {
    if (keyListener) document.removeEventListener('keydown', keyListener, true);
    if (focusListener) document.removeEventListener('focusin', focusListener, true);
    keyListener = null;
    focusListener = null;
  }

  function removeGate(options = {}) {
    const gate = document.getElementById('usfr-consent-gate');
    if (!gate) return;
    stopFocusContainment();
    releaseBackground();
    gate.remove();

    const restoreFocus = options.restoreFocus !== false;
    const target = restoreFocus && previouslyFocused?.isConnected
      ? previouslyFocused
      : document.getElementById('app');
    previouslyFocused = null;
    if (target instanceof HTMLElement && !target.hasAttribute('inert')) {
      requestAnimationFrame(() => target.focus({ preventScroll: false }));
    }
  }

  async function appCheckToken() {
    try {
      const module = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app-check.js`);
      const result = await module.getToken(module.getAppCheck(), false);
      return result?.token || '';
    } catch {
      return '';
    }
  }

  async function saveConsent(status, button, checkbox) {
    if (saving || !checkbox.checked) {
      if (!checkbox.checked) {
        status.textContent = 'Confirm the adult eligibility and policy agreement before continuing.';
        checkbox.focus();
      }
      return;
    }
    const current = state();
    const user = current?.user;
    if (!user) {
      status.textContent = 'Your sign-in session is not ready. Try again.';
      return;
    }
    saving = true;
    button.disabled = true;
    status.textContent = 'Saving your consent securely…';
    try {
      const token = await user.getIdToken();
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
      const appCheck = await appCheckToken();
      if (appCheck) headers['x-firebase-appcheck'] = appCheck;
      const response = await fetch('/api/firebase-account', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'saveConsentControls',
          data: {
            acceptCurrentPolicies: true,
            policyVersion: POLICY_VERSION,
            ageConfirmed: true,
            accepted: true,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || 'Consent could not be saved.');
      localStorage.setItem(storageKey(user.uid), POLICY_VERSION);
      removeGate();
      window.dispatchEvent(new CustomEvent('usfr-policy-consent', { detail: { version: POLICY_VERSION } }));
    } catch (error) {
      status.textContent = String(error?.message || 'Consent could not be saved. Try again.');
      button.disabled = false;
    } finally {
      saving = false;
    }
  }

  async function decline() {
    const user = state()?.user;
    try {
      if (user?.auth) {
        const auth = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`);
        await auth.signOut(user.auth);
      }
    } catch {}
    removeGate({ restoreFocus: false });
    if (typeof window.navigate === 'function') window.navigate('/');
    else location.assign('/');
  }

  function mountGate() {
    if (document.getElementById('usfr-consent-gate')) return;
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const backdrop = element('div', { className: 'consent-gate', id: 'usfr-consent-gate' });
    const dialog = element('section', { className: 'consent-dialog' });
    dialog.tabIndex = -1;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'consent-title');
    dialog.setAttribute('aria-describedby', 'consent-summary');

    const eyebrow = element('p', { className: 'consent-eyebrow', text: 'Before entering your private space' });
    const title = element('h1', { text: 'Confirm the current wellness boundaries.', id: 'consent-title' });
    const summary = element('p', {
      className: 'consent-summary',
      id: 'consent-summary',
      text: 'US, FOR REAL is an adult relationship-wellness tool with AI-assisted guidance. It is not therapy, diagnosis, emergency response, legal advice, or a guarantee of relationship safety.',
    });

    const links = element('nav', { className: 'consent-links' });
    links.setAttribute('aria-label', 'Policies to review');
    [
      ['/privacy.html', 'Privacy notice'],
      ['/terms.html', 'Terms of use'],
      ['/wellness-safety.html', 'AI and wellness safety'],
    ].forEach(([href, label]) => {
      const link = element('a', { href, text: label });
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      links.append(link);
    });

    const label = element('label', { className: 'consent-check' });
    const checkbox = element('input', { type: 'checkbox', id: 'consent-confirm' });
    checkbox.required = true;
    const checkText = element('span', {
      text: 'I am at least 18 years old, I have reviewed the linked notices, and I voluntarily agree to use the service within those boundaries.',
    });
    label.append(checkbox, checkText);

    const status = element('p', { className: 'consent-status', id: 'consent-status' });
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    const actions = element('div', { className: 'consent-actions' });
    const declineButton = element('button', { className: 'consent-secondary', type: 'button', text: 'Decline and sign out' });
    const acceptButton = element('button', { className: 'consent-primary', type: 'button', text: 'Accept and enter my space' });
    declineButton.addEventListener('click', decline);
    acceptButton.addEventListener('click', () => saveConsent(status, acceptButton, checkbox));
    actions.append(declineButton, acceptButton);

    dialog.append(eyebrow, title, summary, links, label, status, actions);
    backdrop.append(dialog);
    document.body.append(backdrop);
    blockBackground(backdrop);
    containFocus(backdrop, dialog);
    requestAnimationFrame(() => checkbox.focus());
  }

  function evaluate() {
    const current = state();
    if (!current?.ready || !current.user) {
      removeGate();
      return;
    }
    if (accepted(current)) removeGate();
    else mountGate();
  }

  ['usfr-firebase-ready', 'usfr-profile-changed', 'usfr-policy-consent'].forEach(name => {
    window.addEventListener(name, evaluate);
  });
  window.addEventListener('usfr-firebase-error', removeGate);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', evaluate, { once: true });
  else evaluate();
  setInterval(evaluate, 5_000);
})();
