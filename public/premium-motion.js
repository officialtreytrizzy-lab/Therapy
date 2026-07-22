/* =========================================================================
   premium-motion.js  ·  Runtime for the polish layer
   For: us-for-real-couple-wellness ("Therapy")
   Framework-agnostic: hooks the existing vanilla-SPA render/route cycle via
   history + MutationObserver, so it needs zero knowledge of internal render().
   Purely additive and fully wrapped in try/catch — it can never break the app.
   ========================================================================= */
(function(){
  "use strict";
  if (window.__pmMotion) return;
  window.__pmMotion = true;

  var RM = false;
  try { RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch(e){}

  /* 1) Guarantee safe-area insets resolve on iOS (needs viewport-fit=cover) */
  try {
    var vp = document.querySelector('meta[name="viewport"]');
    if (vp && !/viewport-fit/i.test(vp.content)) {
      vp.setAttribute('content', vp.content.replace(/\s*$/,'') + ', viewport-fit=cover');
    }
  } catch(e){}

  /* 2) --pm-vh fallback for the Safari URL-bar height jump (older iOS) */
  function setVH(){
    try {
      var h = (window.visualViewport ? window.visualViewport.height : window.innerHeight);
      document.documentElement.style.setProperty('--pm-vh', (h * 0.01) + 'px');
    } catch(e){}
  }
  setVH();
  addEventListener('resize', setVH, {passive:true});
  if (window.visualViewport) visualViewport.addEventListener('resize', setVH, {passive:true});

  /* Honor reduced motion: keep the iOS fixes above, wire no motion below. */
  if (RM) return;

  var REVEAL_SEL = '.card, .deck, .item, .privacy-card, .stat, .lesson-card,' +
                   ' .guide-note, .page-head, .deck-grid > *';
  var RIPPLE_SEL = '.btn, button, .choice, .session-type, .lesson-card';

  var io = ('IntersectionObserver' in window)
    ? new IntersectionObserver(function(entries){
        entries.forEach(function(en){
          if (en.isIntersecting){ en.target.classList.add('pm-in'); io.unobserve(en.target); }
        });
      }, { rootMargin:'0px 0px -8% 0px', threshold:0.05 })
    : null;

  function tagReveals(scope){
    try {
      if (!io){ return; }
      var root = scope || document;
      var page = (root.matches && root.matches('.page')) ? root
               : (root.querySelector ? root.querySelector('.page') : null);
      var container = page || root;
      if (!container.querySelectorAll) return;
      var nodes = container.querySelectorAll(REVEAL_SEL), i = 0;
      Array.prototype.forEach.call(nodes, function(n){
        if (n.__pm) return;
        n.__pm = true;
        n.classList.add('pm-reveal');
        n.style.setProperty('--pm-i', Math.min(i, 8));
        io.observe(n);
        i++;
      });
    } catch(e){}
  }

  function animatePage(){
    try {
      var page = document.querySelector('main.page') || document.querySelector('.page');
      if (!page) return;
      page.classList.remove('pm-page-enter');
      void page.offsetWidth;               /* force reflow to retrigger */
      page.classList.add('pm-page-enter');
      tagReveals(page);
    } catch(e){}
  }

  /* 3) Hook client-side route changes (pushState / replaceState / back-fwd) */
  ['pushState','replaceState'].forEach(function(m){
    var orig = history[m];
    if (typeof orig !== 'function') return;
    history[m] = function(){
      var r = orig.apply(this, arguments);
      try { dispatchEvent(new Event('pm:route')); } catch(e){}
      return r;
    };
  });
  addEventListener('popstate', function(){ try{ dispatchEvent(new Event('pm:route')); }catch(e){} });
  addEventListener('pm:route', function(){
    requestAnimationFrame(function(){ requestAnimationFrame(animatePage); });
  });

  /* 4) Fallback: catch view swaps that replace innerHTML without a route push */
  var scanT;
  function scheduleScan(){ clearTimeout(scanT); scanT = setTimeout(function(){ tagReveals(document); }, 40); }
  try {
    var mo = new MutationObserver(function(muts){
      for (var k=0;k<muts.length;k++){
        var added = muts[k].addedNodes;
        for (var j=0;j<added.length;j++){
          var node = added[j];
          if (node.nodeType === 1 &&
              ((node.matches && node.matches('.page')) ||
               (node.querySelector && node.querySelector('.page, .card, .guide-note')))){
            scheduleScan();
            return;
          }
        }
      }
    });
    mo.observe(document.body, { childList:true, subtree:true });
  } catch(e){}

  /* 5) Press ripple (delegated, safe on clip-friendly controls only) */
  addEventListener('pointerdown', function(ev){
    try {
      var t = ev.target.closest && ev.target.closest(RIPPLE_SEL);
      if (!t) return;
      var cs = getComputedStyle(t);
      if (cs.position === 'static') t.style.position = 'relative';
      if (cs.overflow === 'visible') t.style.overflow = 'hidden';
      var r = t.getBoundingClientRect();
      var size = Math.max(r.width, r.height);
      var sp = document.createElement('span');
      sp.className = 'pm-ripple';
      sp.style.width = sp.style.height = size + 'px';
      sp.style.left = (ev.clientX - r.left - size/2) + 'px';
      sp.style.top  = (ev.clientY - r.top  - size/2) + 'px';
      t.appendChild(sp);
      setTimeout(function(){ if (sp && sp.parentNode) sp.parentNode.removeChild(sp); }, 640);
    } catch(e){}
  }, {passive:true});

  /* 6) First paint */
  function boot(){ animatePage(); tagReveals(document); }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
  else boot();
})();
