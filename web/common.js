import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=13';
import { dict } from './i18n.js?v=13';

export const configured = !SUPABASE_URL.includes('IDE-A-') && !SUPABASE_ANON_KEY.includes('IDE-A-');
export const sb = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

export const state = {
  lang: localStorage.getItem('lang') === 'ro' ? 'ro' : 'hu',
  session: null,
  profile: null,
  isAdmin: false,
  settings: null,
};

export const app = () => document.getElementById('app');

export function t(key, vars = {}) {
  let s = dict[state.lang]?.[key] ?? dict.hu[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const locale = () => (state.lang === 'hu' ? 'hu-HU' : 'ro-RO');
export const fmtKm = (n, digits = 2) => Number(n || 0).toLocaleString(locale(), {
  minimumFractionDigits: digits, maximumFractionDigits: digits,
});
export const fmtNum = (n) => Number(n || 0).toLocaleString(locale());

export function fmtDate(d) {
  if (!d) return '';
  const [y, m, dd] = String(d).slice(0, 10).split('-');
  return state.lang === 'hu' ? `${y}.${m}.${dd}.` : `${dd}.${m}.${y}`;
}

export function fmtDateTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString(locale(), {
    timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/** Mai nap Bukarest szerint, YYYY-MM-DD */
export const todayStr = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' });

/** timestamptz → datetime-local érték (Bukarest szerint) */
export const toLocalInput = (ts) =>
  new Date(ts).toLocaleString('sv-SE', { timeZone: 'Europe/Bucharest' }).slice(0, 16).replace(' ', 'T');

/** Bukaresti helyi dátum + idő -> időbélyeg (ms). A nyári időszámítást is kezeli. */
export function bucharestMs(dateStr, time = '00:00:00') {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm, ss] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm, ss);
  const offsetAt = (ms) => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Bucharest', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(ms));
    const g = (t) => Number(p.find((x) => x.type === t).value);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - ms;
  };
  let ms = wall - offsetAt(wall);
  ms = wall - offsetAt(ms);
  return ms;
}

/** Indulásig visszaszámol; a kihívás alatt felfelé számol az indulás óta eltelt időt. Különben null. */
export function countdownTarget() {
  const s = state.settings;
  const phase = eventPhase();
  if (phase === 'before') return { kind: 'before', ms: bucharestMs(s.event_start) };
  if (phase === 'during') return { kind: 'during', ms: bucharestMs(s.event_start), up: true };
  return null;
}

/** Az esemény fázisa: before | during | grace | closed */
export function eventPhase() {
  const s = state.settings;
  const today = todayStr();
  if (new Date() > new Date(s.submit_deadline)) return 'closed';
  if (today < s.event_start) return 'before';
  if (today <= s.event_end) return 'during';
  return 'grace';
}

/** Több mint 1000 sor lekérése lapozva (a Supabase alapból max. 1000 sort ad vissza) */
export async function fetchAll(build) {
  const out = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await build().range(from, from + size - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}

export async function loadSettings() {
  const { data, error } = await sb.from('settings').select('*').eq('id', 1).single();
  if (error) throw error;
  state.settings = data;
}

export async function loadSession() {
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  state.profile = null;
  state.isAdmin = false;
  if (state.session) {
    const uid = state.session.user.id;
    const [{ data: p }, { data: adm }] = await Promise.all([
      sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
      sb.rpc('is_admin'),
    ]);
    state.profile = p;
    state.isAdmin = !!adm;
  }
}

export function showModal(html) {
  const m = document.getElementById('modal');
  m.innerHTML = `<div class="inner">${html}<div><button class="btn ghost small" data-close>${t('close')}</button></div></div>`;
  m.hidden = false;
  const close = () => { m.hidden = true; m.innerHTML = ''; };
  m.onclick = (e) => { if (e.target === m || e.target.hasAttribute('data-close')) close(); };
}

export async function openPhoto(path) {
  const { data, error } = await sb.storage.from('proofs').createSignedUrl(path, 3600);
  if (error) { alert(error.message); return; }
  showModal(`<img src="${esc(data.signedUrl)}" alt=""><p><a href="${esc(data.signedUrl)}" target="_blank" rel="noopener">${t('view_photo')} ↗</a></p>`);
}

/** Link kiszedése szövegből, pl. "Check out my run on Strava: https://…" */
export function extractUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0] : null;
}

export function downloadCsv(filename, rows) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Excelhez: tizedesvessző */
export const csvNum = (n) => String(Number(n || 0)).replace('.', ',');

export function setBusy(btn, busy) {
  if (!btn) return;
  btn.disabled = busy;
}

export const FB_URL = 'https://www.facebook.com/fitnesstribegroup';
export const fbIcon = '<svg class="fb-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.3 0-3.9 1.4-3.9 4v2.2H8V13.5h2.5V21h3z"/></svg>';
