const express = require('express'), http = require('http'), path = require('path');
const { Server } = require('socket.io');
const app = express(), srv = http.createServer(app), io = new Server(srv);
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));
app.get('/default-config', (_, res) => res.json({ board: DEF_BOARD_RAW.map(([r, n, f]) => ({ req: [...r], n, from: [...f] })), deals: DEALS_DEFAULT.map(v => v / 1e6) }));

// ===== ข้อมูลกติกา (แก้ตรงนี้ให้ตรงกระดานจริงได้) =====
const CFG = { minP: 3, maxP: 6, startHand: 5, maxHand: 12, drawN: 3, stopMs: 6000 };
const INV = [...'ABCDEF'];
const DIV = { 2: 2, 3: 3, 4: 4, 5: 6, 6: 8 };          // จำนวนนักลงทุนที่ต้องใช้ -> จำนวนปันผล (ค่าเริ่มต้น ปรับได้จากห้อง)
// [ต้องมีครบทุกสี, จำนวนที่ต้องเลือกเพิ่ม, เลือกจากกลุ่มสีนี้]  ค่าเริ่มต้น 16 ช่อง — host แก้เป็นค่าจริงจากกล่องได้ก่อนเริ่มเกม (ดู "ตั้งค่ากระดาน")
const DEF_BOARD_RAW = [['AB', 0, ''], ['', 2, 'CDEF'], ['DE', 0, ''], ['A', 2, 'BCF'], ['', 2, 'ABCDEF'], ['E', 1, 'ABD'], ['ACD', 1, 'BEF'], ['', 2, 'ABCDEF'],
  ['D', 2, 'ACE'], ['BEF', 0, ''], ['CD', 2, 'ABEF'], ['AE', 1, 'CDF'], ['ABCD', 1, 'EF'], ['', 2, 'ABCDEF'], ['CE', 0, ''], ['ADF', 2, 'BCE']];
const mkBoard = raw => raw.map(([r, n, f]) => ({ req: [...r], n, from: [...f], div: DIV[r.length + n] || (r.length + n) }));
const BOARD_DEFAULT = mkBoard(DEF_BOARD_RAW);
const DEALS_DEFAULT = [2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5].map(v => v * 1e6);   // มูลค่าต่อ 1 ปันผล (ใบที่ 1-15) — ปรับได้จากห้องเช่นกัน
function validBoard(raw) { // ตรวจ config ที่ host ส่งมา ก่อนใช้แทนค่า default
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 40) return null;
  try { const b = raw.map(t => {
    const req = [...new Set((t.req || []).filter(c => INV.includes(c)))], from = [...new Set((t.from || []).filter(c => INV.includes(c)))];
    const n = Math.max(0, Math.min(6, Math.floor(+t.n) || 0)), div = Math.max(1, Math.floor(+t.div) || (req.length + n));
    if (!req.length && !n) return null; if (n > from.length) return null; return { req, n, from, div };
  }); return b.every(Boolean) ? b : null; } catch { return null; }
}
function validDeals(raw) { if (!Array.isArray(raw) || raw.length < 1 || raw.length > 30) return null;
  const d = raw.map(v => Math.max(1, Math.floor(+v) || 0) * 1e6); return d.every(v => v > 0) ? d : null; }
const ENDS = { 10: [1], 11: [1, 2], 12: [1, 2, 3], 13: [1, 2, 3, 4], 14: [1, 2, 3, 4, 5] }; // เลขบนหลังใบดีล -> ทอยเจอ = จบเกม (ประมาณการ)

const rooms = {};
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const P = (r, id) => r.players.find(p => p.id === id);
const log = (r, m) => { r.log.push(m); r.log = r.log.slice(-40); };
const die = () => 1 + Math.random() * 6 | 0;
function mkDeck() { // 98 ใบ: Clan 24, Travel 21, Recruit 33, Boss 10, Stop 10
  const d = []; let id = 0; const add = (t, inv, n) => { for (let i = 0; i < n; i++) d.push({ id: id++, t, inv }); };
  for (const i of INV) { add('clan', i, 4); add('travel', i, 3); }
  add('travel', '*', 3); add('recruit', null, 33); add('boss', null, 10); add('stop', null, 10); return shuffle(d);
}
const holder = (r, inv) => r.players.find(p => p.inv.includes(inv));
function reps(r) { // ตัวแทนนักลงทุนที่พร้อมดีลตอนนี้
  const out = [];
  for (const p of r.players) for (const inv of p.inv) {
    if (r.travel.includes(inv)) continue;
    const key = 'p:' + inv, o = r.offers[key];
    if (p.id === r.boss) out.push({ key, inv, owner: p.id, ask: 0 }); else if (o) out.push({ key, inv, owner: p.id, ask: o.ask });
  }
  for (const [id, c] of Object.entries(r.clans)) {
    const key = 'c:' + id, o = r.offers[key];
    if (c.owner === r.boss) out.push({ key, inv: c.inv, owner: c.owner, ask: 0, clan: 1 }); else if (o) out.push({ key, inv: c.inv, owner: c.owner, ask: o.ask, clan: 1 });
  }
  return out;
}
function view(r, me) {
  const end = r.phase === 'end';
  return { code: r.code, phase: r.phase, host: r.host, me, board: r.board, pos: r.pos, covered: r.covered, done: r.done, val: r.deals[Math.min(r.done, r.deals.length - 1)],
    turn: r.turn, step: r.step, die: r.die, boss: r.boss, travel: r.travel, center: r.center, reps: r.step === 'neg' ? reps(r) : [], customBoard: r.customBoard,
    pending: r.pending && { type: r.pending.type, by: r.pending.by, data: r.pending.data }, log: r.log.slice(-10), chat: r.chat.slice(-30),
    players: r.players.map(p => ({ id: p.id, name: p.name, inv: p.inv, cards: p.hand.length, money: end || p.id === me ? p.money : null, gone: p.gone })),
    hand: P(r, me)?.hand || [] };
}
const push = r => r.players.forEach(p => io.to(p.id).emit('state', view(r, p.id)));
function draw(r, p, n) { // ถือได้ไม่เกิน 12 ใบ: จั่วจนครบ 12 แล้วหยุด ไม่มีการสุ่มทิ้ง
  for (let i = 0; i < n && p.hand.length < CFG.maxHand; i++) {
    if (!r.deck.length) { r.deck = shuffle(r.disc); r.disc = []; if (!r.deck.length) break; } // เด็คจั่วหมด: สับกองทิ้งของทุกคนกลับมาเป็นเด็คใหม่
    p.hand.push(r.deck.pop());
  }
}
const take = (p, pred) => { const i = p.hand.findIndex(pred); return i < 0 ? null : p.hand.splice(i, 1)[0]; };
function clearNeg(r, used = []) { // คืน Clan ที่ไม่ได้ใช้ให้เจ้าของ ที่เหลือลงกองทิ้ง
  for (const [id, c] of Object.entries(r.clans)) { if (used.includes(id)) r.disc.push(c.card); else P(r, c.owner)?.hand.push(c.card); }
  clearTimeout(r.timer); r.clans = {}; r.offers = {}; r.travel = []; r.pending = null; r.boss = null;
}
function endTurn(r, from) { // ผู้เล่นซ้ายมือของบอสคนสุดท้ายได้เล่นต่อ
  let i = r.players.findIndex(p => p.id === from);
  do { i = (i + 1) % r.players.length; } while (r.players[i].gone);
  r.turn = i; r.step = 'a';
}
const nextFree = (r, i, k = 1) => { for (let s = 0; s < k; s++) { do { i = (i + 1) % r.board.length; } while (r.covered.includes(i)); } return i; };
function resolve(r) {
  const p = r.pending; if (!p || r.step !== 'neg') return;
  const d = p.data;
  if (p.type === 'travel') {
    if (d.key[0] === 'p') r.travel.push(d.inv); else { const c = r.clans[d.key.slice(2)]; if (c) { r.disc.push(c.card); delete r.clans[d.key.slice(2)]; } }
    delete r.offers[d.key]; log(r, `✈️ ${d.inv} ถูกส่งไปต่างประเทศ`);
  } else if (p.type === 'boss') { r.boss = p.by; log(r, `👔 ${P(r, p.by).name} ขึ้นเป็นบอสคนใหม่!`); }
  else if (p.type === 'recruit') {
    const h = holder(r, d.inv); if (h) h.inv = h.inv.filter(x => x !== d.inv); else r.center = r.center.filter(x => x !== d.inv);
    P(r, p.by).inv.push(d.inv); delete r.offers['p:' + d.inv]; log(r, `🤝 ${P(r, p.by).name} ดึงนักลงทุน ${d.inv} มาเป็นของตัวเอง`);
  }
  r.pending = null; push(r);
}
function finish(r, boss) { // หลังปิดดีลสำเร็จ
  r.covered.push(r.pos); r.done++;
  let over = r.done >= r.board.length;
  if (!over && r.done >= Math.max(1, r.board.length - 6)) { const d = die(); log(r, `🎲 ทอยเช็คจบเกมได้ ${d}`); over = (ENDS[r.done] || [1]).includes(d); }
  if (over) { r.phase = 'end'; log(r, '🏁 จบเกม!'); return; }
  r.pos = nextFree(r, r.pos); endTurn(r, boss);
}

io.on('connection', sock => {
  let room = null;
  const ok = (cb, e) => cb && cb(e ? { error: e } : { ok: 1 });
  const inNeg = () => room && room.phase === 'play' && room.step === 'neg';
  const join = (code, name, cb, create) => {
    let r = create ? null : rooms[code];
    if (create) { code = Math.random().toString(36).slice(2, 6).toUpperCase(); r = rooms[code] = { code, host: sock.id, players: [], phase: 'lobby', log: [], chat: [], offers: {}, clans: {}, travel: [], covered: [], center: [], deck: [], disc: [], done: 0, pos: 0, turn: 0, step: 'a', boss: null, pending: null, board: BOARD_DEFAULT, deals: DEALS_DEFAULT, customBoard: false }; }
    if (!r) return ok(cb, 'ไม่พบห้อง'); if (r.phase !== 'lobby') return ok(cb, 'เกมเริ่มไปแล้ว'); if (r.players.length >= CFG.maxP) return ok(cb, 'ห้องเต็ม');
    r.players.push({ id: sock.id, name: (name || 'Player ' + (r.players.length + 1)).slice(0, 14), inv: [], hand: [], money: 0 });
    room = r; sock.join(code); log(r, `👋 ${P(r, sock.id).name} เข้าห้อง`); push(r); ok(cb);
  };
  sock.on('create', (n, cb) => join(null, n, cb, true));
  sock.on('join', (c, n, cb) => join(String(c || '').toUpperCase(), n, cb));

  sock.on('setBoard', (cfg, cb) => { // host ปรับข้อมูลกระดาน/มูลค่าดีลให้ตรงกล่องจริงก่อนเริ่ม
    const r = room; if (!r || r.host !== sock.id || r.phase !== 'lobby') return;
    const b = cfg && cfg.board ? validBoard(cfg.board) : null, d = cfg && cfg.deals ? validDeals(cfg.deals) : null;
    if (cfg && cfg.board && !b) return ok(cb, 'รูปแบบข้อมูลกระดานไม่ถูกต้อง'); if (cfg && cfg.deals && !d) return ok(cb, 'รูปแบบมูลค่าดีลไม่ถูกต้อง');
    if (b) { r.board = b; r.customBoard = true; } if (d) r.deals = d;
    if (!b && !d) { r.board = BOARD_DEFAULT; r.deals = DEALS_DEFAULT; r.customBoard = false; }
    log(r, '🛠️ ตั้งค่ากระดานอัปเดตแล้ว'); push(r); ok(cb);
  });
  sock.on('start', cb => {
    const r = room; if (!r || r.host !== sock.id || r.phase !== 'lobby') return;
    if (r.players.length < CFG.minP) return ok(cb, `ต้องมีอย่างน้อย ${CFG.minP} คน`);
    const inv = shuffle([...INV]), n = r.players.length, per = n === 3 ? 2 : 1;
    r.players.forEach(p => p.inv = inv.splice(0, per)); r.center = inv;   // 4-5 คน: ที่เหลือวางกลางโต๊ะ (ต้องดึงก่อน)
    r.deck = mkDeck(); r.players.forEach(p => draw(r, p, CFG.startHand));
    r.pos = Math.random() * r.board.length | 0; r.turn = Math.random() * n | 0; r.phase = 'play'; r.step = 'a';
    log(r, `▶️ เริ่มเกม ${P(r, r.players[r.turn].id).name} เล่นก่อน (กระดาน: ${r.customBoard ? 'กำหนดเอง' : 'ค่าเริ่มต้นโดยประมาณ'})`); push(r); ok(cb);
  });

  sock.on('act', (a, cb) => { // ต้นตา เลือกได้ 1 อย่าง: ทำดีลที่ช่องนี้ / ทอยเต๋าเดิน (จบตา) / ไม่ทอย จั่ว 3 ใบแทน (จบตา)
    const r = room; if (!r || r.phase !== 'play' || r.players[r.turn].id !== sock.id || r.step !== 'a') return;
    const me = P(r, sock.id);
    if (a === 'deal') { r.step = 'neg'; r.boss = sock.id; r.offers = {}; r.clans = {}; r.travel = []; log(r, `📣 ${me.name}: Let's make a deal! (ช่อง ${r.pos + 1})`); }
    else if (a === 'roll') { r.die = die(); r.pos = nextFree(r, r.pos, r.die); log(r, `🎲 ${me.name} ทอยได้ ${r.die} เดินไปช่องใหม่`); endTurn(r, sock.id); }
    else if (a === 'draw') { draw(r, me, CFG.drawN); log(r, `🃏 ${me.name} ไม่ทอยเต๋า ขอจั่วการ์ด ${CFG.drawN} ใบแทน`); endTurn(r, sock.id); }
    else return ok(cb, 'ทำไม่ได้ตอนนี้');
    push(r); ok(cb);
  });

  sock.on('offer', ({ key, ask }, cb) => { // เสนอนักลงทุน/แก้ราคาขอ
    if (!inNeg()) return; const r = room, me = P(r, sock.id); ask = Math.max(0, Math.floor(+ask) || 0);
    if (r.boss === sock.id) return ok(cb, 'บอสไม่ต้องเสนอ');
    if (key.startsWith('p:')) { const i = key.slice(2); if (!me.inv.includes(i) || r.travel.includes(i)) return ok(cb, 'เสนอไม่ได้'); }
    else if (r.clans[key.slice(2)]?.owner !== sock.id) return ok(cb, 'เสนอไม่ได้');
    r.offers[key] = { ask }; log(r, `💬 ${me.name} เสนอ ${key.startsWith('p:') ? key.slice(2) : 'Clan ' + r.clans[key.slice(2)].inv} ราคา ${ask.toLocaleString()}`); push(r); ok(cb);
  });
  sock.on('clan', ({ inv, ask }, cb) => {
    if (!inNeg()) return; const r = room, me = P(r, sock.id), c = take(me, x => x.t === 'clan' && x.inv === inv);
    if (!c) return ok(cb, 'ไม่มีการ์ด Clan นี้');
    r.clans[c.id] = { owner: sock.id, inv, card: c }; r.offers['c:' + c.id] = { ask: Math.max(0, Math.floor(+ask) || 0) };
    log(r, `🃏 ${me.name} ลง Clan ${inv}`); push(r); ok(cb);
  });
  const pend = (r, type, by, data) => { r.pending = { type, by, data }; r.timer = setTimeout(() => resolve(r), CFG.stopMs); push(r); };
  sock.on('travel', (key, cb) => {
    if (!inNeg()) return; const r = room, me = P(r, sock.id); if (r.pending) return ok(cb, 'มีการ์ดรอ Stop อยู่');
    let inv; if (key.startsWith('p:')) { inv = key.slice(2); if (!holder(r, inv) || r.travel.includes(inv)) return ok(cb, 'เป้าหมายไม่ถูกต้อง'); }
    else { const c = r.clans[key.slice(2)]; if (!c) return ok(cb, 'เป้าหมายไม่ถูกต้อง'); inv = c.inv; }
    const c = take(me, x => x.t === 'travel' && x.inv === inv) || take(me, x => x.t === 'travel' && x.inv === '*');
    if (!c) return ok(cb, 'ไม่มีการ์ด Travel ที่ใช้ได้'); r.disc.push(c);
    log(r, `✈️ ${me.name} ใช้ Travel ใส่ ${inv}`); pend(r, 'travel', sock.id, { key, inv }); ok(cb);
  });
  sock.on('bosscard', cb => {
    if (!inNeg()) return; const r = room, me = P(r, sock.id); if (r.pending) return ok(cb, 'มีการ์ดรอ Stop อยู่'); if (r.boss === sock.id) return ok(cb, 'คุณเป็นบอสอยู่แล้ว');
    const c = take(me, x => x.t === 'boss'); if (!c) return ok(cb, 'ไม่มีการ์ด Boss'); r.disc.push(c);
    log(r, `👔 ${me.name}: "I'm the Boss!"`); pend(r, 'boss', sock.id, {}); ok(cb);
  });
  sock.on('recruit', (inv, cb) => {
    if (!inNeg()) return; const r = room, me = P(r, sock.id); if (r.pending) return ok(cb, 'มีการ์ดรอ Stop อยู่');
    const h = holder(r, inv), inCenter = r.center.includes(inv);
    if ((!h && !inCenter) || me.inv.includes(inv)) return ok(cb, 'ดึงนักลงทุนนี้ไม่ได้'); if (r.center.length && !inCenter) return ok(cb, 'ต้องดึงนักลงทุนกลางโต๊ะก่อน');
    if (me.hand.filter(x => x.t === 'recruit').length < 3) return ok(cb, 'ต้องมี Recruit 3 ใบ');
    for (let i = 0; i < 3; i++) r.disc.push(take(me, x => x.t === 'recruit'));
    log(r, `🤝 ${me.name} ใช้ Recruit 3 ใบดึง ${inv}`); pend(r, 'recruit', sock.id, { inv }); ok(cb);
  });
  sock.on('stop', cb => {
    if (!inNeg()) return; const r = room, me = P(r, sock.id); if (!r.pending) return ok(cb, 'ไม่มีอะไรให้ Stop');
    const c = take(me, x => x.t === 'stop'); if (!c) return ok(cb, 'ไม่มีการ์ด Stop'); r.disc.push(c);
    clearTimeout(r.timer); r.pending = null; log(r, `🛑 ${me.name} ใช้ STOP ยกเลิกการ์ดล่าสุด`); push(r); ok(cb);
  });

  sock.on('close', (sel, cb) => {
    if (!inNeg()) return; const r = room; if (r.boss !== sock.id) return; if (r.pending) return ok(cb, 'มีการ์ดรอ Stop อยู่ รอสักครู่');
    const sp = r.board[r.pos], rp = reps(r), used = []; let cnt = 0;
    for (const [inv, key] of Object.entries(sel || {})) {
      const rep = rp.find(x => x.key === key && x.inv === inv); if (!rep) return ok(cb, 'ตัวแทนไม่ถูกต้อง');
      if (!sp.req.includes(inv) && !sp.from.includes(inv)) continue; used.push(rep); if (!sp.req.includes(inv)) cnt++;
    }
    if (!sp.req.every(i => used.some(u => u.inv === i)) || cnt < sp.n) return ok(cb, 'ยังได้นักลงทุนไม่ครบตามที่ช่องนี้ต้องการ');
    const boss = P(r, r.boss), payout = sp.div * r.deals[Math.min(r.done, r.deals.length - 1)], cost = used.reduce((s, u) => s + u.ask, 0);
    if (cost > boss.money + payout) return ok(cb, 'เงินไม่พอจ่ายตามข้อตกลง');
    boss.money += payout; for (const u of used) if (u.ask) { boss.money -= u.ask; P(r, u.owner).money += u.ask; }
    log(r, `💰 ปิดดีล #${r.done + 1}! บอส ${boss.name} ได้ ${payout.toLocaleString()} จ่ายให้คนอื่น ${cost.toLocaleString()}`);
    const bid = boss.id; clearNeg(r, used.filter(u => u.clan).map(u => u.key.slice(2))); finish(r, bid); push(r); ok(cb);
  });
  const fail = r => { const b = r.boss; log(r, '❌ ดีลล้มเหลว'); clearNeg(r); endTurn(r, b); };
  sock.on('fail', () => { if (!inNeg() || room.boss !== sock.id) return; fail(room); push(room); });

  sock.on('chat', t => { const r = room; if (!r || !t) return; r.chat.push({ n: P(r, sock.id).name, t: String(t).slice(0, 200) }); push(r); });
  sock.on('disconnect', () => {
    const r = room; if (!r) return; const p = P(r, sock.id);
    if (r.phase === 'lobby') { r.players = r.players.filter(x => x !== p); if (!r.players.length) delete rooms[r.code]; else { r.host = r.players[0].id; push(r); } return; }
    p.gone = true; log(r, `📴 ${p.name} หลุดการเชื่อมต่อ`);
    if (r.phase === 'play') { if (r.step === 'neg' && r.boss === sock.id) fail(r); else if (r.step !== 'neg' && r.players[r.turn] === p) endTurn(r, sock.id); }
    push(r);
  });
});
srv.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
