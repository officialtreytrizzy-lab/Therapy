(function accessibilityHardening() {
  'use strict';

  const actionLabels = {
    close: 'Close',
    back: 'Go back',
    menu: 'Open menu',
    copy: 'Copy',
    delete: 'Delete',
    remove: 'Remove',
    refresh: 'Refresh',
    retry: 'Retry',
    send: 'Send',
    save: 'Save',
    settings: 'Open settings',
  };
  let lastPath = location.pathname;

  function readableAction(element) {
    const raw = [element.getAttribute('data-a'), element.id, element.title]
      .filter(Boolean)
      .join(' ')
      .replace(/[-_]+/g, ' ')
      .trim();
    if (!raw) return '';
    const key = Object.keys(actionLabels).find(name => raw.toLowerCase().includes(name));
    return key ? actionLabels[key] : raw.replace(/\b\w/g, char => char.toUpperCase()).slice(0, 80);
  }

  function ensureName(element) {
    const visible = String(element.textContent || '').replace(/\s+/g, ' ').trim();
    if (visible || element.getAttribute('aria-label') || element.getAttribute('aria-labelledby')) return;
    const label = readableAction(element);
    if (label) element.setAttribute('aria-label', label);
  }

  function ensureFieldLabel(field) {
    if (field.getAttribute('aria-label') || field.getAttribute('aria-labelledby')) return;
    if (field.id) {
      const escaped = window.CSS?.escape ? CSS.escape(field.id) : field.id.replace(/[^A-Za-z0-9_-]/g, '');
      const explicit = escaped && document.querySelector(`label[for="${escaped}"]`);
      if (explicit) return;
      const wrapping = field.closest('label');
      if (wrapping) return;
      const nearby = field.parentElement?.querySelector(':scope > label');
      if (nearby) {
        nearby.setAttribute('for', field.id);
        return;
      }
    }
    const fallback = field.getAttribute('placeholder') || field.getAttribute('name') || field.id;
    if (fallback) field.setAttribute('aria-label', fallback.replace(/[-_]+/g, ' '));
  }

  function ensureDialog(dialog) {
    dialog.setAttribute('role', dialog.getAttribute('role') || 'dialog');
    dialog.setAttribute('aria-modal', dialog.getAttribute('aria-modal') || 'true');
    if (dialog.getAttribute('aria-label') || dialog.getAttribute('aria-labelledby')) return;
    const heading = dialog.querySelector('h1,h2,h3');
    if (!heading) {
      dialog.setAttribute('aria-label', 'Dialog');
      return;
    }
    if (!heading.id) heading.id = `dialog-title-${crypto.randomUUID?.() || Date.now()}`;
    dialog.setAttribute('aria-labelledby', heading.id);
  }

  function harden(root) {
    const scope = root?.querySelectorAll ? root : document;
    scope.querySelectorAll('button,a[href]').forEach(ensureName);
    scope.querySelectorAll('input,textarea,select').forEach(ensureFieldLabel);
    scope.querySelectorAll('.modal,.fb2-back,[role="dialog"]').forEach(ensureDialog);
    scope.querySelectorAll('img:not([alt])').forEach(image => image.setAttribute('alt', ''));
    scope.querySelectorAll('a[target="_blank"]').forEach(link => {
      const rel = new Set(String(link.rel || '').split(/\s+/).filter(Boolean));
      rel.add('noopener');
      rel.add('noreferrer');
      link.rel = [...rel].join(' ');
    });
  }

  function announceRoute() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    requestAnimationFrame(() => {
      const heading = document.querySelector('#app h1, #app [role="heading"]');
      const live = document.getElementById('usfr-route-status');
      if (live) live.textContent = heading?.textContent?.trim() || document.title;
      if (heading instanceof HTMLElement) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: false });
      }
    });
  }

  function bootstrap() {
    if (!document.querySelector('.usfr-skip-link')) {
      const skip = document.createElement('a');
      skip.className = 'usfr-skip-link';
      skip.href = '#app';
      skip.textContent = 'Skip to main content';
      document.body.prepend(skip);
    }
    const app = document.getElementById('app');
    if (app) {
      app.setAttribute('tabindex', '-1');
      app.setAttribute('aria-label', app.getAttribute('aria-label') || 'US, FOR REAL application');
    }
    if (!document.getElementById('usfr-route-status')) {
      const live = document.createElement('div');
      live.id = 'usfr-route-status';
      live.className = 'usfr-sr-only';
      live.setAttribute('role', 'status');
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('aria-atomic', 'true');
      document.body.append(live);
    }
    harden(document);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) harden(node);
        }
      }
      announceRoute();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    addEventListener('popstate', announceRoute);
    document.addEventListener('click', () => setTimeout(announceRoute, 0), true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  else bootstrap();
})();
