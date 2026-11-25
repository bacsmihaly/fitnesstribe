import {
  sb, configured, state, app, t, esc, fmtKm, fmtNum, fmtDate, fmtDateTime, todayStr, eventPhase, countdownTarget, FB_URL, fbIcon,
  loadSettings, loadSession, openPhoto, extractUrl, setBusy,
} from './common.js?v=3';
import { renderAdmin } from './admin.js?v=3';

const MAX_PHOTO = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// ---------------------------------------------------------------------
// Útválasztó
// ---------------------------------------------------------------------
const routes = {
  '': renderHome,
  akcio: renderAbout,
  tamogatottak: renderBeneficiaries,
  regisztracio: renderRegister,
  belepes: renderLogin,
  'uj-jelszo': renderNewPassword,
  profil: renderProfile,
  admin: renderAdmin,
};

const currentRoute = () => location.hash.replace(/^#\/?/, '').split('?')[0];

async function route() {
  renderChrome();
  const fn = routes[currentRoute()] || renderHome;
  app().innerHTML = `<div class="loading">${t('loading')}</div>`;
  try {
    await fn();
  } catch (e) {
    console.error(e);
    app().innerHTML = `<div class="card error">${esc(t('error_generic'))}: ${esc(e.message || e)}</div>`;
  }
  window.scrollTo(0, 0);
}

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function renderChrome() {
  document.documentElement.lang = state.lang;
  document.getElementById('brand-t').textContent = t('brand');
  document.getElementById('brand-e').textContent = t('subtitle');
  document.title = t('doc_title');
  document.getElementById('footer').innerHTML = `${esc(t('footer'))} · <a href="${FB_URL}" target="_blank" rel="noopener">${fbIcon} Facebook</a>`;
  const r = currentRoute();
  const link = (href, key, label) =>
    `<a href="${href}" class="${r === key ? 'active' : ''}">${label}</a>`;
  const items = [link('#/', '', t('nav_home')), link('#/akcio', 'akcio', t('nav_about')), link('#/tamogatottak', 'tamogatottak', t('nav_bene'))];
  if (state.session) {
    items.push(link('#/profil', 'profil', t('nav_profile')));
    if (state.isAdmin) items.push(link('#/admin', 'admin', 'Admin'));
    items.push(`<a href="#" id="logout">${t('nav_logout')}</a>`);
  } else {
    items.push(link('#/belepes', 'belepes', t('nav_login')));
    items.push(`<a class="btn small" href="#/regisztracio">${t('nav_register')}</a>`);
  }
  items.push(`<button class="lang" id="lang" title="Magyar / Română">${state.lang === 'hu' ? 'RO' : 'HU'}</button>`);
  const nav = document.getElementById('nav');
  nav.innerHTML = items.join('');
  nav.querySelector('#lang').onclick = () => {
    state.lang = state.lang === 'hu' ? 'ro' : 'hu';
    localStorage.setItem('lang', state.lang);
    route();
  };
  const lo = nav.querySelector('#logout');
  if (lo) lo.onclick = async (e) => {
    e.preventDefault();
    await sb.auth.signOut();
    await loadSession();
    go('#/');
  };
}

// ---------------------------------------------------------------------
// Főoldal: adventi naptár (napi km), összesítő, ranglista, ajándékozók
// ---------------------------------------------------------------------
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dayLabel = (d, opts) => new Date(`${d}T12:00:00Z`).toLocaleDateString(state.lang === 'hu' ? 'hu-HU' : 'ro-RO', { timeZone: 'UTC', ...opts });

// ---------------------------------------------------------------------
// Az akcióról és Kiket támogatunk (külön fülek)
// ---------------------------------------------------------------------
function renderAbout() {
  const s = state.settings;
  const phase = eventPhase();
  const bank = phase === 'closed' ? '' : (state.lang === 'ro' ? (s.bank_info_ro || s.bank_info_hu) : (s.bank_info_hu || s.bank_info_ro));
  const steps = [1, 2, 3, 4].map((n) => `<li><b>${t(`about_s${n}_t`)}</b><span>${t(`about_s${n}_d`, { fee: fmtNum(s.entry_fee || 50), deadline: fmtDateTime(s.submit_deadline) })}</span></li>`).join('');
  const cta = phase === 'closed' ? '' : state.session
    ? `<a class="btn" href="#/profil">${t('adv_submit_today')}</a>`
    : `<a class="btn" href="#/regisztracio">${t('adv_join')}</a><a class="btn ghost" href="#/belepes">${t('nav_login')}</a>`;
  app().innerHTML = `
    <section class="page">
      <h1>${t('about_title')}</h1>
      <p class="page-lead">${t('about_lead', { start: dayLabel(s.event_start, { month: 'long', day: 'numeric' }), end: dayLabel(s.event_end, { month: 'long', day: 'numeric' }) })}</p>
      <div class="callout"><b>${t('about_open_t')}</b> ${t('about_open_d')}</div>
      <div class="callout fbcall"><span>${t('fb_note')}</span> <a class="btn ghost fb" href="${FB_URL}" target="_blank" rel="noopener">${fbIcon} ${t('fb_btn')}</a></div>
      <dl class="facts">
        <div><dt>${t('about_who_t')}</dt><dd>${t('about_who_d')}</dd></div>
        <div><dt>${t('about_what_t')}</dt><dd>${t('about_what_d')}</dd></div>
        <div><dt>${t('about_last_t')}</dt><dd>${t('about_last_d')}</dd></div>
      </dl>
      <h2>${t('about_how')}</h2>
      <ol class="steps">${steps}</ol>
      ${bank ? `<div class="pay-card">
        <div>
          <h3>${t('home_pay_title')}</h3>
          <p>${t('home_pay_text', { fee: fmtNum(s.entry_fee || 50) })}</p>
        </div>
        <pre>${esc(bank)}</pre>
      </div>` : ''}
      <p>${t('about_km', { price: fmtNum(s.km_price) })}</p>
      ${t('about_hashtag') ? `<p>${t('about_share')} <b>${t('about_hashtag')}</b></p>` : ''}
      <p><a href="#/tamogatottak">${t('about_to_bene')}</a></p>
      <div class="cta-row">${cta}</div>
    </section>`;
}

function renderBeneficiaries() {
  app().innerHTML = `
    <section class="page bene">
      <h1>${t('bene_title')}</h1>
      <p class="page-lead">${t('bene_text')}</p>
      <div class="bene-grid">
        <article class="bene-card">
          <span class="bene-tag">${t('bene1_tag')}</span>
          <h3>${t('bene1_name')}</h3>
          <p>${t('bene1_text')}</p>
          <p>${t('bene1_extra')}</p>
          <a class="bene-link" href="https://2kereken.ro" target="_blank" rel="noopener">${t('bene_link')}: 2kereken.ro</a>
        </article>
        <article class="bene-card">
          <span class="bene-tag">${t('bene2_tag')}</span>
          <h3>${t('bene2_name')}</h3>
          <p>${t('bene2_text')}</p>
        </article>
        <article class="bene-card">
          <span class="bene-tag">${t('bene3_tag')}</span>
          <h3>${t('bene3_name')}</h3>
          <p>${t('bene3_text')}</p>
        </article>
      </div>
    </section>`;
}

async function renderHome() {
  const [st, lb, sp, dy] = await Promise.all([
    sb.rpc('public_stats'), sb.rpc('public_leaderboard'), sb.rpc('public_sponsors'), sb.rpc('public_daily'),
  ]);
  for (const r of [st, lb, sp, dy]) if (r.error) throw r.error;
  const stats = st.data || {};
  const s = state.settings;
  const today = todayStr();
  const phase = eventPhase();

  // A kihívás napjai (alapból december 1–21.)
  const days = [];
  for (let d = s.event_start; d <= s.event_end && days.length < 62; d = addDays(d, 1)) days.push(d);
  const daily = new Map((dy.data || []).map((x) => [String(x.run_date).slice(0, 10), x]));
  const maxKm = Math.max(1, ...[...daily.values()].map((x) => Number(x.km)));
  const passed = days.filter((d) => d <= today).length;
  const left = days.length - passed;
  const cdTarget = countdownTarget();

  const doors = days.map((d, i) => {
    const num = Number(d.slice(8, 10));
    const delay = Math.round(i * 22 + (i % 3) * 9); // enyhén szabálytalan nyitás, hogy ne gépies legyen
    if (d > today) {
      return `<button class="door future" disabled style="animation-delay:${delay}ms" aria-label="${esc(dayLabel(d, { month: 'long', day: 'numeric' }))}">
        <span class="d">${num}</span><span class="km">${esc(dayLabel(d, { month: 'short' }))}</span></button>`;
    }
    const x = daily.get(d);
    const km = x ? Number(x.km) : 0;
    const isToday = d === today;
    let cls = 'door';
    let style = `animation-delay:${delay}ms;`;
    if (isToday) cls += ' today';
    else if (!x) cls += ' empty';
    else style += `background:rgba(15,115,96,${(0.55 + 0.45 * (km / maxKm)).toFixed(2)});`;
    return `<button class="${cls}" style="${style}" data-day="${d}" data-today="${t('adv_today')}" aria-pressed="false">
      <span class="d">${num}</span><span class="km">${x ? `${fmtKm(km, 0)}<span class="u"> km</span>` : '–'}</span></button>`;
  }).join('');

  const title = days.length === 21 ? t('adv_title_21') : t('adv_title_n', { n: days.length });
  const totalSub = phase === 'before'
    ? t('adv_total_before', { start: dayLabel(s.event_start, { month: 'long', day: 'numeric' }) })
    : t('adv_total_sub', { runners: fmtNum(stats.active_runners), days: Math.min(passed, days.length) });
  const cta = state.session
    ? (phase === 'closed' ? '' : `<a class="btn" href="#/profil">${t('adv_submit_today')}</a>`)
    : (phase === 'closed' ? '' : `<a class="btn" href="#/regisztracio">${t('adv_join')}</a><a class="btn ghost" href="#/belepes">${t('nav_login')}</a>`);
  const phaseText = t(`phase_${phase}`, { start: fmtDate(s.event_start), deadline: fmtDateTime(s.submit_deadline) });
  const defaultNote = `${t('adv_note_default')} ${left > 0 && phase !== 'before' ? t('adv_note_left', { n: left }) : phaseText}`;

  const gifts = (sp.data || []).map((x) => {
    const inner = `${x.logo_url ? `<img src="${esc(x.logo_url)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<span class="gn">${esc(x.name)}</span><b>${fmtNum(x.km)} km</b>`;
    return `<li>${x.website ? `<a href="${esc(x.website)}" target="_blank" rel="noopener">${inner}</a>` : inner}</li>`;
  }).join('');

  app().innerHTML = `
    <section class="adv">
      <div class="adv-intro">
        <h1>${esc(title)}</h1>
        <p>${t('adv_text')}</p>
        ${cdTarget ? `<div class="countdown" id="cd" role="timer" aria-label="${esc(t(`cd_${cdTarget.kind}`))}">
          <div class="cd-label">${t(`cd_${cdTarget.kind}`)}</div>
          <div class="cd-grid">
            <div><b data-u="d">0</b><small>${t('cd_d')}</small></div>
            <div><b data-u="h">00</b><small>${t('cd_h')}</small></div>
            <div><b data-u="m">00</b><small>${t('cd_m')}</small></div>
            <div><b data-u="s">00</b><small>${t('cd_s')}</small></div>
          </div></div>` : ''}
        <div class="total"><b>${fmtKm(stats.total_km, 0)} km</b><span>${esc(totalSub)}</span></div>
        <div class="cta-row">${cta}<a class="btn ghost fb" href="${FB_URL}" target="_blank" rel="noopener">${fbIcon} ${t('fb_btn')}</a></div>
        <p class="fb-note">${t('fb_note')}</p>
      </div>
      <div>
        <div class="cal" role="group" aria-label="${esc(t('adv_cal_label'))}">${doors}</div>
        <div class="daynote" aria-live="polite" id="daynote">${esc(defaultNote)}</div>
      </div>
    </section>
    <section class="low">
      <div>
        <h2>${t('leaderboard')}</h2>
        <input class="search" id="lbsearch" type="search" placeholder="${t('lb_search')}" aria-label="${t('search')}" autocomplete="off">
        <ol class="res" id="lbbody"></ol>
      </div>
      <div>
        <h2>${t('gifts_title')}</h2>
        <p style="margin:0 0 12px">${t('gifts_text', { price: fmtNum(s.km_price) })}</p>
        ${gifts ? `<ul class="gifts">${gifts}</ul>` : `<p class="muted">${t('sponsors_empty')}</p>`}
      </div>
    </section>`;

  // Visszaszámláló (másodpercenként frissül, amíg az oldal látszik)
  const cd = document.getElementById('cd');
  if (cd && cdTarget) {
    const el = (u) => cd.querySelector(`[data-u="${u}"]`);
    const tick = () => {
      if (!cd.isConnected) return clearInterval(timer);
      let diff = Math.max(0, Math.floor(((cdTarget.up ? Date.now() - cdTarget.ms : cdTarget.ms - Date.now())) / 1000));
      const dd = Math.floor(diff / 86400); diff -= dd * 86400;
      const hh = Math.floor(diff / 3600); diff -= hh * 3600;
      const mm = Math.floor(diff / 60);
      const set = (u, v) => { const n = el(u); if (n && n.textContent !== v) n.textContent = v; };
      set('d', String(dd)); set('h', String(hh).padStart(2, '0')); set('m', String(mm).padStart(2, '0')); set('s', String(diff - mm * 60).padStart(2, '0'));
    };
    const timer = setInterval(tick, 1000);
    tick();
  }

  // Ajtó részletei
  const note = document.getElementById('daynote');
  app().querySelector('.cal').onclick = (e) => {
    const door = e.target.closest('.door[data-day]');
    if (!door) return;
    app().querySelectorAll('.door[aria-pressed="true"]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
    door.setAttribute('aria-pressed', 'true');
    const d = door.dataset.day;
    const x = daily.get(d);
    const date = dayLabel(d, { month: 'long', day: 'numeric' });
    let txt = x ? t('adv_note_day', { date, km: fmtKm(x.km, 0), n: fmtNum(x.runners) }) : t('adv_note_day_empty', { date });
    if (d === today) txt += ` ${t('adv_note_today')}`;
    note.textContent = txt.charAt(0).toUpperCase() + txt.slice(1);
  };

  // Ranglista kereséssel; a névre kattintva a futó futásai nyílnak le
  const rows = (lb.data || []).map((r, i) => ({ ...r, rank: i + 1 }));
  const body = document.getElementById('lbbody');
  const runsCache = new Map();
  const runsHtml = (list) => list.length
    ? `<ul class="runs">${list.map((x) => `<li><span>${esc(dayLabel(String(x.run_date).slice(0, 10), { month: 'long', day: 'numeric' }))}</span><b>${fmtKm(x.km)} km</b></li>`).join('')}</ul>`
    : `<p class="muted">${t('lb_runs_empty')}</p>`;
  const draw = (q = '') => {
    const ql = q.trim().toLowerCase();
    const list = ql ? rows.filter((r) => r.full_name.toLowerCase().includes(ql)) : rows;
    body.innerHTML = list.length
      ? list.map((r) => `<li class="${r.rank <= 3 ? 'top' : ''}" data-id="${esc(r.runner_id)}">
          <button type="button" class="rowbtn" aria-expanded="false"><span class="r">${r.rank}.</span><span class="n">${esc(r.full_name)}</span><span class="k">${fmtKm(r.km)} km</span></button>
          <div class="rundetail" hidden></div></li>`).join('')
      : `<li class="empty-row">${ql ? t('lb_no_match') : t('lb_empty')}</li>`;
  };
  body.onclick = async (e) => {
    const btn = e.target.closest('.rowbtn');
    if (!btn) return;
    const li = btn.parentElement;
    const box = li.querySelector('.rundetail');
    const open = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!open));
    li.classList.toggle('open', !open);
    box.hidden = open;
    if (open || box.dataset.loaded) return;
    const id = li.dataset.id;
    box.innerHTML = `<p class="muted">${t('loading')}</p>`;
    try {
      if (!runsCache.has(id)) {
        const r = await sb.rpc('public_runner_runs', { p_runner: id });
        if (r.error) throw r.error;
        runsCache.set(id, r.data || []);
      }
      box.innerHTML = runsHtml(runsCache.get(id));
      box.dataset.loaded = '1';
    } catch (err) {
      box.innerHTML = `<p class="muted">${esc(t('error_generic'))}</p>`;
    }
  };
  draw();
  document.getElementById('lbsearch').oninput = (e) => draw(e.target.value);
}

// ---------------------------------------------------------------------
// Regisztráció
// ---------------------------------------------------------------------
function renderRegister() {
  if (state.session) return go('#/profil');
  app().innerHTML = `
    <section class="card narrow">
      <h2>${t('register_title')}</h2>
      <form id="f" novalidate>
        <label>${t('f_full_name')}<input name="full_name" required minlength="3" maxlength="80" autocomplete="name" autocapitalize="words"></label>
        <label>${t('f_email')}<input name="email" type="email" required autocomplete="email" autocapitalize="none" autocorrect="off" spellcheck="false"></label>
        <label>${t('f_phone')} <span class="muted">(${t('optional')})</span><input name="phone" type="tel" autocomplete="tel" inputmode="tel"></label>
        <label>${t('f_password')}<input name="password" type="password" required minlength="8" autocomplete="new-password"></label>
        <label>${t('f_password2')}<input name="password2" type="password" required minlength="8" autocomplete="new-password"></label>
        <label class="check"><input type="checkbox" name="consent" required><span>${t('f_consent')}</span></label>
        <button class="btn" type="submit">${t('register_btn')}</button>
        <p class="msg" id="msg"></p>
      </form>
      <p class="muted">${t('have_account')} <a href="#/belepes">${t('nav_login')}</a></p>
    </section>`;

  const f = document.getElementById('f');
  const msg = document.getElementById('msg');
  f.onsubmit = async (e) => {
    e.preventDefault();
    msg.className = 'msg err';
    if (!f.reportValidity()) return;
    const fd = new FormData(f);
    const fullName = String(fd.get('full_name')).trim().replace(/\s+/g, ' ');
    if (fd.get('password') !== fd.get('password2')) { msg.textContent = t('err_pw_match'); return; }
    const btn = f.querySelector('button');
    setBusy(btn, true);
    const { data, error } = await sb.auth.signUp({
      email: String(fd.get('email')).trim(),
      password: String(fd.get('password')),
      options: {
        data: { full_name: fullName, phone: String(fd.get('phone') || '').trim() },
        emailRedirectTo: location.origin + location.pathname,
      },
    });
    setBusy(btn, false);
    if (error) {
      msg.textContent = /registered|exists/i.test(error.message) ? t('err_exists') : error.message;
      return;
    }
    // Ha a Supabase "Confirm email" ki van kapcsolva, azonnal be is lép
    if (data.session) {
      await loadSession();
      return go('#/profil');
    }
    // Létező, megerősített e-mail esetén a Supabase üres identities listát ad vissza
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      msg.textContent = t('err_exists');
      return;
    }
    f.reset();
    msg.className = 'msg ok';
    msg.textContent = t('check_email');
  };
}

// ---------------------------------------------------------------------
// Belépés, elfelejtett jelszó
// ---------------------------------------------------------------------
function renderLogin() {
  if (state.session) return go('#/profil');
  app().innerHTML = `
    <section class="card narrow">
      <h2>${t('login_title')}</h2>
      <form id="f">
        <label>${t('f_email')}<input name="email" type="email" required autocomplete="email" autocapitalize="none" autocorrect="off" spellcheck="false"></label>
        <label>${t('f_password').replace(/\s*\(.*\)/, '')}<input name="password" type="password" required autocomplete="current-password"></label>
        <button class="btn" type="submit">${t('login_btn')}</button>
        <p class="msg" id="msg"></p>
      </form>
      <p><a href="#" id="forgot">${t('forgot')}</a></p>
      <p class="muted">${t('no_account')} <a href="#/regisztracio">${t('nav_register')}</a></p>
    </section>`;

  const f = document.getElementById('f');
  const msg = document.getElementById('msg');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const btn = f.querySelector('button');
    setBusy(btn, true);
    const { error } = await sb.auth.signInWithPassword({
      email: String(fd.get('email')).trim(), password: String(fd.get('password')),
    });
    setBusy(btn, false);
    if (error) {
      msg.className = 'msg err';
      msg.textContent = /confirm/i.test(error.message) ? t('err_not_confirmed') : t('err_login');
      return;
    }
    await loadSession();
    go(state.isAdmin ? '#/admin' : '#/profil');
  };

  document.getElementById('forgot').onclick = async (e) => {
    e.preventDefault();
    const email = f.email.value.trim();
    if (!email) { msg.className = 'msg err'; msg.textContent = t('forgot_need_email'); f.email.focus(); return; }
    await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    msg.className = 'msg ok';
    msg.textContent = t('forgot_sent');
  };
}

function renderNewPassword() {
  if (!state.session) return go('#/belepes');
  app().innerHTML = `
    <section class="card narrow">
      <h2>${t('newpw_title')}</h2>
      <form id="f">
        <label>${t('f_password')}<input name="password" type="password" required minlength="8" autocomplete="new-password"></label>
        <label>${t('f_password2')}<input name="password2" type="password" required minlength="8" autocomplete="new-password"></label>
        <button class="btn" type="submit">${t('newpw_btn')}</button>
        <p class="msg" id="msg"></p>
      </form>
    </section>`;
  const f = document.getElementById('f');
  const msg = document.getElementById('msg');
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (f.password.value !== f.password2.value) { msg.className = 'msg err'; msg.textContent = t('err_pw_match'); return; }
    const { error } = await sb.auth.updateUser({ password: f.password.value });
    msg.className = error ? 'msg err' : 'msg ok';
    msg.textContent = error ? error.message : t('newpw_ok');
    if (!error) setTimeout(() => go('#/profil'), 1200);
  };
}

// ---------------------------------------------------------------------
// Futásaim: befizetési állapot, beküldés, saját lista
// ---------------------------------------------------------------------
async function renderProfile() {
  if (!state.session) return go('#/belepes');
  await loadSession();
  const p = state.profile;
  if (!p) throw new Error('Profil nem található / Profil inexistent');
  const s = state.settings;

  const { data: acts, error } = await sb.from('activities').select('*')
    .eq('runner_id', p.id)
    .order('run_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;

  const approvedKm = acts.filter((a) => a.status === 'approved').reduce((x, a) => x + Number(a.km), 0);
  const pending = acts.filter((a) => a.status === 'pending').length;

  const phase = eventPhase();
  const today = todayStr();
  const maxDate = today < s.event_end ? today : s.event_end;
  const bank = state.lang === 'ro' ? (s.bank_info_ro || s.bank_info_hu) : (s.bank_info_hu || s.bank_info_ro);

  let submitBlock;
  if (phase === 'before') submitBlock = `<p class="muted">${t('submit_not_yet', { start: fmtDate(s.event_start) })}</p>`;
  else if (phase === 'closed') submitBlock = `<p class="muted">${t('submit_closed')}</p>`;
  else submitBlock = `
    <form id="f">
      <div class="form-grid">
        <label>${t('f_date')}<input name="run_date" type="date" required min="${s.event_start}" max="${maxDate}" value="${maxDate}"></label>
        <label>${t('f_km')}<input name="km" inputmode="decimal" required placeholder="5,20" autocomplete="off" enterkeyhint="next"></label>
      </div>
      <div>
        <div style="font-weight:500;margin-bottom:6px">${t('f_proof')}</div>
        <div class="radio-row">
          <label><input type="radio" name="proof_type" value="link" checked> ${t('proof_link')}</label>
          <label><input type="radio" name="proof_type" value="photo"> ${t('proof_photo')}</label>
        </div>
      </div>
      <label id="linkField">${t('f_link')}<input name="proof_url" inputmode="url" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="send" placeholder="https://strava.app.link/…"></label>
      <label id="photoField" hidden>${t('f_photo')}<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label>
      <button class="btn" type="submit">${t('submit_btn')}</button>
      <p class="msg" id="msg"></p>
    </form>`;

  const statusBadge = (a) => {
    const cls = { pending: 'warn', approved: 'ok', rejected: 'bad' }[a.status];
    const reason = a.status === 'rejected' && a.reject_reason ? `<div class="reason">${esc(a.reject_reason)}</div>` : '';
    return `<span class="badge ${cls}">${t(`st_${a.status}`)}</span>${reason}`;
  };
  const proofCell = (a) => (a.proof_type === 'link'
    ? `<a href="${esc(a.proof_url)}" target="_blank" rel="noopener">${t('open_link')} ↗</a>`
    : `<a href="#" data-photo="${esc(a.photo_path)}">${t('view_photo')}</a>`);

  app().innerHTML = `
    <section class="card">
      <h2>${t('hello')}, ${esc(p.full_name)}!</h2>
      ${p.paid ? `<span class="badge ok">✓ ${t('paid_yes')}</span>` : `<span class="badge warn">${t('paid_no')}</span>`}
      ${p.paid ? '' : `<div class="notice">
          ${t('pay_notice')}
          ${s.entry_fee ? `<p>${t('pay_fee')}: <b>${fmtNum(s.entry_fee)} lei</b></p>` : ''}
          ${bank ? `<pre>${esc(bank)}</pre>` : ''}
          <p>${t('pay_ref')}: <b>${esc(p.full_name)} + donatie pentru copiii</b></p>
        </div>`}
      <div class="summary">
        <div><b>${fmtKm(approvedKm)}</b><span class="muted">${t('my_km')}</span></div>
        <div><b>${pending}</b><span class="muted">${t('my_pending')}</span></div>
      </div>
    </section>
    <section class="card"><h2>${t('submit_title')}</h2>${submitBlock}</section>
    <section class="card">
      <h2>${t('my_activities')}</h2>
      ${acts.length ? `<div class="mlist">${acts.map((a) => `<div class="mrow">
          <span class="m-date">${fmtDate(a.run_date)}</span>
          <b class="m-km">${fmtKm(a.km)} km</b>
          <span class="m-proof">${proofCell(a)}</span>
          <span class="m-status">${statusBadge(a)}</span>
          <span class="m-del">${a.status === 'pending' ? `<button class="btn ghost small" data-del="${a.id}">${t('delete')}</button>` : ''}</span>
        </div>`).join('')}</div>` : `<p class="muted">${t('no_activities')}</p>`}
    </section>`;

  app().querySelectorAll('[data-photo]').forEach((el) => {
    el.onclick = (e) => { e.preventDefault(); openPhoto(el.dataset.photo); };
  });
  app().querySelectorAll('[data-del]').forEach((el) => {
    el.onclick = async () => {
      if (!confirm(t('confirm_delete'))) return;
      const a = acts.find((x) => String(x.id) === el.dataset.del);
      const { error: err } = await sb.from('activities').delete().eq('id', a.id);
      if (err) { alert(err.message); return; }
      if (a.photo_path) await sb.storage.from('proofs').remove([a.photo_path]);
      renderProfile();
    };
  });

  const f = document.getElementById('f');
  if (!f) return;
  const msg = document.getElementById('msg');
  const linkField = document.getElementById('linkField');
  const photoField = document.getElementById('photoField');
  f.querySelectorAll('input[name=proof_type]').forEach((r) => {
    r.onchange = () => {
      const isLink = f.proof_type.value === 'link';
      linkField.hidden = !isLink;
      photoField.hidden = isLink;
    };
  });

  f.onsubmit = async (e) => {
    e.preventDefault();
    msg.className = 'msg err';
    msg.textContent = '';
    const runDate = f.run_date.value;
    const km = Number(String(f.km.value).replace(',', '.').trim());
    const max = Number(s.max_km_per_activity);
    if (!runDate) { f.run_date.focus(); return; }
    if (!Number.isFinite(km) || km <= 0 || km > max) { msg.textContent = t('err_km', { max }); return; }
    const kmR = Math.round(km * 100) / 100;
    const proofType = f.proof_type.value;

    let proofUrl = null;
    let file = null;
    if (proofType === 'link') {
      proofUrl = extractUrl(f.proof_url.value);
      if (!proofUrl) { msg.textContent = t('err_no_link'); return; }
    } else {
      file = f.photo.files[0];
      if (!file) { msg.textContent = t('err_no_photo'); return; }
      if (!PHOTO_TYPES.includes(file.type)) { msg.textContent = t('err_photo_type'); return; }
      if (file.size > MAX_PHOTO) { msg.textContent = t('err_photo_big'); return; }
    }

    if (acts.some((a) => a.status !== 'rejected' && a.run_date === runDate && Number(a.km) === kmR)
        && !confirm(t('confirm_dup'))) return;

    const btn = f.querySelector('button[type=submit]');
    setBusy(btn, true);
    let photoPath = null;
    try {
      if (file) {
        const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
        photoPath = `${p.id}/${runDate}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const up = await sb.storage.from('proofs').upload(photoPath, file, { contentType: file.type });
        if (up.error) throw up.error;
      }
      const { error: insErr } = await sb.from('activities').insert({
        runner_id: p.id, run_date: runDate, km: kmR, proof_type: proofType, proof_url: proofUrl, photo_path: photoPath,
      });
      if (insErr) {
        if (photoPath) await sb.storage.from('proofs').remove([photoPath]);
        throw insErr;
      }
      await renderProfile();
      const m2 = document.getElementById('msg');
      if (m2) { m2.className = 'msg ok'; m2.textContent = t('submit_ok'); }
    } catch (err) {
      setBusy(btn, false);
      const code = ['DATE_OUT_OF_RANGE', 'DATE_IN_FUTURE', 'DEADLINE_PASSED', 'KM_TOO_HIGH']
        .find((c) => String(err.message).includes(c));
      if (code) msg.textContent = t(`err_${code}`);
      else if (err.code === '23505') msg.textContent = t('err_dup_link');
      else msg.textContent = err.message || String(err);
    }
  };
}

// ---------------------------------------------------------------------
// Indulás
// ---------------------------------------------------------------------
(async () => {
  if (!configured) {
    app().innerHTML = `<div class="card error">${t('config_missing')}</div>`;
    return;
  }
  // E-mailes linkből érkezés (megerősítés / jelszó-visszaállítás): a token a # után van
  const h = location.hash;
  const fromRecovery = h.includes('type=recovery');
  const fromEmailLink = h.includes('access_token=');
  const errorDesc = h.includes('error_description=')
    ? decodeURIComponent(new URLSearchParams(h.slice(1)).get('error_description') || '').replace(/\+/g, ' ')
    : null;

  await loadSettings();
  await loadSession(); // a supabase-js itt dolgozza fel a linkből jövő tokent

  let target = null;
  if (fromRecovery && state.session) target = '#/uj-jelszo';
  else if (fromEmailLink) target = state.session ? '#/profil' : '#/belepes';
  else if (errorDesc) target = '#/belepes';
  // replaceState nem vált ki hashchange eseményt, így nincs dupla renderelés
  if (target) history.replaceState(null, '', location.pathname + location.search + target);

  window.addEventListener('hashchange', route);
  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY' && currentRoute() !== 'uj-jelszo') setTimeout(() => go('#/uj-jelszo'), 0);
  });
  await route();
  if (errorDesc) {
    const msg = document.getElementById('msg');
    if (msg) { msg.className = 'msg err'; msg.textContent = errorDesc; }
  }
})().catch((e) => {
  console.error(e);
  app().innerHTML = `<div class="card error">${esc(t('error_generic'))}: ${esc(e.message || e)}</div>`;
});
