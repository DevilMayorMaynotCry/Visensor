(function () {
  'use strict';

  function initNavScrollState() {
    var nav = document.querySelector('.nav');
    if (!nav) return;
    function update() {
      if (window.scrollY > 12) {
        nav.classList.add('is-scrolled');
      } else {
        nav.classList.remove('is-scrolled');
      }
    }
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  function initMobileMenu() {
    var toggle = document.getElementById('nav-menu-toggle');
    var links = document.getElementById('nav-links');
    if (!toggle || !links) return;

    toggle.addEventListener('click', function () {
      var isOpen = links.classList.toggle('is-open');
      toggle.classList.toggle('is-open', isOpen);
      toggle.setAttribute('aria-expanded', String(isOpen));
    });

    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        links.classList.remove('is-open');
        toggle.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  function initScrollReveal() {
    var revealEls = document.querySelectorAll('.reveal');
    if (!revealEls.length) return;

    if (!('IntersectionObserver' in window)) {
      revealEls.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    revealEls.forEach(function (el) { observer.observe(el); });
  }

  function initLightbox() {
    var trigger = document.getElementById('schematic-trigger');
    var lightbox = document.getElementById('lightbox');
    var closeBtn = document.getElementById('lightbox-close');
    if (!trigger || !lightbox || !closeBtn) return;

    function openLightbox() {
      lightbox.hidden = false;
      document.body.classList.add('no-scroll');
      closeBtn.focus();
    }
    function closeLightbox() {
      lightbox.hidden = true;
      document.body.classList.remove('no-scroll');
      trigger.focus();
    }

    trigger.addEventListener('click', openLightbox);
    closeBtn.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) closeLightbox();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
    });
  }

  function initSearch() {
    var input = document.getElementById('site-search');
    var clearBtn = document.getElementById('search-clear');
    var statusEl = document.getElementById('search-status');
    if (!input || !clearBtn || !statusEl) return;

    var indexEls = Array.prototype.slice.call(document.querySelectorAll('[data-search]'));
    var lastScrolledId = null;
    var debounceTimer = null;

    function runSearch(rawQuery) {
      var q = rawQuery.trim().toLowerCase();

      if (!q) {
        indexEls.forEach(function (el) {
          el.classList.remove('is-match', 'is-dim');
        });
        statusEl.hidden = true;
        statusEl.textContent = '';
        lastScrolledId = null;
        return;
      }

      var firstMatch = null;
      var matchCount = 0;

      indexEls.forEach(function (el) {
        var haystack = (el.getAttribute('data-search') || '').toLowerCase();
        var isMatch = haystack.indexOf(q) !== -1;
        el.classList.toggle('is-match', isMatch);
        el.classList.toggle('is-dim', !isMatch);
        if (isMatch) {
          matchCount++;
          // Force-reveal matches immediately so a highlighted card below the
          // fold isn't invisible while it waits for its own scroll-reveal.
          el.classList.add('is-visible');
          if (!firstMatch) firstMatch = el;
        }
      });

      if (matchCount === 0) {
        statusEl.hidden = false;
        statusEl.textContent = 'No components match "' + rawQuery.trim() + '".';
      } else {
        statusEl.hidden = true;
        statusEl.textContent = '';
        if (firstMatch && firstMatch.id !== lastScrolledId) {
          firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
          lastScrolledId = firstMatch.id;
        }
      }
    }

    input.addEventListener('input', function (e) {
      var value = e.target.value;
      clearBtn.hidden = value.length === 0;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () { runSearch(value); }, 200);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        input.value = '';
        clearBtn.hidden = true;
        runSearch('');
        input.blur();
      }
    });

    clearBtn.addEventListener('click', function () {
      input.value = '';
      clearBtn.hidden = true;
      runSearch('');
      input.focus();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initNavScrollState();
    initMobileMenu();
    initScrollReveal();
    initLightbox();
    initSearch();
  });
})();
