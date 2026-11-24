// =====================================================================
// OFFLINE DEMÓ – a Supabase helyett a böngésző localStorage-ában tárol.
// Ugyanazokat a szabályokat utánozza, mint a valódi adatbázis (schema.sql).
// =====================================================================
const KEY = 'kgy_demo_db_v1';
const VARIANT = 'kgy_demo_variant';
const SESSION = 'kgy_demo_session';
const PHOTO = 'kgy_demo_photo:';

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' });
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const now = () => new Date().toISOString();
const err = (message, code) => ({ message, code });

// ---------------------------------------------------------------------
// Kezdő tesztadatok
// ---------------------------------------------------------------------
function seed() {
  const t = today();
  // A demóban az esemény "most" zajlik, hogy a beküldés kipróbálható legyen
  const start = addDays(t, -6);
  const db = {
    seq: 1000,
    settings: [{
      id: 1, event_name: 'Kilométerekkel a Gyerekekért – Fitness Tribe Jótékonysági Futás, III. kiadás / Cu kilometri pentru copii – Eveniment de Alergare Caritabilă Fitness Tribe, ediția a III-a', event_start: start, event_end: addDays(t, 14),
      submit_deadline: new Date(`${addDays(t, 15)}T23:59:59+02:00`).toISOString(),
      km_price: 2, max_km_per_activity: 100, entry_fee: 50,
      bank_info_hu: 'Számlaszám: RO24BTRLRONCRT0465351002\nMegnevezés: ASOCIATIA FITNESS TRIBE EGYESULET\nMegjegyzés: "név + donatie pentru copiii"',
      bank_info_ro: 'Cont: RO24BTRLRONCRT0465351002\nDenumire: ASOCIATIA FITNESS TRIBE EGYESULET\nNotă: "nume + donatie pentru copiii"',
    }],
    users: [], admins: [], profiles: [], activities: [],
    sponsors: [
      ['PAPIRUS IMPEX SRL', 800, true], ['BERTIKRIS SRL', 4000, true], ['CONSTRUCTII CONICO SRL', 1500, true],
      ['HYDROKOV SA', 2000, true], ['HORVATH SERVICE', 1000, true], ['KBS SPED SRL', 1000, false],
    ].map(([name, amount, paid], i) => ({
      id: i + 1, kind: 'company', name, amount, paid, show_public: true, logo_url: null, website: null, note: null, created_at: now(),
    })),
  };
  const addUser = (email, password, full_name, paid, admin = false) => {
    const id = uuid();
    db.users.push({ id, email, password });
    db.profiles.push({ id, full_name, email, phone: null, consent_at: now(), paid, paid_at: paid ? now() : null, payment_note: paid ? 'demó' : null, created_at: now() });
    if (admin) db.admins.push(id);
    return id;
  };
  addUser('admin@demo.ro', 'admin123', 'Bács Mihály', true, true);
  const anna = addUser('anna@demo.ro', 'futo1234', 'Kiss Anna', false);
  const runners = [
    ['Szekeres Szabolcs', true, 22], ['Vas Lenke', true, 14], ['Nagy Katalin', true, 12], ['Butyka Elemér', true, 11],
    ['Vajna Miklós', true, 9], ['Pénzes Szabolcs', true, 8], ['Gajdó Éva', false, 6], ['Marin Constantin', true, 10],
    ['Stefán Emese', true, 7], ['Tompa Maria', false, 5],
  ].map(([n, paid, avg], i) => [addUser(`futo${i + 1}@demo.ro`, 'futo1234', n, paid), avg]);

  let r = 7;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  for (const [id, avg] of runners) {
    for (let d = 0; d < 6; d++) {
      if (rnd() < 0.35) continue;
      const km = Math.round((avg * (0.6 + rnd() * 0.8)) * 100) / 100;
      const st = d >= 4 && rnd() < 0.5 ? 'pending' : 'approved';
      db.activities.push({
        id: ++db.seq, runner_id: id, run_date: addDays(start, d), km, proof_type: 'link',
        proof_url: `https://strava.app.link/demo${db.seq}`, photo_path: null, status: st, reject_reason: null,
        created_at: new Date(Date.now() - (6 - d) * 864e5).toISOString(), reviewed_at: st === 'approved' ? now() : null,
      });
    }
  }
  // Egy gyanús dupla beküldés és Anna futásai
  const sz = runners[0][0];
  for (let k = 0; k < 2; k++) db.activities.push({ id: ++db.seq, runner_id: sz, run_date: addDays(t, -1), km: 21.1, proof_type: 'link', proof_url: `https://strava.app.link/dup${k}`, photo_path: null, status: 'pending', reject_reason: null, created_at: now(), reviewed_at: null });
  db.activities.push({ id: ++db.seq, runner_id: anna, run_date: addDays(t, -2), km: 5.3, proof_type: 'link', proof_url: 'https://strava.app.link/anna1', photo_path: null, status: 'approved', reject_reason: null, created_at: now(), reviewed_at: now() });
  db.activities.push({ id: ++db.seq, runner_id: anna, run_date: addDays(t, -1), km: 3, proof_type: 'link', proof_url: 'https://strava.app.link/anna2', photo_path: null, status: 'rejected', reject_reason: 'A link nem publikus', created_at: now(), reviewed_at: now() });
  return db;
}

// Legrosszabb eset: valószerű, de a felületet próbára tevő adatok (break-ui)
function seedWorst() {
  const db = seed();
  const s = db.settings[0];
  s.event_name = 'Kilométerekkel a Gyerekekért III / Kilometri pentru Copii III';
  s.bank_info_hu = 'Számlaszám: RO24BTRLRONCRT0465351002\nMegnevezés: ASOCIATIA FITNESS TRIBE EGYESULET\nMegjegyzés: "név + donatie pentru copiii" (DEMÓ: ez a sor csak a hosszú szöveg elrendezését teszteli, nagyon hosszú összetett név esetén is)';
  s.bank_info_ro = s.bank_info_hu;
  const names = [
    ['Kisfaludi-Bak Zsombor Előd Botond Szabolcs Lehel Árpád Csaba Gergely Barnabás', 'zsombor.elod.botond.kisfaludi-bak@szekelymikokollegium-sepsiszentgyorgy.example.ro'],
    ['Aleksandra Wiśniewska-Kowalczyk', 'bartholomew.fitzgerald@northwind-industries-holdings.example.com'],
    ['Jo', 'a@b.test'],
    ['Ștefănescu-Brâncoveanu Ana-Maria Iuliana', 'ana.maria+kilometri@example.com'],
    ['<script>alert(1)</script> &amp; **Teszt**', 'xss@example.com'],
    ['ILYÉS-FEJÉR IZABELLA', 'izabellailyesfejer@example.com'],
  ];
  const ids = db.profiles.filter((p) => !db.admins.includes(p.id) && p.email !== 'anna@demo.ro').map((p) => p.id);
  names.forEach(([n, e], i) => { const p = db.profiles.find((x) => x.id === ids[i]); p.full_name = n; p.email = e; db.users.find((u) => u.id === p.id).email = e; });
  const big = db.profiles.find((x) => x.id === ids[0]);
  big.paid = true; big.phone = '+40 740 123 456 / 0267 123 456 (munkahelyi)';
  big.payment_note = 'Kivonat 2026.12.03, BT, a férje számlájáról utalva (Szőcs István), 100 lej két nevezésre – a másik: Szőcs Linda Leila';
  const t = today();
  for (let d = 0; d < 13; d++) db.activities.push({ id: ++db.seq, runner_id: big.id, run_date: addDays(s.event_start, d % 6), km: 98.81, proof_type: 'link',
    proof_url: `https://connect.garmin.com/modern/activity/1723456789${d}?share_unique_id=0f9e8d7c6b5a49382716f5e4d3c2b1a0${d}`, photo_path: null,
    status: 'approved', reject_reason: null, created_at: now(), reviewed_at: now() });
  const anna = db.profiles.find((x) => x.email === 'anna@demo.ro');
  anna.full_name = 'Kiss Anna-Krisztina Szidónia';
  db.activities.push({ id: ++db.seq, runner_id: anna.id, run_date: addDays(t, -1), km: 0.01, proof_type: 'link',
    proof_url: 'https://www.strava.com/activities/12345678901234?share_sig=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789&utm_source=android_share', photo_path: null,
    status: 'rejected', reject_reason: 'A képernyőképen nem látszik a dátum és a megtett táv, kérlek töltsd fel újra a teljes képet közvetlenül a Strava alkalmazásból, ne a galériából.', created_at: now(), reviewed_at: now() });
  db.activities.push({ id: ++db.seq, runner_id: anna.id, run_date: addDays(t, -1), km: 100, proof_type: 'link',
    proof_url: 'https://strava.app.link/maxkm', photo_path: null, status: 'pending', reject_reason: null, created_at: now(), reviewed_at: null });
  db.sponsors = [
    ['ASOCIAȚIA SPORTIVĂ ȘI CULTURALĂ PENTRU COPIII DIN SFÂNTU GHEORGHE', 25000, 'https://example.com/nincs-ilyen-logo.png', 'https://example.com'],
    ['Kovászna Megyei Vállalkozók Szövetsége — Covasna Business Association', 4000, null, null],
    ['X', 2, null, null],
    ['BERTIKRIS SRL', 4000, null, 'https://example.com/bertikris'],
  ].map(([name, amount, logo_url, website], i) => ({ id: i + 1, kind: 'company', name, amount, paid: true, show_public: true, logo_url, website,
    note: i === 0 ? 'Szerződés nr. 1284/2026.11.28, kivonat 2026.12.02, a teljes összeg két részletben érkezett (15 000 + 10 000)' : null, created_at: now() }));
  return db;
}
function seedEmpty() {
  const db = seed();
  const admin = db.admins[0];
  db.users = db.users.filter((u) => u.id === admin || u.email === 'anna@demo.ro');
  db.profiles = db.profiles.filter((p) => db.users.some((u) => u.id === p.id));
  db.activities = [];
  db.sponsors = [];
  return db;
}
const variant = () => localStorage.getItem(VARIANT) || 'demo';
let db;
try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
if (!db) { db = variant() === 'worst' ? seedWorst() : variant() === 'empty' ? seedEmpty() : seed(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.warn(e); } };
save();

export function setVariant(v) {
  localStorage.setItem(VARIANT, v);
  resetDemo(true);
}
export const currentVariant = variant;
export function resetDemo(keepVariant = false) {
  if (!keepVariant) localStorage.removeItem(VARIANT);
  for (const k of Object.keys(localStorage)) if (k.startsWith(PHOTO)) localStorage.removeItem(k);
  localStorage.removeItem(KEY);
  localStorage.removeItem(SESSION);
}
export function demoLogin(email) {
  const u = db.users.find((x) => x.email === email);
  if (u) localStorage.setItem(SESSION, u.id);
}

const uid = () => localStorage.getItem(SESSION) || null;
const isAdmin = () => db.admins.includes(uid());
const settings = () => db.settings[0];
const paidSet = () => new Set(db.profiles.filter((p) => p.paid).map((p) => p.id));

// ---------------------------------------------------------------------
// Jogosultságok (a schema.sql RLS szabályainak megfelelően)
// ---------------------------------------------------------------------
const canSee = {
  settings: () => true,
  profiles: (r) => r.id === uid() || isAdmin(),
  activities: (r) => r.runner_id === uid() || isAdmin(),
  sponsors: () => isAdmin(),
};

function beforeInsert(table, row) {
  if (table === 'activities') {
    if (!uid()) throw err('not authenticated');
    const s = settings();
    if (!isAdmin()) {
      Object.assign(row, { runner_id: uid(), status: 'pending', reject_reason: null, reviewed_at: null });
      if (new Date() > new Date(s.submit_deadline)) throw err('DEADLINE_PASSED');
      if (row.run_date < s.event_start || row.run_date > s.event_end) throw err('DATE_OUT_OF_RANGE');
      if (row.run_date > today()) throw err('DATE_IN_FUTURE');
      if (Number(row.km) > Number(s.max_km_per_activity)) throw err('KM_TOO_HIGH');
    }
    if (!(Number(row.km) > 0)) throw err('km check');
    const okProof = (row.proof_type === 'link' && /^https?:\/\//i.test(row.proof_url || ''))
      || (row.proof_type === 'photo' && row.photo_path);
    if (!okProof) throw err('new row violates check constraint "proof_present"', '23514');
    if (row.proof_url && db.activities.some((a) => a.status !== 'rejected' && (a.proof_url || '').toLowerCase() === row.proof_url.toLowerCase())) {
      throw err('duplicate key value violates unique constraint "activities_proof_url_uniq"', '23505');
    }
    return { id: ++db.seq, photo_path: null, proof_url: null, created_at: now(), status: 'pending', reject_reason: null, reviewed_at: null, ...row };
  }
  if (table === 'sponsors') {
    if (!isAdmin()) throw err('new row violates row-level security policy');
    return { id: ++db.seq, created_at: now(), kind: 'company', paid: false, show_public: true, ...row };
  }
  throw err('insert not allowed');
}

function applyUpdate(table, row, patch) {
  if (table === 'settings') { if (!isAdmin()) return false; Object.assign(row, patch); return true; }
  if (table === 'sponsors') { if (!isAdmin()) return false; Object.assign(row, patch); return true; }
  if (table === 'activities') {
    if (!isAdmin()) return false;
    if (patch.status && patch.status !== row.status) {
      row.reviewed_at = patch.status === 'pending' ? null : now();
      if (patch.status !== 'rejected') patch = { ...patch, reject_reason: null };
    }
    Object.assign(row, patch);
    return true;
  }
  if (table === 'profiles') {
    if (!(row.id === uid() || isAdmin())) return false;
    const p = { ...patch };
    if (!isAdmin()) { delete p.paid; delete p.paid_at; delete p.payment_note; delete p.email; }
    else if ('paid' in p && p.paid !== row.paid) p.paid_at = p.paid ? now() : null;
    if (p.full_name) p.full_name = p.full_name.trim().replace(/\s+/g, ' ');
    Object.assign(row, p);
    return true;
  }
  return false;
}

function canDelete(table, row) {
  if (table === 'activities') return isAdmin() || (row.runner_id === uid() && row.status === 'pending');
  if (table === 'sponsors' || table === 'profiles') return isAdmin();
  return false;
}

// ---------------------------------------------------------------------
// Lekérdezés-építő (a supabase-js API azon része, amit az oldal használ)
// ---------------------------------------------------------------------
class Query {
  constructor(table) { this.table = table; this.filters = []; this.orders = []; this.op = 'select'; this.mode = null; this.ret = false; }
  select() { if (this.op !== 'select') this.ret = true; return this; }
  eq(k, v) { this.filters.push((r) => String(r[k]) === String(v)); return this; }
  in(k, vs) { const s = new Set(vs.map(String)); this.filters.push((r) => s.has(String(r[k]))); return this; }
  order(k, o = {}) { this.orders.push([k, o.ascending !== false]); return this; }
  range(a, b) { this.rng = [a, b]; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  single() { this.mode = 'one'; return this; }
  insert(v) { this.op = 'insert'; this.val = v; return this; }
  update(v) { this.op = 'update'; this.val = v; return this; }
  delete() { this.op = 'delete'; return this; }
  then(resolve) { resolve(this.run()); }
  run() {
    try {
      const T = db[this.table];
      const vis = canSee[this.table];
      let rows;
      if (this.op === 'insert') {
        const list = (Array.isArray(this.val) ? this.val : [this.val]).map((v) => beforeInsert(this.table, { ...v }));
        T.push(...list);
        rows = list;
      } else {
        rows = T.filter((r) => vis(r) && this.filters.every((f) => f(r)));
        if (this.op === 'update') rows = rows.filter((r) => applyUpdate(this.table, r, { ...this.val }));
        if (this.op === 'delete') {
          rows = rows.filter((r) => canDelete(this.table, r));
          for (const r of rows) T.splice(T.indexOf(r), 1);
        }
      }
      if (this.op !== 'select') save();
      rows = rows.map((r) => ({ ...r }));
      for (const [k, asc] of [...this.orders].reverse()) {
        rows.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (asc ? 1 : -1));
      }
      if (this.rng) rows = rows.slice(this.rng[0], this.rng[1] + 1);
      if (this.mode) {
        if (this.mode === 'one' && rows.length !== 1) return { data: null, error: err('JSON object requested, multiple (or no) rows returned') };
        return { data: rows[0] || null, error: null };
      }
      return { data: rows, error: null };
    } catch (e) {
      return { data: null, error: e.message ? e : err(String(e)) };
    }
  }
}

// ---------------------------------------------------------------------
// Nyilvános függvények (public_leaderboard, public_stats, public_sponsors)
// ---------------------------------------------------------------------
function leaderboard() {
  const paid = paidSet();
  const m = new Map();
  for (const a of db.activities) {
    if (a.status !== 'approved' || !paid.has(a.runner_id)) continue;
    const p = db.profiles.find((x) => x.id === a.runner_id);
    const e = m.get(a.runner_id) || { runner_id: a.runner_id, full_name: p.full_name, km: 0, runs: 0 };
    e.km += Number(a.km); e.runs++;
    m.set(a.runner_id, e);
  }
  return [...m.values()].map((e) => ({ ...e, km: Math.round(e.km * 100) / 100 }))
    .sort((a, b) => b.km - a.km || a.full_name.localeCompare(b.full_name));
}
const rpcs = {
  is_admin: () => isAdmin(),
  public_daily: () => {
    const paid = paidSet();
    const m = new Map();
    for (const a of db.activities) {
      if (a.status !== 'approved' || !paid.has(a.runner_id)) continue;
      const e = m.get(a.run_date) || { run_date: a.run_date, km: 0, set: new Set() };
      e.km += Number(a.km); e.set.add(a.runner_id);
      m.set(a.run_date, e);
    }
    return [...m.values()].sort((a, b) => (a.run_date < b.run_date ? -1 : 1))
      .map((e) => ({ run_date: e.run_date, km: Math.round(e.km * 100) / 100, runners: e.set.size }));
  },
  public_leaderboard: leaderboard,
  public_runner_runs: (args) => {
    const paid = paidSet();
    if (!paid.has(args.p_runner)) return [];
    return db.activities.filter((a) => a.runner_id === args.p_runner && a.status === 'approved')
      .sort((a, b) => (a.run_date < b.run_date ? 1 : -1)).map((a) => ({ run_date: a.run_date, km: Number(a.km) }));
  },
  public_stats: () => {
    const lb = leaderboard();
    const price = Number(settings().km_price);
    return {
      total_km: Math.round(lb.reduce((x, e) => x + e.km, 0) * 100) / 100,
      active_runners: lb.length,
      sponsor_km: Math.round(db.sponsors.filter((s) => s.paid).reduce((x, s) => x + Number(s.amount), 0) / price),
    };
  },
  public_sponsors: () => {
    const price = Number(settings().km_price);
    return db.sponsors.filter((s) => s.paid && s.show_public).sort((a, b) => b.amount - a.amount)
      .map((s) => ({ kind: s.kind, name: s.name, km: Math.round(s.amount / price), logo_url: s.logo_url, website: s.website }));
  },
};

const fileToDataUrl = (file) => new Promise((res, rej) => {
  const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file);
});

export function createClient() {
  return {
    from: (t) => new Query(t),
    rpc: async (name, args) => ({ data: rpcs[name](args || {}), error: null }),
    auth: {
      getSession: async () => ({ data: { session: uid() ? { user: { id: uid() } } : null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => { localStorage.removeItem(SESSION); return { error: null }; },
      signInWithPassword: async ({ email, password }) => {
        const u = db.users.find((x) => x.email.toLowerCase() === email.toLowerCase() && x.password === password);
        if (!u) return { data: {}, error: err('Invalid login credentials') };
        localStorage.setItem(SESSION, u.id);
        return { data: { session: { user: { id: u.id } } }, error: null };
      },
      signUp: async ({ email, password, options }) => {
        if (db.users.some((x) => x.email.toLowerCase() === email.toLowerCase())) return { data: {}, error: err('User already registered') };
        if (password.length < 6) return { data: {}, error: err('Password should be at least 6 characters') };
        const name = String(options?.data?.full_name || '').trim().replace(/\s+/g, ' ');
        if (name.length < 3) return { data: {}, error: err('Database error saving new user') };
        const id = uuid();
        db.users.push({ id, email, password });
        db.profiles.push({ id, full_name: name, email, phone: options?.data?.phone || null, consent_at: now(), paid: false, paid_at: null, payment_note: null, created_at: now() });
        save();
        localStorage.setItem(SESSION, id); // a demóban nincs e-mail-megerősítés
        return { data: { user: { id, identities: [{}] }, session: { user: { id } } }, error: null };
      },
      resetPasswordForEmail: async () => ({ error: null }),
      updateUser: async ({ password }) => {
        const u = db.users.find((x) => x.id === uid());
        if (u && password) { u.password = password; save(); }
        return { error: null };
      },
    },
    storage: {
      from: () => ({
        upload: async (path, file) => {
          try { localStorage.setItem(PHOTO + path, await fileToDataUrl(file)); return { error: null }; }
          catch { return { error: err('A demóban a böngésző tárhelye megtelt – próbálj kisebb képet.') }; }
        },
        createSignedUrl: async (path) => ({ data: { signedUrl: localStorage.getItem(PHOTO + path) || '' }, error: null }),
        remove: async (paths) => { for (const p of paths) localStorage.removeItem(PHOTO + p); return { error: null }; },
      }),
    },
  };
}
