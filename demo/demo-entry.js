import { resetDemo, demoLogin, setVariant, currentVariant } from './mock-supabase.js';
import './app.js';

const v = currentVariant();
const seg = (key, label) => `<button class="seg ${v === key ? 'on' : ''}" data-variant="${key}">${label}</button>`;
const bar = document.createElement('div');
bar.className = 'demo-bar';
bar.innerHTML = `
  <span><b>OFFLINE DEMÓ</b> – az adatok csak ebben a böngészőben tárolódnak; a futási időszak a teszt kedvéért „most” zajlik.</span>
  <span class="demo-btns">
    <button data-as="admin@demo.ro">Admin</button>
    <button data-as="anna@demo.ro">Futó (nem fizetett)</button>
    <button data-as="futo1@demo.ro">Futó (fizetett)</button>
  </span>
  <span class="segs" title="Adatkészlet">${seg('demo', 'Demó adatok')}${seg('worst', 'Legrosszabb eset')}${seg('empty', 'Üres')}</span>
  <button data-reset class="ghost">Visszaállítás</button>
  <span class="demo-hint">admin@demo.ro / admin123 · anna@demo.ro / futo1234</span>`;
document.body.appendChild(bar);
bar.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.variant) {
    if (b.dataset.variant === v) return;
    setVariant(b.dataset.variant);
    location.hash = '#/';
  } else if (b.dataset.reset) {
    if (!confirm('Minden demóadat visszaáll a kezdő állapotra. Folytatod?')) return;
    resetDemo();
    location.hash = '#/';
  } else {
    demoLogin(b.dataset.as);
    location.hash = b.dataset.as.startsWith('admin') ? '#/admin' : '#/profil';
  }
  location.reload();
});
