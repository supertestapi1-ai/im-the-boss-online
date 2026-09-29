const $ = id => document.getElementById(id), sock = io();
let S = null, isHost = false, joinedCode = null;
const IC = ['#e74c3c', '#e67e22', '#f1c40f', '#27ae60', '#3b82f6', '#9b59b6']; // แดง ส้ม เหลือง เขียว น้ำเงิน ม่วง (6 นักลงทุน)
const IN = ['A', 'B', 'C', 'D', 'E', 'F'];
const color = l => IC[IN.indexOf(l)] || '#888';
const chip = (l, s = '') => `<span class="chip${s}" style="background:${color(l)}"></span>`;
const fmt = n => '$' + (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const em = r => r && r.error && alert(r.error);
const PL = { travel: 'Travel ✈️', boss: "I'm the Boss 👔", recruit: 'Recruit 🤝' };

$('btnCreate').onclick = () => sock.emit('create', $('name').value, r => {
  if (r.error) return $('err').textContent = r.error;
  isHost = true; $('err').textContent = '';
});
$('btnJoin').onclick = () => sock.emit('join', $('code').value, $('name').value, r => r.error && ($('err').textContent = r.error));
$('btnStart').onclick = () => sock.emit('start', em);
const LN = { A: 'แดง', B: 'ส้ม', C: 'เหลือง', D: 'เขียว', E: 'น้ำเงิน', F: 'ม่วง' };
let tiles = [];
function tileRowHtml(t, i) {
  const box = (grp, l) => `<label class="ckl" style="--c:${color(l)}"><input type="checkbox" data-r="${i}" data-g="${grp}" data-l="${l}" ${t[grp].includes(l) ? 'checked' : ''}>${LN[l]}</label>`;
  return `<div class="tedit-row"><b>ช่อง ${i + 1}</b>
    <div class="tedit-grp"><span>ต้องมีครบ:</span>${IN.map(l => box('req', l)).join('')}</div>
    <div class="tedit-grp"><span>เลือกเพิ่มจาก:</span>${IN.map(l => box('from', l)).join('')} <span>จำนวน:</span><input type="number" min="0" max="6" class="amt tn" data-n="${i}" value="${t.n}"></div>
    <div class="tedit-grp"><span>ปันผล ×</span><input type="number" min="1" class="amt tn" data-div="${i}" value="${t.div}"></div>
    <button type="button" class="btn-mute" data-del="${i}">ลบช่อง</button></div>`;
}
function renderTiles() { $('tileEditor').innerHTML = tiles.map(tileRowHtml).join(''); }
$('tileEditor').onchange = e => {
  const d = e.target.dataset;
  if (d.r !== undefined) { const t = tiles[+d.r], arr = t[d.g]; const i2 = arr.indexOf(d.l); if (e.target.checked && i2 < 0) arr.push(d.l); if (!e.target.checked && i2 >= 0) arr.splice(i2, 1); }
  else if (d.n !== undefined) tiles[+d.n].n = Math.max(0, +e.target.value || 0);
  else if (d.div !== undefined) tiles[+d.div].div = Math.max(1, +e.target.value || 1);
};
$('tileEditor').onclick = e => { const d = e.target.dataset; if (d.del !== undefined) { tiles.splice(+d.del, 1); renderTiles(); } };
$('btnAddTile').onclick = () => { tiles.push({ req: [], n: 2, from: [...IN], div: 2 }); renderTiles(); };
$('btnLoadJson').onclick = () => {
  try { tiles = JSON.parse($('cfgBoardJson').value).map(t => ({ req: t.req || [], n: t.n || 0, from: t.from || [], div: t.div || 1 })); renderTiles(); $('cfgMsg').textContent = ''; }
  catch { $('cfgMsg').textContent = 'JSON ไม่ถูกต้อง'; }
};
fetch('/default-config').then(r => r.json()).then(cfg => {
  tiles = cfg.board.map(t => ({ req: t.req, n: t.n, from: t.from, div: (t.req.length + t.n) })); renderTiles();
  $('cfgBoardJson').value = JSON.stringify(cfg.board, null, 1);
  $('cfgDeals').value = cfg.deals.join(', ');
}).catch(() => {});
$('btnSaveCfg').onclick = () => {
  if (!tiles.length) return $('cfgMsg').textContent = 'ต้องมีอย่างน้อย 1 ช่อง';
  for (const t of tiles) if (!t.req.length && !t.n) return $('cfgMsg').textContent = 'แต่ละช่องต้องมีสีที่ต้องใช้อย่างน้อย 1 อย่าง';
  const deals = $('cfgDeals').value.split(',').map(s => +s.trim()).filter(n => n > 0);
  sock.emit('setBoard', { board: tiles, deals }, r => { $('cfgMsg').textContent = r.error || '✅ บันทึกแล้ว'; if (!r.error) $('cfgBoardJson').value = JSON.stringify(tiles, null, 1); });
};
const sendChat = () => { const v = $('chatIn').value.trim(); if (v) sock.emit('chat', v); $('chatIn').value = ''; };
$('btnChat').onclick = sendChat; $('chatIn').onkeydown = e => e.key === 'Enter' && sendChat();
sock.on('state', s => { const prev = S; S = s; render(); if (prev && s.die != null && s.die !== prev.die) { animateDie(s.die); animateMove(prev.pos, s.pos, s.die); } });

let lastPos = null;
let lastDie = null;
let diceTimer = null;

function drawBoard() {
  const T = idx => idx.map(i => {
    const b = S.board[i], ci = S.covered.indexOf(i);
    const wild = !b.req.length && b.from.length >= 5;
    let inner;
    if (ci >= 0) inner = `<span class="cov">✓<br>ดีล #${ci + 1}</span>`;
    else if (wild) inner = `<div class="hs">🤝</div><b class="dv">${b.n} · ×${b.div}</b>`;
    else inner = `<span class="tile-index">${i + 1}</span><div class="reqs">${b.req.map(l => chip(l)).join('')}</div>${b.n ? `<div class="reqs sub">+${b.n} ${b.from.map(l => chip(l, ' sm')).join('')}</div>` : ''}<b class="dv">×${b.div}</b>`;
    const active = S.pos === i && S.phase === 'play';
    const pawn = active ? `<span class="pawn">♟<span class="pawn-label">เดินอยู่ที่นี่</span></span>` : '';
    return `<div class="tile sp${ci >= 0 ? ' done' : ''}${active ? ' cur' : ''}${wild ? ' wild' : ''}" data-tile="${i}">${inner}${pawn}</div>`;
  }).join('');
  const n = S.board.length, q = Math.round(n / 4);
  const rng = (a, b) => Array.from({ length: Math.abs(b - a) + 1 }, (_, k) => a <= b ? a + k : a - k);
  $('rowTop').innerHTML = T(rng(0, q - 1));
  $('colR').innerHTML = T(rng(q, 2 * q - 1));
  $('rowBot').innerHTML = T(rng(3 * q - 1, 2 * q));
  $('colL').innerHTML = T(rng(n - 1, 3 * q));
}

function animateDie(value) {
  if (!$('dieFace')) return;
  const el = $('dieFace');
  const cap = $('diceCaption');
  clearInterval(diceTimer);
  el.classList.remove('rolling', 'dice-hit');
  void el.offsetWidth;
  el.classList.add('rolling');
  const faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];
  let ticks = 0;
  diceTimer = setInterval(() => {
    el.textContent = faces[Math.floor(Math.random() * 6)];
    ticks++;
    if (ticks >= 6) {
      clearInterval(diceTimer);
      el.textContent = faces[Math.max(0, Math.min(5, value - 1))];
      el.classList.remove('rolling');
      el.classList.add('dice-hit');
      cap.textContent = `ออก ${value} แต้ม · เดิน ${value} ช่อง`;
    }
  }, 90);
}

function animateMove(from, to, steps) {
  if (from === null || from === undefined || from === to || !steps) return;
  let cur = from;
  let n = 0;
  const covered = new Set(S.covered || []);
  const tick = () => {
    if (n >= steps) return;
    do { cur = (cur + 1) % S.board.length; } while (covered.has(cur) && cur !== from);
    const el = document.querySelector(`[data-tile="${cur}"]`);
    if (el) { el.classList.remove('move-step'); void el.offsetWidth; el.classList.add('move-step'); }
    n++;
    if (cur !== to && n < steps) setTimeout(tick, 170);
  };
  tick();
}

const lab = c => c.t === 'clan' ? `Clan ${c.inv}` : c.t === 'travel' ? (c.inv === '*' ? 'Travel ทุกสี' : `Travel ${c.inv}`) : { recruit: 'Recruit 🤝', boss: 'Boss 👔', stop: 'STOP 🛑' }[c.t];
const cardColor = c => c.t === 'clan' || c.t === 'travel' ? color(c.inv === '*' ? 'A' : c.inv) : { recruit: '#f39c12', boss: '#2f3542', stop: '#c0392b' }[c.t];

function render() {
  const kept = {}; document.querySelectorAll('[data-k]').forEach(e => kept[e.dataset.k] = e.value);
  const fk = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.k;
  const byId = Object.fromEntries(S.players.map(p => [p.id, p])), me = byId[S.me], play = S.phase === 'play';

  if (S.phase === 'lobby') {
    $('lobby').hidden = false; $('game').hidden = true;
    $('hostPanel').hidden = false; $('roomCode2').textContent = S.code; $('pcount').textContent = S.players.length + '/6';
    $('btnStart').hidden = S.host !== S.me;
    $('roomTag').textContent = 'ห้อง ' + S.code;
    return;
  }
  $('lobby').hidden = true; $('game').hidden = false; $('roomTag').textContent = 'ห้อง ' + S.code; $('roomCodeGame').textContent = S.code;
  drawBoard();
  $('tabs').innerHTML = S.players.map((p, i) => `<div class="tab${play && i === S.turn ? ' active' : ''}" style="${p.gone ? 'opacity:.4' : ''}">${p.id === S.me ? '⭐' : ''}${esc(p.name)} ${p.inv.map(l => chip(l, ' sm')).join('')}${p.id === S.boss ? ' 👔' : ''}</div>`).join('');
  $('plist').innerHTML = S.players.map(p => `<li><span class="u-name">${p.id === S.me ? '⭐' : '👤'} ${esc(p.name)} ${p.inv.map(l => chip(l, ' sm')).join('')}</span><span>🎴${p.cards}${p.money != null ? ' 💰' + fmt(p.money) : ''}</span></li>`).join('') + (S.center.length ? `<li><span>กลางโต๊ะ (ต้องดึงก่อน):</span><span>${S.center.map(l => chip(l, ' sm')).join('')}</span></li>` : '');
  $('log').innerHTML = [...S.log.map(l => `<div>${esc(l)}</div>`), ...S.chat.map(c => `<div><b>${esc(c.n)}:</b> ${esc(c.t)}</div>`)].join(''); $('log').scrollTop = 1e9;
  const g = {}; S.hand.forEach(c => { const k = lab(c); g[k] = g[k] || { n: 0, c }; g[k].n++; });
  $('hand').innerHTML = Object.entries(g).map(([k, v]) => `<div class="fcard" style="background:${cardColor(v.c)}">${k}<b>×${v.n}</b></div>`).join('') || '<i>ไม่มีการ์ด</i>';
  $('handHint').textContent = 'การ์ดที่ใช้ได้จะขึ้นปุ่มในโต๊ะเจรจา';
  $('dealNo').textContent = '#' + Math.min(S.done + 1, S.deals ? S.deals.length : S.done + 1); $('dealAmt').textContent = fmt(S.val); $('dealSeats').textContent = '× ปันผล'; if (S.die != null && lastDie === null) { $('dieFace').textContent = ['⚀','⚁','⚂','⚃','⚄','⚅'][S.die - 1]; $('diceCaption').textContent = `ล่าสุด ${S.die} แต้ม`; } lastDie = S.die;
  $('roundInfo').textContent = play ? `ดีลที่ ${S.done + 1} · ตา ${esc(S.players[S.turn].name)}` : (S.phase === 'end' ? 'จบเกม' : '');
  $('actionZone').innerHTML = zone(byId, me);
  document.querySelectorAll('[data-k]').forEach(e => { if (kept[e.dataset.k] !== undefined) e.value = kept[e.dataset.k]; });
  if (fk) { const f = document.querySelector(`[data-k="${fk}"]`); if (f) f.focus(); }
}

function zone(byId, me) {
  if (S.phase === 'end') { const w = [...S.players].sort((a, b) => b.money - a.money); return `🏆 <b>${esc(w[0].name)}</b> ชนะ! ` + w.map(p => `${esc(p.name)} ${fmt(p.money)}`).join(' | '); }
  const has = f => S.hand.some(f), isAct = S.players[S.turn].id === S.me, act = S.players[S.turn];
  if (S.step === 'a') return isAct ? 'ตาคุณ เลือก 1 อย่าง: <button class="primary-action" data-do="deal">📣 ทำดีลที่ช่องนี้</button> <button class="roll-action" data-do="roll">🎲 ทอยลูกเต๋าเดิน</button> <button data-do="draw">🃏 ไม่ทอย · จั่ว 3 ใบ</button>' : `รอ ${esc(act.name)} ตัดสินใจ...`;
  const sp = S.board[S.pos], boss = byId[S.boss], isBoss = S.boss === S.me;
  let h = `<div>👔 <b>${esc(boss.name)}</b> ต้องการ ${sp.req.map(l => chip(l)).join('') || '(ไม่ระบุสี)'}${sp.n ? ` + ${sp.n} จาก ${sp.from.map(l => chip(l, ' sm')).join('')}` : ''} · ×${sp.div} = <b>${fmt(sp.div * S.val)}</b></div>`;
  if (S.travel.length) h += `<div>✈️ กำลังเดินทาง: ${S.travel.map(l => chip(l, ' sm')).join('')}</div>`;
  if (S.pending) h += `<div class="pend">⏳ ${esc(byId[S.pending.by].name)} ใช้ ${PL[S.pending.type]}${S.pending.data.inv ? ' → ' + S.pending.data.inv : ''} (มีผลใน ~6 วิ) ${has(c => c.t === 'stop') ? '<button data-stop>🛑 STOP</button>' : ''}</div>`;
  const canTr = inv => has(c => c.t === 'travel' && (c.inv === '*' || c.inv === inv)) && !S.pending;
  h += '<div>ตัวแทนที่พร้อมดีล: ' + (S.reps.map(r => `${chip(r.inv)}${esc(byId[r.owner].name)}${r.clan ? '(Clan)' : ''} ขอ <b>${fmt(r.ask)}</b>${r.clan && canTr(r.inv) ? ` <button data-travel="${r.key}">✈️</button>` : ''}`).join(' · ') || '<i>ยังไม่มี</i>') + '</div>';
  const trv = S.players.flatMap(p => p.inv).filter(l => !S.travel.includes(l) && canTr(l));
  if (trv.length) h += '<div>ส่งไปต่างประเทศ: ' + trv.map(l => `<button data-travel="p:${l}">✈️ ${l}</button>`).join(' ') + '</div>';
  if (!isBoss) me.inv.filter(l => !S.travel.includes(l)).forEach(l => h += `<div>${chip(l)} ของคุณ ขอ <input data-k="ask-p:${l}" type="number" class="amt" step="500000" min="0" value="0"> <button data-offer="p:${l}">เสนอ/แก้ราคา</button></div>`);
  [...new Set(S.hand.filter(c => c.t === 'clan').map(c => c.inv))].forEach(l => h += `<div>Clan ${chip(l)} ${isBoss ? '' : `ขอ <input data-k="ask-c:${l}" type="number" class="amt" step="500000" min="0" value="0">`} <button data-clan="${l}">ลงการ์ด</button></div>`);
  if (!isBoss && has(c => c.t === 'boss')) h += '<div><button data-bosscard>👔 I\'m the Boss!</button></div>';
  if (S.hand.filter(c => c.t === 'recruit').length >= 3 && !S.pending) {
    const all = S.players.flatMap(p => p.inv).filter(l => !me.inv.includes(l)), tg = S.center.length ? S.center : all;
    h += '<div>Recruit ×3: ' + tg.map(l => `<button data-rec="${l}">🤝 ดึง ${l}</button>`).join(' ') + '</div>';
  }
  if (isBoss) {
    const need = [...new Set([...sp.req, ...sp.from])];
    h += '<div>เลือกตัวแทน: ' + (need.length ? need : ['A', 'B', 'C', 'D', 'E', 'F']).map(l => `<label>${chip(l)}<select data-k="sel-${l}"><option value="">—</option>${S.reps.filter(r => r.inv === l).map(r => `<option value="${r.key}">${esc(byId[r.owner].name)} ${fmt(r.ask)}</option>`).join('')}</select></label>`).join(' ') + '<br><button data-close>✅ ปิดดีล</button> <button data-fail>❌ ดีลล้มเหลว</button></div>';
  }
  return h;
}

$('actionZone').onclick = e => {
  const b = e.target.closest('button'); if (!b) return; const d = b.dataset, k = key => document.querySelector(`[data-k="${key}"]`);
  if ('do' in d) sock.emit('act', d.do, em);
  else if ('offer' in d) sock.emit('offer', { key: d.offer, ask: +k('ask-' + d.offer).value || 0 }, em);
  else if ('clan' in d) sock.emit('clan', { inv: d.clan, ask: k('ask-c:' + d.clan) ? +k('ask-c:' + d.clan).value || 0 : 0 }, em);
  else if ('travel' in d) sock.emit('travel', d.travel, em);
  else if ('bosscard' in d) sock.emit('bosscard', em);
  else if ('rec' in d) sock.emit('recruit', d.rec, em);
  else if ('stop' in d) sock.emit('stop', em);
  else if ('fail' in d) sock.emit('fail');
  else if ('close' in d) { const sel = {}; document.querySelectorAll('[data-k^="sel-"]').forEach(s => s.value && (sel[s.dataset.k.slice(4)] = s.value)); sock.emit('close', sel, em); }
};
