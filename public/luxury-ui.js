(function () {
  const routesWithOrb = new Set(['/', '/dashboard', '/progress', '/sessions', '/onboarding', '/sign-up', '/sign-in']);
  let queued = false;

  function icon(name) {
    const icons = {
      home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 10.7 12 3.8l8.5 6.9v9.1h-6v-5.7h-5v5.7h-6z"/></svg>',
      sessions: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.3 16.8c-2.8-1.2-4.6-3.6-4.6-6.2 0-3.9 4.2-7.1 9.3-7.1s9.3 3.2 9.3 7.1-4.2 7.1-9.3 7.1c-.7 0-1.4-.1-2.1-.2L5.7 20z"/></svg>',
      insights: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V10m7 9V5m7 14v-7"/></svg>',
      account: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 21c.7-4 3.2-6 7.5-6s6.8 2 7.5 6"/></svg>'
    };
    return icons[name];
  }

  function navItem(path, label, name) {
    const active = location.pathname === path || (path !== '/dashboard' && location.pathname.startsWith(path + '/'));
    return `<a href="${path}" data-link class="lux-tab ${active ? 'active' : ''}">${icon(name)}<span>${label}</span></a>`;
  }

  function greeting() {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  }

  function decorate() {
    document.body.dataset.route = (location.pathname.split('/')[1] || 'landing').replace(/[^a-z0-9-]/gi, '');
    const shell = document.querySelector('.app-shell');
    if (shell && !document.querySelector('.lux-bottom-nav') && !document.querySelector('.premium-tabbar')) {
      shell.insertAdjacentHTML('beforeend', `<nav class="lux-bottom-nav" aria-label="Primary navigation">${navItem('/dashboard', 'Home', 'home')}${navItem('/sessions', 'Sessions', 'sessions')}${navItem('/progress', 'Insights', 'insights')}${navItem('/settings', 'Account', 'account')}</nav>`);
    }

    const main = document.querySelector('main.page, main.serious-session, main.hero, .onboarding');
    const needsOrb = routesWithOrb.has(location.pathname) || location.pathname.startsWith('/sessions/');
    if (main && needsOrb && !main.classList.contains('experience-page') && !main.querySelector(':scope > .lux-orb')) {
      main.insertAdjacentHTML('afterbegin', '<div class="lux-orb" aria-hidden="true"><i></i><i></i><i></i><span></span></div>');
    }

    if (location.pathname === '/dashboard') {
      const title = document.querySelector('.page-title');
      const subtitle = document.querySelector('.page-sub');
      const name = document.querySelector('.profile-meta strong')?.textContent?.trim().split(/\s+&\s+/)[0] || '';
      if (title && !title.dataset.luxuryCopy) {
        title.dataset.luxuryCopy = 'true';
        title.innerHTML = `${greeting()}${name ? ',<br>' + name : ''}.`;
      }
      if (subtitle && !subtitle.dataset.luxuryCopy) {
        subtitle.dataset.luxuryCopy = 'true';
        subtitle.textContent = 'A private space for honest progress.';
      }
    }

    document.querySelectorAll('.page-head').forEach(head => head.classList.add('lux-page-head'));
    document.querySelectorAll('.data-policy').forEach(note => note.setAttribute('role', 'note'));
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      decorate();
    });
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.getElementById('app'), { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  document.addEventListener('click', event => {
    if (event.target.closest('a[data-link]')) setTimeout(schedule, 0);
  });
  schedule();
})();
