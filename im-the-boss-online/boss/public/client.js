const $ = id => document.getElementById(id), sock = io();
let S = null;
const IC = { A: '#d63031', B: '#27ae60', C: '#0984e3', D: '#f1c40f', E: '#e67e22', F: '#8e44ad' }; // สีนักลงทุน (ตรงกับ prompt การ์ด)
const chip = (l, s = '') => `<span class="chip${s}" style="background:${IC[l]};${l === 'D' ? 'color:#000' : ''}">${l}</span>`;
const fmt = n => '$' + (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const em = r => r && r.error && alert(r.error);
const PL = { travel: 'Travel ✈️', boss: "I'm the Boss 👔", recruit: 'Recruit 🤝' };

$('btnCreate').onclick = () => sock.emit('create', $('name').value, r => r.error && ($('err').textContent = r.error));
$('btnJoin').onclick = () => sock.emit('join', $('code').value, $('name').value, r => r.error && ($('err').textContent = r.error));
$('btnStart').onclick = () => sock.emit('start', em);
const sendChat = () => { const v = $('chatIn').value.trim(); if (v) sock.emit('chat', v); $('chatIn').value = ''; };
$('btnChat').onclick = sendChat; $('chatIn').onkeydown = e => e.key === 'Enter' && sendChat();
sock.on('state', s => { S = s; render(); });

function drawBoard() {
  const T = idx => idx.map(i => {
    const b = S.board[i], ci = S.covered.indexOf(i);
    const inner = ci >= 0 ? `<span class="cov">✔ #${ci + 1}</span>` : `<div class="reqs">${b.req.map(l => chip(l)).join('')}</div>${b.n ? `<div class="reqs">+${b.n}:${b.from.map(l => chip(l, ' sm')).join('')}</div>` : ''}<b class="dv">${b.div}</b>`;
    return `<div class="tile sp${ci >= 0 ? ' done' : ''}${S.pos === i && S.phase === 'play' ? ' cur' : ''}">${inner}${S.pos === i && S.phase === 'play' ? '<span class="pawn">💲</span>' : ''}</div>`;
  }).join('');
  const rng = (a, b) => Array.from({ length: Math.abs(b - a) + 1 }, (_, k) => a <= b ? a + k : a - k);
  $('rowTop').innerHTML = T(rng(0, 4)); $('colR').innerHTML = T(rng(5, 7)); $('rowBot').innerHTML = T(rng(12, 8)); $('colL').innerHTML = T(rng(15, 13));
}
const lab = c => c.t === 'clan' ? `Clan ${c.inv}` : c.t === 'travel' ? (c.inv === '*' ? 'Travel ทุกสี' : `Travel ${c.inv}`) : { recruit: 'Recruit 🤝', boss: 'Boss 👔', stop: 'STOP 🛑' }[c.t];

function render() {
  const kept = {}; document.querySelectorAll('[data-k]').forEach(e => kept[e.dataset.k] = e.value);
  const fk = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.k;
  $('lobby').hidden = true; $('game').hidden = false; $('roomCode').textContent = S.code; $('roomTag').textContent = 'ห้อง ' + S.code;
  $('btnStart').hidden = !(S.phase === 'lobby' && S.host === S.me);
  const byId = Object.fromEntries(S.players.map(p => [p.id, p])), me = byId[S.me], play = S.phase === 'play';
  drawBoard();
  $('tabs').innerHTML = S.players.map((p, i) => `<div class="tab" style="background:#334155;${play && i === S.turn ? 'outline:2px solid #f1c40f;' : ''}${p.gone ? 'opacity:.4' : ''}">${p.id === S.me ? '⭐' : ''}${esc(p.name)} ${p.inv.map(l => chip(l, ' sm')).join('')}${p.id === S.boss ? ' 👔' : ''}</div>`).join('');
  $('plist').innerHTML = S.players.map(p => `<li><span class="u-name">${p.id === S.me ? '⭐' : '👤'} ${esc(p.name)} ${p.inv.map(l => chip(l, ' sm')).join('')}</span><span>🎴${p.cards}${p.money != null ? ' 💰' + fmt(p.money) : ''}</span></li>`).join('') + (S.center.length ? `<li><span>กลางโต๊ะ (ต้องดึงก่อน):</span><span>${S.center.map(l => chip(l, ' sm')).join('')}</span></li>` : '');
  $('log').innerHTML = [...S.log.map(l => `<div>${esc(l)}</div>`), ...S.chat.map(c => `<div><b>${esc(c.n)}:</b> ${esc(c.t)}</div>`)].join(''); $('log').scrollTop = 1e9;
  const g = {}; S.hand.forEach(c => { const k = lab(c); g[k] = (g[k] || 0) + 1; });
  $('hand').innerHTML = Object.entries(g).map(([k, n]) => `<div class="hcard">${k} <b>×${n}</b></div>`).join('') || '<i>ไม่มีการ์ด</i>';
  $('handHint').textContent = 'การ์ดที่ใช้ได้จะขึ้นปุ่มในโต๊ะเจรจา';
  $('dealNo').textContent = '#' + Math.min(S.done + 1, 15); $('dealAmt').textContent = fmt(S.val); $('dealSeats').textContent = '/ปันผล';
  $('roundInfo').textContent = play ? `ดีลที่ ${S.done + 1}/15 · ตา ${esc(S.players[S.turn].name)}` : (S.phase === 'end' ? 'จบเกม' : 'รอผู้เล่น (' + S.players.length + ')');
  $('actionZone').innerHTML = zone(byId, me);
  document.querySelectorAll('[data-k]').forEach(e => { if (kept[e.dataset.k] !== undefined) e.value = kept[e.dataset.k]; });
  if (fk) { const f = document.querySelector(`[data-k="${fk}"]`); if (f) f.focus(); }
}

function zone(byId, me) {
  if (S.phase === 'lobby') return `แชร์รหัสห้อง <b>${S.code}</b> ให้เพื่อน (ต้อง ${3}–6 คน)`;
  if (S.phase === 'end') { const w = [...S.players].sort((a, b) => b.money - a.money); return `🏆 <b>${esc(w[0].name)}</b> ชนะ! ` + w.map(p => `${esc(p.name)} ${fmt(p.money)}`).join(' | '); }
  const has = f => S.hand.some(f), isAct = S.players[S.turn].id === S.me, act = S.players[S.turn];
  if (S.step === 'a') return isAct ? 'ตาคุณ: <button data-do="deal">📣 ทำดีลที่ช่องนี้</button> <button data-do="roll">🎲 ทอยลูกเต๋าเลื่อนมาร์คเกอร์</button>' : `รอ ${esc(act.name)} ตัดสินใจ...`;
  if (S.step === 'b') return isAct ? `ทอยได้ ${S.die}: <button data-do="deal">📣 ทำดีลช่องนี้</button> <button data-do="draw">🃏 จั่ว 3 ใบ</button>` : `${esc(act.name)} ทอยได้ ${S.die} กำลังเลือก...`;
  const sp = S.board[S.pos], boss = byId[S.boss], isBoss = S.boss === S.me;
  let h = `<div>👔 <b>${esc(boss.name)}</b> ต้องการ ${sp.req.map(l => chip(l)).join('')}${sp.n ? ` + ${sp.n} จาก ${sp.from.map(l => chip(l, ' sm')).join('')}` : ''} · ${sp.div}×${fmt(S.val)} = <b>${fmt(sp.div * S.val)}</b></div>`;
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
    h += '<div>เลือกตัวแทน: ' + [...new Set([...sp.req, ...sp.from])].map(l => `<label>${chip(l)}<select data-k="sel-${l}"><option value="">—</option>${S.reps.filter(r => r.inv === l).map(r => `<option value="${r.key}">${esc(byId[r.owner].name)} ${fmt(r.ask)}</option>`).join('')}</select></label>`).join(' ') + '<br><button data-close>✅ ปิดดีล</button> <button data-fail>❌ ดีลล้มเหลว</button></div>';
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
