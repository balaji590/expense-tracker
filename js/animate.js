/* Animate: tiny reusable helpers for count-up numbers and motion-safety checks.
   Kept separate from Utils/Charts because this is purely presentational timing logic,
   not business logic — matches the existing separation of concerns in this codebase. */
window.Animate = (function(){

  function prefersReducedMotion(){
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Animates a numeric value into an element's text content using a formatter (e.g. Utils.fmtMoney).
  // Skips straight to the final value when the user prefers reduced motion, when opts.instant is set
  // (e.g. a same-page refresh that shouldn't replay the full entrance animation), or for very small deltas.
  function countUp(el, toValue, opts){
    opts = opts || {};
    const duration = opts.duration || 600;
    const formatter = opts.formatter || (n => String(Math.round(n)));
    if(!el) return;

    if(prefersReducedMotion() || opts.instant){
      el.textContent = formatter(toValue);
      return;
    }

    const fromValue = 0;
    const start = performance.now();
    function tick(now){
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current = fromValue + (toValue - fromValue) * eased;
      el.textContent = formatter(current);
      if(progress < 1){
        requestAnimationFrame(tick);
      } else {
        el.textContent = formatter(toValue);
      }
    }
    requestAnimationFrame(tick);
  }

  // Applies a staggered entrance class to a NodeList/array of elements.
  function staggerIn(elements, opts){
    opts = opts || {};
    const step = opts.step || 45;
    const className = opts.className || 'enter-up';
    if(prefersReducedMotion()){
      return;
    }
    Array.from(elements).forEach((el, i)=>{
      el.style.animationDelay = (i * step) + 'ms';
      el.classList.add(className);
    });
  }

  // Animates an element's width from 0 to its target (used for progress bars that are
  // freshly inserted into the DOM on every render, so a plain CSS transition has no
  // "previous" width to animate from).
  function fillBar(el, targetPct){
    if(!el) return;
    if(prefersReducedMotion()){
      el.style.width = Math.max(0, Math.min(100, targetPct)) + '%';
      return;
    }
    el.style.width = '0%';
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        el.style.width = Math.max(0, Math.min(100, targetPct)) + '%';
      });
    });
  }

  return { prefersReducedMotion, countUp, staggerIn, fillBar };
})();
