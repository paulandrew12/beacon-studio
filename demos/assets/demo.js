/* Beacon Studio — demo interactions
   Drives: hero video, scroll reveal, progress bar, tilt cards, counters. */
(function(){
  "use strict";
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- read themed colors from CSS so 3D matches the niche ---- */
  function cssVar(name, fallback){
    var v = getComputedStyle(document.body).getPropertyValue(name).trim();
    return v || fallback;
  }

  /* ---------------- hero video (replaces the old 3D hero) ---------------- */
  function heroVideo(){
    var vids = document.querySelectorAll('video.hero-video');
    if(!vids.length) return;
    vids.forEach(function(v){
      if(reduce){                 // reduced-motion: hold a still poster frame, no looping
        v.removeAttribute('autoplay');
        v.removeAttribute('loop');
        try{ v.pause(); }catch(e){}
        return;
      }
      // Nudge browsers that defer muted autoplay; if it's blocked the poster stays.
      var p = v.play();
      if(p && typeof p.catch === 'function') p.catch(function(){});
    });
  }

  /* ---------------- progress bar ---------------- */
  function progress(){
    var bar = document.getElementById('progress');
    if(!bar) return;
    window.addEventListener('scroll', function(){
      var h = document.documentElement.scrollHeight - innerHeight;
      bar.style.width = (h>0 ? (scrollY/h*100) : 0) + '%';
    }, {passive:true});
  }

  /* ---------------- scroll reveal ---------------- */
  function reveal(){
    var els = document.querySelectorAll('.reveal');
    if(reduce || !('IntersectionObserver' in window)){
      els.forEach(function(e){e.classList.add('in')}); return;
    }
    var io = new IntersectionObserver(function(ents){
      ents.forEach(function(en){ if(en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target);} });
    }, {threshold:0.12});
    els.forEach(function(e){io.observe(e)});
  }

  /* ---------------- tilt + shine cards ---------------- */
  function tilt(){
    if(reduce) return;
    document.querySelectorAll('.tilt').forEach(function(card){
      card.addEventListener('pointermove', function(e){
        var r = card.getBoundingClientRect();
        var cx = (e.clientX - r.left)/r.width, cy = (e.clientY - r.top)/r.height;
        card.style.transform = 'perspective(800px) rotateY('+((cx-0.5)*12)+'deg) rotateX('+((0.5-cy)*12)+'deg) translateY(-4px)';
        card.style.setProperty('--mx', (cx*100)+'%');
        card.style.setProperty('--my', (cy*100)+'%');
      });
      card.addEventListener('pointerleave', function(){ card.style.transform = ''; });
    });
  }

  /* ---------------- animated counters ---------------- */
  function counters(){
    var els = document.querySelectorAll('[data-count]');
    if(!('IntersectionObserver' in window)){ els.forEach(function(e){e.textContent=fmt(e)}); return; }
    function fmt(e){ return (e.dataset.pre||'') + (+e.dataset.count).toLocaleString() + (e.dataset.suf||''); }
    var io = new IntersectionObserver(function(ents){
      ents.forEach(function(en){
        if(!en.isIntersecting) return;
        var e = en.target, end = +e.dataset.count, t0 = performance.now(), dur = 1400;
        (function run(now){
          var k = Math.min((now-t0)/dur, 1), v = Math.floor((1-Math.pow(1-k,3))*end);
          e.textContent = (e.dataset.pre||'') + v.toLocaleString() + (e.dataset.suf||'');
          if(k<1) requestAnimationFrame(run);
        })(t0);
        io.unobserve(e);
      });
    }, {threshold:0.5});
    els.forEach(function(e){io.observe(e)});
  }

  document.addEventListener('DOMContentLoaded', function(){
    progress(); reveal(); tilt(); counters();
    heroVideo();
  });
})();
