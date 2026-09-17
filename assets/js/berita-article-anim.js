/**
 * berita-article-anim.js
 * Randomized text animation system — premium, subtle, CMS-compatible
 * Replaces inline <script> in generated articles.
 *
 * Animasi tersedia:
 *   fade-up     — naik + fade (klasik editorial)
 *   fade-in     — pure fade, tanpa movement
 *   slide-left  — geser dari kiri
 *   blur-reveal — blur + naik sedikit
 *   scale-reveal — scale kecil + naik
 *
 * Setiap elemen teks mendapat animasi sesuai tipe & random pool-nya.
 * Stagger delay dihitung berurutan per-section agar natural.
 */
(function () {
  'use strict';

  /* ── Prefers reduced motion: skip semua animasi ── */
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Pastikan IntersectionObserver tersedia ── */
  var hasIO = 'IntersectionObserver' in window;

  /* ── Animation pools per-element role ──
     Setiap role memiliki pool animasi yang cocok.
     Random dipilih dari pool saat init. */
  var ANIM_POOLS = {
    kicker:    ['fade-in', 'fade-up'],
    title:     ['fade-up', 'blur-reveal'],
    desc:      ['fade-up', 'fade-in'],
    byline:    ['fade-in'],
    'h2':      ['fade-up', 'slide-left', 'blur-reveal'],
    'h3':      ['fade-up', 'slide-left'],
    'p':       ['fade-up', 'fade-in'],
    'first-p': ['fade-up', 'blur-reveal'],
    blockquote:['scale-reveal', 'fade-up'],
    figure:    ['scale-reveal', 'fade-up'],
    li:        ['fade-in', 'fade-up'],
    cta:       ['scale-reveal'],
    generic:   ['fade-up', 'fade-in']
  };

  function pickAnim(role) {
    var pool = ANIM_POOLS[role] || ANIM_POOLS.generic;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* ── Assign [data-anim] ke elemen ── */
  function assignAnimations() {
    /* Hero elements */
    var kicker = document.querySelector('.news-kicker');
    var title  = document.querySelector('.news-hero__title');
    var desc   = document.querySelector('.news-hero__desc');
    var byline = document.querySelector('.news-byline');
    var heroImg = document.querySelector('.news-hero__image');

    setAnim(kicker,  'kicker',  0);
    setAnim(title,   'title',   1);
    setAnim(desc,    'desc',    2);
    setAnim(byline,  'byline',  3);
    setAnim(heroImg, 'figure',  0); /* hero image: no delay */

    /* Content elements */
    var content = document.querySelector('.news-content');
    if (!content) return;

    var children = content.children;
    var stagger = 0;
    var isFirstP = true;

    for (var i = 0; i < children.length; i++) {
      var el = children[i];
      var tag = el.tagName.toLowerCase();

      if (tag === 'p') {
        var role = isFirstP ? 'first-p' : 'p';
        isFirstP = false;
        setAnim(el, role, stagger % 3); /* max 3 stagger levels */
        stagger++;
      } else if (tag === 'h2') {
        stagger = 0; /* reset stagger per-section */
        setAnim(el, 'h2', 0);
        stagger++;
      } else if (tag === 'h3') {
        setAnim(el, 'h3', 0);
        stagger++;
      } else if (tag === 'blockquote') {
        setAnim(el, 'blockquote', 0);
        stagger = 0;
      } else if (tag === 'figure' || el.classList.contains('art-inline-image')) {
        setAnim(el, 'figure', 0);
        stagger = 0;
      } else if (tag === 'ul' || tag === 'ol') {
        /* Animasi pada parent list, bukan tiap li */
        setAnim(el, 'li', 0);
        stagger++;
      } else if (el.classList.contains('art-cta-wrap') ||
                 el.classList.contains('berita-cta-inline')) {
        setAnim(el, 'cta', 0);
        stagger = 0;
      } else {
        setAnim(el, 'generic', stagger % 2);
        stagger++;
      }
    }

    /* TOC */
    var toc = document.querySelector('.article-toc');
    setAnim(toc, 'generic', 0);

    /* Final CTA & Related news */
    var finalCta = document.querySelector('.news-final-cta');
    var related  = document.querySelector('.related-news');
    setAnim(finalCta, 'cta', 0);
    setAnim(related,  'generic', 0);
  }

  function setAnim(el, role, delayLevel) {
    if (!el) return;
    /* Skip jika sudah ada [data-anim] (manual override dari CMS) */
    if (el.hasAttribute('data-anim')) return;
    el.setAttribute('data-anim', pickAnim(role));
    if (delayLevel > 0) el.setAttribute('data-delay', String(delayLevel));
  }

  /* ── Observer: tambahkan .is-visible saat masuk viewport ── */
  function initObserver() {
    var targets = document.querySelectorAll('[data-anim], .reveal-on-scroll');
    if (!targets.length) return;

    if (reducedMotion || !hasIO) {
      /* Langsung visible semua */
      targets.forEach(function (el) {
        el.classList.add('is-visible');
      });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.08,
      rootMargin: '0px 0px -40px 0px'
    });

    targets.forEach(function (el) { io.observe(el); });
  }

  /* ── Init ── */
  function init() {
    if (reducedMotion) {
      /* Ensure all potentially-animated elements are already visible */
      document.querySelectorAll('[data-anim], .reveal-on-scroll').forEach(function (el) {
        el.classList.add('is-visible');
      });
      return;
    }

    assignAnimations();
    initObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
