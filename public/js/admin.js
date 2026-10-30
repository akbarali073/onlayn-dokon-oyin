(() => {
  const code = location.pathname.split('/')[2].toUpperCase();
  const KEY = 'market_admin_' + code;
  const q = new URLSearchParams(location.search).get('key');
  if (q) { localStorage.setItem(KEY, q); history.replaceState(null, '', location.pathname); }

  const socket = io();
  let room = { title: '', status: 'active' }, products = [], purchases = [];
  let prog = { users: [], total: 0, boughtCount: 0, ready: false };
  const link = location.origin + '/r/' + code;

  async function join() {
    const r = await emit(socket, 'admin:join', { code, adminToken: localStorage.getItem(KEY) });
    if (!r.ok) {
      $('#panel').hidden = true; $('#denied').hidden = false;
      $('#deniedMsg').textContent = r.error + '. Xonani yaratgan qurilmadan oching.';
      return;
    }
    ({ room, products, purchases, progress: prog } = r.state);
    $('#denied').hidden = true; $('#panel').hidden = false; render();
  }
  socket.on('connect', join);

  function render() {
    const done = room.status === 'finished';
    $('#title').textContent = room.title;
    $('#status').textContent = done ? 'Yakunlangan' : 'Davom etmoqda';
    $('#link').textContent = link; $('#codeTxt').textContent = code;
    $('#pCount').textContent = `${prog.boughtCount}/${prog.total}`;
    $('#bar').style.width = (prog.total ? prog.boughtCount / prog.total * 100 : 0) + '%';
    $('#cond').textContent = done ? 'Oʻyin yakunlangan.'
      : prog.total < 2 ? 'Kamida 2 ta qatnashchi qoʻshilishi kerak.'
      : prog.ready ? 'Shart bajarildi: hamma kamida 1 ta xarid qildi.'
      : `${prog.total - prog.boughtCount} ta qatnashchi hali xarid qilmagan.`;
    $('#finish').disabled = done || !prog.ready;

    $('#tab-users').innerHTML = prog.users.length ? prog.users.map((u) => `<div class="row">
      <div class="grow"><b>${esc(u.name)}</b></div>
      <span class="chip ${u.hasProduct ? 'ok' : ''}">${u.hasProduct ? 'Eʼlon bor' : 'Eʼlon yoʻq'}</span>
      <span class="chip ${u.hasBought ? 'ok' : ''}">${u.hasBought ? 'Xarid qildi' : 'Xarid yoʻq'}</span></div>`).join('')
      : '<div class="card pad empty">Hali hech kim qoʻshilmadi.</div>';

    $('#tab-products').innerHTML = products.length ? products.map((p) => `<div class="row">
      <img class="thumb" src="${esc(p.image || PLACEHOLDER)}" alt="">
      <div class="grow"><b>${esc(p.name)}</b><div class="muted">${esc(p.sellerName)} · ${money(p.price)}</div></div>
      <span class="chip ${p.sold ? 'ok' : ''}">${p.sold} ta sotildi</span></div>`).join('')
      : '<div class="card pad empty">Hali eʼlonlar yoʻq.</div>';

    $('#tab-log').innerHTML = purchases.length ? purchases.map((p) => `<div class="row">
      <div class="grow"><b>${esc(p.buyerName)}</b> ← ${esc(p.sellerName)}
      <div class="muted">${p.qty} ta ${esc(p.productName)} · ${hhmm(p.createdAt)}</div></div>
      <b>${money(p.total)}</b></div>`).join('')
      : '<div class="card pad empty">Hali xaridlar yoʻq.</div>';
  }

  socket.on('product:new', (p) => { if (!products.some((x) => x.id === p.id)) { products.unshift(p); render(); toast(`${p.sellerName}: yangi eʼlon`); } });
  socket.on('product:updated', (p) => { products = products.map((x) => x.id === p.id ? p : x); render(); });
  socket.on('purchase:new', (u) => { purchases.unshift(u); render(); toast(`${u.buyerName} ← ${u.sellerName}: ${u.qty} ta ${u.productName}`); });
  socket.on('progress', (p) => { prog = p; render(); });
  socket.on('room:finished', () => { room.status = 'finished'; render(); });

  $('#finish').addEventListener('click', async () => {
    if (!confirm('Oʻyinni yakunlaysizmi?')) return;
    const r = await emit(socket, 'admin:finish', {});
    if (!r.ok) toast(r.error, 'err');
  });
  $('#copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(link); toast('Havola nusxalandi'); }
    catch { toast(link); }
  });
  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
    ['users', 'products', 'log'].forEach((t) => { $('#tab-' + t).hidden = t !== b.dataset.tab; });
  }));
})();
