// Admin felület – csak magyarul (egy admin felhasználó van)
import {
  sb, state, app, esc, fetchAll, loadSettings, openPhoto, downloadCsv, csvNum, toLocalInput, setBusy,
} from './common.js?v=11';

const hu = (n, d = 2) => Number(n || 0).toLocaleString('hu-HU', { minimumFractionDigits: d, maximumFractionDigits: d });
const huDate = (d) => (d ? String(d).slice(0, 10).replaceAll('-', '.') + '.' : '');
const huDT = (ts) => (ts ? new Date(ts).toLocaleString('hu-HU', { timeZone: 'Europe/Bucharest' }) : '');
/** Rövid időpont táblázatba: 12.03. 21:40 */
const huShort = (ts) => (ts ? new Date(ts).toLocaleString('hu-HU', {
  timeZone: 'Europe/Bucharest', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
}).replace(/\s/g, '').replace(/\.(\d\d):/, '. $1:') : '');
const ST = { pending: ['warn', 'Függőben'], approved: ['ok', 'Elfogadva'], rejected: ['bad', 'Elutasítva'] };
const badge = (s) => `<span class="badge ${ST[s][0]}">${ST[s][1]}</span>`;

const TABS = [
  ['activities', 'Beküldések'],
  ['runners', 'Futók és befizetések'],
  ['sponsors', 'Szponzorok'],
  ['settings', 'Beállítások'],
];

export async function renderAdmin() {
  if (!state.session) { location.hash = '#/belepes'; return; }
  if (!state.isAdmin) { location.hash = '#/'; return; }
  const tab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab') || 'activities';
  app().innerHTML = `
    <div class="tabs">${TABS.map(([k, l]) => `<a href="#/admin?tab=${k}" class="${k === tab ? 'active' : ''}">${l}</a>`).join('')}</div>
    <div id="pane"><div class="loading">Betöltés…</div></div>`;
  const pane = document.getElementById('pane');
  if (tab === 'runners') await runnersTab(pane);
  else if (tab === 'sponsors') await sponsorsTab(pane);
  else if (tab === 'settings') await settingsTab(pane);
  else await activitiesTab(pane);
}

async function loadData() {
  const [acts, profiles] = await Promise.all([
    fetchAll(() => sb.from('activities').select('*').order('created_at', { ascending: true })),
    fetchAll(() => sb.from('profiles').select('*').order('full_name')),
  ]);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return { acts, profiles, byId };
}

// ---------------------------------------------------------------------
// Beküldések jóváhagyása
// ---------------------------------------------------------------------
async function activitiesTab(pane) {
  const { acts, profiles, byId } = await loadData();

  // Gyanús ismétlések: azonos futó + dátum + km
  const dupKey = (a) => `${a.runner_id}|${a.run_date}|${Number(a.km)}`;
  const dupCount = new Map();
  for (const a of acts) if (a.status !== 'rejected') dupCount.set(dupKey(a), (dupCount.get(dupKey(a)) || 0) + 1);

  const counts = { pending: 0, approved: 0, rejected: 0 };
  for (const a of acts) counts[a.status]++;
  const approvedKm = acts.filter((a) => a.status === 'approved').reduce((x, a) => x + Number(a.km), 0);

  const todayIso = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' });
  pane.innerHTML = `
    <section class="card">
      <h2>Futás rögzítése futó helyett</h2>
      <p class="muted">A futás azonnal elfogadott lesz, mintha a futó küldte volna be. A dátumra és a km-re itt nincs korlát, a határidő sem érvényes.</p>
      <form id="manualForm" class="toolbar" autocomplete="off">
        <input id="mRunner" list="mRunners" placeholder="Futó neve vagy e-mailje…" required style="min-width:240px">
        <datalist id="mRunners">${profiles.map((p) => `<option value="${esc(p.full_name)} (${esc(p.email)})"></option>`).join('')}</datalist>
        <input id="mDate" type="date" value="${todayIso}" required>
        <input id="mKm" type="number" step="0.01" min="0.01" max="1000" placeholder="km" required style="width:110px">
        <button class="btn small" type="submit">Futás rögzítése</button>
      </form>
      <p class="muted" id="mMsg" aria-live="polite"></p>
    </section>
    <section class="card">
      <div class="row-between">
        <h2>Beküldések</h2>
        <div class="actions">
          <button class="btn ghost small" id="expActs">Export: összes futás (CSV)</button>
        </div>
      </div>
      <p class="muted">Függőben: <b>${counts.pending}</b> · Elfogadva: <b>${counts.approved}</b> (${hu(approvedKm)} km) ·
        Elutasítva: <b>${counts.rejected}</b> · Regisztrált futó: <b>${profiles.length}</b></p>
      <div class="toolbar">
        <select id="fStatus">
          <option value="pending">Függőben (${counts.pending})</option>
          <option value="approved">Elfogadva</option>
          <option value="rejected">Elutasítva</option>
          <option value="all">Mind</option>
        </select>
        <input id="fName" type="search" placeholder="Név keresése…">
        <label class="check" style="align-items:center"><input type="checkbox" id="fDup"> csak gyanús ismétlések</label>
        <button class="btn ok small" id="bulk">Összes látható elfogadása</button>
      </div>
      <div class="alist">
        <div class="arow ahead"><span class="a-who">Futó</span><span class="a-meta">Futás dátuma · km · igazolás</span><span class="a-status">Állapot</span><span class="a-act">Művelet</span></div>
        <div id="tb"></div>
      </div>
      <p class="muted" id="more"></p>
    </section>`;

  const tb = document.getElementById('tb');
  const fStatus = document.getElementById('fStatus');
  const fName = document.getElementById('fName');
  const fDup = document.getElementById('fDup');
  const LIMIT = 300;
  let visible = [];

  const rowHtml = (a) => {
    const p = byId.get(a.runner_id) || {};
    const dup = a.status !== 'rejected' && dupCount.get(dupKey(a)) > 1;
    const proof = a.proof_type === 'manual'
      ? '<span class="muted">admin rögzítette</span>'
      : a.proof_type === 'link'
        ? `<a href="${esc(a.proof_url)}" target="_blank" rel="noopener">Link ↗</a>`
        : `<a href="#" data-photo="${esc(a.photo_path)}">Kép</a>`;
    const act = a.status === 'pending'
      ? `<button class="btn ok small" data-ok="${a.id}">Elfogad</button>
         <input placeholder="Elutasítás oka…" data-reason="${a.id}" enterkeyhint="done">
         <button class="btn bad small" data-no="${a.id}">Elutasít</button>`
      : `<button class="btn ghost small" data-reset="${a.id}">Vissza függőbe</button>`;
    return `<div class="arow" id="r${a.id}">
      <div class="a-who"><span class="n">${esc(p.full_name)}</span> ${p.paid ? '' : '<span class="badge warn" title="Nevezési díj nincs visszaigazolva">nem fizetett</span>'}
        ${dup ? '<div class="flag">⚠ azonos dátum + km többször</div>' : ''}</div>
      <div class="a-meta"><span>${huDate(a.run_date)}</span> <b>${hu(a.km)} km</b> ${proof}</div>
      <div class="a-sub">beküldve ${huShort(a.created_at)}</div>
      <div class="a-status">${badge(a.status)}${a.reject_reason ? `<div class="reason">${esc(a.reject_reason)}</div>` : ''}</div>
      <div class="a-act">${act}</div>
    </div>`;
  };

  const draw = () => {
    const st = fStatus.value;
    const q = fName.value.trim().toLowerCase();
    visible = acts.filter((a) =>
      (st === 'all' || a.status === st)
      && (!q || (byId.get(a.runner_id)?.full_name || '').toLowerCase().includes(q))
      && (!fDup.checked || (a.status !== 'rejected' && dupCount.get(dupKey(a)) > 1)));
    if (st !== 'pending') visible = [...visible].reverse(); // legújabb elöl
    const shown = visible.slice(0, LIMIT);
    tb.innerHTML = shown.map(rowHtml).join('') || `<p class="muted" style="padding:14px 2px">${
      st === 'pending' && !q && !fDup.checked ? 'Nincs ellenőrzésre váró futás. ✓' : 'Nincs találat.'}</p>`;
    document.getElementById('more').textContent = visible.length > LIMIT
      ? `Az első ${LIMIT} látszik a(z) ${visible.length} találatból – szűkíts névre.` : '';
    const pendVisible = visible.filter((a) => a.status === 'pending').length;
    const bulk = document.getElementById('bulk');
    bulk.textContent = `Összes látható függő elfogadása (${pendVisible})`;
    bulk.disabled = pendVisible === 0;
  };

  const setStatus = async (ids, status, reason = null) => {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error } = await sb.from('activities')
        .update({ status, reject_reason: status === 'rejected' ? reason : null })
        .in('id', chunk);
      if (error) { alert(error.message); return false; }
    }
    const set = new Set(ids);
    for (const a of acts) if (set.has(a.id)) { a.status = status; a.reject_reason = status === 'rejected' ? reason : null; }
    return true;
  };

  tb.onclick = async (e) => {
    const el = e.target;
    if (el.dataset.photo) { e.preventDefault(); openPhoto(el.dataset.photo); return; }
    const id = Number(el.dataset.ok || el.dataset.no || el.dataset.reset);
    if (!id) return;
    setBusy(el, true);
    if (el.dataset.ok) await setStatus([id], 'approved');
    else if (el.dataset.no) {
      const reason = tb.querySelector(`[data-reason="${id}"]`).value.trim();
      if (!reason && !confirm('Indoklás nélkül utasítod el? (A futó látja az okot, érdemes megadni.)')) { setBusy(el, false); return; }
      await setStatus([id], 'rejected', reason || null);
    } else await setStatus([id], 'pending');
    // Csak az adott sort frissítjük, hogy a lista ne ugráljon
    const a = acts.find((x) => x.id === id);
    const row = document.getElementById(`r${id}`);
    if (row) row.outerHTML = rowHtml(a);
  };

  document.getElementById('bulk').onclick = async (e) => {
    const ids = visible.filter((a) => a.status === 'pending').map((a) => a.id);
    if (!ids.length || !confirm(`${ids.length} függő beküldés elfogadása. Átnézted mindet?`)) return;
    setBusy(e.target, true);
    await setStatus(ids, 'approved');
    setBusy(e.target, false);
    draw();
  };

  fStatus.onchange = draw;
  fName.oninput = draw;
  fDup.onchange = draw;

  // Kézi rögzítés: az admin által felvitt futás azonnal elfogadott
  const byLabel = new Map(profiles.map((p) => [`${p.full_name} (${p.email})`.toLowerCase(), p]));
  document.getElementById('manualForm').onsubmit = async (e) => {
    e.preventDefault();
    const msg = document.getElementById('mMsg');
    const btn = e.target.querySelector('button');
    const key = document.getElementById('mRunner').value.trim().toLowerCase();
    const matches = byLabel.get(key)
      ? [byLabel.get(key)]
      : profiles.filter((p) => p.full_name.toLowerCase() === key || p.email.toLowerCase() === key);
    if (matches.length !== 1) {
      msg.textContent = matches.length ? 'Több futó is egyezik – válaszd ki a listából név + e-mail szerint.' : 'Nincs ilyen futó. Válassz a listából.';
      return;
    }
    const p = matches[0];
    const date = document.getElementById('mDate').value;
    const km = Number(document.getElementById('mKm').value);
    if (!date || !(km > 0)) { msg.textContent = 'Adj meg dátumot és pozitív km-et.'; return; }
    if (!confirm(`${p.full_name}: ${hu(km)} km, ${huDate(date)}. Rögzítsem elfogadott futásként?`)) return;
    setBusy(btn, true);
    const { error } = await sb.from('activities').insert({
      runner_id: p.id, run_date: date, km, proof_type: 'manual', status: 'approved', reviewed_at: new Date().toISOString(),
    });
    setBusy(btn, false);
    if (error) { msg.textContent = `Hiba: ${error.message}`; return; }
    await renderAdmin();
  };

  document.getElementById('expActs').onclick = () => {
    const rows = [['ID', 'Beküldve', 'Futó', 'E-mail', 'Befizetett', 'Futás dátuma', 'Km', 'Igazolás típusa', 'Link', 'Kép', 'Állapot', 'Elutasítás oka']];
    for (const a of acts) {
      const p = byId.get(a.runner_id) || {};
      rows.push([a.id, huDT(a.created_at), p.full_name, p.email, p.paid ? 'igen' : 'nem', a.run_date, csvNum(a.km),
        a.proof_type === 'manual' ? 'admin' : a.proof_type === 'link' ? 'link' : 'kép', a.proof_url || '', a.photo_path || '', ST[a.status][1], a.reject_reason || '']);
    }
    downloadCsv(`futasok_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  draw();
}

// ---------------------------------------------------------------------
// Futók és befizetések
// ---------------------------------------------------------------------
async function runnersTab(pane) {
  const { acts, profiles } = await loadData();
  const km = new Map();
  const pend = new Map();
  for (const a of acts) {
    if (a.status === 'approved') km.set(a.runner_id, (km.get(a.runner_id) || 0) + Number(a.km));
    if (a.status === 'pending') pend.set(a.runner_id, (pend.get(a.runner_id) || 0) + 1);
  }
  const paidCount = profiles.filter((p) => p.paid).length;
  const unpaidWithKm = profiles.filter((p) => !p.paid && km.get(p.id)).length;

  pane.innerHTML = `
    <section class="card">
      <div class="row-between">
        <h2>Futók és befizetések</h2>
        <button class="btn ghost small" id="exp">Export: futók (CSV)</button>
      </div>
      <p class="muted">Regisztrált: <b>${profiles.length}</b> · Befizetés visszaigazolva: <b>${paidCount}</b> ·
        Nem fizetett, de van elfogadott km-je: <b>${unpaidWithKm}</b> (ezek nem számítanak a ranglistán)</p>
      <div class="toolbar">
        <input id="q" type="search" placeholder="Név, e-mail vagy település…">
        <select id="fPaid"><option value="all">Mind</option><option value="unpaid">Nem fizetett</option><option value="paid">Fizetett</option></select>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th style="min-width:210px">Név</th><th>E-mail / telefon</th><th class="hide-sm">Regisztrált</th><th>Befizetve</th><th style="min-width:180px">Megjegyzés (pl. kivonat dátuma)</th><th class="num">Elfogadott km</th><th class="num">Függő</th></tr></thead>
        <tbody id="tb"></tbody>
      </table></div>
    </section>`;

  const tb = document.getElementById('tb');
  const draw = () => {
    const q = document.getElementById('q').value.trim().toLowerCase();
    const fp = document.getElementById('fPaid').value;
    const list = profiles.filter((p) =>
      (!q || p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || (p.city || '').toLowerCase().includes(q))
      && (fp === 'all' || (fp === 'paid') === p.paid));
    tb.innerHTML = list.map((p) => `<tr>
      <td><input value="${esc(p.full_name)}" data-name="${p.id}" title="${esc(p.full_name)} – javítás: írd át, Enter ment"></td>
      <td class="email">${esc(p.email)}${p.phone ? `<br><span class="muted">${esc(p.phone)}</span>` : ''}${p.city ? `<br><span class="muted">${esc(p.city)}</span>` : ''}</td>
      <td class="muted nowrap hide-sm" style="font-size:.8rem">${huShort(p.created_at)}</td>
      <td><label class="check nowrap"><input type="checkbox" data-paid="${p.id}" ${p.paid ? 'checked' : ''}>
        <span class="muted" style="font-size:.8rem">${p.paid_at ? huShort(p.paid_at) : ''}</span></label></td>
      <td><input value="${esc(p.payment_note || '')}" data-note="${p.id}" placeholder="—" title="${esc(p.payment_note || '')}"></td>
      <td class="num">${hu(km.get(p.id) || 0)}</td>
      <td class="num">${pend.get(p.id) || ''}</td>
    </tr>`).join('') || '<tr><td colspan="7" class="muted">Nincs találat.</td></tr>';
  };

  const save = async (id, patch, el) => {
    const { data, error } = await sb.from('profiles').update(patch).eq('id', id).select().single();
    if (error) { alert(error.message); return; }
    Object.assign(profiles.find((p) => p.id === id), data);
    if (el) { el.style.outline = '2px solid #0F7360'; setTimeout(() => { el.style.outline = ''; }, 800); }
  };

  tb.onchange = async (e) => {
    const el = e.target;
    if (el.dataset.paid) { await save(el.dataset.paid, { paid: el.checked }); draw(); }
    else if (el.dataset.note) await save(el.dataset.note, { payment_note: el.value.trim() || null }, el);
    else if (el.dataset.name) {
      const v = el.value.trim().replace(/\s+/g, ' ');
      if (v.length < 3) { alert('A név legalább 3 karakter.'); return; }
      await save(el.dataset.name, { full_name: v }, el);
    }
  };
  tb.onkeydown = (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); };
  document.getElementById('q').oninput = draw;
  document.getElementById('fPaid').onchange = draw;

  document.getElementById('exp').onclick = () => {
    const rows = [['Név', 'E-mail', 'Telefon', 'Település', 'Regisztrált', 'Befizetve', 'Befizetés rögzítve', 'Megjegyzés', 'Elfogadott km', 'Függő futás']];
    for (const p of profiles) {
      rows.push([p.full_name, p.email, p.phone || '', p.city || '', huDT(p.created_at), p.paid ? 'igen' : 'nem', huDT(p.paid_at),
        p.payment_note || '', csvNum((km.get(p.id) || 0).toFixed(2)), pend.get(p.id) || 0]);
    }
    downloadCsv(`futok_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  draw();
}

// ---------------------------------------------------------------------
// Szponzorok és adományok
// ---------------------------------------------------------------------
async function sponsorsTab(pane) {
  const price = Number(state.settings.km_price);
  const { data: list, error } = await sb.from('sponsors').select('*').order('created_at');
  if (error) throw error;

  const sum = (arr) => arr.reduce((x, s) => x + Number(s.amount), 0);
  const paid = list.filter((s) => s.paid);

  pane.innerHTML = `
    <section class="card">
      <h2>Új szponzor / adomány</h2>
      <form id="f">
        <div class="form-grid">
          <label>Típus<select name="kind"><option value="company">Cég</option><option value="person">Magánszemély / adomány</option></select></label>
          <label>Név<input name="name" required></label>
          <label>Összeg (lej)<input name="amount" inputmode="decimal" required></label>
          <label>Logó URL <span class="muted">(nem kötelező)</span><input name="logo_url" placeholder="https://…"></label>
          <label>Weboldal <span class="muted">(nem kötelező)</span><input name="website" placeholder="https://…"></label>
          <label>Megjegyzés<input name="note" placeholder="pl. szerződés száma, kivonat dátuma"></label>
        </div>
        <div class="radio-row">
          <label><input type="checkbox" name="paid"> Befizetve</label>
          <label><input type="checkbox" name="show_public" checked> Megjelenik a főoldalon</label>
        </div>
        <button class="btn" type="submit">Hozzáadás</button>
      </form>
    </section>
    <section class="card">
      <div class="row-between"><h2>Szponzorok</h2><button class="btn ghost small" id="exp">Export (CSV)</button></div>
      <p class="muted">Befizetve: <b>${hu(sum(paid), 0)} lej</b> = <b>${hu(sum(paid) / price, 0)} km</b> ·
        Összes vállalás: ${hu(sum(list), 0)} lej · Km-ár: ${hu(price)} lej/km</p>
      <div class="table-wrap"><table>
        <thead><tr><th style="min-width:160px">Név</th><th class="hide-sm">Típus</th><th class="num">Összeg</th><th class="num">Km</th><th>Befizetve</th><th>Nyilvános</th><th>Megjegyzés</th><th></th></tr></thead>
        <tbody id="tb">${list.map((s) => `<tr>
          <td>${s.logo_url ? `<img src="${esc(s.logo_url)}" alt="" onerror="this.remove()" style="height:22px;vertical-align:middle;margin-right:6px">` : ''}${esc(s.name)}</td>
          <td class="hide-sm">${s.kind === 'company' ? 'Cég' : 'Magánszemély'}</td>
          <td class="num">${hu(s.amount, 0)}</td>
          <td class="num">${hu(s.amount / price, 0)}</td>
          <td><input type="checkbox" data-paid="${s.id}" ${s.paid ? 'checked' : ''}></td>
          <td><input type="checkbox" data-pub="${s.id}" ${s.show_public ? 'checked' : ''}></td>
          <td><input value="${esc(s.note || '')}" data-note="${s.id}" placeholder="—" title="${esc(s.note || '')}"></td>
          <td><button class="btn ghost small" data-del="${s.id}">Törlés</button></td>
        </tr>`).join('') || '<tr><td colspan="8" class="muted">Még nincs szponzor.</td></tr>'}</tbody>
      </table></div>
    </section>`;

  const f = document.getElementById('f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const amount = Number(String(fd.get('amount')).replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0) { alert('Érvénytelen összeg.'); return; }
    const { error: err } = await sb.from('sponsors').insert({
      kind: fd.get('kind'), name: String(fd.get('name')).trim(), amount,
      logo_url: String(fd.get('logo_url') || '').trim() || null,
      website: String(fd.get('website') || '').trim() || null,
      note: String(fd.get('note') || '').trim() || null,
      paid: fd.get('paid') === 'on', show_public: fd.get('show_public') === 'on',
    });
    if (err) { alert(err.message); return; }
    sponsorsTab(pane);
  };

  const tb = document.getElementById('tb');
  tb.onchange = async (e) => {
    const el = e.target;
    let patch = null; let id = null;
    if (el.dataset.paid) { id = el.dataset.paid; patch = { paid: el.checked }; }
    else if (el.dataset.pub) { id = el.dataset.pub; patch = { show_public: el.checked }; }
    else if (el.dataset.note) { id = el.dataset.note; patch = { note: el.value.trim() || null }; }
    if (!patch) return;
    const { error: err } = await sb.from('sponsors').update(patch).eq('id', id);
    if (err) { alert(err.message); return; }
    if (el.dataset.paid) sponsorsTab(pane);
  };
  tb.onclick = async (e) => {
    const id = e.target.dataset.del;
    if (!id || !confirm('Biztosan törlöd?')) return;
    const { error: err } = await sb.from('sponsors').delete().eq('id', id);
    if (err) { alert(err.message); return; }
    sponsorsTab(pane);
  };

  document.getElementById('exp').onclick = () => {
    const rows = [['Név', 'Típus', 'Összeg (lej)', 'Km', 'Befizetve', 'Nyilvános', 'Megjegyzés']];
    for (const s of list) rows.push([s.name, s.kind === 'company' ? 'cég' : 'magánszemély', csvNum(s.amount),
      csvNum(Math.round(s.amount / price)), s.paid ? 'igen' : 'nem', s.show_public ? 'igen' : 'nem', s.note || '']);
    downloadCsv(`szponzorok_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };
}

// ---------------------------------------------------------------------
// Beállítások
// ---------------------------------------------------------------------
async function settingsTab(pane) {
  await loadSettings();
  const s = state.settings;
  pane.innerHTML = `
    <section class="card">
      <h2>Beállítások</h2>
      <form id="f">
        <label>Esemény neve<input name="event_name" value="${esc(s.event_name)}" required></label>
        <div class="form-grid">
          <label>Kezdőnap<input name="event_start" type="date" value="${s.event_start}" required></label>
          <label>Utolsó futónap<input name="event_end" type="date" value="${s.event_end}" required></label>
          <label>Beküldési határidő (bukaresti idő)<input name="submit_deadline" type="datetime-local" value="${toLocalInput(s.submit_deadline)}" required></label>
          <label>Km-ár (lej/km)<input name="km_price" inputmode="decimal" value="${s.km_price}" required></label>
          <label>Max. km egy futásra<input name="max_km_per_activity" inputmode="decimal" value="${s.max_km_per_activity}" required></label>
          <label>Nevezési díj (lej) <span class="muted">(nem kötelező)</span><input name="entry_fee" inputmode="decimal" value="${s.entry_fee ?? ''}"></label>
        </div>
        <label>Utalási adatok – magyarul (a nem fizetett futók látják)<textarea name="bank_info_hu" rows="4" placeholder="Kedvezményezett: …&#10;IBAN: RO…&#10;Bank: …">${esc(s.bank_info_hu)}</textarea></label>
        <label>Utalási adatok – románul<textarea name="bank_info_ro" rows="4" placeholder="Beneficiar: …&#10;IBAN: RO…&#10;Banca: …">${esc(s.bank_info_ro)}</textarea></label>
        <button class="btn" type="submit">Mentés</button>
        <p class="msg" id="msg"></p>
      </form>
    </section>`;

  const f = document.getElementById('f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const num = (k) => { const v = String(fd.get(k) || '').replace(',', '.').trim(); return v === '' ? null : Number(v); };
    // December = EET (UTC+2); nyári időszámításban +3 lenne, de az esemény decemberben van
    const patch = {
      event_name: String(fd.get('event_name')).trim(),
      event_start: fd.get('event_start'),
      event_end: fd.get('event_end'),
      submit_deadline: `${fd.get('submit_deadline')}:00+02:00`,
      km_price: num('km_price'),
      max_km_per_activity: num('max_km_per_activity'),
      entry_fee: num('entry_fee'),
      bank_info_hu: String(fd.get('bank_info_hu') || ''),
      bank_info_ro: String(fd.get('bank_info_ro') || ''),
    };
    const msg = document.getElementById('msg');
    if (patch.event_end < patch.event_start) { msg.className = 'msg err'; msg.textContent = 'Az utolsó nap nem lehet a kezdőnap előtt.'; return; }
    const { error } = await sb.from('settings').update(patch).eq('id', 1);
    msg.className = error ? 'msg err' : 'msg ok';
    msg.textContent = error ? error.message : 'Elmentve.';
    if (!error) await loadSettings();
  };
}
