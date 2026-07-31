(function legalLinks() {
  'use strict';
  function mount() {
    if (document.getElementById('usfr-legal-links')) return;
    const footer = document.createElement('footer');
    footer.id = 'usfr-legal-links';
    footer.className = 'usfr-legal-links';
    footer.setAttribute('aria-label', 'Legal and safety information');
    const links = [
      ['/privacy.html', 'Privacy'],
      ['/terms.html', 'Terms'],
      ['/wellness-safety.html', 'AI and wellness safety'],
      ['/crisis', 'Immediate support'],
    ];
    links.forEach(([href, label], index) => {
      if (index) footer.append(document.createTextNode(' · '));
      const link = document.createElement('a');
      link.href = href;
      link.textContent = label;
      footer.append(link);
    });
    document.body.append(footer);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
