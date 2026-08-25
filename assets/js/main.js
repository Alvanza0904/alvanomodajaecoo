/* =============================================================
   OMODA JAECOO PALEMBANG — GLOBAL INTERACTIONS
   Adapted from the current OMODA Palembang project.
============================================================= */
(function(){
  'use strict';

  var navbar=document.getElementById('navbar');
  function updateNavbar(){
    if(!navbar) return;
    navbar.classList.toggle('is-scrolled',window.scrollY>12);
  }
  updateNavbar();
  window.addEventListener('scroll',updateNavbar,{passive:true});

  var toggle=document.getElementById('navbarToggle');
  var menu=document.getElementById('navbarMenu');
  function closeMenu(){
    if(!toggle||!menu)return;
    toggle.setAttribute('aria-expanded','false');
    menu.classList.remove('is-open');
    document.body.style.overflow='';
  }
  if(toggle&&menu){
    toggle.addEventListener('click',function(){
      var open=menu.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded',String(open));
      document.body.style.overflow=open?'hidden':'';
    });
    menu.querySelectorAll('.navbar__link').forEach(function(link){
      link.addEventListener('click',closeMenu);
    });
    window.addEventListener('resize',function(){if(window.innerWidth>860)closeMenu();});
  }

  /* O4 hero video: graceful fallback */
  var hero=document.getElementById('hero');
  var video=document.getElementById('heroVideo');
  if(hero&&video){
    var reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduced){
      hero.classList.add('is-video-error');
    }else{
      video.addEventListener('loadeddata',function(){hero.classList.add('is-video-ready');},{once:true});
      var play=video.play();
      if(play&&play.catch){
        play.then(function(){hero.classList.add('is-video-ready');})
          .catch(function(){hero.classList.add('is-video-error');});
      }
      video.addEventListener('error',function(){hero.classList.add('is-video-error');});
    }
  }

  /* Scroll reveal */
  var reveal=document.querySelectorAll('.reveal');
  var reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reveal.length){
    if(reducedMotion||!('IntersectionObserver' in window)){
      reveal.forEach(function(el){el.classList.add('is-inview');});
    }else{
      var observer=new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(entry.isIntersecting){
            entry.target.classList.add('is-inview');
            observer.unobserve(entry.target);
          }
        });
      },{threshold:.14,rootMargin:'0px 0px -50px 0px'});
      reveal.forEach(function(el){observer.observe(el);});
    }
  }

  /* Homepage hero video slider — existing slider structure/copy preserved,
     timing now driven by each slide's own video (ended event) instead of
     a fixed timer. Falls back to a fixed timer only for reduced-motion
     or if a given video fails to load/play. */
  var heroBgs=[].slice.call(document.querySelectorAll('.hero-bg-video'));
  var dots=[].slice.call(document.querySelectorAll('.hero-dot'));
  var prev=document.getElementById('heroPrev'), next=document.getElementById('heroNext');
  var eyebrow=document.getElementById('heroEyebrow'), title=document.getElementById('heroTitle');
  var description=document.getElementById('heroDescription'), primary=document.getElementById('heroPrimary');
  if(heroBgs.length){
    var slides=[
      {eyebrow:'OMODA O4 EV · PALEMBANG',title:'First AI<br>For Everyone.',description:'Electric mobility dengan desain Cyber Mecha dan jarak tempuh hingga 553 km NEDC.',href:'/omoda-o4/',cta:'Lihat OMODA O4'},
      {eyebrow:'JAECOO J5 EV · PALEMBANG',title:'This Is The<br>Real SUV.',description:'SUV listrik premium dengan baterai CATL LFP, motor 130 kW, dan karakter berkendara yang praktis untuk mobilitas harian.',href:'/jaecoo-j5.html',cta:'Lihat JAECOO J5'}
    ];
    var heroReducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var videos=heroBgs.map(function(bg){return bg.querySelector('.hero-bg-video__el');});
    var i=0,fallbackTimer,heroPaused=false;

    function clearFallback(){clearTimeout(fallbackTimer);}

    /* Fallback timer only used when a slide's video can't drive timing itself
       (reduced motion, or the video failed to load/play). */
    function scheduleFallback(){
      clearFallback();
      fallbackTimer=setTimeout(function(){advance();},6500);
    }

    function stopVideo(v){
      if(!v)return;
      try{v.pause();v.currentTime=0;}catch(e){}
    }

    function playActiveVideo(){
      var v=videos[i];
      if(!v||heroReducedMotion){scheduleFallback();return;}
      if(v.classList.contains('is-error')){scheduleFallback();return;}
      clearFallback();
      try{v.currentTime=0;}catch(e){}
      var p=v.play();
      if(p&&p.catch){
        p.then(function(){v.classList.add('is-ready');})
          .catch(function(){v.classList.add('is-error');scheduleFallback();});
      }else{
        v.classList.add('is-ready');
      }
    }

    var heroEl=document.querySelector('.hero-slider');

    function show(n,fromUser){
      i=(n+slides.length)%slides.length;
      /* Presentational only — lets CSS give each slide its own typography/
         positioning based on video composition. Does not touch video
         playback, timing, or the ended-event slide logic below. */
      if(heroEl)heroEl.setAttribute('data-active-slide',String(i));
      heroBgs.forEach(function(bg,k){bg.classList.toggle('is-active',k===i);});
      videos.forEach(function(v,k){if(k!==i)stopVideo(v);});
      dots.forEach(function(d,k){d.classList.toggle('active',k===i);});
      var s=slides[i];
      if(eyebrow)eyebrow.textContent=s.eyebrow;
      if(title)title.innerHTML=s.title;
      if(description)description.textContent=s.description;
      if(primary){primary.href=s.href;primary.textContent=s.cta;}
      if(!heroPaused)playActiveVideo();
    }

    function advance(){show(i+1);}
    function goTo(n){show(n);}

    /* One 'ended' listener per video, bound once — each only fires while
       its own slide is the active/playing one, so there is no risk of a
       duplicate or stray listener skipping slides. */
    videos.forEach(function(v,k){
      if(!v)return;
      v.addEventListener('ended',function(){if(k===i)advance();});
      v.addEventListener('error',function(){v.classList.add('is-error');if(k===i)scheduleFallback();});
    });

    dots.forEach(function(d,k){d.addEventListener('click',function(){goTo(k);});});
    if(prev)prev.addEventListener('click',function(){goTo(i-1);});
    if(next)next.addEventListener('click',function(){goTo(i+1);});

    /* Pause/resume with tab visibility so an inactive tab doesn't keep
       decoding video or silently advance slides while unseen. */
    document.addEventListener('visibilitychange',function(){
      if(document.hidden){
        heroPaused=true;clearFallback();
        var v=videos[i];if(v)try{v.pause();}catch(e){}
      }else{
        heroPaused=false;playActiveVideo();
      }
    });

    show(0);
  }
})();

/* =============================================================
   COLOR CONFIGURATOR — OMODA O4 & JAECOO J5
   Lightweight, no dependencies. Works for any .color-config
   or .j5-color-config section that follows the data-cc-* API.
============================================================= */
(function () {
  'use strict';

  /**
   * Boot one color configurator.
   * @param {HTMLElement} section  — .color-config or .j5-color-config
   */
  function initConfigurator(section) {
    var swatches = section.querySelectorAll('.cc-swatch');
    var images   = section.querySelectorAll('.cc-stage__img');
    var nameEl   = section.querySelector('.cc-color-name');
    var descEl   = section.querySelector('.cc-color-desc');
    var infoEl   = section.querySelector('.cc-info');

    if (!swatches.length) return;

    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function select(index) {
      // Update aria-selected
      swatches.forEach(function (sw, i) {
        sw.setAttribute('aria-selected', i === index ? 'true' : 'false');
      });

      // Cross-fade image
      images.forEach(function (img, i) {
        img.classList.toggle('is-active', i === index);
      });

      // Update text with fade (skip if reduced-motion)
      var newName = swatches[index].dataset.colorName || '';
      var newDesc = swatches[index].dataset.colorDesc || '';

      if (reducedMotion || !infoEl) {
        if (nameEl) nameEl.textContent = newName;
        if (descEl) descEl.textContent = newDesc;
      } else {
        infoEl.classList.add('is-transitioning');
        setTimeout(function () {
          if (nameEl) nameEl.textContent = newName;
          if (descEl) descEl.textContent = newDesc;
          infoEl.classList.remove('is-transitioning');
        }, 200);
      }
    }

    // Attach swatch click & keyboard
    swatches.forEach(function (sw, i) {
      sw.addEventListener('click', function () { select(i); });
      sw.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select(i);
        }
        // Arrow key navigation
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          select((i + 1) % swatches.length);
          swatches[(i + 1) % swatches.length].focus();
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          select((i - 1 + swatches.length) % swatches.length);
          swatches[(i - 1 + swatches.length) % swatches.length].focus();
        }
      });
    });

    // Show first color on load
    select(0);
  }

  // Boot all configurators on the page
  document.querySelectorAll('.color-config, .j5-color-config').forEach(initConfigurator);
})();
