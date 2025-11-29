// Dark mode toggle script (flubber-enabled version — restored)
(function(){
  'use strict';
  const storageKey = 'greudespus-theme';
  const className = 'dark-theme';
  const root = document.documentElement;

  function applyTheme(theme){
    if(theme === 'dark') root.classList.add(className);
    else root.classList.remove(className);
  }

  function getStored(){
    try{ return localStorage.getItem(storageKey); } catch(e){ return null; }
  }

  function setStored(v){
    try{ localStorage.setItem(storageKey, v); } catch(e){}
  }

  // initialize: check storage -> then prefers-color-scheme
  let theme = getStored();
  if(!theme){
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    theme = prefersDark ? 'dark' : 'light';
  }
  applyTheme(theme);

  // Create the button markup (polished SVG icons) if present
  function ensureButtonContent(btn){
    if(!btn) return;
    if(btn.dataset.gdsInitialized) return;
    const sunPath = 'M12 6a6 6 0 1 0 0 12a6 6 0 1 0 0-12z';
    const moonPath = 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z';
    btn.innerHTML = '';
    // create SVG programmatically to avoid template parsing issues in some browsers
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox','0 0 24 24');
    svg.setAttribute('aria-hidden','true');
    svg.setAttribute('focusable','false');
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('id','gdsTogglePath');
    path.setAttribute('d', theme === 'dark' ? moonPath : sunPath);
    path.setAttribute('fill','currentColor');
    path.style.opacity = 1;
    path.style.transition = 'opacity .22s ease';
    svg.appendChild(path);
    btn.appendChild(svg);
    const span = document.createElement('span');
    span.className = 'label visually-hidden';
    span.textContent = 'Toggle theme';
    btn.appendChild(span);

    btn.dataset.gdsSun = sunPath;
    btn.dataset.gdsMoon = moonPath;
    btn._interpSunToMoon = null;
    btn._interpMoonToSun = null;
    btn.dataset.gdsInitialized = '1';
  }

  function toggle(){
    const btn = document.getElementById('themeToggle');
    if(!btn) return;
    const active = root.classList.contains(className) ? 'dark' : 'light';
    const next = active === 'dark' ? 'light' : 'dark';
    // determine from/to shapes based on previous (active) state
    const from = active === 'dark' ? btn.dataset.gdsMoon : btn.dataset.gdsSun;
    const to = active === 'dark' ? btn.dataset.gdsSun : btn.dataset.gdsMoon;

    // toggle theme first (so DOM reflects new styles quickly)
    applyTheme(next);
    setStored(next);
    updateButton();

    // animate icon: prefer precomputed interpolators
    const pathEl = btn.querySelector && btn.querySelector('#gdsTogglePath');
    if(!pathEl) return;

    // choose correct precomputed interpolator based on previous state
    let useInterp = null;
    if(active === 'dark') useInterp = btn._interpMoonToSun || null;
    else useInterp = btn._interpSunToMoon || null;

    if(useInterp && typeof useInterp === 'function'){
      try{
        const interpolator = useInterp;
        const duration = 220;
        const start = performance.now();
        (function frame(now){
          const t = Math.min(1, (now - start) / duration);
          try{ pathEl.setAttribute('d', interpolator(t)); }catch(e){}
          if(t < 1) requestAnimationFrame(frame);
        })(start);
        return;
      }catch(e){ /* ignore and fallback */ }
    }

    // fallback crossfade with cheap immediate swap if interpolator not available
    if(from && to){
      try{
        const svg = pathEl.ownerSVGElement || pathEl.parentNode;
        const ghost = pathEl.cloneNode(true);
        ghost.setAttribute('d', to);
        ghost.style.opacity = 0;
        ghost.style.transition = 'opacity .28s ease';
        svg.appendChild(ghost);
        // force reflow
        void ghost.getBoundingClientRect();
        requestAnimationFrame(function(){
          ghost.style.opacity = 1;
          pathEl.style.opacity = 0;
        });
        setTimeout(function(){
          try{ pathEl.setAttribute('d', to); }catch(e){}
          pathEl.style.opacity = 1;
          try{ svg.removeChild(ghost); }catch(e){}
        }, 340);
      }catch(e){ /* ignore */ }
    }
  }

  function updateButton(){
    const btn = document.getElementById('themeToggle');
    if(!btn) return;
    const isDark = root.classList.contains(className);
    btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    btn.classList.toggle('is-dark', isDark);
    const label = btn.querySelector('.label');
    if(label) label.textContent = isDark ? 'Tema întunecată' : 'Tema deschisă';
    const pathEl = btn.querySelector && btn.querySelector('#gdsTogglePath');
    if(pathEl){
      const target = isDark ? btn.dataset.gdsMoon : btn.dataset.gdsSun;
      // only force-set shape when no interpolator exists
      if(!(window.flubber && typeof window.flubber.interpolate === 'function') && !(btn._interpSunToMoon || btn._interpMoonToSun)){
        try{ pathEl.setAttribute('d', target); }catch(e){}
      }
    }
  }

  // Precompute interpolators asynchronously to avoid blocking initial render
  document.addEventListener('DOMContentLoaded', function(){
    const btn = document.getElementById('themeToggle');
    if(!btn) return;
    ensureButtonContent(btn);
    // attach handler once
    if(!btn._gdsHandlerAttached){ btn.addEventListener('click', toggle); btn._gdsHandlerAttached = true; }

    function doPrecompute(){
      try{
        const sun = btn.dataset.gdsSun;
        const moon = btn.dataset.gdsMoon;
        // prefer high-quality flubber if available on window.flubber
        if(window.flubber && typeof window.flubber.interpolate === 'function'){
          // compute using a slightly larger maxSegmentLength to keep perf reasonable
          try{
            btn._interpSunToMoon = window.flubber.interpolate(sun, moon, {maxSegmentLength:4});
            btn._interpMoonToSun = window.flubber.interpolate(moon, sun, {maxSegmentLength:4});
          }catch(e){ /* if flubber compute fails, fallback to simpleMorph below */ }
        }
        // cheap fallback (fast) - compute immediately if available
        if((!btn._interpSunToMoon || !btn._interpMoonToSun) && window.simpleMorph && typeof window.simpleMorph.interpolate === 'function'){
          try{
            btn._interpSunToMoon = btn._interpSunToMoon || window.simpleMorph.interpolate(sun, moon);
            btn._interpMoonToSun = btn._interpMoonToSun || window.simpleMorph.interpolate(moon, sun);
          }catch(e){}
        }
      }catch(e){ /* ignore */ }
    }

    // schedule precompute during idle or after a short delay
    if('requestIdleCallback' in window){
      try{ requestIdleCallback(doPrecompute, {timeout: 500}); }catch(e){ setTimeout(doPrecompute, 120); }
    } else {
      setTimeout(doPrecompute, 120);
    }

    updateButton();
  });

  // expose for debugging
  window.gdsTheme = {toggle: toggle, applyTheme: applyTheme};
})();
