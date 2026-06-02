/* Beacon Studio — demo interactions
   Requires global THREE (loaded via <script> before this file).
   Drives: 3D hero, scroll reveal, progress bar, tilt cards, counters. */
(function(){
  "use strict";
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- read themed colors from CSS so 3D matches the niche ---- */
  function cssVar(name, fallback){
    var v = getComputedStyle(document.body).getPropertyValue(name).trim();
    return v || fallback;
  }

  /* ---------------- 3D HERO ---------------- */
  function hero3d(){
    var canvas = document.getElementById('bg3d');
    if(!canvas || typeof THREE === 'undefined') return;

    var motif = document.body.dataset.motif || 'studio';
    var brand  = new THREE.Color(cssVar('--brand', '#5ad1ff'));
    var brand2 = new THREE.Color(cssVar('--brand-2', '#3b6fff'));

    var renderer = new THREE.WebGLRenderer({canvas:canvas, antialias:true, alpha:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 6);

    /* lights */
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    var key = new THREE.PointLight(brand.getHex(), 2.4, 60);   key.position.set(5, 6, 6);  scene.add(key);
    var rim = new THREE.PointLight(brand2.getHex(), 2.0, 60);  rim.position.set(-6, -3, 4); scene.add(rim);

    /* geometry per niche */
    var geo, faceted = false, organic = false, spin = 0.0016;
    switch(motif){
      case 'dental':  geo = new THREE.IcosahedronGeometry(1.55, 1); faceted = true;  organic = true;  break;
      case 'medspa':  geo = new THREE.SphereGeometry(1.6, 48, 48);                    organic = true;  break;
      case 'hvac':    geo = new THREE.TorusKnotGeometry(1.1, 0.36, 160, 24);          spin = 0.0024;   break;
      case 'law':     geo = new THREE.OctahedronGeometry(1.7, 0);  faceted = true;                     break;
      case 'fitness': geo = new THREE.TorusKnotGeometry(1.0, 0.34, 180, 24, 2, 3);    spin = 0.0040;   break;
      case 'roofing': geo = new THREE.ConeGeometry(1.7, 1.8, 4, 1); faceted = true;                    break;
      default:        geo = new THREE.IcosahedronGeometry(1.55, 1); faceted = true;   organic = true;
    }

    var mat = new THREE.MeshStandardMaterial({
      color: brand, metalness: 0.55, roughness: 0.22, flatShading: faceted
    });
    var mesh = new THREE.Mesh(geo, mat);
    if(motif === 'roofing') mesh.rotation.y = Math.PI/4;
    scene.add(mesh);

    /* glowing wireframe shell */
    var wire = new THREE.Mesh(
      geo.clone(),
      new THREE.MeshBasicMaterial({color:brand2, wireframe:true, transparent:true, opacity:0.18})
    );
    wire.scale.setScalar(1.28);
    scene.add(wire);

    /* store base positions for organic wobble */
    var base = null;
    if(organic){
      base = geo.attributes.position.array.slice(0);
    }

    /* particle field */
    var COUNT = 720, pos = new Float32Array(COUNT*3);
    for(var i=0;i<COUNT;i++){
      var r = 6 + Math.random()*9, th = Math.random()*Math.PI*2, ph = Math.acos(2*Math.random()-1);
      pos[i*3]   = r*Math.sin(ph)*Math.cos(th);
      pos[i*3+1] = r*Math.sin(ph)*Math.sin(th);
      pos[i*3+2] = r*Math.cos(ph);
    }
    var pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
    var stars = new THREE.Points(pg, new THREE.PointsMaterial({
      color:brand2, size:0.045, transparent:true, opacity:0.7, sizeAttenuation:true,
      blending:THREE.AdditiveBlending, depthWrite:false
    }));
    scene.add(stars);

    /* pointer parallax */
    var px = 0, py = 0, tx = 0, ty = 0;
    window.addEventListener('pointermove', function(e){
      tx = (e.clientX / window.innerWidth  - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
    }, {passive:true});

    function resize(){
      var w = canvas.clientWidth || canvas.offsetWidth, h = canvas.clientHeight || canvas.offsetHeight;
      if(!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w/h; camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

    function wobble(t){
      var p = geo.attributes.position.array, n = p.length/3;
      for(var i=0;i<n;i++){
        var ix=i*3, ox=base[ix], oy=base[ix+1], oz=base[ix+2];
        var len = Math.sqrt(ox*ox+oy*oy+oz*oz) || 1;
        var d = 1 + 0.07*Math.sin(t*1.4 + ix*0.7) + 0.05*Math.sin(t*2.1 + oy*3.0);
        p[ix]   = ox/len * len*d;
        p[ix+1] = oy/len * len*d;
        p[ix+2] = oz/len * len*d;
      }
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
    }

    var t0 = performance.now();
    function frame(now){
      var t = (now - t0)/1000;
      mesh.rotation.x += spin; mesh.rotation.y += spin*1.4;
      wire.rotation.x -= spin*0.6; wire.rotation.y -= spin*0.9;
      stars.rotation.y += 0.0006;
      if(organic) wobble(t);
      px += (tx - px)*0.05; py += (ty - py)*0.05;
      camera.position.x = px*0.9;
      camera.position.y = -py*0.6;
      camera.lookAt(0,0,0);
      renderer.render(scene, camera);
      if(!reduce) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
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
    hero3d();
  });
})();
