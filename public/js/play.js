(() => {
  const code = location.pathname.split('/')[2].toUpperCase();
  const KEY = 'market_player_' + code;
  const socket = io();
  let me = null, products = [], purchases = [];
  let prog = { users: [], total: 0, boughtCount: 0, ready: false };
  let room = { title: '', status: 'active' };
  let current = null, imgData = null;

  const show = (id) => ['joinScreen', 'app'].forEach((x) => { $('#' + x).hidden = x !== id; });

  fetch('/api/rooms/' + code).then((r) => r.ok ? r.json() : Promise.reject())
    .then((d) => { $('#joinTitle').textContent = d.title; })
    .catch(() => { $('#joinErr').textContent = 'Xona topilmadi'; });

  async function join(name) {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    const r = await emit(socket, 'player:join', { code, name, token: saved && saved.token });
    if (!r.ok) {
      if (saved) localStorage.removeItem(KEY);
      show('joinScreen');
      if (r.error !== 'NAME') $('#joinErr').textContent = r.error;
      return;
    }
    me = r.me; localStorage.setItem(KEY, JSON.stringify(me));
    ({ room, products, purchases, progress: prog } = r.state);
    show('app'); renderAll();
  }
  // Ulanish uzilib qayta tiklansa, avtomatik qayta qo'shiladi
  socket.on('connect', () => { if (localStorage.getItem(KEY)) join(); });
  $('#joinForm').addEventListener('submit', (e) => { e.preventDefault(); join($('#nameIn').value); });

  /* ---------- render ---------- */
  const myBuys = () => purchases.filter((p) => p.buyerId === me.id);
  const iBought = () => myBuys().length > 0;

  function renderHead() {
    $('#roomTitle').textContent = room.title;
    $('#chip').textContent = `${prog.boughtCount}/${prog.total} xarid qildi`;
    $('#hint').textContent = iBought()
      ? 'Siz xarid qildingiz. Boshqalarni kutamiz.'
      : 'Oʻyin yakunlanishi uchun kamida 1 ta mahsulot sotib oling.';
    $('#hint').classList.toggle('ok', iBought());
  }
  function renderFeed() {
    $('#feed').innerHTML = products.length
      ? products.map((p) => productCard(p, me.id)).join('')
      : '<div class="card pad empty span">Hali eʼlonlar yoʻq. Birinchi boʻlib mahsulot yarating.</div>';
  }
  function renderMine() {
    const list = products.filter((p) => p.sellerId === me.id);
    $('#mine').innerHTML = list.length ? list.map((p) => `<div class="row">
      <img class="thumb" src="${esc(p.image || PLACEHOLDER)}" alt="">
      <div class="grow"><b>${esc(p.name)}</b><div class="muted">${money(p.price)}</div></div>
      <span class="chip ${p.sold ? 'ok' : ''}">${p.sold} ta sotildi</span></div>`).join('')
      : '<div class="card pad empty">Siz hali eʼlon yaratmagansiz.</div>';
  }
  function renderOrders() {
    const list = myBuys();
    $('#orders').innerHTML = list.length ? list.map((p) => `<div class="row">
      <div class="grow"><b>${esc(p.productName)}</b>
      <div class="muted">${esc(p.sellerName)} · ${p.qty} ta · ${hhmm(p.createdAt)}</div></div>
      <b>${money(p.total)}</b></div>`).join('')
      : '<div class="card pad empty">Hali xarid qilmagansiz. Bozordan mahsulot tanlang.</div>';
  }
  function renderFinished() {
    const f = $('#finished'); f.hidden = room.status !== 'finished';
    if (f.hidden) return;
    const sum = (a, k) => a.reduce((s, x) => s + x[k], 0);
    const sold = purchases.filter((p) => p.sellerId === me.id);
    $('#finalBody').innerHTML = `<p>Siz ${sum(myBuys(), 'qty')} ta mahsulot sotib oldingiz (${money(sum(myBuys(), 'total'))}).</p>
      <p>Sizdan ${sum(sold, 'qty')} ta mahsulot sotildi (${money(sum(sold, 'total'))}).</p>`;
  }
  function renderAll() { renderHead(); renderFeed(); renderMine(); renderOrders(); renderFinished(); }

  /* ---------- real-time voqealar ---------- */
  socket.on('product:new', (p) => {
    if (!me || products.some((x) => x.id === p.id)) return;
    products.unshift(p); renderFeed(); renderMine();
    if (p.sellerId !== me.id) toast(`${p.sellerName} yangi eʼlon qoʻshdi: ${p.name}`);
  });
  socket.on('product:updated', (p) => {
    if (!me) return;
    products = products.map((x) => x.id === p.id ? p : x); renderFeed(); renderMine();
  });
  socket.on('purchase:new', (u) => {
    if (!me) return;
    purchases.unshift(u); renderHead(); renderOrders();
    if (u.sellerId === me.id) toast(`${u.buyerName} sizdan ${u.qty} ta ${u.productName} sotib oldi`);
  });
  socket.on('progress', (p) => { prog = p; if (me) renderHead(); });
  socket.on('room:finished', () => { room.status = 'finished'; if (me) renderFinished(); });

  /* ---------- navigatsiya ---------- */
  $$('[data-view]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-view]').forEach((x) => x.classList.toggle('on', x === b));
    $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + b.dataset.view; });
    scrollTo(0, 0);
  }));

  /* ---------- e'lon yaratish ---------- */
  $('#fFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { imgData = await resizeImage(f); $('#preview').src = imgData; $('#preview').hidden = false; }
    catch (err) { toast(err.message, 'err'); }
  });
  $('#sellForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
    const r = await emit(socket, 'product:create', {
      name: $('#fName').value, price: $('#fPrice').value,
      description: $('#fDesc').value, image: imgData || $('#fUrl').value
    });
    btn.disabled = false;
    if (!r.ok) return toast(r.error, 'err');
    e.target.reset(); imgData = null; $('#preview').hidden = true;
    toast('Eʼlon yaratildi');
  });

  /* ---------- sotib olish ---------- */
  const qty = () => Math.min(100, Math.max(1, Math.floor(Number($('#qVal').value) || 1)));
  const calc = () => { $('#qVal').value = qty(); $('#shTotal').textContent = money(qty() * current.price); };
  $('#feed').addEventListener('click', (e) => {
    const b = e.target.closest('[data-buy]'); if (!b) return;
    current = products.find((p) => p.id === b.dataset.buy); if (!current) return;
    $('#shImg').dataset.fb = ''; $('#shImg').src = current.image || PLACEHOLDER;
    $('#shName').textContent = current.name; $('#shPrice').textContent = money(current.price) + ' / dona';
    $('#qVal').value = 1; calc(); $('#sheet').hidden = false;
  });
  const closeSheet = () => { $('#sheet').hidden = true; };
  $('#shClose').addEventListener('click', closeSheet);
  $('#qMinus').addEventListener('click', () => { $('#qVal').value = qty() - 1; calc(); });
  $('#qPlus').addEventListener('click', () => { $('#qVal').value = qty() + 1; calc(); });
  $('#qVal').addEventListener('input', calc);
  $('#shBuy').addEventListener('click', async () => {
    const btn = $('#shBuy'); btn.disabled = true;
    const r = await emit(socket, 'product:buy', { productId: current.id, qty: qty() });
    btn.disabled = false;
    if (!r.ok) return toast(r.error, 'err');
    closeSheet(); toast('Xarid amalga oshdi');
  });
})();
