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

  // Same facts as the component cards below, copied verbatim so the
  // diagram's live panel never says anything the cards don't already say.
  var partsData = {
    'battery': {
      name: '5V Battery', category: 'power', cardId: 'card-battery',
      desc: "The device's single power source — a 5V battery that supplies every other component with the energy it needs to run.",
      specs: [['Output', '5V']]
    },
    'switch': {
      name: 'Rocker Switch', category: 'power', cardId: 'card-switch',
      desc: "A simple on/off switch sitting between the battery and the Arduino. Flip it to power the whole device on or off.",
      specs: [['Wired between', 'Battery \u2192 Arduino 5V pin']]
    },
    'arduino': {
      name: 'Arduino Nano', category: 'compute', cardId: 'card-arduino',
      desc: "The device's decision-maker. This small microcontroller runs all of the logic — reading both distance sensors and deciding when and how the buzzers should sound.",
      specs: [
        ['Handles', 'Sensor reading & buzzer-alert logic'],
        ['Connects to', 'D2/D3 (left sensor), D6/D7 (right sensor), D4 (left buzzer), D5 (right buzzer)']
      ]
    },
    'lidar-left': {
      name: 'Left TF-Luna LiDAR Sensor', category: 'sensing', cardId: 'card-lidar-left',
      desc: "An infrared distance sensor aimed at the wearer's left side. It measures how far away the nearest object is, using a narrow beam so it reads the direction it's pointed in rather than a wide area.",
      specs: [
        ['Connection', 'UART (SoftwareSerial) \u2014 D2 (RX), D3 (TX)'],
        ['Beam width', '2\u00b0, narrow'],
        ['Reliable range', 'Up to 8m; ~2.5m on dark surfaces'],
        ['Blind spot', '~20cm minimum']
      ]
    },
    'lidar-right': {
      name: 'Right TF-Luna LiDAR Sensor', category: 'sensing', cardId: 'card-lidar-right',
      desc: "The mirror image of the left sensor, aimed at the wearer's right side, with identical specifications.",
      specs: [
        ['Connection', 'UART (SoftwareSerial) \u2014 D6 (RX), D7 (TX)'],
        ['Beam width', '2\u00b0, narrow'],
        ['Reliable range', 'Up to 8m; ~2.5m on dark surfaces'],
        ['Blind spot', '~20cm minimum']
      ]
    },
    'buzzer-left': {
      name: 'Left Buzzer', category: 'alerting', cardId: 'card-buzzer-left',
      desc: "An active buzzer that sounds the moment it's powered — no tone signal required. It's the wearer's audible warning for obstacles on the left.",
      specs: [['Connected to', 'D4']]
    },
    'buzzer-right': {
      name: 'Right Buzzer', category: 'alerting', cardId: 'card-buzzer-right',
      desc: "The right-side counterpart to the left buzzer, warning the wearer about obstacles on their right.",
      specs: [['Connected to', 'D5']]
    },
    'ground': {
      name: 'Common Ground Bus', category: 'power', cardId: 'card-ground',
      desc: "Every component's negative connection — the battery, the Arduino, both sensors, and both buzzers — is tied to one shared ground, giving the whole circuit a common reference point.",
      specs: [['Ties together', 'Battery (\u2013), Arduino, both sensors, both buzzers']]
    },
    'bus5v': {
      name: 'Common 5V Bus', category: 'power', cardId: 'card-5vbus',
      desc: "A shared power line carrying 5V from the switched battery to the Arduino and both LiDAR sensors, so one power path feeds the entire sensing system.",
      specs: [['Powers', 'Arduino, left LiDAR, right LiDAR']]
    }
  };

  var categoryLabels = { power: 'Power', compute: 'Compute', sensing: 'Sensing', alerting: 'Alerting' };
  var categoryClasses = ['card--power', 'card--compute', 'card--sensing', 'card--alerting'];

  function initInteractiveDiagram() {
    var hotspots = Array.prototype.slice.call(document.querySelectorAll('.hotspot'));
    var panel = document.getElementById('diagram-panel');
    var hint = document.getElementById('diagram-panel-hint');
    var body = document.getElementById('diagram-panel-body');
    var tagEl = document.getElementById('panel-tag');
    var titleEl = document.getElementById('panel-title');
    var descEl = document.getElementById('panel-desc');
    var specsEl = document.getElementById('panel-specs');
    if (!hotspots.length || !panel || !hint || !body) return;

    var pinnedBtn = null;

    function setActiveButton(btn) {
      hotspots.forEach(function (h) { h.classList.toggle('is-active', h === btn); });
    }

    function highlightCard(cardId) {
      var prev = document.querySelectorAll('.card.is-diagram-highlight');
      prev.forEach(function (c) { c.classList.remove('is-diagram-highlight'); });
      if (cardId) {
        var card = document.getElementById(cardId);
        if (card) card.classList.add('is-diagram-highlight');
      }
    }

    function showPart(part) {
      var data = partsData[part];
      if (!data) return;
      hint.hidden = true;
      body.hidden = false;
      categoryClasses.forEach(function (c) { panel.classList.remove(c); });
      panel.classList.add('card--' + data.category);
      tagEl.textContent = categoryLabels[data.category] || '';
      titleEl.textContent = data.name;
      descEl.textContent = data.desc;
      specsEl.innerHTML = '';
      (data.specs || []).forEach(function (pair) {
        var row = document.createElement('div');
        row.className = 'specs__row';
        var dt = document.createElement('dt');
        dt.textContent = pair[0];
        var dd = document.createElement('dd');
        dd.textContent = pair[1];
        row.appendChild(dt);
        row.appendChild(dd);
        specsEl.appendChild(row);
      });
      highlightCard(data.cardId);
    }

    function revert() {
      if (pinnedBtn) {
        showPart(pinnedBtn.getAttribute('data-part'));
        setActiveButton(pinnedBtn);
      } else {
        hint.hidden = false;
        body.hidden = true;
        categoryClasses.forEach(function (c) { panel.classList.remove(c); });
        setActiveButton(null);
        highlightCard(null);
      }
    }

    hotspots.forEach(function (btn) {
      var part = btn.getAttribute('data-part');

      btn.addEventListener('mouseenter', function () {
        showPart(part);
        setActiveButton(btn);
      });
      btn.addEventListener('focus', function () {
        showPart(part);
        setActiveButton(btn);
      });
      btn.addEventListener('mouseleave', revert);
      btn.addEventListener('blur', revert);

      btn.addEventListener('click', function () {
        if (pinnedBtn === btn) {
          pinnedBtn = null;
          revert();
        } else {
          pinnedBtn = btn;
          showPart(part);
          setActiveButton(btn);
        }
      });
    });
  }

  function initFlowDiagram() {
    var nodes = Array.prototype.slice.call(document.querySelectorAll('.flow-node'));
    var caption = document.getElementById('flow-caption');
    if (!nodes.length || !caption) return;

    var defaultCaption = caption.textContent;

    var nodePaths = {
      'left-sensor': ['ls-mcu'],
      'right-sensor': ['rs-mcu'],
      'mcu': ['ls-mcu', 'rs-mcu', 'mcu-lb', 'mcu-rb'],
      'left-buzzer': ['mcu-lb'],
      'right-buzzer': ['mcu-rb']
    };

    var flowCaptions = {
      'left-sensor': 'Measures distance on the left side, continuously.',
      'right-sensor': 'Measures distance on the right side, continuously.',
      'mcu': 'Reads both sensors, verifies each checksum, and classifies the distance into a zone.',
      'left-buzzer': 'Beeps in the pattern that matches the current zone.',
      'right-buzzer': 'Beeps in the pattern that matches the current zone.'
    };

    function clearActive() {
      nodes.forEach(function (n) { n.classList.remove('is-active'); });
      Array.prototype.slice.call(document.querySelectorAll('.flow-path.is-active')).forEach(function (p) {
        p.classList.remove('is-active');
      });
    }

    function activate(node) {
      clearActive();
      var part = node.getAttribute('data-node');
      node.classList.add('is-active');
      (nodePaths[part] || []).forEach(function (pid) {
        var pathEl = document.querySelector('.flow-path[data-path="' + pid + '"]');
        if (pathEl) pathEl.classList.add('is-active');
      });
      caption.textContent = flowCaptions[part] || defaultCaption;
    }

    function reset() {
      clearActive();
      caption.textContent = defaultCaption;
    }

    nodes.forEach(function (node) {
      node.addEventListener('mouseenter', function () { activate(node); });
      node.addEventListener('focus', function () { activate(node); });
      node.addEventListener('mouseleave', reset);
      node.addEventListener('blur', reset);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initNavScrollState();
    initMobileMenu();
    initScrollReveal();
    initLightbox();
    initSearch();
    initInteractiveDiagram();
    initFlowDiagram();
  });
})();
