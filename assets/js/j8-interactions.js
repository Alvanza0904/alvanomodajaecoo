
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  ready(function () {
    var root = document.querySelector('.j8-page');
    if (!root) return;

    /* IntersectionObserver: deterministic, one-shot reveals. */
    var items = root.querySelectorAll('.j8-anim');
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
    } else {
      var observer = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var delay = Number(entry.target.getAttribute('data-delay') || 0);
          window.setTimeout(function () {
            entry.target.classList.add('is-visible');
          }, Number.isFinite(delay) ? delay : 0);
          obs.unobserve(entry.target);
        });
      }, { root: null, rootMargin: '0px', threshold: 0.15 });
      items.forEach(function (el) { observer.observe(el); });
    }

    /* J8 colour selector. */
    var vehicle = root.querySelector('[data-j8-color-image]');
    var name = root.querySelector('[data-j8-color-name]');
    root.querySelectorAll('[data-j8-color-src]').forEach(function (swatch) {
      swatch.addEventListener('click', function () {
        var src = swatch.getAttribute('data-j8-color-src');
        if (!src || !vehicle) return;
        root.querySelectorAll('[data-j8-color-src]').forEach(function (s) {
          s.setAttribute('aria-pressed', s === swatch ? 'true' : 'false');
        });
        vehicle.classList.add('is-fading');
        window.setTimeout(function () {
          vehicle.src = src;
          vehicle.alt = swatch.getAttribute('data-j8-color-alt') || '';
          if (name) name.textContent = swatch.getAttribute('data-j8-color-name') || '';
          vehicle.classList.remove('is-fading');
        }, 180);
      });
    });

    /* Accessible accordion. Multiple panels may remain open. */
    root.querySelectorAll('[data-j8-accordion-trigger]').forEach(function (trigger) {
      trigger.addEventListener('click', function () {
        var panelId = trigger.getAttribute('aria-controls');
        var panel = panelId ? document.getElementById(panelId) : null;
        if (!panel) return;
        var expanded = trigger.getAttribute('aria-expanded') === 'true';
        trigger.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        panel.hidden = false;
        panel.classList.toggle('is-open', !expanded);
        if (expanded) {
          window.setTimeout(function () {
            if (trigger.getAttribute('aria-expanded') === 'false') panel.hidden = true;
          }, 310);
        }
      });
      trigger.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          trigger.click();
        }
      });
    });

    /* Keep active J8 tab in view on narrow screens. */
    var nav = document.querySelector('.j8-subnav__inner');
    var active = document.querySelector('.j8-subnav__link--active');
    if (nav && active && window.innerWidth < 700) {
      nav.scrollLeft = Math.max(0, active.offsetLeft - nav.clientWidth / 2 + active.offsetWidth / 2);
    }
  });
})();
