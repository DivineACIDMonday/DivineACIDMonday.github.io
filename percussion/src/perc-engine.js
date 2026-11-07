/* PERC ENGINE START
   Divine Percussion Machine: traditional timelines and figures, rules only, no AI.
   A song is { bpm, sections:[{type,bars}], style, seed, wild 0..1, swing 0..1, mutes:{}, beat:{bars:[{k:[steps],s:[steps]}]} }
   generate(song) gives events { t seconds, v voice id, vel 1..127 } for the whole song. */
(function (root) {
  'use strict';
  // ---------- voices: name, General MIDI note, colour ----------
  const VOICES = {
    drum: { name: 'Big drum', gm: 41, col: '#E0705A' }, clo: { name: 'Low conga', gm: 64, col: '#E39B4C' }, chi: { name: 'High conga', gm: 63, col: '#E9C46A' },
    slap: { name: 'Slap', gm: 62, col: '#F2E0A0' }, bhi: { name: 'Bongo high', gm: 60, col: '#8FD18B' }, blo: { name: 'Bongo low', gm: 61, col: '#5BB38A' },
    shk: { name: 'Shaker', gm: 70, col: '#7FC8E8' }, bell: { name: 'Bell', gm: 67, col: '#A79BF0' }, bell2: { name: 'Low bell', gm: 68, col: '#8A7BE0' },
    clave: { name: 'Clave', gm: 75, col: '#E88FC8' }, wood: { name: 'Woodblock', gm: 76, col: '#C88FE8' }, tamb: { name: 'Tambourine', gm: 54, col: '#9FE8D8' },
    // taiko
    odaiko: { name: 'Odaiko', gm: 35, col: '#C0503A' }, don: { name: 'Nagado don', gm: 41, col: '#E0705A' }, ka: { name: 'Nagado ka (rim)', gm: 37, col: '#F2E0A0' },
    shime: { name: 'Shime', gm: 48, col: '#E9C46A' }, shimeka: { name: 'Shime ka (rim)', gm: 75, col: '#F7EBC0' }, okedo: { name: 'Okedo', gm: 45, col: '#E39B4C' },
    kane: { name: 'Atarigane', gm: 56, col: '#A79BF0' }, kake: { name: 'Kakegoe (call)', gm: 54, col: '#7FC8E8' },
    apito: { name: 'Apito (whistle)', gm: 71, col: '#9FE8D8' },
    snare: { name: 'Snare', gm: 38, col: '#6F86D6' }, rim: { name: 'Snare rim click', gm: 37, col: '#C9D6FF' }, tenor1: { name: 'Tenor 1 (high)', gm: 50, col: '#E8C468' }, tenor2: { name: 'Tenor 2', gm: 48, col: '#D4A537' }, tenor3: { name: 'Tenor 3', gm: 47, col: '#B8862B' }, tenor4: { name: 'Tenor 4 (low)', gm: 60, col: '#8F6A22' },
    bass1: { name: 'Bass 1 (lowest)', gm: 35, col: '#6E140C' }, bass2: { name: 'Bass 2', gm: 36, col: '#8E1E14' }, bass3: { name: 'Bass 3', gm: 41, col: '#B8322A' }, bass4: { name: 'Bass 4', gm: 43, col: '#D9412E' }, bass5: { name: 'Bass 5 (highest)', gm: 45, col: '#E8704F' }, cym: { name: 'Cymbals', gm: 49, col: '#F6D365' }, cyc: { name: 'Cymbal choke', gm: 52, col: '#E8D7A6' }
  };
  // ---------- random ----------
  function rng(seed) { let a = (seed >>> 0) || 1; const f = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.int = (n) => Math.floor(f() * n); f.pick = (a) => a[Math.floor(f() * a.length)]; f.chance = (p) => f() < p; return f; }
  const hash = (...xs) => { let h = 2166136261; for (const x of xs) { const s = String(x); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } } return h >>> 0; };
  const euclid = (k, n, rot) => { const o = []; for (let i = 0; i < n; i++) if (((i + rot) * k) % n < k) o.push(i); return o; };
  const estr = (k, n, rot, ch) => { const e = euclid(k, n, rot); let s = ''; for (let i = 0; i < n; i++) s += e.includes(i) ? (i === e[0] ? ch.toUpperCase() : ch) : '.'; return s; };
  const rot = (s, k) => { k = ((k % s.length) + s.length) % s.length; return s.slice(k) + s.slice(0, k); };
  // three step cells for 12/8 hand drums, four step cells for 16ths: figures are cells glued together, ABAB, AABA or ABAC
  const cells = (pool, n, r) => { const A = r.pick(pool), B = r.pick(pool), C = r.pick(pool); const form = r.pick(['ABAB', 'AABA', 'ABAC', 'AAAB', 'ABBA']); let s = ''; for (const c of form.slice(0, n)) s += c === 'A' ? A : c === 'B' ? B : C; return s; };

  /* ---------- styles ----------
     each player: { id, role, map: letter -> voice or [voices], prio (lower joins first), wild (needs at least this wildness), make(r) -> figure string }
     uppercase letter = full stroke, lowercase = soft stroke, '.' = rest */
  const STYLES = {
    westafrica: { name: 'West Africa', grid: 12, tempo: [90, 145], players: [
      { id: 'bell', role: 'timeline', prio: 0, map: { B: 'bell', b: 'bell' }, make: (r) => rot(r.pick(['B.B.BB.B.B.B', 'B.B.BB.B.B.B', 'B..B..B..B..', 'B.B.B..B.B..', 'B.BB.B.BB.B.']), r.pick([0, 0, 0, 7, 5])) },
      { id: 'dundun', role: 'low', prio: 1, map: { D: 'drum', d: 'drum', K: 'bell2', k: 'bell2' }, make: (r) => r.pick(['D.....D..D..', 'D..D..D.....', 'D.....DD....', 'D..D.D..D...', 'D.k..kD.k..k', 'D.k.D.k.k...', '..D..D.....D']) },
      { id: 'sangban', role: 'mid', prio: 3, map: { L: 'clo', l: 'clo' }, make: (r) => r.pick(['...L..L..L..', 'L..L.....L.L', '.L..L..L..L.', 'L.....L.lL..', '..lL....lL..', 'L..l..L..l.l']) },
      { id: 'djembe1', role: 'hand', prio: 2, map: { B: 'clo', T: 'chi', t: 'chi', S: 'slap', s: 'slap' }, make: (r) => cells(['B.T', 'S.T', 'TS.', 'S.S', 'T.T', '.TT', 'B..', 'S..', '.ST', 'T.S', 'SsT', 'B.s', 'TtS'], 4, r) },
      { id: 'djembe2', role: 'hand2', prio: 4, map: { H: 'bhi', h: 'bhi', O: 'blo', o: 'blo' }, make: (r) => cells(['H.h', '.HH', 'O.H', 'H..', '.hO', 'HhH', 'O..', '.H.', 'h.O'], 4, r) },
      { id: 'shekere', role: 'shake', prio: 2, map: { S: 'shk', s: 'shk' }, make: (r) => r.pick(['S.sS.sS.sS.s', 'SssSssSssSss', '..S..S..S..S', 'S.sS.s.sSS.s', 's.Ss.Ss.Ss.S']) },
      { id: 'kpanlogo', role: 'poly', prio: 6, wild: 0.35, map: { W: 'wood', w: 'wood' }, make: (r) => r.pick(['W...W...W...', 'W..W..W..W..', estr(5, 12, r.int(12), 'w'), estr(7, 12, r.int(12), 'w')]) } ] },
    afrocuban: { name: 'Afro-Cuban', grid: 16, tempo: [88, 135], players: [
      { id: 'clave', role: 'timeline', prio: 0, map: { C: 'clave' }, make: (r) => r.pick(['C..C..C...C.C...', 'C..C...C..C.C...', '..C.C...C..C..C.', '..C.C...C..C...C', 'C..C..C...C..C..']) },
      { id: 'tumbao', role: 'hand', prio: 1, map: { l: 'clo', L: 'clo', t: 'chi', T: 'chi', S: 'slap' }, make: (r) => r.pick(['l.t.S.t.l.t.T.T.', 'l.t.S.t.l.t.T.L.', 'l.t.S.tTl.t.T.L.', '..t.S.t...t.S.TT', 'l.t.S.t.l.TTS.L.', 'l.t.S.L.l.t.TTL.', 'l.tTS.t.l.tTS.LL']) },
      { id: 'martillo', role: 'hand2', prio: 2, map: { H: 'bhi', h: 'bhi', O: 'blo', o: 'blo' }, make: (r) => r.pick(['H.h.O.h.H.h.O.h.', 'HhhhOhhhHhhhOhhh', 'H.hhO.h.H.hhO.hh', 'h.H.h.O.h.H.h.OO', 'H.h.O.hHH.h.O.hO']) },
      { id: 'cascara', role: 'metal', prio: 3, map: { W: 'wood', w: 'wood' }, make: (r) => r.pick(['W.WW.WW.W.WW.W.W', 'W.W.WW.WW.W.WW.W', 'W...W...W...W...', 'W.w.W.w.W.w.W.w.', 'W.Ww.W.wW.Ww.W.w']) },
      { id: 'campana', role: 'bell', prio: 4, map: { M: 'bell', m: 'bell2' }, make: (r) => r.pick(['M...M...M...M...', 'M.m.M.m.M.m.M.m.', 'M..mM.m.M..mM.m.', 'M.mmM.m.M.mmM.mm']) },
      { id: 'guiro', role: 'shake', prio: 2, map: { S: 'shk', s: 'shk' }, make: (r) => r.pick(['S.ssS.ssS.ssS.ss', 'S.s.S.s.S.s.S.s.', 'SsssSsssSsssSsss', 's.S.s.S.s.S.s.S.']) },
      { id: 'bombo', role: 'low', prio: 5, map: { D: 'drum' }, make: (r) => r.pick(['......D.........', '......D.....D...', '...D......D.....', 'D.........D.....']) } ] },
    brazil: { name: 'Brazil', grid: 16, tempo: [90, 135], players: [
      { id: 'surdo', role: 'low', prio: 0, map: { D: 'drum', d: 'drum' }, make: (r) => r.pick(['....d.......D...', 'd...D...d...D...', '....D.......D..D', 'd.....d.D.......', '....d...d...D.D.']) },
      { id: 'ganza', role: 'shake', prio: 1, map: { S: 'shk', s: 'shk' }, make: (r) => r.pick(['SsssSsssSsssSsss', 'sSs.sSs.sSs.sSs.', 'SssSSssSSssSSssS', 'sSssSsssSsssSssS']) },
      { id: 'tamborim', role: 'hand', prio: 2, map: { H: 'bhi', h: 'bhi' }, make: (r) => r.pick(['H.H..H.H.H..H.H.', 'H.HH.H.H.HH.H.H.', 'H..H..H...H..H..', estr(9, 16, r.int(16), 'h'), 'H.h.HH.h.H.hHH.h']) },
      { id: 'agogo', role: 'bell', prio: 3, map: { A: 'bell', a: 'bell2' }, make: (r) => r.pick(['A.a.AA.a.A.a.a..', 'A..aA.a.A..aA.a.', 'aA.A.aA.A.a.A..A', 'A.aaA.a.A.aaA.a.', 'AA.aA.a.AA.aA.a.']) },
      { id: 'caixa', role: 'metal', prio: 4, map: { T: 'tamb', t: 'tamb' }, make: (r) => r.pick(['TttTttTtTttTttTt', 'T.tTt.tTT.tTt.tT', 'TtttTtttTtttTttt', 't.Tt.tT.t.Tt.tTt']) },
      { id: 'repique', role: 'hand2', prio: 5, wild: 0.3, map: { L: 'clo', l: 'clo', T: 'chi', S: 'slap' }, make: (r) => cells(['L.T.', 'S.l.', 'T.TL', 'l.S.', '..TT', 'S.SL'], 4, r) } ] },
    mideast: { name: 'Middle East', grid: 16, tempo: [75, 135], players: [
      { id: 'darbuka', role: 'timeline', prio: 0, map: { D: 'clo', T: 'slap', k: 'bhi', K: 'bhi' }, make: (r) => r.pick(['D.T...T.D...T...', 'D.D...T.D...T...', 'D.T...D.D...T...', 'D.....T.....T...', 'D...k.T.D...k.T.', 'D.TkT.TkD.TkT.Tk']) },
      { id: 'ka', role: 'hand2', prio: 2, map: { k: 'bhi', K: 'bhi', t: 'blo' }, make: (r) => r.pick(['..k.k...k.k.k.k.', '.kk.kk.k.kk.kk.k', 'k.kt.k.kk.kt.k.k', estr(7, 16, r.int(16), 'k')]) },
      { id: 'riq', role: 'metal', prio: 1, map: { R: 'tamb', r: 'tamb' }, make: (r) => r.pick(['R.r.R.r.R.r.R.r.', 'R.rrR.r.R.rrR.r.', 'RrrrRrrrRrrrRrrr', '..R...R...R...R.']) },
      { id: 'bendir', role: 'low', prio: 3, map: { F: 'drum', f: 'drum' }, make: (r) => r.pick(['F.......F.......', 'F.....F...F.....', 'F..f..F.F..f....', 'F.......f.f.....']) },
      { id: 'zills', role: 'bell', prio: 4, map: { Z: 'bell', z: 'bell' }, make: (r) => r.pick(['..Z...Z...Z...Z.', 'Z...Z...Z...Z...', 'Z.z.Z.z.Z.z.Z.z.', 'Z..zZ.z.Z..zZ.z.']) },
      { id: 'clap', role: 'hand', prio: 5, wild: 0.4, map: { W: 'wood' }, make: (r) => r.pick(['....W.......W...', '..W..W....W..W..', 'W..W..W...W.....']) } ] },
    india: { name: 'India', grid: 16, tempo: [60, 125], players: [
      { id: 'tabla', role: 'timeline', prio: 0, map: { A: ['clo', 'bhi'], N: ['clo', 'blo'], t: 'bhi', T: 'bhi', g: 'clo', n: 'blo', k: 'slap' }, make: (r) => r.pick(['ANNAANNAAtttTNNA', 'AgntnkNnAgntnkNn', 'AgNnAgNnAgNntkNn', 'A.NAA.NAAt.tT.NA', 'AgtkNnAgtkNnAgNn']) },
      { id: 'kaida', role: 'hand2', prio: 2, map: { t: 'bhi', k: 'slap', T: 'bhi', g: 'clo' }, make: (r) => cells(['tktk', 'T.tk', 'g.tk', 'tk.T', 'T.T.', 'gtkt'], 4, r) },
      { id: 'manjira', role: 'bell', prio: 1, map: { Z: 'bell', z: 'bell' }, make: (r) => r.pick(['..Z...Z...Z...Z.', 'Z.....Z.Z.....Z.', 'Z...z...Z...z...', 'Z.z.Z.z.Z.z.Z.z.']) },
      { id: 'dholak', role: 'low', prio: 3, map: { D: 'drum', d: 'drum', L: 'clo' }, make: (r) => r.pick(['D..L..D...L.D...', 'D.....d.D...L...', 'D..d..L.D..d..L.', 'D.......D..L....']) },
      { id: 'ghungroo', role: 'shake', prio: 4, map: { S: 'shk', s: 'shk' }, make: (r) => r.pick(['S.s.S.s.S.s.S.s.', 'SsssSsssSsssSsss', '..S...S...S...S.']) } ] },
    zen: { name: 'Japanese zen', grid: 16, tempo: [50, 105], zen: true, players: [
      { id: 'odaiko', role: 'low', prio: 0, map: { D: 'drum', d: 'drum' }, make: (r) => r.pick(['D...............', 'D.......D.......', 'D.....D.........', 'D..........D....', 'D.......d.D.....']) },
      { id: 'hyoshigi', role: 'timeline', prio: 1, map: { W: 'wood' }, make: (r) => r.pick(['W.......W.......', '........W.....W.', 'W..W............', '....W...........']) },
      { id: 'kane', role: 'bell', prio: 2, map: { Z: 'bell', z: 'bell2' }, make: (r) => r.pick(['....Z.......Z...', 'Z.z...Z.z...Z...', '..........Z.....', 'Z...z...Z...z...']) },
      { id: 'shime', role: 'hand', prio: 3, wild: 0.25, map: { S: 'slap', s: 'slap' }, make: (r) => r.pick(['S...S...S...S...', 'S.sSS.sSS.sSS.sS', 'S..sS..sS..sS..s', 'S.S.S.S.S.S.S.S.']) },
      { id: 'chudaiko', role: 'mid', prio: 4, wild: 0.4, map: { L: 'clo', l: 'clo' }, make: (r) => r.pick(['L..L..L.L.......', 'L.....L.....L.l.', '..L...L...L.L.L.']) } ] },
    shamanic: { name: 'Shamanic', grid: 16, tempo: [95, 190], climb: true, players: [
      { id: 'frame', role: 'low', prio: 0, map: { D: 'drum', d: 'drum' }, make: (r) => r.pick(['D.d.....D.d.....', 'D...D...D...D...', 'D.D.D.D.D.D.D.D.', 'D.d.D.d.D.d.D.d.', 'D..dD..dD..dD..d']) },
      { id: 'rattle', role: 'shake', prio: 1, map: { S: 'shk', s: 'shk' }, make: (r) => r.pick(['SsSsSsSsSsSsSsSs', 'S.s.S.s.S.s.S.s.', 'S..sS..sS..sS..s', 'SssSssSssSssSsss']) },
      { id: 'drum2', role: 'mid', prio: 2, map: { L: 'clo', l: 'clo' }, make: (r) => r.pick(['..L...L...L...L.', 'L..L..L..L..L.L.', '.l.L.l.L.l.L.l.L', estr(5, 16, r.int(16), 'l')]) },
      { id: 'bells', role: 'bell', prio: 3, map: { Z: 'bell', z: 'bell' }, make: (r) => r.pick(['Z.......z.......', '..z...z...z...z.', 'Z.....z...Z.....']) },
      { id: 'sticks', role: 'hand', prio: 4, wild: 0.45, map: { W: 'wood', w: 'wood' }, make: (r) => r.pick(['W..W..W...W..W..', 'W.w.W.w.W.w.W.w.', estr(7, 16, r.int(16), 'w')]) },
      { id: 'hands', role: 'hand2', prio: 5, wild: 0.6, map: { H: 'bhi', h: 'bhi', S: 'slap' }, make: (r) => cells(['H.h.', 'S.hh', 'hhS.', 'H.S.', 'hHhS'], 4, r) } ] },
    minimal: { name: 'Minimal house', grid: 16, tempo: [112, 132], players: [
      { id: 'shaker', role: 'shake', prio: 0, map: { S: 'shk', s: 'shk' }, make: (r) => r.pick(['SsSsSsSsSsSsSsSs', 's.S.s.S.s.S.s.S.', 'S.sSS.sSS.sSS.sS', 'sSssSsssSssssSsS', 'sssSsssSsssSsssS']) },
      { id: 'conga', role: 'hand', prio: 1, map: { T: 'chi', t: 'chi', L: 'clo', l: 'clo', S: 'slap' }, make: (r) => r.pick(['..T...L...T.L.L.', '...T..L...T..L..', 'L..T..L...T.T...', '..t.S.t...t.T.L.', 'T..L..T.L..T..L.', cells(['..T.', 'L...', '.T.L', 'S..t', '..LL'], 4, r)]) },
      { id: 'bongo', role: 'hand2', prio: 3, map: { H: 'bhi', h: 'bhi', O: 'blo' }, make: (r) => r.pick(['..H...H...H...H.', 'H.h.H.hhH.h.H.hh', '.h.O.h.H.h.O.hH.', estr(5, 16, r.int(16), 'h'), 'h..h..H..h..h.H.']) },
      { id: 'rim', role: 'timeline', prio: 2, map: { C: 'clave', c: 'clave' }, make: (r) => r.pick([estr(3, 16, r.int(16), 'c'), estr(5, 16, r.int(16), 'c'), 'C..C..C...C.....', '...C..C....C..C.']) },
      { id: 'block', role: 'metal', prio: 4, map: { W: 'wood', w: 'wood' }, make: (r) => r.pick([estr(3, 16, r.int(16), 'w'), estr(7, 16, r.int(16), 'w'), '...W......W.....', 'W..w..w..w..w..w', '..w..w..w..w..w.']) },
      { id: 'tamb', role: 'bell', prio: 5, map: { R: 'tamb', r: 'tamb' }, make: (r) => r.pick(['....R.......R...', '..R...R...R...R.', 'R.r.R.r.R.r.R.r.']) },
      { id: 'cowbell', role: 'bell2', prio: 6, wild: 0.4, map: { M: 'bell', m: 'bell2' }, make: (r) => r.pick(['...M..M...M..M..', 'M..m..M...m.....', estr(5, 16, r.int(16), 'm')]) } ] }
  };
  STYLES.taiko = { name: 'Taiko', grid: 16, tempo: [70, 160], taiko: true, players: [] };
  STYLES.marching = { name: 'Marching', grid: 16, tempo: [90, 140], players: [] };
  STYLES.powwow = { name: 'Powwow (social dances)', grid: 16, tempo: [80, 170], players: [] };
  const ORDER = ['westafrica', 'afrocuban', 'brazil', 'mideast', 'india', 'taiko', 'zen', 'shamanic', 'powwow', 'marching', 'minimal'];
  const INTENS = { intro: 0.3, verse: 0.55, prechorus: 0.65, build: 0.6, chorus: 0.95, drop: 1, break: 0.25, bridge: 0.45, outro: 0.35, fill: 0.7, solo: 0.8 };

  // parse a figure into strokes { s step (may be fractional), voices, soft }
  function strokes(fig, map) { const o = []; for (let i = 0; i < fig.length; i++) { const c = fig[i]; if (c === '.' || !map[c] && !map[c.toUpperCase()]) continue; const v = map[c] || map[c.toUpperCase()]; o.push({ s: i, v: Array.isArray(v) ? v : [v], soft: c !== c.toUpperCase() }); } return o; }
  // a small change: move, drop or add a stroke, so a bar answers the one before
  function mutate(fig, r, amount) { const a = fig.split(''); const n = a.length, letters = a.filter((c) => c !== '.'); if (!letters.length) return fig;
    for (let k = 0; k < amount; k++) { const i = r.int(n); if (a[i] === '.') { if (r.chance(0.6)) a[i] = r.pick(letters).toLowerCase(); } else if (i % (n === 12 ? 3 : 4) !== 0 && r.chance(0.5)) a[i] = '.'; else { const j = (i + 1) % n; if (a[j] === '.') { a[j] = a[i]; a[i] = '.'; } } }
    return a.join(''); }

  // ---------- the band for one song ----------
  function band(song) {
    const S = STYLES[song.style] || STYLES.minimal, r = rng(hash(song.seed, song.style, 'band')), w = song.wild;
    const ps = S.players.filter((p) => (p.wild || 0) <= w + 0.05).map((p) => { const pr = rng(hash(song.seed, song.style, p.id)); const base = p.make(pr); const alt = pr.chance(0.5) ? p.make(pr) : mutate(base, pr, 2 + pr.int(3));
      return { id: p.id, role: p.role, prio: p.prio + (pr() * 0.8), map: p.map, base, alt, third: mutate(alt, pr, 3) }; });
    ps.sort((a, b) => a.prio - b.prio);
    // shuffle the joining order a little after the first two, so two songs do not build up the same way
    for (let i = ps.length - 1; i > 2; i--) { const j = 2 + r.int(i - 1); [ps[i], ps[j]] = [ps[j], ps[i]]; }
    // a polyrhythm that can slide in halfway long sections: three against four or a euclid on a free voice
    const pv = r.pick(['wood', 'clave', 'bhi', 'bell2', 'slap']), G = S.grid;
    const poly = { id: 'poly3', role: 'poly', map: { X: pv, x: pv }, base: G === 16 ? r.pick(['X..x..x..x..x..x', 'X..x..x..X..x..x', estr(5, 16, r.int(16), 'x'), estr(7, 16, r.int(16), 'x')]) : r.pick(['X...x...x...', 'X..x..x..x..', estr(5, 12, r.int(12), 'x')]) };
    poly.alt = poly.base; poly.third = poly.base;
    return { S, ps, poly, G };
  }

  // ---------- tempo: a style that wants a slower or faster pulse plays in half or double time ----------
  function timeFactor(S, bpm) { if (bpm > S.tempo[1] * 1.3) return 0.5; if (bpm < S.tempo[0] / 1.3) return 2; return 1; }

  /* ---------- the whole song ---------- */
  /* ---------- the traditions: each style plays in its own language and its own form ----------
     A phrase is a row of tokens, one per step of the grid ('.' is a rest). A capital syllable is a full stroke,
     lower case a soft one, a '!' an accent. Each player maps syllables to sounds. */
  const T = {};
  const toks = (s) => s.trim().split(/\s+/);
  const rot8 = (s) => { const a = toks(s); return a.slice(8).concat(a.slice(0, 8)).join(' '); };
  function layer(ctx, pid, t0, stp, phrase, map, gain) {
    const { ev, mutes, r, w, sw, grid } = ctx; if (mutes[pid]) return;
    toks(phrase).forEach((tk, i) => { if (tk === '.' || tk === '-') return; const key = tk.replace(/[^A-Za-z0-9]/g, '').toLowerCase(), m = map[key]; if (!m) return;
      const acc = tk.includes('!'), strong = /^[A-Z]/.test(tk), flam = tk.includes('~'), dd = tk.includes('='); let s = i; if (grid === 16 && i % 2 === 1) s += sw * 0.36;
      const vel = (acc ? 122 : strong ? 98 : 60) * gain + (r() - 0.5) * (8 + 10 * w), jit = (r() - 0.5) * (0.004 + 0.008 * w), cl = (x) => Math.max(15, Math.min(127, Math.round(x)));
      for (const v of [].concat(m)) { const t = Math.max(0, t0 + s * stp + jit); ev.push({ t, v, vel: cl(vel) });
        if (flam) ev.push({ t: Math.max(0, t - 0.028), v, vel: cl(vel * 0.42) }); if (dd) ev.push({ t: t + stp / 2, v, vel: cl(vel * 0.82) }); } });
  }
  const show = (ph, g) => { const a = toks(ph), o = []; for (let i = 0; i < a.length; i += g) o.push(a.slice(i, i + g).join(' ')); return o.join(' | '); };

  // West Africa: a djembe and dundun ensemble in 12/8. Djembe: Gun bass, Go tone, Pa slap. The lead calls the ensemble in and out.
  T.westafrica = { fixed: ['bell'], grid: 12, group: 3, players: [['bell', 'Bell'], ['djembe1', 'Djembe 1'], ['dundunba', 'Dundunba'], ['kenkeni', 'Kenkeni'], ['sangban', 'Sangban'], ['djembe2', 'Djembe 2'], ['shekere', 'Shekere'], ['lead', 'Lead djembe']],
    map: { ting: 'bell', ken: 'bhi', san: 'blo', dun: 'drum', gun: 'clo', go: 'chi', pa: 'slap', shk: 'shk' },
    pools: { bell: ['Ting . Ting . Ting Ting . Ting . Ting . Ting', 'Ting . . Ting . . Ting . . Ting . .', 'Ting . Ting . Ting . . Ting . Ting . .'],
      kenkeni: ['Ken . . Ken . . Ken . . Ken . .', 'Ken . Ken . . . Ken . Ken . . .', '. . Ken . . Ken . . Ken . . Ken'],
      sangban: ['San . . . San San . . San . . .', '. . . San . . San . . San . san', 'San . san . . San San . . . . .'],
      dundunba: ['Dun . . . . . Dun . Dun . . .', 'Dun . . Dun . . . . . . . .', 'Dun . . . . . . . . Dun . Dun'],
      djembe1: ['Gun . Go Pa . Pa Gun . Go Pa . Pa', 'Pa . Go Go . Pa Pa . Go Go . Pa', 'Gun Go Go Pa . . Gun Go Go Pa . .', 'Pa Pa . Go Go . Pa Pa . Go Go .', '. Pa Pa . Go Go . Pa Pa . Go Go'],
      djembe2: ['Go . Pa Go . Pa Go . Pa Go . Pa', '. Pa Pa . Pa Pa . Go Go . Go Go', 'Pa . . Pa Go Go Pa . . Pa Go Go'],
      shekere: ['Shk . shk Shk . shk Shk . shk Shk . shk', 'Shk shk shk Shk shk shk Shk shk shk Shk shk shk'] },
    cells: ['Pa Pa Pa', 'Pa . Pa', 'Go Go Pa', 'Pa Go Go', 'Gun . Pa', 'Pa! . .', 'Pa Pa .', '. Pa Pa', 'Go . Go', 'Pa! Pa Pa'],
    call: 'Pa! . . Pa Pa . Pa Pa . Pa Pa .',
    bar(c) { const { r, prog, inten, firstBar, lastBar, lastSec, pick } = c; const out = []; const n = Math.max(2, Math.round(2 + inten * 5));
      if (firstBar && c.si === 0) { out.push(['lead', this.call, 1.1]); return { part: 'call', out }; }
      ['bell', 'djembe1', 'dundunba', 'kenkeni', 'sangban', 'djembe2', 'shekere'].slice(0, n).forEach((p) => out.push([p, pick(p), p === 'bell' ? 0.7 : 0.85]));
      let part = 'ensemble';
      if (lastBar && !c.short) { out.push(['lead', this.call, 1.15]); part = lastSec ? 'call to stop' : 'call'; }
      else if (inten > 0.55 && prog >= 0.35) { const hot = prog > 0.8; part = hot ? 'echauffement' : 'solo'; let ph = []; for (let k = 0; k < 4; k++) ph.push(hot && r.chance(0.6) ? r.pick(['Pa Pa Pa', 'Pa! Pa Pa', 'Go Go Pa']) : r.pick(this.cells)); out.push(['lead', ph.join(' '), hot ? 1.15 : 1]); }
      return { part, out }; } };

  // Afro-Cuban: everything follows the clave and its direction. Conga strokes: h heel, t toe, S slap, O open; the quinto improvises and calls (llamada).
  // The 6/8 side (bembé, rumba columbia): the bell keeps the seven-stroke timeline, the drums feel four big beats of three, 3 against 2.
  T.afrocuban = { fixed: ['clave', 'bell'], grid: 16, group: 4, players: [['clave', 'Clave'], ['bell', 'Bell (6/8)'], ['shekere', 'Chekeré'], ['palitos', 'Palitos (cascara)'], ['segundo', 'Segundo'], ['tumba', 'Tumba'], ['quinto', 'Quinto'], ['campana', 'Campana'], ['guiro', 'Guiro']],
    map: { x: 'clave', pi: 'wood', h: 'chi', t: 'chi', s: 'slap', o: 'chi', bo: 'clo', q: 'bhi', cam: 'bell', gu: 'shk' },
    pools: { clave: ['X . . X . . X . . . X . X . . .', 'X . . X . . . X . . X . X . . .'],
      palitos: ['Pi . Pi Pi . Pi . Pi Pi . Pi . Pi . Pi .', 'Pi . Pi . Pi Pi . Pi Pi . Pi . Pi Pi . Pi'],
      segundo: ['h . t . S . t . h . t . O . O .', 'h . t . S . t . h . t . S . O O', 'h . t . S . t O h . t . S . O .'],
      tumba: ['. . . . . . . . . . . . . . Bo Bo', '. . . . . . Bo . . . . . . . Bo .', '. . . . . . . . . . . . Bo . Bo Bo'],
      campana: ['Cam . . . Cam . . . Cam . . . Cam . . .', 'Cam . cam . Cam . cam . Cam . cam . Cam . cam .'],
      guiro: ['Gu . gu gu Gu . gu gu Gu . gu gu Gu . gu gu'] },
    P16: null,
    P12: { clave: ['X . X . X . . X . X . .', 'X . X . . X . X . X . .'],
      bell: ['Cam . Cam . Cam Cam . Cam . Cam . Cam', 'Cam . Cam . Cam Cam . Cam . Cam . Cam'],
      shekere: ['Gu . gu Gu . gu Gu . gu Gu . gu', 'Gu gu . Gu gu . Gu gu . Gu gu .', 'Gu . . gu . gu Gu . . gu . gu'],
      palitos: ['Pi . Pi . Pi Pi . Pi . Pi . Pi', 'Pi Pi . Pi . Pi Pi Pi . Pi . Pi'],
      segundo: ['h . t O . O h . t O . O', '. . O . . O . . O . . O', 'h t O . O . h t O . O .', 'S . . O O . S . . O O .', 'h . O h . O h . O h . O'],
      tumba: ['. . . . . . . . . Bo . Bo', 'Bo . . . . Bo . . . Bo . .', '. . . Bo . . . . . Bo . .', 'Bo . . . . . Bo . . . . .'],
      campana: ['Cam . . Cam . . Cam . . Cam . .', 'Cam . . . . . Cam . . . . .'], guiro: ['Gu . gu Gu . gu Gu . gu Gu . gu'] },
    cells: ['S . Q .', '. Q Q .', 'S S . Q', 'Q . . S', '. . S Q', 'S . S .', 'Q Q Q S', '. . . .'],
    // in 6/8 the quinto thinks in threes, and now and then in twos across them
    cells12: ['S . Q', 'Q Q S', '. S S', 'S . .', 'Q . S', 'S Q Q', '. . Q', 'S! . S'], cross12: ['S . . S . . S . . S . .', 'S . Q . S . Q . S . Q .', 'S! . S . S . S! . S . S .'],
    call12: 'S! . S S! . S Q Q . S! . .',
    call: 'S! . S . Q Q . . S! . . Q . Q . .',
    setup(c) { this.dir = c.R.chance(0.5) ? 32 : 23; if (!this.P16) this.P16 = this.pools; this.six = c.R.chance(0.42); this.kind = c.R.chance(0.5) ? 'bembé' : 'rumba columbia';
      this.grid = this.six ? 12 : 16; this.group = this.six ? 3 : 4; this.pools = this.six ? this.P12 : this.P16; },
    bar6(c) { const { r, prog, inten, lastBar, pick } = c, out = [], d = (ph) => { if (this.dir === 32) return ph; const a = toks(ph); return a.slice(6).concat(a.slice(0, 6)).join(' '); };
      // the bell is the timeline, the clave sits in it; the chekeré and the drums walk in the big beats
      out.push(['bell', pick('bell'), 0.75]); if (this.kind === 'rumba columbia' || inten > 0.5) out.push(['clave', d(pick('clave')), 0.8]);
      if (inten > 0.3) out.push(['shekere', pick('shekere'), 0.55]); out.push(['segundo', pick('segundo'), 0.85]); if (inten > 0.4) out.push(['tumba', pick('tumba'), 0.95]);
      const hot = inten > 0.6 && prog >= 0.4; let part = hot ? (this.kind === 'bembé' ? 'bembé · the quinto rides' : 'columbia · the quinto dances') : this.kind;
      if (lastBar && !c.short) { out.push(['quinto', this.call12, 1.1]); part = 'llamada'; }
      else if (hot || r.chance(0.2 + inten * 0.2)) { const two = hot && r.chance(0.3 + 0.3 * c.w); let ph = two ? r.pick(this.cross12) : [0, 1, 2, 3].map(() => r.pick(this.cells12)).join(' ');
        out.push(['quinto', ph, hot ? 1.05 : 0.8]); if (two) part += ', in twos across the threes'; }
      if (hot && this.kind === 'bembé') out.push(['campana', pick('campana'), 0.55]);
      return { part: part + ' · 6/8, clave ' + (this.dir === 32 ? '3-2' : '2-3'), out }; },
    bar(c) { if (this.six) return this.bar6(c); const { r, prog, inten, lastBar, pick } = c, d = (ph) => this.dir === 23 ? rot8(ph) : ph; const out = [['clave', d(pick('clave')), 0.9]];
      if (inten > 0.25) out.push(['palitos', d(pick('palitos')), 0.6]); out.push(['segundo', pick('segundo'), 0.85]); if (inten > 0.4) out.push(['tumba', pick('tumba'), 0.95]);
      const mont = inten > 0.6 && prog >= 0.4; let part = mont ? 'montuno' : 'canto';
      if (lastBar && !c.short) { out.push(['quinto', d(this.call), 1.1]); part = 'llamada'; }
      else if (mont || r.chance(0.2 + inten * 0.2)) { let ph = []; for (let k = 0; k < 4; k++) ph.push(r.pick(this.cells)); out.push(['quinto', ph.join(' '), mont ? 1.05 : 0.8]); }
      if (mont) { out.push(['campana', pick('campana'), 0.6]); out.push(['guiro', pick('guiro'), 0.55]); }
      return { part: part + ' · clave ' + (this.dir === 32 ? '3-2' : '2-3'), out }; } };

  // Brazil: a samba bateria. Three surdos talk to each other, the repinique calls (chamada), the apito whistle signals the breaks (paradinha).
  T.brazil = { fixed: ['surdo1', 'surdo2'], grid: 16, group: 4, players: [['surdo1', 'Surdo 1 (marcação)'], ['surdo2', 'Surdo 2 (resposta)'], ['ganza', 'Ganzá'], ['caixa', 'Caixa'], ['tamborim', 'Tamborim'], ['surdo3', 'Surdo 3 (corte)'], ['agogo', 'Agogô'], ['repinique', 'Repinique'], ['apito', 'Apito']],
    map: { bum: 'drum', tum: 'drum', dum: 'clo', cor: 'chi', x: 'tamb', tam: 'wood', ag: ['bell'], gg: 'bell2', sh: 'shk', rp: 'bhi', api: 'apito' },
    pools: { surdo1: ['tum . . . Bum . . . tum . . . Bum . . .', '. . . . Bum . . . . . . . Bum . . .'], surdo2: ['Dum . . . . . . . Dum . . . . . . .', 'Dum . . . . . . . Dum . . . . . Dum .'],
      surdo3: ['. . . . Cor . Cor . . . Cor . . Cor . .', '. . Cor . . . Cor Cor . . Cor . . . Cor .', 'Cor . . Cor . . Cor . . . Cor . Cor . . .', '. . . Cor . . Cor . . . . Cor . . Cor Cor', 'Cor . Cor . . . . Cor . . Cor . . . Cor .'],
      caixa: ['X x x X x x X x X x x X x x X x', 'X x X x x X x X X x X x x X x X', 'x x X x x x X x x x X x x x X x'],
      tamborim: ['Tam . Tam . . Tam . Tam . Tam . . Tam . Tam .', 'Tam tam Tam tam Tam tam Tam tam Tam tam Tam tam Tam tam Tam tam', 'Tam . . Tam . . Tam . . . Tam . Tam . . .', 'Tam . Tam Tam . Tam . Tam Tam . Tam . Tam . Tam .', '. Tam . Tam . Tam Tam . . Tam . Tam Tam . Tam .', 'Tam . . Tam Tam . Tam . Tam . . Tam Tam . . .', 'Tam . . Tam . . Tam . . Tam . . Tam . . tam'],
      agogo: ['Ag . gg . Ag Ag . gg . Ag . gg . . . .', 'Ag . . gg Ag . gg . Ag . . gg Ag . gg .', 'gg Ag . Ag . gg Ag . . Ag . gg Ag . . .', 'Ag gg . Ag gg . Ag . gg . Ag gg . Ag . .'], ganza: ['Sh sh sh sh Sh sh sh sh Sh sh sh sh Sh sh sh sh', 'sh sh Sh sh sh sh Sh sh sh sh Sh sh sh sh Sh sh', 'Sh sh sh Sh sh sh Sh sh Sh sh sh Sh sh sh Sh sh'] },
    chamada: 'Rp! . Rp . Rp! . Rp . Rp! . Rp . Rp! Rp Rp Rp', apito: 'Api! . . . Api! . . . . . . . . . . .', parad: 'Rp! . . Rp! . . Rp! . . . Rp! . Rp! . . .',
    bossas: ['Rp! . . Rp! . . Rp! . . . Rp! . Rp! . . .', 'Rp! . Rp! . . Rp! . Rp! . . Rp! . Rp! Rp! . .', 'Rp! . . . Rp! . . . Rp! . Rp! . Rp! . . .', '. . Rp! . . Rp! . . Rp! . . . Rp! Rp! Rp! .', 'Rp! . . Rp! . . Rp! . . Rp! . . Rp! . . Rp!', 'Rp! . . Rp! . . Rp! . Rp! . . Rp! . . Rp! .'],
    setup(c) { this.order = null; this.parad = c.R.pick(this.bossas); this.chamada = c.R.pick(['Rp! . Rp . Rp! . Rp . Rp! . Rp . Rp! Rp Rp Rp', 'Rp! Rp . Rp Rp! . Rp . Rp! Rp . Rp Rp! Rp Rp Rp', 'Rp! . . Rp Rp! . . Rp Rp! . Rp . Rp! Rp Rp Rp']); },
    bar(c) { const { r, inten, firstBar, lastBar, pick, pb, nPat } = c, out = [];
      if (firstBar && c.si === 0) { out.push(['apito', this.apito, 1]); out.push(['repinique', this.chamada, 1.1]); return { part: 'chamada', out }; }
      if (nPat >= 24 && pb === Math.floor(nPat / 2) + 1 && c.R.chance(0.5)) { out.push(['surdo1', 'Bum . . . . . . . . . . . . . . .', 1]); out.push(['apito', '. . . . . . . . . . . . Api! . Api! .', 1]); return { part: 'paradinha · holding the breath', out }; }
      if (nPat >= 16 && pb === Math.floor(nPat / 2)) { out.push(['repinique', this.parad, 1.1]); out.push(['surdo1', 'Bum . . . . . . . . . . . . . . .', 1]); return { part: 'paradinha (break)', out }; }
      if (nPat >= 16 && pb === Math.floor(nPat / 2) - 1) out.push(['apito', '. . . . . . . . Api! . . . Api! . . .', 1]);
      const order = this.order || (this.order = ['surdo1', 'surdo2'].concat(['ganza', 'caixa', 'tamborim', 'surdo3', 'agogo'].sort(() => c.R() - 0.5))), n = Math.max(3, Math.round(3 + inten * 4));
      order.slice(0, n).forEach((p) => out.push([p, pick(p), p.startsWith('surdo') ? 1 : 0.7]));
      if (pb % 4 === 3 && !lastBar) { out.push(['repinique', r.pick(['. . . . . . . . Rp! . Rp Rp Rp! . Rp! .', 'Rp . Rp Rp . Rp . Rp Rp! . . Rp! . Rp! . .', '. . . . . . . . . . Rp Rp Rp! Rp Rp! .', 'Rp! . . Rp . . Rp . . . . . Rp! Rp Rp Rp!']), 1]);
        const s3 = out.findIndex((x) => x[0] === 'surdo3'); if (s3 >= 0) out[s3] = ['surdo3', toks(out[s3][1]).slice(0, 12).concat(['Cor', 'Cor', 'Cor', 'Cor']).join(' '), 1]; }
      let part = pb % 4 === 3 ? 'batucada · the repinique turns the phrase' : 'batucada'; if (lastBar && !c.short) { out.push(['apito', this.apito, 1]); out.push(['repinique', this.chamada, 1.05]); part = 'chamada'; }
      return { part, out }; } };

  // Middle East: rhythmic cycles (iqa'at) in Dum (low centre), Tek (high edge), ka (soft other hand). Each part of the song can have its own cycle.
  T.mideast = { grid: 16, group: 4, players: [['darbuka', 'Darbuka'], ['riq', 'Riq'], ['bendir', 'Bendir'], ['zills', 'Zills']],
    map: { dum: 'clo', tek: 'slap', ka: 'bhi', sh: 'tamb', bd: 'drum', zi: 'bell' },
    iqa: { maqsum: 'Dum . Tek . . . Tek . Dum . . . Tek . . .', baladi: 'Dum . Dum . . . Tek . Dum . . . Tek . . .', saidi: 'Dum . Tek . . . Dum . Dum . . . Tek . . .', malfuf: 'Dum . . Tek . . Tek . Dum . . Tek . . Tek .', ayoub: 'Dum . . ka Dum . Tek . Dum . . ka Dum . Tek .' },
    setup(c) { const R = c.R; this.gh = [1, 3, 5, 7, 9, 11, 13, 15].filter(() => R.chance(0.3)); this.riq = R.pick(['Sh', 'Sh sh', 'Sh . sh sh', 'Sh sh . sh']); this.zil = R.pick(['. . Zi . . . Zi . . . Zi . . . Zi .', 'Zi . . . Zi . . . Zi . . . Zi . . .', 'Zi . zi . Zi . zi . Zi . zi . Zi . zi .']); this.bd = R.pick(['dum', 'dum+', 'half']); this.by = { intro: R.pick(['malfuf', 'maqsum']), verse: 'maqsum', build: R.pick(['malfuf', 'ayoub']), drop: R.pick(['saidi', 'baladi', 'maqsum']), chorus: R.pick(['saidi', 'baladi']), break: R.pick(['malfuf', 'ayoub']), outro: 'maqsum' }; },
    adorn(ph, r, amt) { return toks(ph).map((t, i) => t !== '.' ? t : r.chance(amt) ? (i % 2 ? 'ka' : r.pick(['ka', 'tek'])) : '.').join(' '); },
    closing: 'Dum . Tek ka Tek ka Tek ka Dum . Tek ka Dum! . . .',
    bar(c) { const { r, prog, inten, lastBar, w } = c, name = this.by[c.sec.type] || 'maqsum', base = this.iqa[name], out = [];
      // each darbuka player has their own soft ka strokes in the gaps of the cycle
      let part = name + ' · plain', d = toks(base).map((t, i) => t === '.' && this.gh.includes(i) ? 'ka' : t).join(' ');
      if (inten < 0.45 && !lastBar) { const h = c.pb % 2; d = toks(base).slice(h * 8, h * 8 + 8).map((t) => t + ' .').join(' '); part = name + ' · slow, over 2 bars'; }
      if (lastBar && !c.short) { d = this.closing; part = 'closing phrase'; } else if (inten > 0.5 && prog >= 0.3) { d = this.adorn(base, r, 0.25 + 0.5 * w + 0.2 * prog); part = name + ' · zakhrafa (ornament)';
        // now and then the player groups the strokes in threes across the cycle and lands back on its Dum
        if (c.pb % 4 === 2 && r.chance(0.3 + 0.3 * w)) { d = r.pick(['Dum tek ka Dum tek ka Dum tek ka Dum tek ka Dum . Tek .', 'Tek ka ka Tek ka ka Tek ka ka Tek ka ka Dum . Tek .', 'Dum . tek Dum . tek Dum . tek Dum . tek Dum . Tek ka']); part = name + ' · zakhrafa in threes'; } }
      out.push(['darbuka', d, 1]);
      if (inten > 0.3) { const q = toks(this.riq); out.push(['riq', toks(base).map((t, i) => t !== '.' ? 'Sh' : q[i % q.length] === '.' ? '.' : 'sh').join(' '), 0.6]); }
      if (inten > 0.45) out.push(['bendir', toks(base).map((t, i) => /dum/i.test(t) && (this.bd !== 'half' || i < 8) ? 'Bd' : this.bd === 'dum+' && /tek/i.test(t) ? 'bd' : '.').join(' '), 0.9]);
      if (inten > 0.7) out.push(['zills', this.zil, 0.5]);
      return { part, out }; } };

  // India: the tabla speaks in bols. Teentaal is a cycle of 16 matras (here one matra is one beat, so four bars):
  // sam (X) on the first, khali (0) on the ninth where the bass falls silent. A tihai, a phrase three times, lands on sam.
  T.india = { grid: 16, group: 4, players: [['tabla', 'Tabla'], ['manjira', 'Manjira']],
    map: { dha: ['clo', 'bhi'], dhin: ['clo', 'blo'], dhi: ['clo', 'blo'], tin: 'blo', tu: 'blo', ta: 'bhi', na: 'bhi', ti: 'bhi', ra: 'bhi', ki: 'slap', ke: 'slap', ka: 'slap', ge: 'clo', ching: 'bell', chak: 'bell2' },
    theka: ['Dha Dhin Dhin Dha', 'Dha Dhin Dhin Dha', 'Dha Tin Tin Ta', 'Ta Dhin Dhin Dha'], marks: ['X', '2', '0', '3'],
    keherwa: ['Dha Ge Na Ti', 'Na Ka Dhi Na'],
    // ektaal, 12 matras over three bars, its vibhags in pairs: X 0 | 2 0 | 3 4
    ektaal: ['Dhin Dhin Dha Ge', 'Ti Ra Ki Ta', 'Tu Na Ka Ta'], ekmarks: ['X 0', '2 0', '3 4'],
    kaida: ['Dha Ti Dha Ge Na Dha Tin Na', 'Dha Dha Ti Ta Dha Dha Tin Na', 'Dha Ti Ra Ki Ta Dha Tin Na', 'Ge Na Dha Ti Dha Ge Tin Na', 'Dha Ge Ti Ra Ki Ta Tin Na', 'Dha Ti Dha Dha Ti Dha Tin Na'],
    relas: ['Dha Ti Ra Ki Ta Ka Ti Ra Ki Ta Ti Ra Ki Ta Ka Ta', 'Ti Ra Ki Ta Dha Ti Ra Ki Ta Dha Ti Ra Ki Ta Dha .'],
    tihais: [['Dha Ti Ra Ki Ta Dha', 2], ['Dha . Ti Dha', 1], ['Ki Ta Dha Ti Dha', 2], ['Dha Ge Na Dha', 1]],
    manjiras: ['Ching . . . chak . . . chak . . . chak . . .', 'Ching . chak . . . chak . Ching . chak . . . chak .', 'Ching . . chak . . chak . . chak . . Ching . . .'],
    spread: (ws) => ws.split(' ').map((b) => b + ' . . .').join(' '),
    khali: (ph) => ph.replace(/Dha/g, 'Ta').replace(/Dhin/g, 'Tin').replace(/Ge/g, 'Ke').replace(/Dhi\b/g, 'Ti'),
    setup(c) { const R = c.R; this.k = R.pick(this.kaida); this.tala = R.chance(0.3) ? 'ektaal' : 'teentaal'; this.th = R.pick(this.tihais); this.rela = R.pick(this.relas); this.manj = R.pick(this.manjiras); },
    tlen() { return 3 * toks(this.th[0]).length + 2 * this.th[1] - 1; },
    bar(c) { const { inten, pbIn, r, w } = c, out = [], slow = inten < 0.45 && c.sec.type !== 'intro' && c.sec.type !== 'outro' ? false : inten < 0.45, vil = inten < 0.45 && !slow;
      // vilambit: the slow laya, one matra lasts two beats, a teentaal cycle takes eight bars
      if (vil || (inten < 0.45 && c.sec.type === 'break')) { const all = this.theka.join(' ').split(' '), m0 = (pbIn * 2) % 16, ph = all[m0] + ' . . . . . . . ' + all[m0 + 1] + ' . . . . . . .';
        const room = c.nPat >= 2 ? (c.nPat - c.pb) * 16 - this.tlen() : 99; out.push(['tabla', room <= 0 ? '. . . . . . . . . . . . . . . .' : room < 16 ? toks(ph).map((t, i) => i < room ? t : '.').join(' ') : ph, 1]);
        out.push(['manjira', 'Ching . . . . . . . chak . . . . . . .', 0.4]); return { part: 'vilambit (slow laya) · teentaal ' + ['X', '2', '0', '3'][Math.floor(m0 / 4)], out }; }
      const ek = !slow && this.tala === 'ektaal', cyc = slow ? this.keherwa : ek ? this.ektaal : this.theka, v = pbIn % cyc.length;
      // the form changes only at the start of a cycle, on sam
      const cStart = c.pb - v, cProg = c.nPat > 1 ? cStart / (c.nPat - 1) : 1;
      let ph, part;
      if (!slow && inten > 0.55 && cProg >= 0.25) {
        // kaida: the theme, its khali mirror, and paltas (its halves turned around); a rela when the players are wild
        const h = this.k.split(' '), a = h.slice(0, 4).join(' '), b = h.slice(4).join(' ');
        const palta = [this.k + ' ' + this.k, a + ' ' + a + ' ' + a + ' ' + b, b + ' ' + a + ' ' + a + ' ' + b, a + ' ' + b + ' ' + b + ' ' + b][Math.floor(c.pb / cyc.length) % 4];
        if (w > 0.7 && v === cyc.length - 1 && r.chance(0.5)) { ph = this.rela; part = 'rela'; } else { ph = !ek && v === 2 ? this.khali(palta) : palta; part = 'kaida'; }
        // a chhand in threes: three bols at a time across the four beats, home again on the last
        if (part === 'kaida' && v === 1 && r.chance(0.25 + 0.3 * w)) { const t3 = h.slice(0, 3); ph = [0, 1, 2, 3, 4].map(() => t3.join(' ')).join(' ') + ' Dha'; part = 'kaida · chhand in threes'; }
      } else { ph = this.spread(cyc[v]); part = slow ? 'keherwa' : ek ? 'ektaal' : 'theka'; }
      // drut, dugun: in the full parts the theka now and then runs at double speed, two bols to a beat
      if (!slow && !ek && inten > 0.8 && part === 'kaida' && c.pb % 8 >= 6 && r.chance(0.6)) { const all = this.theka.join(' ').split(' '), half = (c.pb % 2) * 8; ph = all.slice(half, half + 8).map((b) => b + ' .').join(' '); part = 'drut · theka in dugun'; }
      if (part === 'theka' && v === cyc.length - 1) { const f = r.pick(['Ti Ra Ki Ta', 'Dha Ge Na Ge', 'Na Dha Ti Ta', 'Ki Ta Dha .', 'Dha . Ti Ra']); ph = toks(ph).slice(0, 12).concat(toks(f)).join(' '); part = 'theka, a small fill back to sam'; }
      // room for the tihai at the end of the part
      if (c.nPat >= 2) { const L = this.tlen(), endIdx = (c.nPat - c.pb) * 16; // steps from this bar's start to the end of the part
        const room = endIdx - L; if (room <= 0) ph = null; else if (room < 16) ph = toks(ph).map((t, i) => i < room ? t : '.').join(' '); }
      if (ph) out.push(['tabla', ph, 1]);
      out.push(['manjira', this.manj, 0.45]);
      return { part: part + ' · ' + (slow ? (v === 0 ? 'X' : '0') : ek ? 'ektaal ' + this.ekmarks[v] : 'teentaal ' + this.marks[v]), out }; },
    // the tihai: three times the same phrase with a rest between, the last stroke exactly on sam (the start of the next part)
    cadence(c, tEnd, stp) { const p = this.th[0], len = toks(p).length, gap = this.th[1], st = tEnd - this.tlen() * stp; let s = st;
      for (let k = 0; k < 3; k++) { layer(c, 'tabla', s, stp, p, this.map, k === 2 ? 1.15 : 1.05); s += (len + gap) * stp; } return 'tihai ×3 → sam'; } };

  // Marching: drum line and taptoe. The snare speaks in rudiments, written as stickings (R right, L left):
  // '~' a flam, '=' a diddle (two strokes on one), small letters soft taps, '!' an accent.
  // A drum line plays phrases of four bars that build and answer, not one bar over and over:
  // a motif, its echo, a turn, and an ending that rolls into the next phrase. Accents against soft taps make the groove.
  T.marching = { grid: 16, group: 4, players: [['snare', 'Snare line'], ['tenors', 'Tenors (quads)'], ['bassline', 'Bass line (5 drums)'], ['cymbals', 'Cymbals']],
    map: { r: 'snare', l: 'snare', x: 'rim', t1: 'tenor1', t2: 'tenor2', t3: 'tenor3', t4: 'tenor4', b1: 'bass1', b2: 'bass2', b3: 'bass3', b4: 'bass4', b5: 'bass5', cy: 'cym', ch: 'cyc', sz: 'cyc' },
    C16: { open: ['R! l r l', 'R! l r r', 'R~ l r l', 'R! l= r l', 'R! . r l', 'R= L= R! .', 'R~ r L~ l'], mid: ['r l R! l', 'l r r L!', 'r l r L!', 'R= l R= l', 'r= l r= l', 'l R! l r', 'r l= R! l', '. l r L!', 'R~ r l l', 'l l R! .'],
      roll: ['R= L= R= L=', 'R= L= R= L!', 'R= L= R! .', 'L= R= L= R!'], rest: ['R! . . .', '. . . .', '. . R! .'] },
    C12: { open: ['R! l r', 'R~ l r', 'R! l= r', 'R! . r', 'R= L= R!'], mid: ['r l R!', 'l r L!', 'R! L! .', 'r= l r', 'l R! l', 'R~ l l', 'r l r'], roll: ['R= L= R=', 'R= L= R!', 'L= R= L!'], rest: ['R! . .', '. . .'] },
    cell(kind, r) { const C = this.grid === 12 ? this.C12 : this.C16; return r.pick(C[kind]); },
    bar4(r, dense) { const k = (i) => i === 0 ? 'open' : r.chance(dense) ? 'mid' : r.chance(0.5) ? 'rest' : 'mid'; return [0, 1, 2, 3].map((i) => this.cell(k(i), r)).join(' '); },
    // an accent grid: soft taps all through, an accent every n strokes, so the accent walks across the bar
    accGrid(n, start, len) { const o = []; for (let i = 0; i < len; i++) o.push(((start + i) % n === 0) ? (i % 2 ? 'L!' : 'R!') : (i % 2 ? 'l' : 'r')); return o.join(' '); },
    setup(c) { const R = c.R; this.grid = R.chance(0.45) ? 12 : 16; this.group = this.grid === 12 ? 3 : 4; this.sec = {}; this.cyc = R.pick([3, 5, 6, 7]); },
    plan(c) { // the phrases of one part, made once: motif A, echo A', turn B, ending E
      if (this.sec[c.si]) return this.sec[c.si]; const r = c.r, G = this.grid, beats = 4, dense = 0.35 + 0.4 * c.w;
      const A = this.bar4(r, dense), B = this.bar4(r, dense + 0.15), A2 = toks(A).slice(0, 2 * G / 4).concat(toks(this.cell('mid', r) + ' ' + this.cell('roll', r))).join(' ');
      const E = this.cell('open', r) + ' ' + this.cell('mid', r) + ' ' + this.cell('roll', r) + ' ' + this.cell('roll', r);
      const forms = [['A', 'A', 'A2', 'E'], ['A', 'B', 'A', 'E'], ['A', 'A2', 'B', 'E'], ['A', 'G', 'A', 'E'], ['A', 'B', 'G', 'E']];
      // bass line: a melody over five drums, and a run for the ends
      const pos = euclid(r.pick([5, 6, 7]), G, r.int(G)); let d = 1 + r.int(5); const bl = Array(G).fill('.');
      pos.forEach((p, i) => { bl[p] = (i === 0 ? 'B' : 'b') + d; d = Math.max(1, Math.min(5, d + r.pick([-2, -1, 1, 2]))); }); bl[0] = 'B1';
      const run = Array(G).fill('.').map((_, i) => i >= G / 2 ? 'B' + (5 - ((i - G / 2) % 5)) : '.'); run[0] = 'B1';
      // tenors: sweeps around the four drums and answers to the snares
      const sweeps = G === 16 ? ['T1 T2 T3 T4', 'T4 T3 T2 T1', 'T1 . T3 .', 'T2 T1 T3 T4', 't1 t2 T3 .', 'T1 T1 T4 .'] : ['T1 T2 T3', 'T4 T3 T2', 'T1 . T4', 't2 t1 T3'];
      const ten = Array.from({ length: 4 }, () => r.pick(sweeps)).join(' ');
      const p = { A, A2, B, E, form: r.pick(forms), bass: bl.join(' '), run: run.join(' '), ten, cresc: r.pick(['cresc', 'flat', 'terraced']) }; this.sec[c.si] = p; return p; },
    // every next phrase of a part is a development of the first: a cell changed, a new turn, a new ending
    phrase(c) { const base = this.plan(c), k = Math.floor(c.pb / 4), key = c.si + '_' + k; if (!k) return base; if (this.sec[key]) return this.sec[key];
      const r = c.r, G = this.grid, g = G / 4, cells = (ph) => { const a = toks(ph), o = []; for (let i = 0; i < 4; i++) o.push(a.slice(i * g, i * g + g).join(' ')); return o; };
      const A = cells(base.A); A[1 + r.int(3)] = this.cell('mid', r); const B = cells(r.chance(0.5) ? base.B : this.bar4(r, 0.6 + 0.3 * c.w)); B[r.int(4)] = this.cell('mid', r);
      const E = this.cell('open', r) + ' ' + this.cell(r.chance(0.5) ? 'mid' : 'rest', r) + ' ' + this.cell('roll', r) + ' ' + this.cell('roll', r);
      const p = Object.assign({}, base, { A: A.join(' '), B: B.join(' '), E, A2: A.slice(0, 2).join(' ') + ' ' + this.cell('mid', r) + ' ' + this.cell('roll', r), form: r.pick([['A', 'B', 'A', 'E'], ['A', 'A2', 'B', 'E'], ['B', 'A', 'G', 'E'], ['A', 'G', 'B', 'E'], ['G', 'A', 'B', 'E']]) });
      if (r.chance(0.5)) { const sw = G === 16 ? ['T1 T2 T3 T4', 'T4 T3 T2 T1', 'T1 . T3 .', 'T2 T1 T3 T4', 't1 t2 T3 .', 'T1 T1 T4 .', 'T4 . T1 T2'] : ['T1 T2 T3', 'T4 T3 T2', 'T1 . T4', 't2 t1 T3']; p.ten = Array.from({ length: 4 }, () => r.pick(sw)).join(' '); }
      this.sec[key] = p; return p; },
    bar(c) { const { r, inten, prog, firstBar, lastBar, lastSec, w } = c, ty = c.sec.type, G = this.grid, out = [], p = this.phrase(c), inPh = c.pb % 4;
      const unis = (tok) => Array(G).fill('.').map((_, i) => i === 0 ? tok : '.').join(' ');
      if (firstBar && c.si === 0) { const ro = G === 16 ? 'R! . . . R! . . . R! . R! . R= L= R= L=' : 'R! . . R! . . R! . R! R= L= R='; out.push(['snare', ro, 1.05]); out.push(['bassline', G === 16 ? 'B1 . . . B1 . . . B1 . B1 . . . . .' : 'B1 . . B1 . . B1 . B1 . . .', 1]); return { part: 'roll-off · the signal to step off', out }; }
      if (lastSec && lastBar) { out.push(['snare', unis('R!'), 1.2]); out.push(['tenors', unis('T4'), 1.1]); out.push(['bassline', unis('B1'), 1.15]); out.push(['cymbals', G === 16 ? 'Cy . . . ch . . . . . . . . . . .' : 'Cy . . ch . . . . . . . .', 1.1]); return { part: 'cut-off · all as one', out }; }
      const gain = p.cresc === 'cresc' ? 0.75 + 0.35 * (inPh / 3) : p.cresc === 'terraced' ? [0.8, 0.8, 1, 1.05][inPh] : 0.95;
      // mark time: in place; left and right foot on the basses, rim clicks, and in a build a roll that grows
      if (ty === 'build' || ty === 'break' || inten < 0.35) { const steps = G === 16 ? 'B1 . . . B2 . . . B1 . . . B2 . . .' : 'B1 . . B2 . . B1 . . B2 . .';
        out.push(['bassline', steps, 0.85 + 0.3 * prog]);
        const rim = G === 16 ? 'x . x x . x . x x . x . x x . x' : 'x . x x . x x . x x . x';
        out.push(['snare', ty === 'build' && prog > 0.5 ? this.accGrid(this.cyc, c.pb * G, G) : rim, ty === 'build' ? 0.6 + 0.5 * prog : 0.6]);
        if (ty === 'build' && prog > 0.75) out.push(['cymbals', G === 16 ? 'sz . . . sz . . . sz . . . sz . sz .' : 'sz . . sz . . sz . . sz . sz', 0.6]);
        return { part: 'mark time · in place' + (ty === 'build' && prog > 0.5 ? ', accent every ' + this.cyc : ''), out }; }
      const feat = (ty === 'drop' || ty === 'chorus') && prog >= 0.2, slot = p.form[inPh];
      // the snare line: the phrase; in the feature the accent grid and the denser turn take over now and then
      let sn = slot === 'A' ? p.A : slot === 'A2' ? p.A2 : slot === 'B' ? p.B : slot === 'G' ? this.accGrid(this.cyc, c.pb * G, G) : p.E;
      if (feat && slot !== 'E' && r.chance(0.25 + 0.35 * w)) { sn = r.chance(0.5) ? this.accGrid(this.cyc, c.pb * G, G) : this.bar4(r, 0.85); }
      if (lastBar && !c.short) sn = toks(sn).slice(0, G / 2).concat(toks(this.cell('roll', r) + ' ' + this.cell('roll', r))).join(' ');
      out.push(['snare', sn, gain * (feat ? 1.05 : 1)]);
      // tenors: they answer in bars 2 and 4, and double the snare accents on their low drums in bars 1 and 3
      const acc = toks(sn).map((t, i) => /!/.test(t) ? (i % G === 0 ? 'T4' : r.pick(['T3', 'T4', 'T2'])) : '.').join(' ');
      // in 6/8 the tenors sometimes sweep in twos across the threes
      const two = G === 12 && feat && inPh === 2 && r.chance(0.5); if (inten > 0.45) out.push(['tenors', two ? r.pick(['T1 . T2 . T3 . T4 . T3 . T2 .', 'T4 . T3 . T4 . T2 . T1 . T1 .']) : (inPh % 2 === 1 || feat) ? p.ten : acc, gain * 0.95]);
      // bass line: the melody, a run at the end of the phrase, unison with the tutti
      out.push(['bassline', slot === 'E' ? p.run : p.bass, gain]);
      if (inten > 0.55) out.push(['cymbals', inPh === 0 ? (G === 16 ? 'Cy . . . . . . . sz . . . sz . . .' : 'Cy . . . . . sz . . sz . .') : slot === 'E' ? (G === 16 ? '. . . . . . . . . . . . Cy . ch .' : '. . . . . . . . . Cy . ch') : (G === 16 ? '. . . . sz . . . . . . . sz . . .' : '. . . sz . . . . . sz . .'), 0.6 * gain]);
      const nm = { A: 'the motif', A2: 'its echo', B: 'the turn', G: 'accent every ' + this.cyc, E: 'the ending, rolling on' }[slot];
      return { part: (feat ? 'drum feature' : 'cadence') + ' · bar ' + (inPh + 1) + ' of 4: ' + nm + (two ? ', tenors in twos across' : '') + (G === 12 ? ' · in 6/8' : ''), out }; } };

  // Shamanic: one steady pulse of about four to seven strokes a second, a rattle with it. At the end of the journey the callback:
  // four rounds of seven strong strokes, a fast roll, one last stroke.
  T.shamanic = { grid: 16, group: 4, players: [['frame', 'Frame drum'], ['rattle', 'Rattle'], ['drum2', 'Second drum'], ['bells', 'Bells']],
    map: { dum: 'drum', ra: 'shk', lo: 'clo', zi: 'bell' },
    setup(c) { const R = c.R; this.acc = R.pick([3, 5, 6, 7, 9]); this.rat = R.pick(['Ra ra', 'Ra ra ra ra', 'Ra . ra .', 'Ra ra ra .']); this.d2 = R.pick(['. . Lo . . . Lo .', 'Lo . . . . . . .', '. Lo . Lo . . . .', 'Lo . . Lo . . Lo .']); this.wave = R.chance(0.6); this.hb = R.pick(['Dum . dum . . . . . Dum . dum . . . . .', 'Dum . . dum . . . . Dum . . dum . . . .', 'Dum dum . . . . . . Dum dum . . . . . .']); },
    bar(c) { const { bpm, inten, prog, w, pb, nPat, lastSec, firstBar } = c, out = [];
      // one pulse; the accent walks in its own cycle over it (every 3, 4, 5, 6 or 8 strokes), so the drum breathes
      const sub = bpm * 2 / 60 >= 3.8 && bpm * 2 / 60 <= 7.5 ? 2 : bpm * 4 / 60 <= 7.5 ? 1 : 4, k0 = (c.bar0 + pb) * (16 / sub);
      const pulse = Array.from({ length: 16 }, (_, i) => i % sub ? '.' : ((k0 + i / sub) % this.acc === 0 ? 'Dum' : 'dum')).join(' ');
      const rq = toks(this.rat), rat = Array.from({ length: 16 }, (_, i) => rq[i % rq.length]).join(' ');
      if (lastSec && nPat >= 4 && pb >= nPat - 3) { const k = pb - (nPat - 3);
        if (k < 2) { out.push(['frame', 'Dum! Dum! Dum! Dum! Dum! Dum! Dum! . Dum! Dum! Dum! Dum! Dum! Dum! Dum! .', 1.1]); return { part: 'callback · 2 × 7', out }; }
        return { part: 'callback · fast roll', out, roll: true }; }
      if (firstBar && c.si === 0 || inten < 0.3) { out.push(['frame', this.hb, 0.95]); out.push(['rattle', 'Ra . . . ra . . . Ra . . . ra . . .', 0.4]); return { part: 'heartbeat', out }; }
      if (inten > 0.7 && pb % 8 === 7 && c.r.chance(0.45 + 0.35 * w)) { out.push(['frame', 'Dum dum Dum dum Dum dum Dum dum Dum dum Dum dum Dum! Dum! Dum! Dum!', 1.05]); out.push(['rattle', 'Ra ra Ra ra Ra ra Ra ra Ra ra Ra ra Ra ra Ra ra', 0.6]); return { part: 'storm · fast drumming', out }; }
      out.push(['frame', pulse, 0.95]); out.push(['rattle', rat, 0.45]);
      if (inten > 0.6 && w > 0.35) out.push(['drum2', this.d2 + ' ' + this.d2, 0.6]);
      // the wave: the second drum walks in threes over the pulse in twos, so the trance rocks
      else if (inten > 0.45 && this.wave && Math.floor(pb / 4) % 2 === 1) { const k = (c.bar0 + pb) * 16; out.push(['drum2', Array.from({ length: 16 }, (_, i) => (k + i) % 6 === 0 ? 'Lo' : (k + i) % 6 === 3 ? 'lo' : '.').join(' '), 0.55]); return { part: 'journey · the wave, three across two', out }; }
      if (prog > 0.5 && pb % 4 === 0) out.push(['bells', 'Zi . . . . . . . . . . . . . . .', 0.5]);
      return { part: 'journey · ' + (sub === 2 ? 'eighths' : sub === 1 ? 'sixteenths' : 'quarters') + ', ' + (bpm * 4 / 60 / sub).toFixed(1) + ' strokes a second', out }; } };

  // Powwow, the social dances only: one big drum, the singers around it strike together, a little apart, so each stroke is wide.
  // A song is sung in push-ups (rounds); honor beats (hard beats) fall in the middle of a round; it ends with a tail, and the drum stops dead.
  // No songs, no words, no ceremonial or honor songs here: those belong to the people and their occasions.
  T.powwow = { grid: 16, group: 4, players: [['drum', 'The drum (all singers)'], ['bells', "Dancers' bells"]],
    map: { d: ['drum', 'clo'], bel: 'tamb' },
    kinds: ['intertribal', 'intertribal', 'round dance', 'crow hop', 'sneak-up'],
    setup(c) { const R = c.R; this.kind = R.pick(this.kinds); this.grid = this.kind === 'round dance' || this.kind === 'crow hop' ? 12 : 16; this.group = this.grid === 12 ? 3 : 4; this.hb = R.pick([1, 2]); },
    beat(G, kind, hard) { // one bar of the drum
      if (kind === 'round dance') return 'D! . d D! . d D! . d D! . d';
      if (kind === 'crow hop') return hard ? 'D! . . D! . . D! . . D! . .' : 'd . D! d . D! d . D! d . D!';
      return hard ? 'D! . . . d . . . D! . . . d . . .' : 'D . . . D . . . D . . . D . . .'; },
    bar(c) { const { r, inten, prog, pb, nPat, lastBar, lastSec, firstBar } = c, G = this.grid, out = [], kind = this.kind, inR = pb % 8, rnd = Math.floor(pb / 8) + 1;
      const bells = (n) => Array.from({ length: G }, (_, i) => i % (G / 4) === 0 ? 'Bel' : r.chance(0.18 * n) ? 'bel' : '.').join(' ');
      // the end of the song: the tail, and on its last beat the drum stops and the dancers stand still
      if (lastSec && lastBar) { out.push(['drum', G === 16 ? 'D . . . D . . . D . . . D! . . .' : 'D! . d D! . d D! . . . . .', 1.05]); return { part: 'the tail · the drum stops, the dancers stop with it', out }; }
      if (firstBar && c.si === 0) { out.push(['drum', G === 16 ? 'd . . . d . . . d . . . d . . .' : 'd . . d . . d . . d . .', 0.7]); return { part: 'the lead singer opens · the drum comes in soft', out }; }
      // the sneak-up: a trembling roll while the dancers crouch and search, then hard single beats while they move in
      if (kind === 'sneak-up' && c.sec.type !== 'outro') { const ph = pb % 4;
        if (ph < 2) { out.push(['drum', Array(G).fill(0).map((_, i) => i % 2 ? 'd' : 'D').join(' '), 0.65 + 0.2 * ph]); return { part: 'sneak-up · the roll, the dancers crouch and search', out }; }
        out.push(['drum', ph === 2 ? 'D! . . . . . . . D! . . . . . . .' : 'D! . . . D! . . . . . . . . . . .', 1.1]); out.push(['bells', 'Bel . . . . . . . Bel . . . . . . .', 0.6]); return { part: 'sneak-up · hard beats, the dancers move in', out }; }
      // honor beats: in the middle of a round, a few bars of hard beats, loud and soft by turns
      const honor = nPat >= 8 && inR >= 4 && inR < 4 + this.hb * 2 && inten > 0.4;
      let ph = this.beat(G, kind, honor);
      if (!honor && r.chance(0.12 + 0.2 * c.w)) ph = toks(ph).map((t, i) => t === '.' && i % (G / 4) === (G === 16 ? 2 : 2) && r.chance(0.3) ? 'd' : t).join(' ');
      out.push(['drum', ph, honor ? 1.15 : 0.8 + 0.25 * inten]);
      if (inten > 0.35) out.push(['bells', bells(inten), 0.45 + 0.2 * inten]);
      const nm = kind === 'intertribal' ? 'intertribal · the straight beat' : kind === 'round dance' ? 'round dance · strong and soft, the circle sways' : 'crow hop · ' + (honor ? 'on the beat' : 'the hop on the off-beat');
      return { part: (honor ? 'honor beats · ' : '') + nm + ' · push-up ' + rnd, out }; } };

  function generateTrad(song) {
    const Tm = T[song.style], w = song.wild, sw = song.swing || 0, bpm = song.bpm, barSec = 240 / bpm, mutes = song.mutes || {}, ev = [], words = [];
    const R = rng(hash(song.seed, song.style, 'trad')), choice = {}, fixed = Tm.fixed || [];
    if (Tm.setup) Tm.setup({ R, w });
    const grid = Tm.grid, stp = barSec / grid;
    // like real players, each one makes the figure their own: a stroke moved, added or left out, never on the main beats
    const personal = (ph, r, n) => { const a = toks(ph), syl = a.filter((t) => t !== '.'); if (!syl.length) return ph; const g = Tm.group;
      for (let k = 0; k < n; k++) { const i = r.int(a.length); if (i % g === 0) continue; if (a[i] === '.') a[i] = r.pick(syl).replace('!', '').toLowerCase(); else if (r.chance(0.6)) a[i] = '.'; } return a.join(' '); };
    const fresh = (p, r) => fixed.includes(p) ? r.pick(Tm.pools[p]) : personal(r.pick(Tm.pools[p]), r, 1 + r.int(3));
    // phrases of four bars: the part a player chose develops from phrase to phrase, and the fourth bar turns
    const cur = { si: 0, pb: 0 }, dev = {};
    const pick = (p) => { if (!choice[p]) choice[p] = fresh(p, R); const base = choice[p]; if (fixed.includes(p)) return base;
      const k = Math.floor(cur.pb / 4), key = p + '|' + cur.si + '|' + k, rr = rng(hash(song.seed, key));
      if (!dev[key]) dev[key] = k ? personal(base, rr, 1) : base; if (cur.pb % 4 !== 3) return dev[key];
      if (!dev[key + 't']) dev[key + 't'] = personal(dev[key], rr, 2 + Math.round(2 * w)); return dev[key + 't']; };
    // now and then a player changes figure between parts, as players do
    let bar0 = 0;
    song.sections.forEach((sec, si) => {
      const nb = Math.max(1, sec.bars), base = INTENS[sec.type] != null ? INTENS[sec.type] : 0.6, lastSec = si === song.sections.length - 1, r = rng(hash(song.seed, song.style, si));
      if (si > 0 && Tm.pools) for (const k in choice) if (r.chance(0.35)) choice[k] = fresh(k, r);
      for (let pb = 0; pb < nb; pb++) {
        const t0 = (bar0 + pb) * barSec, prog = nb > 1 ? pb / (nb - 1) : 1, inten = Math.min(1, base * (0.8 + 0.4 * prog) + 0.12 * w);
        const c = { ev, mutes, r, w, sw, grid, R, bpm, si, sec, pb, bar0, nPat: nb, pbIn: pb, prog, inten, firstBar: pb === 0, lastBar: pb === nb - 1, lastSec, short: nb < 2, pick };
        cur.si = si; cur.pb = pb; const res = Tm.bar(c), line = { bar: bar0 + pb, part: res.part, lines: [] };
        // the dynamics of the phrase: growing, in steps, or even
        const shape = [['cresc', [0.85, 0.92, 1, 1.08]], ['terraced', [0.88, 0.88, 1.02, 1.06]], ['even', [0.97, 0.97, 0.97, 1.03]]][hash(song.seed, si, 'shape') % 3][1][pb % 4];
        for (const [pid, ph, g] of res.out) { layer(c, pid, t0, stp, ph, Tm.map, g * (0.85 + 0.2 * inten) * shape); const nm = (Tm.players.find((p) => p[0] === pid) || [pid, pid])[1]; line.lines.push([nm, show(ph, Tm.group)]); }
        if (res.roll) { const n = 24 + Math.round(16 * w); for (let k = 0; k < n; k++) ev.push({ t: t0 + (k / n) * barSec * 0.9, v: 'drum', vel: 70 + Math.round(40 * k / n) }); ev.push({ t: t0 + barSec * 0.95, v: 'drum', vel: 124 }); line.lines.push(['Frame drum', 'roll, faster and faster, one last stroke']); }
        words.push(line);
      }
      bar0 += nb;
      // a cadence that lands on the first beat of the next part (India's tihai)
      if (Tm.cadence && nb >= 2) { const lbl = Tm.cadence({ ev, mutes, r, w, sw: 0, grid }, bar0 * barSec, stp); const L = words[words.length - 1]; L.part += ' · ' + lbl; }
    });
    // play around a loaded beat: the low drums give the kick room
    if (song.beat && song.beat.bars) { const B = song.beat; for (const e of ev) { const bi = Math.floor(e.t / barSec), b = B.bars[bi]; if (!b) continue; const s16 = (e.t - bi * barSec) / barSec * 16; if ((e.v === 'drum' || e.v === 'clo') && b.k.some((k) => Math.abs(k - s16) < 0.35)) e.vel = Math.round(e.vel * 0.5); } }
    ev.sort((a, b) => a.t - b.t);
    const players = Tm.players.map(([id, name]) => ({ id, name, voices: [] }));
    for (const p of players) { const syl = Object.entries(Tm.map); p.voices = [...new Set(syl.map(([, v]) => [].concat(v)).flat())].slice(0, 1); }
    return { events: ev, barSec, totalSec: bar0 * barSec, tf: 1, grid, players, words, trad: true };
  }

  /* ---------- Taiko: kumi-daiko in its own language ----------
     Kuchi-shoga, one word per beat (four sixteenths): capitals are full strokes, ka/ra are rim strokes, su is a held silence (ma). */
  const KS = {
    DON: [[0, 'c', 2]], don: [[0, 'c', 1]], doko: [[0, 'c', 1], [2, 'c', 0]], dokon: [[0, 'c', 1], [2, 'c', 1]], tsuku: [[0, 'c', 0], [2, 'c', 0]], tsu: [[0, 'c', 0]],
    doro: [[0, 'c', 1], [1, 'c', 0], [2, 'c', 0], [3, 'c', 0]], dodon: [[0, 'c', 1], [2, 'c', 2]], donko: [[0, 'c', 1], [3, 'c', 0]], kara: [[0, 'r', 1], [2, 'r', 0]], ka: [[0, 'r', 1]],
    kadon: [[0, 'r', 0], [2, 'c', 1]], karakara: [[0, 'r', 1], [1, 'r', 0], [2, 'r', 1], [3, 'r', 0]], su: [], sun: []
  };
  // ji-uchi: the ground the shime keeps, one beat repeated
  const JI = { dondoko: 'doko', dontsuku: 'donko', dorotsuku: 'doro', matsuri: 'kadon', dondon: 'don' };
  // phrases of one bar, four words; a lead calls and a second player answers
  const CALLS = ['DON don doko don', 'DON su doko DON', 'don doko DON su', 'doko doko DON su', 'DON su su DON', 'don kara don kara', 'doko DON kara DON', 'DON doko su doko', 'don don doko DON', 'su doko DON don', 'DON tsuku doko DON', 'doro DON su DON', 'dodon su dodon su', 'DON kara doko DON', 'donko donko DON su', 'kadon kadon DON su'];
  const ANSWERS = ['su doko DON su', 'don su don DON', 'kara kara DON su', 'doko don DON su', 'su su doko DON', 'tsuku tsuku DON don', 'DON su kara DON', 'don doko don DON'];
  const KYU = ['doro doro DON DON', 'doko doko doko DON', 'dodon dodon doro DON', 'karakara doro DON su', 'doko doro doko DON', 'doro DON doro DON'];
  const KIME = ['DON su DON DON', 'DON DON su DON', 'dodon su DON su', 'DON su su DON'];
  const words = (ph) => ph.split(' ').filter(Boolean);
  // the second player passes the call on to the rim: same rhythm, other voice of the drum
  const RIM = { DON: 'ka', don: 'ka', doko: 'kara', dokon: 'kara', doro: 'karakara', dodon: 'kadon', donko: 'ka', tsuku: 'kara', tsu: 'ka' };
  const toRim = (ph) => words(ph).map((w) => RIM[w] || w).join(' ');
  function generateTaiko(song) {
    const w = song.wild, sw = song.swing || 0, bpm = song.bpm, barSec = 240 / bpm, tf = timeFactor(STYLES.taiko, bpm), mutes = song.mutes || {}, ev = [], txt = [];
    const R = rng(hash(song.seed, 'taiko')), ji = R.pick(sw > 0.45 ? ['dontsuku', 'dorotsuku'] : ['dondoko', 'dondoko', 'matsuri', 'dorotsuku', 'dontsuku']);
    const callPool = [0, 1, 2, 3, 4].map(() => R.pick(CALLS)), ansPool = [0, 1, 2].map(() => R.pick(ANSWERS)), kyuPool = [0, 1].map(() => R.pick(KYU));
    const put = (t, v, vel) => { if (!mutes[v === 'ka' ? 'don' : v === 'shimeka' ? 'shime' : v]) ev.push({ t: Math.max(0, t), v, vel: Math.max(15, Math.min(127, Math.round(vel))) }); };
    // a phrase of kuchi-shoga words on one drum: c = centre, r = rim
    const play = (t0, beatSec, ph, centre, rim, gain, r) => { words(ph).forEach((wd, b) => { (KS[wd] || []).forEach(([s, k, a]) => { let st = s; if (s % 2 === 1) st += sw * 0.36;
      const vel = (a === 2 ? 118 : a === 1 ? 96 : 60) * gain + (r() - 0.5) * (8 + 10 * w), jit = (r() - 0.5) * (0.004 + 0.008 * w); put(t0 + (b + st / 4) * beatSec + jit, k === 'c' ? centre : rim, vel); }); }); };
    let bar0 = 0;
    song.sections.forEach((sec, si) => {
      const nb = Math.max(1, sec.bars), nPat = Math.max(1, Math.round(nb * tf)), patSec = barSec * nb / nPat, beat = patSec / 4, last = si === song.sections.length - 1;
      const base = INTENS[sec.type] != null ? INTENS[sec.type] : 0.6, r = rng(hash(song.seed, 'taiko', si)); let slowUntil = -1;
      for (let pb = 0; pb < nPat; pb++) {
        const t0 = bar0 * barSec + pb * patSec, prog = nPat > 1 ? pb / (nPat - 1) : 1, inten = Math.min(1, base * (0.75 + 0.5 * prog) + 0.15 * w);
        // jo, ha, kyu: open slowly, break open, end fast
        const part = prog < 0.3 && nPat >= 4 && base < 0.7 ? 'jo' : prog < 0.75 || nPat < 4 ? 'ha' : 'kyu', line = { bar: bar0 + Math.floor(pb / tf), part };
        const lastBar = pb === nPat - 1, kime = lastBar && nPat >= 2 && !(last && nPat >= 4);
        // oroshi: a roll that speeds up, to open the piece and to close it
        if ((si === 0 && pb === 0 && nPat >= 4) || (last && lastBar && nPat >= 4)) {
          // every oroshi is its own: how many strokes, how fast it speeds up, odaiko alone or answered by the nagado
          const n = 8 + r.int(8) + Math.round(8 * w), cv = 1.4 + r() * 1.2, duo = r.chance(0.5), out = si === 0 && pb === 0;
          for (let k = 0; k < n; k++) { const f = k / (n - 1), pos = out ? 1 - Math.pow(1 - f, cv) : Math.pow(f, cv), v = duo && k % 2 ? 'don' : 'odaiko'; put(t0 + pos * patSec * 0.94, v, 54 + 60 * (out ? 1 - f * 0.4 : f)); }
          if (r.chance(0.4)) put(t0 + patSec * 0.75, 'ka', 90);
          line.odaiko = 'oroshi'; if (!out) { put(t0 + patSec * 0.97, 'kake', 110); line.kake = 'ha!'; } txt.push(line); continue; }
        // odaiko: the heartbeat of the earth, sparse in jo, every bar later
        const od = part === 'jo' ? (pb % 2 === 0 ? 'DON su su su' : 'su su su su') : part === 'ha' ? (inten > 0.5 ? 'DON su su DON' : 'DON su su su') : 'DON su DON su';
        // shime keeps the ji-uchi from ha on
        const sh = part === 'jo' ? (inten > 0.55 && r.chance(0.5) ? 'don su don su' : null) : part === 'ha' && r.chance(0.2 + 0.3 * (1 - w)) ? null : Array(4).fill(JI[ji]).join(' ');
        // the two nagado: call and answer, the answer passes the call on to the rim, then they join
        let a = null, b = null, ok = null, kn = null;
        if (kime) { a = b = ok = r.pick(KIME); }
        else if (part === 'jo') { a = pb % 2 === 0 ? callPool[pb % callPool.length].replace(/doko|doro/g, 'don') : 'su su su su'; }
        else if (part === 'ha') { const turn = Math.floor(pb / 2) % 2; const c = callPool[(Math.floor(pb / 4)) % callPool.length];
          if (turn === 0) { a = c; b = pb % 2 ? ansPool[pb % ansPool.length] : null; } else { a = pb % 2 ? null : 'su su su su'; b = r.chance(0.5) ? toRim(c) : ansPool[(pb + 1) % ansPool.length]; }
          if (inten > 0.6) ok = 'don su don su'; if (inten > 0.5 || w > 0.5) kn = 'kara su kara su'; }
        else { a = kyuPool[pb % kyuPool.length]; b = pb % 2 ? kyuPool[(pb + 1) % kyuPool.length] : a; ok = 'doko doko doko doko'; kn = 'karakara karakara karakara karakara'; }
        // the wild slider lets players add the sixteenths of the kyu earlier
        if (w > 0.7 && a && part === 'ha' && r.chance(0.3)) a = a.replace('doko', 'doro');
        // zen side: more ma, the second player rests more
        if (w < 0.3 && b && r.chance(0.4)) b = null;
        // the breath of this phrase: jo mostly drops in slow motion, kyu mostly storms, ha mixes; the slider moves the balance
        let breath = 'normal';
        if (!kime && a) { const pDrop = part === 'jo' ? 0.55 + 0.35 * (1 - w) : part === 'ha' ? 0.1 + 0.35 * (1 - w) : 0.04, pStorm = part === 'jo' ? 0 : part === 'ha' ? 0.1 + 0.3 * w : 0.45 + 0.35 * w, x = r();
          breath = x < pDrop && pb + 1 < nPat - 1 && /[A-Za-z]/.test(a.replace(/su/g, '')) ? 'drop' : x < pDrop + pStorm ? 'storm' : 'normal'; }
        if (pb < slowUntil) { a = null; b = null; line.lead = '(the slow phrase goes on: ma)'; }
        // the odaiko is more than a heartbeat: it answers the nagado in ha and storms with them in kyu
        let odx = od;
        if (part === 'ha' && !b && r.chance(0.3)) { odx = r.pick(ANSWERS); line.odaiko = odx + ' (answers)'; }
        else if (part === 'kyu' && r.chance(0.4 + 0.3 * w)) odx = r.pick(['doko doko DON su', 'DON doko DON doko', 'doro DON doro DON', 'DON DON doko DON']);
        play(t0, beat, odx, 'odaiko', 'odaiko', 1.05, r); if (!line.odaiko) line.odaiko = odx;
        if (a && breath === 'drop') { play(t0, beat * 2, a, 'don', 'ka', 0.95, r); line.lead = a + '   · slow motion, over 2 bars'; slowUntil = pb + 2; a = null; b = null; }
        else if (a && breath === 'storm') { const st2 = r.pick(KYU); play(t0, beat / 2, st2, 'don', 'ka', 0.95 + 0.1 * inten, r); play(t0 + 2 * beat, beat / 2, st2, 'don', 'ka', 1, r); line.lead = st2 + ' ×2   · storm'; a = null; }
        if (sh) { play(t0, beat, sh, 'shime', 'shimeka', 0.7 + 0.2 * inten, r); line.shime = sh; }
        if (a) { play(t0, beat, a, 'don', 'ka', 0.9 + 0.1 * inten, r); line.lead = a; }
        if (line.lead && !line.part2) line.breath = breath;
        if (b) { play(t0 + (kime ? 0 : 0.006), beat, b, 'don', 'ka', 0.82, r); line.second = b; }
        if (ok) { play(t0, beat, ok, 'okedo', 'ka', 0.72, r); line.okedo = ok; }
        if (kn) { play(t0, beat, words(kn).map((x) => x === 'karakara' ? 'doro' : x === 'kara' ? 'doko' : x).join(' '), 'kane', 'kane', 0.55, r); line.kane = words(kn).map((x) => x === 'karakara' ? 'chiki-chiki' : x === 'kara' ? 'chan-chiki' : x).join(' '); }
        // kakegoe: the calls that carry the players, before a phrase, with the kime
        if (kime) { put(t0 + 3.5 * beat, 'kake', 112); line.kake = 'ha!'; }
        else if (part !== 'jo' && pb % 4 === 3 && r.chance(0.35 + 0.5 * w)) { put(t0 + 3.5 * beat, 'kake', 100); line.kake = r.pick(['sore!', 'yoisho!', 'ho!']); }
        txt.push(line);
      }
      bar0 += nb;
    });
    if (song.beat && song.beat.bars) { const B = song.beat; for (const e of ev) { const bi = Math.floor(e.t / barSec), b = B.bars[bi]; if (!b) continue; const st = (e.t - bi * barSec) / barSec * 16; if ((e.v === 'odaiko' || e.v === 'don') && b.k.some((k) => Math.abs(k - st) < 0.35)) e.vel = Math.round(e.vel * 0.55); } }
    ev.sort((a, b) => a.t - b.t);
    const P = [['odaiko', ['odaiko']], ['shime', ['shime', 'shimeka']], ['don', ['don', 'ka']], ['okedo', ['okedo']], ['kane', ['kane']], ['kake', ['kake']]];
    return { events: ev, barSec, totalSec: bar0 * barSec, tf, grid: 16, players: P.map(([id, vs]) => ({ id, role: id, voices: vs })), words: txt, ji };
  }
  function generate(song) {
    if (STYLES[song.style] && STYLES[song.style].taiko) return generateTaiko(song);
    if (T[song.style]) return generateTrad(song);
    const { S, ps, poly, G } = band(song), w = song.wild, sw = song.swing || 0, bpm = song.bpm, barSec = 240 / bpm, tf = timeFactor(S, bpm);
    const ev = [], mutes = song.mutes || {}; let bar0 = 0;
    const maxN = Math.max(2, Math.round(ps.length * (0.5 + 0.5 * w)));
    song.sections.forEach((sec, si) => {
      const nb = Math.max(1, sec.bars), base = INTENS[sec.type] != null ? INTENS[sec.type] : 0.6, last = si === song.sections.length - 1;
      const nPat = Math.max(1, Math.round(nb * tf)), patSec = barSec * nb / nPat; // pattern bars in this section and their length
      const r = rng(hash(song.seed, song.style, 'sec', si, sec.type));
      for (let pb = 0; pb < nPat; pb++) {
        const t0 = (bar0 * barSec) + pb * patSec, prog = nPat > 1 ? pb / (nPat - 1) : 0, phrase = Math.floor(pb / (8 * tf || 8)), nPhr = Math.max(1, Math.ceil(nPat / (8 * tf || 8)));
        // how full: the section type, a slow climb over long sections, a little more for wild players
        let inten = base + (S.climb || w > 0.6 ? 0.25 * prog : 0.1 * prog); if (sec.type === 'build') inten = 0.35 + 0.6 * prog;
        let n = Math.round(1 + (maxN - 1) * Math.min(1, inten)); if (nPhr > 1) n = Math.max(1, Math.min(maxN, n - (nPhr - 1 - phrase)));
        const lastBar = pb === nPat - 1 && !last && nb >= 2, inPhrase = pb % 4, half = nPat >= 8 && prog >= 0.5;
        const br = rng(hash(song.seed, song.style, si, pb));
        const zenSilence = S.zen && br.chance((1 - w) * 0.35) && pb % 4 !== 0;
        const players = ps.slice(0, n).concat(half && w > 0.2 && nb >= 16 ? [poly] : []);
        players.forEach((p, pi) => {
          if (mutes[p.id]) return; if (zenSilence && pi > 0) return;
          let fig = half && pi % 2 === 1 ? p.alt : p.base;
          if (inPhrase === 3) fig = pi === (phrase % Math.max(1, players.length)) ? p.third : p.alt === fig ? p.base : fig; // the fourth bar answers
          if (br.chance(w * 0.45)) fig = mutate(fig, br, 1 + Math.round(w * 3));
          if (S.zen && br.chance((1 - w) * 0.25)) fig = mutate(fig, br, 2);
          let st = strokes(fig.length === G ? fig : fig.padEnd(G, '.').slice(0, G), p.map);
          // the last bar before a new section: a roll, a tihai, or a single big stroke
          if (lastBar && (p.role === 'hand' || p.role === 'low' || p.role === 'timeline' && S === STYLES.india)) st = st.filter((x) => x.s < G / 2).concat(fill(S, p, G, br, w));
          for (const x of st) { let s = x.s; if (G === 16 && Math.floor(s) % 2 === 1 && Number.isInteger(s)) s += sw * 0.36;
            const acc = Number.isInteger(x.s) && x.s % (G === 12 ? 3 : 4) === 0;
            let vel = (x.soft ? 56 : 98) + (acc ? 12 : 0) + (x.vel || 0); vel = 64 + (vel - 64) * (0.75 + 0.5 * w) * (0.85 + 0.25 * Math.min(1, inten)); vel += (br() - 0.5) * (8 + 14 * w);
            const jit = (br() - 0.5) * (0.004 + 0.01 * w);
            for (const v of x.v) ev.push({ t: Math.max(0, t0 + s * patSec / G + jit), v, vel: Math.max(18, Math.min(127, Math.round(vel))) }); }
        });
      }
      bar0 += nb;
    });
    // play around the beat: no big drum right on a kick, softer slaps on the snare
    if (song.beat && song.beat.bars) { const B = song.beat;
      for (const e of ev) { const bi = Math.floor(e.t / barSec), b = B.bars[bi]; if (!b) continue; const st = (e.t - bi * barSec) / barSec * 16, near = (arr) => arr.some((k) => Math.abs(k - st) < 0.35);
        if ((e.v === 'drum' || e.v === 'clo') && near(b.k)) e.vel = Math.round(e.vel * 0.45); if (e.v === 'slap' && near(b.s)) e.vel = Math.round(e.vel * 0.7); }
    }
    ev.sort((a, b) => a.t - b.t);
    return { events: ev, barSec, totalSec: bar0 * barSec, tf, players: ps.map((p) => ({ id: p.id, role: p.role, voices: [...new Set(Object.values(p.map).flat())] })), grid: G };
  }
  function fill(S, p, G, r, w) {
    const v = Object.values(p.map).flat(), lo = v.includes('drum') ? 'drum' : v.includes('clo') ? 'clo' : v[0], hi = v.find((x) => x === 'chi' || x === 'bhi' || x === 'slap') || v[v.length - 1];
    const o = [];
    if (S === STYLES.india && p.role === 'timeline') { // tihai: one phrase three times, landing on the one
      const m = [['clo', 'bhi'], ['bhi'], ['slap']]; let s = G / 2 - 1; for (let k = 0; k < 3; k++) { m.forEach((x, j) => o.push({ s: s + j, v: x, soft: j > 0 })); s += 3 + (k < 2 ? 0 : 0); } return o.filter((x) => x.s < G); }
    if (S.zen) { if (p.role === 'low') o.push({ s: G - 4, v: [lo], soft: false, vel: 18 }); return o; }
    const step = w > 0.65 ? 0.5 : 1; // shamanic players roll in 32nds
    for (let s = G / 2; s < G; s += step) { const k = (s - G / 2) / (G / 2); o.push({ s, v: [k > 0.6 || r.chance(0.4) ? hi : lo], soft: k < 0.4, vel: Math.round(k * 16) }); }
    return o;
  }

  /* ---------- sounds: small synths, the same code for playing and for the WAV ---------- */
  let NOISE = null;
  function noise(ctx) { if (NOISE && NOISE.sampleRate === ctx.sampleRate) return NOISE; const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; NOISE = b; return b; }
  function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  function tone(ctx, out, t, f0, f1, dec, amp, type) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + Math.min(0.12, dec)); env(g, t, 0.002, amp, dec); o.connect(g); g.connect(out); o.start(t); o.stop(t + dec + 0.05); }
  function nz(ctx, out, t, type, f, q, dec, amp) { const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise(ctx); fl.type = type; fl.frequency.value = f; fl.Q.value = q; env(g, t, 0.002, amp, dec); s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dec + 0.05); }
  function play(ctx, out, v, t, vel) { const a = Math.pow(vel / 127, 1.5);
    switch (v) {
      case 'drum': tone(ctx, out, t, 140, 52, 0.55, 0.9 * a); nz(ctx, out, t, 'lowpass', 900, 0.7, 0.05, 0.25 * a); break;
      case 'clo': tone(ctx, out, t, 205, 180, 0.28, 0.6 * a); nz(ctx, out, t, 'bandpass', 600, 2, 0.03, 0.15 * a); break;
      case 'chi': tone(ctx, out, t, 300, 270, 0.2, 0.5 * a); nz(ctx, out, t, 'bandpass', 900, 2, 0.025, 0.14 * a); break;
      case 'slap': nz(ctx, out, t, 'bandpass', 1500, 1.4, 0.06, 0.6 * a); tone(ctx, out, t, 380, 330, 0.06, 0.2 * a); break;
      case 'bhi': tone(ctx, out, t, 480, 430, 0.11, 0.42 * a); nz(ctx, out, t, 'bandpass', 2400, 3, 0.015, 0.12 * a); break;
      case 'blo': tone(ctx, out, t, 350, 320, 0.13, 0.42 * a); nz(ctx, out, t, 'bandpass', 1800, 3, 0.015, 0.1 * a); break;
      case 'shk': nz(ctx, out, t, 'highpass', 6500, 0.8, 0.05, 0.28 * a); break;
      case 'bell': tone(ctx, out, t, 830, 830, 0.32, 0.17 * a, 'triangle'); tone(ctx, out, t, 1245, 1245, 0.2, 0.07 * a, 'square'); break;
      case 'bell2': tone(ctx, out, t, 560, 560, 0.32, 0.17 * a, 'triangle'); tone(ctx, out, t, 845, 845, 0.2, 0.07 * a, 'square'); break;
      case 'clave': tone(ctx, out, t, 2500, 2450, 0.06, 0.32 * a); break;
      case 'wood': tone(ctx, out, t, 1150, 1100, 0.07, 0.3 * a); tone(ctx, out, t, 1780, 1750, 0.04, 0.12 * a); break;
      case 'tamb': nz(ctx, out, t, 'highpass', 7000, 0.7, 0.12, 0.22 * a); nz(ctx, out, t, 'bandpass', 9500, 6, 0.18, 0.12 * a); break;
      case 'odaiko': tone(ctx, out, t, 75, 38, 1.4, 1.0 * a); nz(ctx, out, t, 'lowpass', 500, 0.7, 0.08, 0.3 * a); break;
      case 'don': tone(ctx, out, t, 130, 82, 0.6, 0.85 * a); nz(ctx, out, t, 'lowpass', 1200, 0.8, 0.05, 0.25 * a); break;
      case 'ka': tone(ctx, out, t, 1300, 1250, 0.05, 0.3 * a); nz(ctx, out, t, 'bandpass', 2800, 2, 0.03, 0.25 * a); break;
      case 'shime': tone(ctx, out, t, 420, 380, 0.11, 0.45 * a); nz(ctx, out, t, 'bandpass', 3000, 2, 0.02, 0.2 * a); break;
      case 'shimeka': tone(ctx, out, t, 1900, 1850, 0.04, 0.22 * a); break;
      case 'okedo': tone(ctx, out, t, 170, 120, 0.35, 0.6 * a); nz(ctx, out, t, 'bandpass', 900, 1.5, 0.04, 0.2 * a); break;
      case 'kane': tone(ctx, out, t, 2200, 2200, 0.25, 0.12 * a, 'square'); tone(ctx, out, t, 3170, 3170, 0.18, 0.06 * a, 'square'); nz(ctx, out, t, 'highpass', 5000, 1, 0.05, 0.1 * a); break;
      case 'snare': nz(ctx, out, t, 'bandpass', 2600, 0.9, 0.13, 0.55 * a); nz(ctx, out, t, 'highpass', 5000, 0.7, 0.05, 0.3 * a); tone(ctx, out, t, 340, 300, 0.05, 0.25 * a); break;
      case 'rim': tone(ctx, out, t, 1750, 1700, 0.03, 0.3 * a); nz(ctx, out, t, 'bandpass', 3500, 3, 0.015, 0.15 * a); break;
      case 'tenor1': tone(ctx, out, t, 330, 300, 0.25, 0.5 * a); nz(ctx, out, t, 'bandpass', 2000, 2, 0.02, 0.18 * a); break;
      case 'tenor2': tone(ctx, out, t, 262, 240, 0.28, 0.5 * a); nz(ctx, out, t, 'bandpass', 1800, 2, 0.02, 0.18 * a); break;
      case 'tenor3': tone(ctx, out, t, 208, 190, 0.3, 0.52 * a); nz(ctx, out, t, 'bandpass', 1500, 2, 0.02, 0.18 * a); break;
      case 'tenor4': tone(ctx, out, t, 165, 150, 0.34, 0.55 * a); nz(ctx, out, t, 'bandpass', 1300, 2, 0.02, 0.18 * a); break;
      case 'bass1': tone(ctx, out, t, 62, 46, 0.6, 0.95 * a); nz(ctx, out, t, 'lowpass', 600, 0.7, 0.03, 0.2 * a); break;
      case 'bass2': tone(ctx, out, t, 78, 60, 0.55, 0.9 * a); nz(ctx, out, t, 'lowpass', 700, 0.7, 0.03, 0.2 * a); break;
      case 'bass3': tone(ctx, out, t, 98, 76, 0.5, 0.85 * a); nz(ctx, out, t, 'lowpass', 800, 0.7, 0.03, 0.2 * a); break;
      case 'bass4': tone(ctx, out, t, 122, 96, 0.45, 0.8 * a); nz(ctx, out, t, 'lowpass', 900, 0.7, 0.03, 0.2 * a); break;
      case 'bass5': tone(ctx, out, t, 150, 120, 0.4, 0.78 * a); nz(ctx, out, t, 'lowpass', 1000, 0.7, 0.03, 0.2 * a); break;
      case 'cym': nz(ctx, out, t, 'highpass', 4500, 0.6, 0.9, 0.25 * a); nz(ctx, out, t, 'bandpass', 7800, 4, 0.6, 0.12 * a); break;
      case 'cyc': nz(ctx, out, t, 'highpass', 4500, 0.6, 0.12, 0.28 * a); break;
      case 'apito': { const o = ctx.createOscillator(), l = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain(); o.frequency.value = 2900; l.frequency.value = 38; lg.gain.value = 120; l.connect(lg); lg.connect(o.frequency); env(g, t, 0.01, 0.18 * a, 0.22); o.connect(g); g.connect(out); o.start(t); l.start(t); o.stop(t + 0.3); l.stop(t + 0.3); break; }
      case 'kake': { const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(240, t); o.frequency.linearRampToValueAtTime(180, t + 0.25); f.type = 'bandpass'; f.frequency.value = 800; f.Q.value = 3; env(g, t, 0.01, 0.35 * a, 0.25); o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + 0.3); nz(ctx, out, t, 'bandpass', 1500, 2, 0.06, 0.2 * a); break; }
    } }

  root.PercMotor = { VOICES, STYLES, ORDER, INTENS, generate, play, rng, hash, euclid, timeFactor, TRAD: T };
})(window);
/* PERC ENGINE END */
