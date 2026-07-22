(function () {
  'use strict';

  const VERSION = '12.16.0';
  const OVERLAY_ID = 'usfr-email-link-confirmation';
  const url = new URL(window.location.href);
  const isEmailSignIn = url.searchParams.get('mode') === 'signIn' && url.searchParams.has('oobCode');
  if (!isEmailSignIn) return;

  const originalPrompt = window.prompt.bind(window);
  let promptIntercepted = false;

  window.prompt = function (message, defaultValue) {
    if (/confirm the email that received this link/i.test(String(message || ''))) {
      promptIntercepted = true;
      sessionStorage.setItem('usfr-email-link-needs-confirmation', '1');
      queueMicrotask(showConfirmation);
      return null;
    }
    return originalPrompt(message, defaultValue);
  };

  function addStyles() {
    if (document.getElementById('usfr-email-link-confirmation-style')) return;
    const style = document.createElement('style');
    style.id = 'usfr-email-link-confirmation-style';
    style.textContent = `
      .email-link-confirmation{position:fixed;inset:0;z-index:10000;display:grid;place-items:end center;padding:18px 18px calc(18px + env(safe-area-inset-bottom));background:rgba(2,5,3,.82);backdrop-filter:blur(18px)}
      .email-link-card{width:min(560px,100%);border:1px solid rgba(125,224,162,.22);border-radius:28px;padding:22px;background:linear-gradient(155deg,#18201b,#090d0a 72%);box-shadow:0 30px 100px rgba(0,0,0,.72);color:#f4f0e8;font-family:"DM Sans",system-ui,sans-serif}
      .email-link-kicker{display:block;margin-bottom:9px;color:#72d69a;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
      .email-link-card h2{margin:0 0 8px;font:700 34px/1.02 "Cormorant Garamond",serif}
      .email-link-card p{margin:0;color:#b9b3a9;font-size:14px;line-height:1.55}
      .email-link-field{display:grid;gap:7px;margin-top:18px}
      .email-link-field label{font-size:12px;font-weight:700;color:#d9d4ca}
      .email-link-field input{width:100%;min-height:52px;border:1px solid rgba(255,255,255,.13);border-radius:14px;padding:0 14px;background:#0c110e;color:#fff;font:16px "DM Sans",system-ui;outline:none}
      .email-link-field input:focus{border-color:#6ed493;box-shadow:0 0 0 3px rgba(110,212,147,.12)}
      .email-link-error{min-height:20px;margin-top:9px!important;color:#ffb9b2!important;font-size:12px!important}
      .email-link-actions{display:flex;gap:10px;margin-top:16px}
      .email-link-actions button{min-height:48px;border-radius:999px;padding:0 18px;font-weight:800;border:1px solid rgba(255,255,255,.13);cursor:pointer}
      .email-link-actions .primary{flex:1;border:0;background:#69d08f;color:#06110a}
      .email-link-actions .secondary{background:rgba(255,255,255,.05);color:#eee9e0}
      .email-link-actions button:disabled{opacity:.55;cursor:wait}
      @media(max-width:620px){.email-link-confirmation{padding:0;place-items:end}.email-link-card{border-radius:28px 28px 0 0;padding:22px 18px calc(22px + env(safe-area-inset-bottom))}.email-link-actions{flex-direction:column-reverse}.email-link-actions button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function showConfirmation() {
    if (!document.body || document.getElementById(OVERLAY_ID)) return;
    if (localStorage.getItem('usfr-email')) return;
    addStyles();
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'email-link-confirmation';
    overlay.innerHTML = `
      <section class="email-link-card" role="dialog" aria-modal="true" aria-labelledby="emailLinkTitle">
        <span class="email-link-kicker">Secure sign-in</span>
        <h2 id="emailLinkTitle">Confirm your email</h2>
        <p>Enter the same email address that received this sign-in link. This keeps the link tied to the correct private member account.</p>
        <div class="email-link-field">
          <label for="emailLinkAddress">Email address</label>
          <input id="emailLinkAddress" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="you@example.com" />
        </div>
        <p class="email-link-error" id="emailLinkError" role="alert"></p>
        <div class="email-link-actions">
          <button type="button" class="secondary" id="emailLinkCancel">Cancel</button>
          <button type="button" class="primary" id="emailLinkContinue">Continue securely</button>
        </div>
      </section>`;
    document.body.appendChild(overlay);
    const input = document.getElementById('emailLinkAddress');
    const button = document.getElementById('emailLinkContinue');
    document.getElementById('emailLinkCancel').addEventListener('click', cancelConfirmation);
    button.addEventListener('click', completeSignIn);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') completeSignIn();
    });
    setTimeout(() => input.focus(), 50);
  }

  function cancelConfirmation() {
    sessionStorage.removeItem('usfr-email-link-needs-confirmation');
    const cleanUrl = new URL(window.location.origin + '/dashboard');
    history.replaceState({}, '', cleanUrl.pathname);
    document.getElementById(OVERLAY_ID)?.remove();
    window.USFRFirebase?.open?.();
  }

  async function completeSignIn() {
    const input = document.getElementById('emailLinkAddress');
    const errorNode = document.getElementById('emailLinkError');
    const button = document.getElementById('emailLinkContinue');
    const email = String(input?.value || '').trim().toLowerCase();
    errorNode.textContent = '';
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      errorNode.textContent = 'Enter the email address that received this link.';
      input?.focus();
      return;
    }

    button.disabled = true;
    button.textContent = 'Signing in…';
    try {
      const base = `https://www.gstatic.com/firebasejs/${VERSION}`;
      const [appModule, authModule] = await Promise.all([
        import(`${base}/firebase-app.js`),
        import(`${base}/firebase-auth.js`),
      ]);
      const app = appModule.getApps().length ? appModule.getApp() : null;
      if (!app) throw new Error('Account services are still loading. Try again in a moment.');
      const auth = authModule.getAuth(app);
      if (!authModule.isSignInWithEmailLink(auth, window.location.href)) {
        throw new Error('This sign-in link is invalid or has already been used. Request a new link.');
      }
      localStorage.setItem('usfr-email', email);
      await authModule.signInWithEmailLink(auth, email, window.location.href);
      localStorage.removeItem('usfr-email');
      sessionStorage.removeItem('usfr-email-link-needs-confirmation');
      history.replaceState({}, '', '/dashboard');
      document.getElementById(OVERLAY_ID)?.remove();
      window.dispatchEvent(new CustomEvent('usfr-email-link-complete'));
      setTimeout(() => {
        if (window.location.pathname !== '/dashboard') window.location.assign('/dashboard');
      }, 250);
    } catch (error) {
      console.error('In-app email-link confirmation failed', error);
      errorNode.textContent = String(error?.message || 'The sign-in link could not be completed.');
      button.disabled = false;
      button.textContent = 'Continue securely';
    }
  }

  const schedule = () => {
    if (!localStorage.getItem('usfr-email') && (promptIntercepted || sessionStorage.getItem('usfr-email-link-needs-confirmation') === '1')) {
      showConfirmation();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true });
  } else {
    schedule();
  }
  window.addEventListener('usfr-firebase-ready', schedule);
  setTimeout(schedule, 1200);
})();