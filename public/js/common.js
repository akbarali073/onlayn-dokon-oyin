const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Number(n).toLocaleString('ru-RU') + ' soʻm';
const hhmm = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='#f0e6ff'/><path d='M28 68l16-20 12 15 8-9 12 14z' fill='#c9a8ff'/><circle cx='66' cy='36' r='7' fill='#c9a8ff'/></svg>");

document.addEventListener('error', (e) => {
  const t = e.target;
  if (t.tagName === 'IMG' && !t.dataset.fb) { t.dataset.fb = 1; t.src = PLACEHOLDER; }
}, true);

const emit = (s, ev, d) => new Promise((res) => {
  if (!s.connected) return res({ ok: false, error: 'Aloqa yoʻq' });
  s.emit(ev, d, res);
});

function toast(msg, type = '') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.append(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.textContent = msg;
  box.append(t); setTimeout(() => t.remove(), 3400);
}

// Rasmni siqib, base64 ga o'giradi (serverga yengil yuborish uchun)
function resizeImage(file, max = 640) {
  return new Promise((ok, no) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => no(new Error('Rasm ochilmadi'));
    img.src = url;
  });
}

function productCard(p, meId) {
  const mine = p.sellerId === meId;
  return `<article class="card product">
    <div class="pimg"><img src="${esc(p.image || PLACEHOLDER)}" alt="" loading="lazy"></div>
    <div class="pbody">
      <div class="pprice">${money(p.price)}</div>
      <h3 class="pname">${esc(p.name)}</h3>
      ${p.description ? `<p class="pdesc">${esc(p.description)}</p>` : ''}
      <p class="pmeta">${esc(p.sellerName)} · ${p.sold ? p.sold + ' ta sotildi' : 'yangi'}</p>
      ${mine ? '<div class="badge">Sizning eʼloningiz</div>'
             : `<button class="btn btn-primary btn-block" data-buy="${p.id}">Sotib olish</button>`}
    </div></article>`;
}
