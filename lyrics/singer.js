/* Divine Lyric Oracle singer: the eSpeak robot speaks each word, then every syllable is put on its note.
   No AI, no network: meSpeak (eSpeak, GPL) makes the words, this file stretches the vowels and sets the pitch.
   Pitch is moved by pitch synchronous overlap add: short slices of one voice period are laid down again
   at the distance of the wanted note, so the timbre stays and only the tone changes. */
(function (root) {
  'use strict';
  const SR = 22050, XF = Math.round(0.035 * SR), HOP = 110, WIN = 880;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const hann = (n) => { const w = new Float32Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)); return w; };
  const HW = hann(WIN), hcache = new Map();
  const hannOf = (n) => { let w = hcache.get(n); if (!w) { w = hann(n); hcache.set(n, w); } return w; };

  // ---- words from eSpeak ----
  function wavToFloat(bytes) {
    const u = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes); const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    let p = 12, off = 44, len = u.length - 44;
    while (p + 8 <= u.length) { const id = String.fromCharCode(u[p], u[p + 1], u[p + 2], u[p + 3]), sz = dv.getUint32(p + 4, true); if (id === 'data') { off = p + 8; len = Math.min(sz, u.length - off); break; } p += 8 + sz + (sz & 1); }
    const n = len >> 1, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = dv.getInt16(off + 2 * i, true) / 32768; return x;
  }
  function trim(x) {
    let mx = 0; for (let i = 0; i < x.length; i++) mx = Math.max(mx, Math.abs(x[i])); const th = 0.02 * mx; let a = 0, b = x.length - 1;
    while (a < b && Math.abs(x[a]) <= th) a++; while (b > a && Math.abs(x[b]) <= th) b--;
    return x.slice(Math.max(0, a - 40), Math.min(x.length, b + 40));
  }
  const words = new Map();
  function speak(word) {
    const key = word.toLowerCase(); if (words.has(key)) return words.get(key);
    let d = null; try { d = root.meSpeak.speak(word, { rawdata: 'array', pitch: 40, speed: 140, wordgap: 0 }); } catch (e) { root.__badWords = (root.__badWords || []).concat(word); }
    const x = d && d.length ? trim(wavToFloat(d)) : new Float32Array(Math.round(SR * 0.1));
    words.set(key, x); return x;
  }

  // ---- analysis ----
  function f0track(x) {
    const lo = Math.floor(SR / 400), hi = Math.floor(SR / 70), out = [];
    const f = new Float32Array(WIN);
    for (let s = 0; s + WIN < x.length || s === 0; s += HOP) {
      let e = 0; for (let i = 0; i < WIN; i++) { const v = (x[s + i] || 0) * HW[i]; f[i] = v; e += v * v; }
      if (Math.sqrt(e / WIN) < 0.01) { out.push(0); if (s + WIN >= x.length) break; continue; }
      let best = -1, bl = lo; for (let L = lo; L < hi; L++) { let a = 0; for (let i = 0; i + L < WIN; i++) a += f[i] * f[i + L]; if (a > best) { best = a; bl = L; } }
      out.push(best / (e + 1e-9) > 0.4 ? SR / bl : 0); if (s + WIN >= x.length) break;
    }
    return out;
  }
  function periodAt(f0, i, fallback) { const v = f0[Math.min(f0.length - 1, Math.floor(i / HOP))]; return SR / Math.max(70, v || fallback || 120); }
  function marks(x, f0) {
    let first = -1, last = -1; for (let i = 0; i < f0.length; i++) if (f0[i] > 0) { if (first < 0) first = i; last = i; }
    if (first < 0) return null; const firstF = f0[first];
    const v0 = first * HOP, v1 = Math.min(x.length - 1, last * HOP + WIN); const ms = []; let t = v0;
    while (t < v1) { const P = Math.round(periodAt(f0, t, firstF)); if (t + 4 > x.length) break; let m = t, mv = -1e9; for (let i = t; i < Math.min(x.length, t + P); i++) if (x[i] > mv) { mv = x[i]; m = i; } ms.push(m); t = m + Math.round(P * 0.75); }
    const pm = [ms[0]]; for (const m of ms.slice(1)) if (m - pm[pm.length - 1] > 0.6 * periodAt(f0, m, 120)) pm.push(m);
    return { pm, v0, v1 };
  }
  function split(x, n) {
    if (n <= 1) return [x];
    const e = []; for (let s = 0; s + 440 < x.length; s += 110) { let a = 0; for (let i = 0; i < 440; i++) a += x[s + i] * x[s + i]; e.push(Math.sqrt(a / 440)); }
    const sm = e.map((_, k) => { let a = 0, c = 0; for (let j = k - 2; j <= k + 2; j++) if (j >= 0 && j < e.length) { a += e[j]; c++; } return a / c; });
    const lo = Math.floor(sm.length * 0.15), hi = Math.floor(sm.length * 0.85), cand = [];
    for (let k = lo + 1; k < hi - 1; k++) if (sm[k] <= sm[k - 1] && sm[k] <= sm[k + 1]) cand.push([sm[k], k]);
    cand.sort((a, b) => a[0] - b[0]); const pts = [];
    for (const [, k] of cand) { if (pts.every((p) => Math.abs(k - p) > 12)) pts.push(k); if (pts.length === n - 1) break; }
    while (pts.length < n - 1) pts.push(Math.floor(sm.length * (pts.length + 1) / n));
    const b = [0].concat(pts.map((p) => p * 110).sort((a, c) => a - c), [x.length]); const out = [];
    for (let i = 0; i < n; i++) out.push(x.slice(b[i], Math.max(b[i] + 1, b[i + 1])));
    return out;
  }
  const parts = new Map();
  function syllableParts(word, n) {
    const key = word.toLowerCase() + '|' + n; if (parts.has(key)) return parts.get(key);
    const ps = split(speak(word), n).map((p) => { let mx = 1e-9; for (const v of p) mx = Math.max(mx, Math.abs(v)); const x = p.map((v) => v / mx); const f0 = x.length > 900 ? f0track(x) : []; return { x, f0, mk: x.length > 900 ? marks(x, f0) : null }; });
    parts.set(key, ps); return ps;
  }

  // ---- one syllable on one note ----
  function sing(an, midi, prev, N, detune) {
    const { x, f0, mk } = an, y = new Float32Array(N + XF);
    if (!mk) { for (let i = 0; i < Math.min(x.length, y.length); i++) y[i] = x[i]; return y; }
    const { pm, v0, v1 } = mk, onsetN = v0, tailN = Math.min(x.length - v1, Math.round(0.07 * SR));
    const Vl = Math.max(1, v1 - v0), mid = Math.max(Math.round(0.06 * SR), N + XF - onsetN - tailN);
    const buf = new Float32Array(onsetN + mid + tailN + 4000), ws = new Float32Array(buf.length);
    for (let i = 0; i < onsetN; i++) { buf[i] = x[i] * 1.1; ws[i] = 1; }
    const a = 0.2 * Vl, bq = 0.2 * Vl;
    const tin = (t) => mid <= Vl ? v0 + Vl * t / mid : t < a ? v0 + t : t > mid - bq ? v1 - (mid - t) : v0 + a + (Vl - a - bq) * (t - a) / (mid - a - bq);
    const tgt = midi + detune, st = prev != null ? prev + detune : tgt; let t = 0;
    while (t < mid) {
      const sec = t / SR, g = Math.min(1, sec / 0.06); let semi = st + (tgt - st) * (1 - (1 - g) * (1 - g));
      if (sec > 0.25) semi += 0.18 * Math.sin(2 * Math.PI * 5.4 * (sec - 0.25)) * Math.min(1, (sec - 0.25) / 0.25);
      const P = SR / mtof(semi), ti = tin(t);
      let k1 = 0; while (k1 < pm.length && pm[k1] < ti) k1++; const k0 = Math.max(0, Math.min(pm.length - 1, k1 - 1)); k1 = Math.min(pm.length - 1, k0 + 1);
      const fr = pm[k1] === pm[k0] ? 0 : Math.max(0, Math.min(1, (ti - pm[k0]) / (pm[k1] - pm[k0])));
      const Pg = Math.floor(Math.min(P, periodAt(f0, pm[k0], 120))), L = 2 * Pg, w = hannOf(L), o = onsetN + Math.floor(t) - Pg;
      if (o >= 0 && o + L < buf.length) {
        for (const [m, wt] of [[pm[k0], 1 - fr], [pm[k1], fr]]) { const s = m - Pg; if (wt > 0 && s >= 0 && s + L <= x.length) for (let i = 0; i < L; i++) buf[o + i] += wt * x[s + i] * w[i]; }
        for (let i = 0; i < L; i++) ws[o + i] += w[i];
      }
      t += P;
    }
    for (let i = onsetN; i < onsetN + mid; i++) buf[i] /= Math.max(ws[i], 0.35);
    for (let i = 0; i < tailN; i++) buf[onsetN + mid + i] = x[v1 + i] * 1.1;
    y.set(buf.subarray(0, y.length)); return y;
  }

  // ---- syllables in a word ----
  function syllables(word) {
    let w = String(word).toLowerCase().replace(/[^a-z]/g, ''); if (!w) return 0; if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, ''); const m = w.match(/[aeiouy]{1,2}/g); return Math.max(1, m ? m.length : 1);
  }

  /* render a list of notes: {word, nSyl, syl, midi, start, dur, lineEnd, spoken}
     returns {lead, dbl} mono Float32Arrays at SR, length `total` seconds */
  async function render(notes, total, onProgress) {
    const n = Math.ceil(total * SR), lead = new Float32Array(n), dbl = new Float32Array(n);
    let prev = null, firstOfLine = true;
    for (let k = 0; k < notes.length; k++) {
      const nt = notes[k];
      if (nt.spoken) { const x = speak(nt.word), o = Math.round(nt.start * SR); for (let i = 0; i < x.length && o + i < n; i++) { lead[o + i] += x[i] * 0.9; dbl[o + i] += x[i] * 0.9; } prev = null; firstOfLine = true; }
      else {
        const an = syllableParts(nt.word, nt.nSyl)[Math.min(nt.syl, nt.nSyl - 1)], N = Math.max(1, Math.round(nt.dur * SR));
        for (const [arr, det, dl] of [[lead, 0, 0], [dbl, 0.08, Math.round(0.012 * SR)]]) {
          const y = sing(an, nt.midi, prev, N, det); let e = 0, c = 0; for (let i = Math.round(0.03 * SR); i < y.length; i++) { e += y[i] * y[i]; c++; } const g = 0.12 / (Math.sqrt(e / Math.max(1, c)) + 1e-9);
          const o = Math.round(nt.start * SR) + dl;
          for (let i = 0; i < y.length; i++) {
            let f = 1; if (!firstOfLine && i < XF) f = i / XF;
            if (nt.lineEnd) { const e2 = Math.min(N, Math.round(0.12 * SR)); if (i >= N) f = 0; else if (i >= N - e2) f *= (N - i) / e2; } else if (i >= N) f *= 1 - (i - N) / (y.length - N);
            if (o + i < n && o + i >= 0) arr[o + i] += y[i] * g * f;
          }
        }
        prev = nt.lineEnd ? null : nt.midi; firstOfLine = nt.lineEnd;
      }
      if (onProgress && k % 6 === 0) { onProgress(k / notes.length); await new Promise((r) => setTimeout(r, 0)); }
    }
    for (const arr of [lead, dbl]) for (let i = 0; i < n; i++) arr[i] = Math.tanh(arr[i] * 1.2);
    if (onProgress) onProgress(1);
    return { lead, dbl, sr: SR };
  }
  root.Singer = { SR, render, syllables, speak };
})(window);
