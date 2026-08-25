// OMODA JAECOO Palembang - Main JS
(function() {
  'use strict';

  // Navbar toggle for mobile
  var toggle = document.getElementById('navbarToggle');
  var menu = document.getElementById('navbarMenu');
  if (toggle && menu) {
    toggle.addEventListener('click', function() {
      var expanded = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', !expanded);
      menu.classList.toggle('is-open');
    });
  }

  // Navbar scroll behavior
  var navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', function() {
      if (window.scrollY > 20) {
        navbar.classList.add('is-scrolled');
      } else {
        navbar.classList.remove('is-scrolled');
      }
    }, { passive: true });
  }
})();
