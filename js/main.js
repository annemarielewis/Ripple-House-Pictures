/* ==========================================================================
   Ripple House — shared site behaviour
   No frameworks, no build step. Everything here is vanilla JS.
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Hero: background reel -> freeze on last frame -> precise entrance timeline ----------
     Driven by two plain local <video> elements (media/banner_web.mp4 and
     media/cinematography_reel_web.mp4) — no external API/network dependency:
       1. Background reel autoplays permanently muted, at full/normal brightness
          (no controls of any kind on it — not even a mute toggle, and nothing else
          on the page is visible — see body.intro-pending in css/style.css); once
          it reports it's actually playing, the hero-bg-video wrapper fades in from
          black over .5s (CSS opacity transition). It is never dimmed while playing.
       2. We poll playback time against duration and pause a hair before the true end,
          so it freezes on (essentially) its last frame instead of looping/flashing
          back to frame 0.
       3. That freeze is the ONLY trigger for what happens next: beginEntrance(),
          which runs this exact timeline from a single t=0 origin (absolute
          setTimeout delays, not chained, so the offsets stay exact):
            t=0.000s  "Ripple House" AND the navigation menu (see
                      .nav-controls in css/style.css) start fading in
                      together (see .site-nav .brand) AND the background
                      starts dimming by 20% (see .hero-bg-video.is-dimmed)
                      — all three over exactly 2.5s, finishing at t=2.500s.
            t=1.000s  the overlay video starts fading in, over exactly 1s
                      (see .video-frame) — this overlaps the tail end of
                      the brand/nav/dim animation above by design.
            t=2.125s  .125s after that fade completes, the caption below the
                      reel starts typing itself out, at 4.5x the base
                      per-character rate (see typewriter() below) — and, at
                      this exact same instant, the awards/logo scroller
                      behind it starts sliding on from the right at a fixed
                      speed (AWARDS_SPEED below) and, the instant it's fully
                      on screen, keeps going at that exact same speed in a
                      seamless, indefinite loop (see startAwardsScroll()). */
  const bgVideo = document.getElementById('hero-bg-video-el');
  const overlayVideo = document.getElementById('hero-overlay-video-el');
  // Set synchronously, before first paint, by the inline <script> at the
  // top of index.html's <body> (see its comment for the full rationale) —
  // true only when this visitor already played the entrance earlier in
  // the current site session (sessionStorage), which is exactly the
  // "already visited or clicked Home" case the skip behavior targets.
  const skipIntro = document.body.classList.contains('intro-skip');

  if (bgVideo || overlayVideo) {
    const bgWrap = document.querySelector('.hero-bg-video');
    const overlayWrap = document.querySelector('.hero-overlay');
    const overlayMuteToggle = document.querySelector('.overlay-mute-toggle');
    const heroLink = document.querySelector('.hero-link');
    const typedTextEl = heroLink ? heroLink.querySelector('.typed-text') : null;
    const typedCursorEl = heroLink ? heroLink.querySelector('.typed-cursor') : null;
    const belowReel = document.querySelector('.hero-below-reel');
    const videoFrame = document.querySelector('.hero-overlay .video-frame');
    const heroInner = document.querySelector('.hero-inner');
    const awardsBand = document.querySelector('.awards-band');
    const awardsEnter = document.querySelector('.awards-enter');
    const awardsTrack = document.querySelector('.awards-track');
    const awardsSet = document.querySelector('.awards-set');
    // Fixed px/s speed for the whole awards scroller — entrance AND loop
    // both move at exactly this rate (see startAwardsScroll() below), so
    // there's one constant speed throughout with no separate/faster
    // entrance phase. This is 2x the strip's previous steady-state speed
    // (a ~1216.6px set width over a 30s loop, ~40.55px/s), doubled.
    const AWARDS_SPEED = 81.1; // px/s

    let watcherStarted = false;
    let entranceStarted = false;
    let overlayMuted = true;

    // Keeps .hero-below-reel (the caption + awards scroller) anchored to
    // start exactly at the reel's rendered bottom edge, so flex centering
    // inside it lands both dead center in the space between the reel and
    // the bottom of the viewport. The reel's own position/size never
    // changes because of this — it's only ever read, never written — but
    // it IS responsive (width: 70vw, aspect-ratio-driven height), so this
    // has to be re-measured on load and on every resize.
    function positionBelowReel() {
      if (!belowReel || !videoFrame || !heroInner) return;
      const videoBottom = videoFrame.getBoundingClientRect().bottom;
      const innerTop = heroInner.getBoundingClientRect().top;
      belowReel.style.top = Math.max(0, videoBottom - innerTop) + 'px';
    }
    positionBelowReel();
    window.addEventListener('resize', positionBelowReel);

    // Starts the awards/logo scroller — called from the exact same
    // setTimeout tick as typewriter() below, so the two are perfectly
    // synchronized. Re-measures positionBelowReel() first in case a resize
    // happened during the intro.
    //
    // Timing is computed, not hardcoded, so both phases hold the exact
    // same AWARDS_SPEED:
    //   - .awards-enter slides translateX(100vw) -> 0 (see css/style.css);
    //     100vw is a different PIXEL distance at every viewport width, so
    //     its duration has to be (current viewport width in px) / SPEED.
    //   - .awards-track then loops translateX(0) -> -50% forever; its
    //     duration is (one rendered .awards-set's width, incl. its
    //     trailing gap) / SPEED, and it's delayed to start exactly when
    //     the entrance's duration ends — so the entrance is finished and
    //     motionless (fill-mode: forwards) the instant the loop picks up,
    //     and only one of the two is ever actually moving. That hand-off,
    //     not a shared speed alone, is what removes the old compounding
    //     ("fast entrance, slower settle") effect entirely.
    function startAwardsScroll() {
      positionBelowReel();
      if (!awardsBand || !awardsEnter || !awardsTrack || !awardsSet) return;
      const viewportWidth = awardsBand.getBoundingClientRect().width || window.innerWidth;
      const setWidth = awardsSet.getBoundingClientRect().width;
      const enterDuration = viewportWidth / AWARDS_SPEED;
      const loopDuration = setWidth / AWARDS_SPEED;
      awardsEnter.style.animationDuration = enterDuration + 's';
      awardsTrack.style.animationDuration = loopDuration + 's';
      awardsTrack.style.animationDelay = enterDuration + 's';
      awardsBand.classList.add('is-scrolling');
    }

    // Types the caption (read from the link's aria-label, so the visible
    // text and the accessible name can never drift apart) one character at
    // a time with a little random jitter for a natural feel. The cursor
    // starts blinking the instant this fires and is never told to stop, so
    // it keeps blinking after the last character lands too.
    function typewriter() {
      if (!heroLink || !typedTextEl) return;
      const fullText = heroLink.getAttribute('aria-label') || '';
      heroLink.classList.add('is-typing');
      if (typedCursorEl) typedCursorEl.classList.add('is-visible');
      let i = 0;
      const typeNext = () => {
        if (i >= fullText.length) return;
        typedTextEl.textContent += fullText.charAt(i);
        i++;
        setTimeout(typeNext, 63 + Math.random() * 76.5); // ~63–139.5ms per character (2x faster than the prior 126–279ms rate)
      };
      typeNext();
    }

    // Fires once, the instant the background reel freezes on its last frame
    // (or, via the safety-net timeout below, if it never gets there at
    // all). This is t=0.000s of the timeline described in the comment
    // above — everything from here on is scheduled from this single origin.
    // On a repeat Home visit this session (skipIntro), every delay below
    // collapses to 0 — same calls, same classes, same typewriter()/
    // startAwardsScroll(), just fired back-to-back on one tick instead of
    // spread across the timeline, and the transitions those classes gate
    // are themselves neutralized to 0s under body.intro-skip (see
    // css/style.css), so nothing here animates into view — it's just
    // already-settled chrome, with typing starting essentially instantly.
    // The first-visit path (skipIntro === false) is completely unchanged.
    function beginEntrance() {
      if (entranceStarted) return;
      entranceStarted = true;

      if (bgWrap) bgWrap.classList.add('is-dimmed');   // t=0.000s — 20% dim over 2.5s (instant when skipIntro)
      document.body.classList.remove('intro-pending'); // t=0.000s — brand + nav menu fade in over 2.5s (instant when skipIntro)

      setTimeout(() => {                                // t=1.000s (t=0 when skipIntro)
        if (overlayWrap) overlayWrap.classList.add('is-visible'); // video-frame fades in over 1s (instant when skipIntro)
        if (overlayVideo) {
          overlayVideo.muted = true; // stays muted until the visitor opts in
          overlayVideo.play().catch(() => {});
        }
      }, skipIntro ? 0 : 1000);

      setTimeout(() => {                                // t=2.125s (t=0 when skipIntro)
        startAwardsScroll(); // awards images start entering from the right...
        typewriter();        // ...at the exact same instant typing begins
      }, skipIntro ? 0 : 2125);
    }

    function watchForFreeze() {
      if (watcherStarted || !bgVideo) return;
      watcherStarted = true;
      const onTimeUpdate = () => {
        const dur = bgVideo.duration;
        const cur = bgVideo.currentTime;
        // pause a hair before the true end so it freezes cleanly on
        // (essentially) its last frame instead of looping/flashing.
        if (dur > 0 && cur > 0 && dur - cur < 0.15) {
          bgVideo.removeEventListener('timeupdate', onTimeUpdate);
          bgVideo.pause();
          beginEntrance(); // freeze is the trigger — t=0.000s of the timeline above
        }
      };
      bgVideo.addEventListener('timeupdate', onTimeUpdate);
    }

    if (bgVideo) {
      if (skipIntro) {
        // Repeat visit: never play the reel from frame 0. Instead, jump
        // straight to (essentially) its last frame — the same point
        // watchForFreeze() below pauses on for a first-time visit — and
        // reveal it there directly, skipping the play-through entirely.
        const jumpToFrozenFrame = () => {
          const dur = bgVideo.duration;
          if (dur > 0 && isFinite(dur)) {
            const onSeeked = () => {
              bgVideo.removeEventListener('seeked', onSeeked);
              if (bgWrap) bgWrap.classList.add('is-ready');
              beginEntrance();
            };
            bgVideo.addEventListener('seeked', onSeeked);
            bgVideo.currentTime = Math.max(0, dur - 0.15);
          } else {
            // Duration not available (e.g. load failure) — still reveal
            // rather than leaving the hero blank.
            if (bgWrap) bgWrap.classList.add('is-ready');
            beginEntrance();
          }
        };
        if (bgVideo.readyState >= 1) { // HAVE_METADATA already
          jumpToFrozenFrame();
        } else {
          bgVideo.addEventListener('loadedmetadata', jumpToFrozenFrame, { once: true });
        }
      } else {
        bgVideo.addEventListener('playing', () => {
          if (bgWrap) requestAnimationFrame(() => bgWrap.classList.add('is-ready'));
          watchForFreeze();
        });
        // No "autoplay" attribute on this visit path either (see
        // index.html) — this direct call is now what starts playback,
        // same as it already covered browsers needing the explicit nudge.
        bgVideo.play().catch(() => {});
      }
    }

    // Safety net: if the reel never gets to freeze (e.g. the file fails to
    // load), still bring everything up after a few seconds so the page isn't
    // left permanently blank.
    setTimeout(beginEntrance, 8000);

    if (overlayMuteToggle) {
      const overlayIcon = overlayMuteToggle.querySelector('.mute-icon');
      overlayMuteToggle.addEventListener('click', () => {
        if (!overlayVideo) return;
        overlayMuted = !overlayMuted;
        overlayVideo.muted = overlayMuted;
        overlayMuteToggle.setAttribute('aria-pressed', String(!overlayMuted));
        overlayMuteToggle.setAttribute('aria-label', overlayMuted ? 'Unmute video' : 'Mute video');
        if (overlayIcon) overlayIcon.classList.toggle('is-on', !overlayMuted);
      });
    }
  }

  /* ---------- Nav: solid-on-scroll + mobile toggle ---------- */
  const nav = document.querySelector('.site-nav');
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');

  const onScroll = () => {
    if (!nav) return;
    nav.classList.toggle('is-scrolled', window.scrollY > 12);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const open = navToggle.classList.toggle('is-open');
      navLinks.classList.toggle('is-open', open);
      navToggle.setAttribute('aria-expanded', String(open));
    });
    navLinks.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        navToggle.classList.remove('is-open');
        navLinks.classList.remove('is-open');
      });
    });
  }

  /* ---------- Tape-counter scroll readout (signature element) ---------- */
  const counter = document.querySelector('.tape-counter .reading');
  if (counter) {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? window.scrollY / max : 0;
      const totalSeconds = Math.floor(pct * 599); // fake 0:00–9:59 tape reel
      const m = Math.floor(totalSeconds / 60);
      const s = String(totalSeconds % 60).padStart(2, '0');
      counter.textContent = `${m}:${s}`;
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  /* ---------- FAQ accordion ---------- */
  document.querySelectorAll('.faq-item').forEach(item => {
    const q = item.querySelector('.faq-q');
    const a = item.querySelector('.faq-a');
    if (!q || !a) return;
    q.addEventListener('click', () => {
      const isOpen = item.classList.contains('is-open');
      // close siblings
      item.parentElement.querySelectorAll('.faq-item.is-open').forEach(sib => {
        if (sib !== item) {
          sib.classList.remove('is-open');
          sib.querySelector('.faq-a').style.maxHeight = null;
          sib.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
        }
      });
      item.classList.toggle('is-open', !isOpen);
      q.setAttribute('aria-expanded', String(!isOpen));
      a.style.maxHeight = !isOpen ? a.scrollHeight + 'px' : null;
    });
  });

  /* ---------- Slideshow (Live Action page) ----------
     Page-agnostic, same pattern as the FAQ accordion above: guarded on
     .slideshow existing, so this is a no-op everywhere else. A single
     <img> has its src swapped on navigation (rather than pre-rendering all
     104 slides into the DOM), so only the current slide plus its two
     immediate neighbors (preloaded below) are ever fetched. */
  document.querySelectorAll('.slideshow').forEach(el => {
    const count = parseInt(el.getAttribute('data-slide-count'), 10) || 0;
    const base = el.getAttribute('data-slide-base') || '';
    const ext = el.getAttribute('data-slide-ext') || '.jpg';
    const pad = parseInt(el.getAttribute('data-slide-pad'), 10) || 3;
    const img = el.querySelector('.slideshow-img');
    const prevBtn = el.querySelector('.slideshow-prev');
    const nextBtn = el.querySelector('.slideshow-next');
    const currentEl = el.querySelector('.slideshow-current');
    const totalEl = el.querySelector('.slideshow-total');
    if (!count || !img) return;

    let index = 1; // 1-based

    const slidePath = (n) => `${base}${String(n).padStart(pad, '0')}${ext}`;
    const preload = (n) => { const im = new Image(); im.src = slidePath(n); };

    const render = () => {
      img.src = slidePath(index);
      img.alt = `Live Action slideshow, slide ${index} of ${count}`;
      if (currentEl) currentEl.textContent = String(index);
      preload(index === count ? 1 : index + 1);
      preload(index === 1 ? count : index - 1);
    };

    const go = (delta) => {
      index = ((index - 1 + delta + count) % count) + 1;
      render();
    };

    prevBtn?.addEventListener('click', () => go(-1));
    nextBtn?.addEventListener('click', () => go(1));

    el.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    });

    // touch swipe (mobile)
    let touchStartX = null;
    el.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (touchStartX === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      touchStartX = null;
    }, { passive: true });

    if (totalEl) totalEl.textContent = String(count);
    render();
  });

  /* ---------- About page: tab switcher (About / My Passion / Experience) ----------
     Standard ARIA tablist pattern — click, or Left/Right arrow keys while a
     tab has focus, switches which .about-panel is shown and moves the
     "active" (--brass-light) styling to the matching .about-tab. Fully
     guarded on .about-tab existing, so this is a no-op on every other page
     — only about.html has these elements. */
  const aboutTabs = Array.from(document.querySelectorAll('.about-tab'));
  if (aboutTabs.length) {
    const aboutPanels = document.querySelectorAll('.about-panel');
    const activateAboutTab = (tab) => {
      if (!tab || tab.classList.contains('is-active')) return;
      aboutTabs.forEach(t => {
        const isTarget = t === tab;
        t.classList.toggle('is-active', isTarget);
        t.setAttribute('aria-selected', String(isTarget));
        t.tabIndex = isTarget ? 0 : -1;
      });
      aboutPanels.forEach(p => {
        p.hidden = p.id !== tab.getAttribute('aria-controls');
      });
    };
    aboutTabs.forEach((tab, i) => {
      tab.tabIndex = tab.classList.contains('is-active') ? 0 : -1;
      tab.addEventListener('click', () => activateAboutTab(tab));
      tab.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const next = aboutTabs[(i + dir + aboutTabs.length) % aboutTabs.length];
        next.focus();
        activateAboutTab(next);
      });
    });
  }

  /* ---------- Video modal (popup overlay embed) ---------- */
  const modal = document.getElementById('video-modal');
  if (modal) {
    const frame = modal.querySelector('iframe');
    const closeBtn = modal.querySelector('.video-modal-close');
    const backdropClose = (e) => { if (e.target === modal) close(); };

    const open = (embedUrl) => {
      frame.src = embedUrl + (embedUrl.includes('?') ? '&' : '?') + 'autoplay=1';
      modal.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    };
    const close = () => {
      modal.classList.remove('is-open');
      frame.src = '';
      document.body.style.overflow = '';
    };

    document.querySelectorAll('[data-video-popup]').forEach(trigger => {
      trigger.addEventListener('click', () => open(trigger.getAttribute('data-video-popup')));
    });
    closeBtn?.addEventListener('click', close);
    modal.addEventListener('click', backdropClose);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }

  /* ---------- Claymation/Storyboard video modal (local file playback) ----------
     Separate id/data-attribute from the iframe-based #video-modal above
     (that one is unused elsewhere on the site, but this stays fully
     independent regardless) — this modal plays a local <video> instead of
     an embed. Reuses the same .video-modal/.video-modal-inner/
     .video-modal-close/.video-frame/.video-modal-label CSS. Guarded on
     #clay-video-modal existing, so this only runs on claymation.html. */
  const clayModal = document.getElementById('clay-video-modal');
  if (clayModal) {
    const player = clayModal.querySelector('.clay-video-modal-player');
    const clayCloseBtn = clayModal.querySelector('.video-modal-close');
    const clayLabel = clayModal.querySelector('.video-modal-label');
    const clayBackdropClose = (e) => { if (e.target === clayModal) clayClose(); };

    const clayOpen = (src, label) => {
      player.src = src;
      clayLabel.textContent = label || '';
      clayModal.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      player.play().catch(() => {});
    };
    const clayClose = () => {
      clayModal.classList.remove('is-open');
      player.pause();
      player.removeAttribute('src');
      player.load();
      document.body.style.overflow = '';
    };

    document.querySelectorAll('[data-clay-video]').forEach(trigger => {
      trigger.addEventListener('click', () => clayOpen(trigger.getAttribute('data-clay-video'), trigger.getAttribute('data-video-label')));
    });
    clayCloseBtn?.addEventListener('click', clayClose);
    clayModal.addEventListener('click', clayBackdropClose);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && clayModal.classList.contains('is-open')) clayClose(); });
  }

  /* ---------- Contact drawer ---------- */
  const drawer = document.getElementById('contact-drawer');
  const drawerBackdrop = document.getElementById('contact-backdrop');
  if (drawer && drawerBackdrop) {
    const openDrawer = () => {
      drawer.classList.add('is-open');
      drawerBackdrop.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    };
    const closeDrawer = () => {
      drawer.classList.remove('is-open');
      drawerBackdrop.classList.remove('is-open');
      document.body.style.overflow = '';
    };
    document.querySelectorAll('.talk-trigger').forEach(t => t.addEventListener('click', (e) => {
      e.preventDefault();
      openDrawer();
    }));
    drawer.querySelector('.contact-drawer-close')?.addEventListener('click', closeDrawer);
    drawerBackdrop.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

    /* Static-site form handling: this demo just shows a success message.
       Wire this up to Formspree, Netlify Forms, Getform, or similar for
       a real inbox — see README for notes. */
    const form = document.getElementById('contact-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        form.querySelector('.form-msg.success')?.classList.add('is-visible');
        form.reset();
      });
    }
  }

  /* ---------- Discog: lightweight custom audio player ---------- */
  const tracks = document.querySelectorAll('.track[data-audio]');
  if (tracks.length) {
    let currentAudio = null;
    let currentTrack = null;

    tracks.forEach(track => {
      const btn = track.querySelector('.track-play');
      const src = track.getAttribute('data-audio');
      btn.addEventListener('click', () => {
        if (currentTrack === track) {
          // toggle play/pause on the same track
          if (currentAudio.paused) { currentAudio.play(); track.classList.add('is-playing'); }
          else { currentAudio.pause(); track.classList.remove('is-playing'); }
          return;
        }
        // switch tracks
        if (currentAudio) { currentAudio.pause(); currentTrack?.classList.remove('is-playing'); }
        currentAudio = new Audio(src);
        currentTrack = track;
        currentAudio.play().catch(() => {
          /* file likely missing until real audio is dropped into /audio */
        });
        track.classList.add('is-playing');
        currentAudio.addEventListener('ended', () => track.classList.remove('is-playing'));
      });
    });
  }

  /* ---------- Active nav link ---------- */
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (href === path || (path === '' && href === 'index.html')) {
      a.classList.add('is-active');
    }
  });

  /* ---------- Scroll reveal (e.g. the MISSION section) ----------
     Any .reveal-on-scroll element fades/rises in the first time it enters
     the viewport, then is left alone — this is a one-shot "reveal", not a
     repeating scroll effect, and it's separate from the hero's own
     page-load entrance timeline above. Elements start hidden via CSS; if
     IntersectionObserver isn't available, reveal everything immediately
     rather than leaving content permanently invisible. */
  const revealEls = document.querySelectorAll('.reveal-on-scroll');
  if (revealEls.length) {
    if ('IntersectionObserver' in window) {
      const revealObserver = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.2, rootMargin: '0px 0px -10% 0px' });
      revealEls.forEach(el => revealObserver.observe(el));
    } else {
      revealEls.forEach(el => el.classList.add('is-visible'));
    }
  }

});
