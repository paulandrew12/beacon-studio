/* Beacon Studio — booking widget
   Real bookings against Supabase. Each demo page sets window.BEACON_SLUG.
   Loads after the supabase-js CDN bundle. No build step. */
(function () {
  'use strict';

  var CFG = {
    url: 'https://zsjqwtgbeocdspszaibb.supabase.co',
    key: 'sb_publishable_OyLDBq9UyUuZ525nGZL40A_yZXgkpjA'
  };
  CFG.fnBase = CFG.url + '/functions/v1';

  var SLUG = window.BEACON_SLUG;
  if (!SLUG) { console.warn('[beacon] window.BEACON_SLUG is not set — booking disabled'); return; }

  var sb = null;
  function client() {
    if (sb) return sb;
    if (!window.supabase || !window.supabase.createClient) return null;
    sb = window.supabase.createClient(CFG.url, CFG.key);
    return sb;
  }

  var BIZ = null;          // business profile (cached across opens)
  var built = false;
  var els = {};
  var state = freshState();

  function freshState() {
    return { step: 0, service: null, date: null, time: null, form: null, result: null, days: [] };
  }

  /* ---------- small helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }
  function sameDay(a, b) { return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function fmtTime(H, M) { var ap = H < 12 ? 'am' : 'pm'; var h = H % 12; if (h === 0) h = 12; return h + (M ? ':' + String(M).padStart(2, '0') : '') + ap; }
  function money(cur, amt) {
    amt = Number(amt || 0);
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: amt % 1 === 0 ? 0 : 2 }).format(amt); }
    catch (e) { return cur + ' ' + amt; }
  }
  function defChannel() { return BIZ && BIZ.country === 'KE' ? 'whatsapp' : 'sms'; }
  function friendly(code) {
    var m = {
      business_not_found: "This business isn't available for booking right now.",
      name_required: 'Please enter your name.',
      contact_required: 'Add a phone or email so we can confirm.',
      invalid_time: 'That time has passed — please pick another slot.'
    };
    return m[code] || 'Could not complete the booking. Please try again.';
  }

  /* ---------- timezone: convert a wall-clock time in the business tz to UTC ISO ---------- */
  function tzParts(date, tz) {
    var dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    var o = {};
    dtf.formatToParts(date).forEach(function (p) { if (p.type !== 'literal') o[p.type] = p.value; });
    return o;
  }
  function tzOffsetMs(date, tz) {
    try {
      var p = tzParts(date, tz);
      var asUTC = Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
      return asUTC - date.getTime();
    } catch (e) { return 0; }
  }
  function wallToISO(y, mon, d, H, M, tz) {
    var guess = Date.UTC(y, mon - 1, d, H, M, 0);
    var off = tzOffsetMs(new Date(guess), tz);
    var inst = guess - off;
    off = tzOffsetMs(new Date(inst), tz);
    inst = guess - off;
    return new Date(inst).toISOString();
  }

  /* ---------- build the modal once ---------- */
  function build() {
    if (built) return;
    var root = document.createElement('div');
    root.className = 'bk-overlay';
    root.innerHTML =
      '<div class="bk-modal" role="dialog" aria-modal="true" aria-label="Book an appointment">' +
        '<div class="bk-head">' +
          '<div class="mk" id="bkMk">B</div>' +
          '<div><div class="ttl" id="bkTtl">Book your visit</div><div class="sub" id="bkSub">Takes about 30 seconds</div></div>' +
          '<button class="bk-x" id="bkX" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="bk-steps"><i id="bkd0"></i><i id="bkd1"></i><i id="bkd2"></i></div>' +
        '<div class="bk-body" id="bkBody"><div class="bk-err" id="bkErr"></div><div id="bkStep"></div></div>' +
        '<div class="bk-foot" id="bkFoot"></div>' +
      '</div>';
    document.body.appendChild(root);

    els.overlay = root;
    els.modal = root.querySelector('.bk-modal');
    els.body = root.querySelector('#bkBody');
    els.step = root.querySelector('#bkStep');
    els.foot = root.querySelector('#bkFoot');
    els.err = root.querySelector('#bkErr');
    els.mk = root.querySelector('#bkMk');
    els.ttl = root.querySelector('#bkTtl');
    els.sub = root.querySelector('#bkSub');
    els.d0 = root.querySelector('#bkd0');
    els.d1 = root.querySelector('#bkd1');
    els.d2 = root.querySelector('#bkd2');

    root.querySelector('#bkX').onclick = close;
    root.addEventListener('click', function (e) { if (e.target === root) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    built = true;
  }

  /* ---------- error + loading + button states ---------- */
  function showErr(msg) { if (els.err) { els.err.textContent = msg; els.err.classList.add('show'); } }
  function hideErr() { if (els.err) els.err.classList.remove('show'); }
  function loadingHTML() {
    return '<div class="bk-empty" style="text-align:center;padding:34px 0">' +
      '<span class="bk-spin" style="border-color:color-mix(in srgb,var(--ink) 22%,transparent);border-top-color:var(--brand)"></span>' +
      '<div style="margin-top:11px">Loading availability…</div></div>';
  }
  function setFoot(html) { els.foot.innerHTML = html; }
  function btn(id, label, disabled) { return '<button class="bk-btn bk-primary" id="' + id + '"' + (disabled ? ' disabled' : '') + '>' + label + '</button>'; }
  function ghost(id, label) { return '<button class="bk-btn bk-ghost" id="' + id + '">' + label + '</button>'; }
  function bindGo(fn) { var b = document.getElementById('bkGo'); if (b) b.onclick = fn; }
  function setBtnLoading(id, on) {
    var b = document.getElementById(id); if (!b) return;
    if (on) { b.dataset.label = b.innerHTML; b.disabled = true; b.innerHTML = '<span class="bk-spin"></span>'; }
    else { b.disabled = false; if (b.dataset.label) b.innerHTML = b.dataset.label; }
  }

  /* ---------- step 0: choose service ---------- */
  function stepServiceHTML() {
    var cur = BIZ.currency;
    var rows = (BIZ.services || []).map(function (s) {
      var free = !s.price || Number(s.price) === 0;
      var dep = BIZ.deposit_required && Number(s.deposit_amount) > 0;
      var pr = free
        ? '<b>Free</b>'
        : '<b>' + money(cur, s.price) + '</b>' + (dep ? '<small>' + money(cur, s.deposit_amount) + ' deposit</small>' : '');
      var seld = state.service && state.service.slug === s.slug ? ' sel' : '';
      return '<button class="bk-svc' + seld + '" data-slug="' + esc(s.slug) + '">' +
        '<div><div class="nm">' + esc(s.name) + '</div><div class="meta">' + (s.duration_minutes || 30) + ' min' +
        (s.description ? ' · ' + esc(s.description) : '') + '</div></div>' +
        '<div class="pr">' + pr + '</div></button>';
    }).join('');
    return '<div class="bk-step show"><div class="bk-h">What can we help with?</div>' +
      '<div class="bk-p">Pick a service to get started.</div>' + rows + '</div>';
  }
  function wireServices() {
    els.step.querySelectorAll('.bk-svc').forEach(function (b) {
      b.onclick = function () {
        state.service = (BIZ.services || []).find(function (s) { return s.slug === b.dataset.slug; }) || null;
        state.time = null;
        goStep(0);
      };
    });
  }

  /* ---------- step 1: date + time ---------- */
  function enterWhen() {
    state.days = [];
    var today = new Date();
    for (var i = 0; i < 14; i++) {
      var dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      var dow = dt.getDay();
      var h = (BIZ.hours || []).find(function (x) { return x.day === dow; });
      var closed = !h || h.closed;
      state.days.push({ date: dt, dow: dow, closed: closed, open: h && h.open, close: h && h.close });
    }
    if (!state.date) {
      var f = state.days.find(function (d) { return !d.closed; });
      state.date = f ? f.date : null;
    }
    goStep(1);
  }
  function slotsFor(dayObj, durationMin) {
    if (!dayObj || dayObj.closed) return [];
    var op = dayObj.open.split(':').map(Number), cl = dayObj.close.split(':').map(Number);
    var startMin = op[0] * 60 + op[1], endMin = cl[0] * 60 + cl[1];
    var dur = durationMin || 30, step = Math.max(dur, 30);
    var out = [], now = new Date(), isToday = sameDay(dayObj.date, now);
    for (var m = startMin; m + dur <= endMin; m += step) {
      var H = Math.floor(m / 60), M = m % 60;
      if (isToday) {
        var guess = new Date(dayObj.date.getFullYear(), dayObj.date.getMonth(), dayObj.date.getDate(), H, M);
        if (guess.getTime() < now.getTime() + 30 * 60000) continue;
      }
      out.push({ H: H, M: M });
    }
    return out;
  }
  function stepWhenHTML() {
    var dur = state.service ? state.service.duration_minutes : 30;
    var days = state.days.map(function (d, i) {
      var sel = state.date && sameDay(d.date, state.date);
      var dow = d.date.toLocaleDateString(undefined, { weekday: 'short' });
      return '<div class="bk-day' + (d.closed ? ' off' : '') + (sel ? ' sel' : '') + '" data-i="' + i + '">' +
        '<div class="dow">' + esc(dow) + '</div><div class="dnum">' + d.date.getDate() + '</div></div>';
    }).join('');
    var dayObj = state.days.find(function (d) { return state.date && sameDay(d.date, state.date); });
    var slots = slotsFor(dayObj, dur);
    var slotHTML = slots.length
      ? slots.map(function (s) {
          var sel = state.time && state.time.H === s.H && state.time.M === s.M;
          return '<button class="bk-slot' + (sel ? ' sel' : '') + '" data-h="' + s.H + '" data-m="' + s.M + '">' + fmtTime(s.H, s.M) + '</button>';
        }).join('')
      : '<div class="bk-empty">No times that day — please pick another.</div>';
    var sub = (state.service ? esc(state.service.name) + ' · ' : '') + (BIZ.city ? esc(BIZ.city) : '');
    return '<div class="bk-step show"><div class="bk-h">Pick a time</div><div class="bk-p">' + sub + '</div>' +
      '<div class="bk-days">' + days + '</div><div class="bk-slots">' + slotHTML + '</div></div>';
  }
  function wireWhen() {
    els.step.querySelectorAll('.bk-day').forEach(function (d) {
      d.onclick = function () { state.date = state.days[+d.dataset.i].date; state.time = null; goStep(1); };
    });
    els.step.querySelectorAll('.bk-slot').forEach(function (s) {
      s.onclick = function () { state.time = { H: +s.dataset.h, M: +s.dataset.m }; goStep(1); };
    });
  }

  /* ---------- step 2: details ---------- */
  function chanPill(v, label) {
    var cur = (state.form && state.form.channel) || defChannel();
    var sel = cur === v;
    return '<label class="' + (sel ? 'sel' : '') + '"><input type="radio" name="bkchan" value="' + v + '"' + (sel ? ' checked' : '') + '>' + label + '</label>';
  }
  function stepDetailsHTML() {
    var f = state.form || {};
    var ph = BIZ.country === 'KE' ? '+254 7…' : '+1…';
    return '<div class="bk-step show"><div class="bk-h">Your details</div>' +
      '<div class="bk-p">We send confirmation &amp; reminders here — and alert ' + esc(BIZ.name) + ' instantly.</div>' +
      '<div class="bk-field"><label>Full name *</label><input id="bkName" value="' + esc(f.name) + '" placeholder="Jane Doe" autocomplete="name"></div>' +
      '<div class="bk-row2">' +
        '<div class="bk-field"><label>Phone *</label><input id="bkPhone" value="' + esc(f.phone) + '" placeholder="' + ph + '" autocomplete="tel"></div>' +
        '<div class="bk-field"><label>Email</label><input id="bkEmail" type="email" value="' + esc(f.email) + '" placeholder="you@email.com" autocomplete="email"></div>' +
      '</div>' +
      '<div class="bk-field"><label>WhatsApp <span style="opacity:.6">(optional)</span></label><input id="bkWa" value="' + esc(f.whatsapp) + '" placeholder="If different from phone"></div>' +
      '<div class="bk-field"><label>Where should we confirm?</label><div class="bk-chan" id="bkChan">' +
        chanPill('sms', 'SMS') + chanPill('whatsapp', 'WhatsApp') + chanPill('email', 'Email') + '</div></div>' +
      '<div class="bk-field"><label>Anything we should know? <span style="opacity:.6">(optional)</span></label>' +
        '<textarea id="bkNote" placeholder="e.g. the issue, a preferred staff member, parking…">' + esc(f.note) + '</textarea></div>' +
      '</div>';
  }
  function wireDetails() {
    els.step.querySelectorAll('input[name=bkchan]').forEach(function (r) {
      r.onchange = function () {
        els.step.querySelectorAll('.bk-chan label').forEach(function (l) { l.classList.remove('sel'); });
        r.parentElement.classList.add('sel');
      };
    });
  }
  function captureForm() {
    var sel = document.querySelector('input[name=bkchan]:checked');
    state.form = {
      name: val('bkName'), phone: val('bkPhone'), email: val('bkEmail'),
      whatsapp: val('bkWa'), note: val('bkNote'),
      channel: sel ? sel.value : defChannel()
    };
  }

  /* ---------- step nav ---------- */
  function goStep(n) {
    state.step = n;
    hideErr();
    [0, 1, 2].forEach(function (i) { els['d' + i].classList.toggle('on', n >= i); });
    if (n === 0) {
      els.step.innerHTML = stepServiceHTML(); wireServices();
      setFoot('<div class="bk-note">Free to book · no charge to reserve</div>' + btn('bkGo', 'Continue', !state.service));
      bindGo(function () { if (state.service) enterWhen(); });
    } else if (n === 1) {
      els.step.innerHTML = stepWhenHTML(); wireWhen();
      setFoot(ghost('bkBack', 'Back') + btn('bkGo', 'Continue', !state.time));
      document.getElementById('bkBack').onclick = function () { goStep(0); };
      bindGo(function () { if (state.time) goStep(2); });
    } else if (n === 2) {
      els.step.innerHTML = stepDetailsHTML(); wireDetails();
      setFoot(ghost('bkBack', 'Back') + btn('bkGo', 'Confirm booking', false));
      document.getElementById('bkBack').onclick = function () { captureForm(); goStep(1); };
      bindGo(submit);
    }
  }

  /* ---------- submit ---------- */
  function submit() {
    captureForm();
    var f = state.form;
    if (!f.name) { showErr('Please enter your name.'); return; }
    if (!f.phone && !f.email) { showErr('Add a phone or email so we can confirm.'); return; }
    if (!state.date || !state.time) { showErr('Pick a date and time.'); goStep(1); return; }
    var c = client();
    if (!c) { showErr('Could not reach the booking server. Check your connection and try again.'); return; }
    var d = state.date;
    var iso = wallToISO(d.getFullYear(), d.getMonth() + 1, d.getDate(), state.time.H, state.time.M, BIZ.timezone);
    setBtnLoading('bkGo', true);
    c.rpc('create_public_booking', {
      p_slug: SLUG,
      p_service_slug: state.service ? state.service.slug : '',
      p_name: f.name, p_email: f.email || '', p_phone: f.phone || '',
      p_whatsapp: f.whatsapp || '', p_preferred_channel: f.channel,
      p_starts_at: iso, p_note: f.note || ''
    }).then(function (res) {
      if (res.error) throw res.error;
      var data = res.data;
      if (!data || !data.ok) { showErr(friendly(data && data.error)); setBtnLoading('bkGo', false); return; }
      state.result = data;
      flushAlerts(data.booking_id);
      goConfirm();
    }).catch(function (e) {
      console.error('[beacon] booking failed', e);
      showErr('Something went wrong creating your booking. Please try again.');
      setBtnLoading('bkGo', false);
    });
  }

  /* ---------- flush alerts (fire-and-forget; queue persists regardless) ---------- */
  function flushAlerts(bookingId) {
    if (!bookingId) return;
    try {
      fetch(CFG.fnBase + '/alert-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CFG.key, 'apikey': CFG.key },
        body: JSON.stringify({ booking_id: bookingId })
      }).catch(function () {});
    } catch (e) { /* alerts already queued server-side */ }
  }

  /* ---------- confirmation ---------- */
  function li(k, v) { return '<div class="li"><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>'; }
  function goConfirm() {
    state.step = 3;
    [0, 1, 2].forEach(function (i) { els['d' + i].classList.add('on'); });
    var r = state.result, f = state.form;
    var when = state.date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) + ' · ' + fmtTime(state.time.H, state.time.M);
    var dep = r.deposit_required && Number(r.deposit_amount) > 0;
    var alerts = ['You: ' + (f.channel || 'sms').toUpperCase(), BIZ.name + ' alerted'];
    var payHTML = '';
    if (dep) {
      var mpesa = r.payment_provider === 'mpesa';
      payHTML = '<div class="bk-pay"><div class="amt">' + money(r.currency, r.deposit_amount) + '</div>' +
        '<div class="pdesc">Secure your slot with a deposit' + (mpesa ? ' via M-Pesa' : ' via card') + '. The balance is settled at your visit.</div>' +
        '<button class="bk-btn bk-primary" id="bkPay">' + (mpesa ? 'Pay deposit with M-Pesa' : 'Pay deposit by card') + '</button></div>';
    }
    els.step.innerHTML = '<div class="bk-step show"><div class="bk-conf">' +
      '<div class="bk-check">&#10003;</div>' +
      '<div class="bk-h">You\'re on the calendar' + (dep ? ' — one step left' : '') + '</div>' +
      '<div class="bk-ref">' + esc(r.reference) + '</div>' +
      '<div class="bk-alerts">' + alerts.map(function (a) { return '<span class="a">' + esc(a) + '</span>'; }).join('') + '</div>' +
      '<div class="bk-summary">' +
        li('Business', r.business_name) +
        (r.service ? li('Service', r.service) : '') +
        li('When', when) +
        (dep ? li('Deposit', money(r.currency, r.deposit_amount)) : li('Cost', 'Quoted at your visit')) +
      '</div>' + payHTML +
      '</div></div>';
    setFoot('<div class="bk-note">Confirmation sent to you &amp; the owner.</div><button class="bk-btn bk-primary" id="bkDone">Done</button>');
    document.getElementById('bkDone').onclick = close;
    if (dep) document.getElementById('bkPay').onclick = pay;
  }

  /* ---------- deposit payment (graceful if function not deployed) ---------- */
  function pay() {
    var r = state.result, f = state.form;
    setBtnLoading('bkPay', true);
    fetch(CFG.fnBase + '/pay-deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CFG.key, 'apikey': CFG.key },
      body: JSON.stringify({ slug: SLUG, booking_id: r.booking_id, provider: r.payment_provider, phone: f.phone, return_url: location.origin + location.pathname })
    }).then(function (res) {
      return res.json().then(function (out) { return { ok: res.ok, out: out }; });
    }).then(function (w) {
      if (!w.ok || w.out.ok === false) throw new Error((w.out && w.out.error) || 'payment_failed');
      var box = document.querySelector('.bk-pay');
      var demo = w.out.mock ? ' (demo mode — no real charge)' : '';
      if (r.payment_provider === 'mpesa') {
        box.innerHTML = '<div class="amt">Check your phone 📲</div><div class="pdesc">We sent an M-Pesa prompt to ' + esc(f.phone || 'your phone') + '. Enter your PIN to confirm your deposit.' + demo + '</div>';
      } else if (w.out.checkout_url) {
        window.open(w.out.checkout_url, '_blank');
        box.innerHTML = '<div class="amt">Opening secure checkout…</div><div class="pdesc">Finish your card payment in the new tab.' + demo + '</div>';
      } else {
        box.innerHTML = '<div class="amt">Deposit recorded ✓</div><div class="pdesc">Your slot is secured.' + demo + '</div>';
      }
    }).catch(function (e) {
      console.warn('[beacon] pay endpoint not active yet', e);
      var box = document.querySelector('.bk-pay');
      box.innerHTML = '<div class="amt">' + money(r.currency, r.deposit_amount) + ' deposit ready</div>' +
        '<div class="pdesc">Payments switch on when the owner connects ' + (r.payment_provider === 'mpesa' ? 'M-Pesa' : 'Stripe') +
        '. Your booking (' + esc(r.reference) + ') is saved and the owner has been alerted.</div>';
    });
  }

  /* ---------- open / close ---------- */
  function open() {
    build();
    els.overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    state = freshState();
    if (BIZ) { state.step = 0; if (BIZ.services && BIZ.services.length === 1) state.service = BIZ.services[0]; goStep(0); return; }

    els.step.innerHTML = loadingHTML();
    setFoot('');
    var c = client();
    if (!c) { els.step.innerHTML = '<div class="bk-empty">Booking needs an internet connection — please try again.</div>'; return; }
    c.rpc('get_public_business', { p_slug: SLUG }).then(function (res) {
      if (res.error || !res.data) throw res.error || new Error('not_found');
      BIZ = res.data;
      els.mk.textContent = (BIZ.name || 'B').trim().charAt(0);
      els.ttl.textContent = 'Book · ' + BIZ.name;
      els.sub.textContent = BIZ.city || 'Takes about 30 seconds';
      if (BIZ.services && BIZ.services.length === 1) state.service = BIZ.services[0];
      goStep(0);
    }).catch(function (e) {
      console.error('[beacon] could not load business', e);
      els.step.innerHTML = '<div class="bk-empty">Couldn\'t load booking right now. Please try again in a moment.</div>';
    });
  }
  function close() {
    if (els.overlay) { els.overlay.classList.remove('open'); document.body.style.overflow = ''; }
  }

  /* ---------- entry points ---------- */
  function injectFab() {
    if (document.querySelector('.bk-fab')) return;
    var b = document.createElement('button');
    b.className = 'bk-fab'; b.type = 'button';
    b.innerHTML = '<span class="dot"></span><span class="lbl">Book now</span>';
    b.onclick = open;
    document.body.appendChild(b);
  }
  function bindTriggers() {
    var selectors = ['[data-book]', '.nav-cta', '.hero-cta .btn-primary', '.cta .btn-primary', 'a[href="#book"]'];
    var nodes = document.querySelectorAll(selectors.join(','));
    nodes.forEach(function (el) {
      if (el.classList.contains('bk-fab')) return;
      el.addEventListener('click', function (ev) { ev.preventDefault(); open(); });
    });
  }

  function init() { injectFab(); bindTriggers(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
