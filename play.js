// Rubiq in the browser: a 3D cube and its circle graph, driven by one shared state.
// A port of the iOS app's model (CubeModel.swift, CircleLayout.swift). No dependencies.
(() => {
  "use strict";

  const root = document.getElementById("playground");
  if (!root) return;

  const STICKER = ["#f7f7f2", "#ffd41a", "#00b361", "#216ef5", "#eb1f33", "#ff800f"]; // U D F B R L
  const FAMILY = ["#f7857a", "#f5e094", "#66ccbd"]; // circle families: x, y, z slices
  const R0 = 1.48, SPREAD = 0.7;
  const CENTERS = [[0.8660254, 0.5], [0, -1], [-0.8660254, 0.5]];
  const BOUNDS = { x: -3.1, y: -3.25, w: 6.2, h: 6.0 };
  const SCRAMBLE = { warmup: () => 3, easy: () => 6, classic: (n) => (n === 2 ? 11 : n === 3 ? 22 : 40) };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const now = () => performance.now();
  const ease = (p) => { const x = Math.min(1, Math.max(0, p)); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };

  // ---------- Cube model: fixed sticker slots, a colour per slot, layer turns as permutations

  function rotateV([x, y, z], axis, dir) {
    if (axis === 0) return dir > 0 ? [x, -z, y] : [x, z, -y];
    if (axis === 1) return dir > 0 ? [z, y, -x] : [-z, y, x];
    return dir > 0 ? [-y, x, z] : [y, -x, z];
  }
  function rotateC([x, y, z], axis, a) {
    const c = Math.cos(a), s = Math.sin(a);
    if (axis === 0) return [x, y * c - z * s, y * s + z * c];
    if (axis === 1) return [x * c + z * s, y, -x * s + z * c];
    return [x * c - y * s, x * s + y * c, z];
  }
  const faceOf = (n) => (n[1] === 1 ? 0 : n[1] === -1 ? 1 : n[2] === 1 ? 2 : n[2] === -1 ? 3 : n[0] === 1 ? 4 : 5);
  const slotKey = (p, n) => p.join(",") + "|" + n.join(",");

  class Geometry {
    constructor(n) {
      this.n = n;
      const m = n - 1;
      this.layers = [];
      for (let v = -m; v <= m; v += 2) this.layers.push(v);
      this.slots = [];
      const cubies = new Map();
      for (const x of this.layers) for (const y of this.layers) for (const z of this.layers) {
        const p = [x, y, z];
        for (let a = 0; a < 3; a++) {
          if (Math.abs(p[a]) !== m) continue;
          const normal = [0, 0, 0];
          normal[a] = p[a] > 0 ? 1 : -1;
          const i = this.slots.push({ pos: p, normal, axis: a, face: faceOf(normal) }) - 1;
          const k = p.join(",");
          if (!cubies.has(k)) cubies.set(k, { pos: p, stickers: [] });
          cubies.get(k).stickers.push(i);
        }
      }
      this.cubies = [...cubies.values()];
      this.index = new Map(this.slots.map((s, i) => [slotKey(s.pos, s.normal), i]));
      this.solved = this.slots.map((s) => s.face);
      this.cache = new Map();
    }
    perm(mv) {
      const k = `${mv.axis},${mv.layer},${mv.dir}`;
      let p = this.cache.get(k);
      if (!p) {
        p = this.slots.map((s, i) => s.pos[mv.axis] === mv.layer
          ? this.index.get(slotKey(rotateV(s.pos, mv.axis, mv.dir), rotateV(s.normal, mv.axis, mv.dir))) : i);
        this.cache.set(k, p);
      }
      return p;
    }
    apply(mv, colors) {
      const p = this.perm(mv), out = colors.slice();
      for (let i = 0; i < colors.length; i++) if (p[i] !== i) out[p[i]] = colors[i];
      return out;
    }
    isSolved(colors) {
      const f = [-1, -1, -1, -1, -1, -1];
      for (let i = 0; i < colors.length; i++) {
        const s = this.slots[i].face;
        if (f[s] < 0) f[s] = colors[i]; else if (f[s] !== colors[i]) return false;
      }
      return true;
    }
  }

  // ---------- Circle layout: each sticker sits where two slice-circles cross

  function intersect(c1, r1, c2, r2) {
    const dx = c2[0] - c1[0], dy = c2[1] - c1[1], d = Math.hypot(dx, dy);
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
    const mx = c1[0] + (a * dx) / d, my = c1[1] + (a * dy) / d;
    return [[mx - (h * dy) / d, my + (h * dx) / d], [mx + (h * dy) / d, my - (h * dx) / d]];
  }
  const side = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) > 0;
  function angleDelta(p, q, c) {
    let d = Math.atan2(q[1] - c[1], q[0] - c[0]) - Math.atan2(p[1] - c[1], p[0] - c[0]);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d <= -Math.PI) d += 2 * Math.PI;
    return d;
  }

  class Layout {
    constructor(geo) {
      this.geo = geo;
      const gap = SPREAD / (geo.n - 1);
      this.dot = Math.min(0.15, gap * 0.36);
      this.tol = Math.min(0.3, gap * 0.5);
      const sums = [...Array(6)].map(() => [0, 0, 0]);
      this.points = geo.slots.map((s) => {
        const a = s.axis, [b, c] = [0, 1, 2].filter((k) => k !== a);
        const [p1, p2] = intersect(CENTERS[b], this.radius(b, s.pos[b]), CENTERS[c], this.radius(c, s.pos[c]));
        const ref = side(CENTERS[b], CENTERS[c], CENTERS[a]);
        const p = (side(CENTERS[b], CENTERS[c], p1) === ref) === s.normal[a] > 0 ? p1 : p2;
        sums[s.face][0] += p[0]; sums[s.face][1] += p[1]; sums[s.face][2]++;
        return p;
      });
      this.petals = sums.map(([x, y, k]) => [x / k, y / k]);
      this.signCache = new Map();
    }
    radius(axis, layer) {
      const m = this.geo.n - 1;
      return R0 + ((m - layer) / (2 * m)) * SPREAD;
    }
    /** +1 when the moving dots travel toward increasing screen angle (clockwise, y down). */
    signs(mv) {
      const k = `${mv.axis},${mv.layer},${mv.dir}`;
      if (this.signCache.has(k)) return this.signCache.get(k);
      const p = this.geo.perm(mv);
      let ring = 0, face = 0;
      this.geo.slots.forEach((s, i) => {
        if (p[i] === i) return;
        const isFace = s.axis === mv.axis;
        const d = angleDelta(this.points[i], this.points[p[i]], isFace ? this.petals[s.face] : CENTERS[mv.axis]);
        if (isFace) face += d > 0 ? 1 : -1; else ring += d > 0 ? 1 : -1;
      });
      const r = { ring: ring >= 0 ? 1 : -1, face: face >= 0 ? 1 : -1 };
      this.signCache.set(k, r);
      return r;
    }
    animated(i, mv, t) {
      const j = this.geo.perm(mv)[i];
      if (j === i) return this.points[i];
      const s = this.geo.slots[i], isFace = s.axis === mv.axis;
      const c = isFace ? this.petals[s.face] : CENTERS[mv.axis];
      const sign = isFace ? this.signs(mv).face : this.signs(mv).ring;
      const p0 = this.points[i], p1 = this.points[j];
      const a0 = Math.atan2(p0[1] - c[1], p0[0] - c[0]);
      let d = angleDelta(p0, p1, c);
      if (sign > 0 && d < 0) d += 2 * Math.PI; else if (sign < 0 && d > 0) d -= 2 * Math.PI;
      const ra = Math.hypot(p0[0] - c[0], p0[1] - c[1]), rb = Math.hypot(p1[0] - c[0], p1[1] - c[1]);
      const r = ra + (rb - ra) * t, a = a0 + d * t;
      return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
    }
    nearest(p) {
      let best = null;
      for (let a = 0; a < 3; a++) {
        const dist = Math.hypot(p[0] - CENTERS[a][0], p[1] - CENTERS[a][1]);
        for (const v of this.geo.layers) {
          const off = Math.abs(dist - this.radius(a, v));
          if (off < this.tol && (!best || off < best.off)) best = { off, axis: a, layer: v };
        }
      }
      return best;
    }
    /** Circle under the drag start whose tangent best matches the drag direction. */
    moveAt(p, d) {
      const dl = Math.hypot(d[0], d[1]);
      let best = null;
      for (let a = 0; a < 3; a++) {
        const rx = p[0] - CENTERS[a][0], ry = p[1] - CENTERS[a][1], dist = Math.hypot(rx, ry);
        for (const v of this.geo.layers) {
          const off = Math.abs(dist - this.radius(a, v));
          if (off >= this.tol * 1.3) continue;
          const cross = (rx * d[1] - ry * d[0]) / (dist * dl);
          const score = Math.abs(cross) - (off / this.tol) * 0.35;
          if (!best || score > best.score) {
            const plus = this.signs({ axis: a, layer: v, dir: 1 }).ring;
            best = { score, mv: { axis: a, layer: v, dir: cross > 0 === plus > 0 ? 1 : -1 } };
          }
        }
      }
      return best && best.mv;
    }
    tapAt(p) {
      const b = this.nearest(p);
      if (!b) return null;
      const plus = this.signs({ axis: b.axis, layer: b.layer, dir: 1 }).ring;
      return { axis: b.axis, layer: b.layer, dir: plus > 0 ? 1 : -1 };
    }
  }

  // ---------- Game state shared by both views

  const game = {
    setSize(n) {
      this.geo = new Geometry(n);
      this.layout = new Layout(this.geo);
      this.colors = this.geo.solved.slice();
      this.display = this.colors.slice();
      this.queue = [];
      this.anim = null;
      this.history = [];
      this.phase = "idle"; // idle · scrambling · ready · solving · solved · rewinding
      this.moves = 0;
      this.startedAt = 0;
      this.elapsed = 0;
      this.lastMove = "";
    },
    enqueue(mv, dur) {
      this.colors = this.geo.apply(mv, this.colors);
      this.queue.push({ mv, dur });
    },
    turn(mv) {
      if (this.phase === "scrambling" || this.phase === "rewinding") return;
      if (this.phase === "ready") { this.phase = "solving"; this.startedAt = now(); }
      if (this.phase === "solved") this.phase = "idle";
      this.history.push(mv);
      this.enqueue(mv, this.queue.length > 1 ? 0.1 : 0.2);
      this.moves++;
      this.lastMove = notation(mv, this.geo.n);
      if (this.phase === "solving" && this.geo.isSolved(this.colors)) {
        this.elapsed = (now() - this.startedAt) / 1000;
        this.phase = "solved";
        ui.celebrate();
      }
    },
    scramble(length) {
      const n = this.geo.n;
      this.setSize(n);
      const usable = n % 2 ? this.geo.layers.filter((v) => v !== 0) : this.geo.layers;
      let moves, colors;
      do {
        moves = []; colors = this.geo.solved;
        let last = -1;
        while (moves.length < length) {
          const axis = Math.floor(Math.random() * 3);
          if (axis === last) continue;
          last = axis;
          const mv = { axis, layer: usable[Math.floor(Math.random() * usable.length)], dir: Math.random() < 0.5 ? 1 : -1 };
          moves.push(mv);
          colors = this.geo.apply(mv, colors);
        }
      } while (this.geo.isSolved(colors));
      const d = Math.max(0.05, Math.min(0.14, 1.8 / moves.length));
      for (const mv of moves) { this.history.push(mv); this.enqueue(mv, d); }
      this.phase = "scrambling";
    },
    rewind() {
      if (!this.history.length || this.phase === "scrambling" || this.phase === "rewinding") return;
      const seq = this.history.reverse().map((m) => ({ ...m, dir: -m.dir }));
      this.history = [];
      const d = Math.max(0.07, Math.min(0.22, 5 / seq.length));
      for (const mv of seq) this.enqueue(mv, d);
      this.phase = "rewinding";
    },
    tick(t) {
      if (this.anim && t - this.anim.start >= this.anim.dur * 1000) {
        this.display = this.geo.apply(this.anim.mv, this.display);
        this.anim = null;
      }
      if (!this.anim && this.queue.length) {
        const q = this.queue.shift();
        this.anim = { mv: q.mv, start: t, dur: q.dur };
      }
      if (!this.anim && !this.queue.length) {
        if (this.phase === "scrambling") this.phase = "ready";
        if (this.phase === "rewinding") this.phase = "idle";
      }
      if (this.phase === "solving") this.elapsed = (t - this.startedAt) / 1000;
    },
    progress(t) { return this.anim ? ease((t - this.anim.start) / (this.anim.dur * 1000)) : 0; },
    busy() { return this.anim || this.queue.length; },
  };

  function notation(mv, n) {
    const m = n - 1, v = mv.layer;
    if (v === 0) return ["M", "E", "S"][mv.axis] + (mv.dir === (mv.axis === 2 ? -1 : 1) ? "" : "'");
    const plus = v > 0, face = [["R", "L"], ["U", "D"], ["F", "B"]][mv.axis][plus ? 0 : 1];
    const depth = (m - Math.abs(v)) / 2 + 1;
    return (depth > 1 ? depth : "") + face + (mv.dir === (plus ? -1 : 1) ? "" : "'");
  }
  const fmt = (s) => {
    const cs = Math.floor(s * 100);
    return `${Math.floor(cs / 6000)}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
  };

  // ---------- Canvas helpers

  function setupCanvas(canvas) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: r.width, h: r.height };
  }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.round(Math.min(255, v * k));
    return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
  }
  function pointer(e, el) {
    const r = el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  function inPoly(p, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // ---------- 3D cube view (perspective canvas, painter's algorithm)

  const cube = {
    canvas: root.querySelector("#pg-cube"),
    yaw: -0.62, pitch: 0.52, spin: !reducedMotion, hits: [], drag: null, confetti: [],
    view([x, y, z]) {
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
    },
    draw(t) {
      const { ctx, w, h } = setupCanvas(this.canvas);
      ctx.clearRect(0, 0, w, h);
      const g = game.geo, n = g.n, S = Math.min(w, h);
      const D = n * 3.9, f = S / 2 / Math.tan((15 * Math.PI) / 180), cx = w / 2, cy = h / 2;
      const project = ([x, y, z]) => [cx + (f * x) / (D - z), cy - (f * y) / (D - z)];
      const light = [-0.35, 0.75, 0.56];
      const a = game.anim, angle = a ? a.mv.dir * game.progress(t) * (Math.PI / 2) : 0;
      const polys = [];
      for (const c of g.cubies) {
        const center = c.pos.map((v) => v / 2);
        const turning = a && c.pos[a.mv.axis] === a.mv.layer;
        const place = (p) => this.view(turning ? rotateC(p, a.mv.axis, angle) : p);
        for (let ax = 0; ax < 3; ax++) for (const sgn of [1, -1]) {
          const normal = [0, 0, 0]; normal[ax] = sgn;
          const nv = this.view(turning ? rotateC(normal, a.mv.axis, angle) : normal);
          const fc = center.slice(); fc[ax] += sgn * 0.48;
          const fcv = place(fc);
          // Back-face cull against the camera at (0, 0, D).
          if (nv[0] * -fcv[0] + nv[1] * -fcv[1] + nv[2] * (D - fcv[2]) <= 0) continue;
          const [u, v] = [0, 1, 2].filter((k) => k !== ax);
          const corners = (half) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => {
            const p = fc.slice(); p[u] += su * half; p[v] += sv * half;
            return project(place(p));
          });
          const depth = fcv[0] * fcv[0] + fcv[1] * fcv[1] + (D - fcv[2]) * (D - fcv[2]);
          const lit = 0.6 + 0.4 * Math.max(0, nv[0] * light[0] + nv[1] * light[1] + nv[2] * light[2]);
          polys.push({ depth, pts: corners(0.48), fill: shade("#14171f", lit), round: 0.12 });
          if (Math.abs(c.pos[ax]) === n - 1 && Math.sign(c.pos[ax]) === sgn) {
            const slot = c.stickers.find((i) => g.slots[i].axis === ax);
            polys.push({ depth: depth - 1e-6, pts: corners(0.42), fill: shade(STICKER[game.display[slot]], lit), round: 0.2, slot });
          }
        }
      }
      polys.sort((p, q) => q.depth - p.depth);
      this.hits = [];
      for (const p of polys) {
        roundedPoly(ctx, p.pts, p.round);
        ctx.fillStyle = p.fill;
        ctx.fill();
        if (p.slot !== undefined) this.hits.push(p);
      }
      this.drawConfetti(ctx, w, h, t);
    },
    /** Sticker under the pointer; a touch in the gap between stickers picks the nearest one, like the app. */
    stickerAt(p) {
      for (let i = this.hits.length - 1; i >= 0; i--) if (inPoly(p, this.hits[i].pts)) return this.hits[i].slot;
      let best = null;
      for (const h of this.hits) {
        const cx = h.pts.reduce((a, q) => a + q[0], 0) / 4, cy = h.pts.reduce((a, q) => a + q[1], 0) / 4;
        const size = Math.max(...h.pts.map((q, i) => Math.hypot(q[0] - h.pts[(i + 1) % 4][0], q[1] - h.pts[(i + 1) % 4][1])));
        const d = Math.hypot(p[0] - cx, p[1] - cy);
        if (d < size * 0.85 && (!best || d < best.d)) best = { d, slot: h.slot };
      }
      return best ? best.slot : null;
    },
    /** Which layer turn does a drag on this sticker mean? Compare each candidate's on-screen motion. */
    moveFor(slot, d) {
      const s = game.geo.slots[slot];
      const c = s.pos.map((v, k) => v / 2 + s.normal[k] * 0.5);
      const dl = Math.hypot(d[0], d[1]);
      let best = null;
      for (let ax = 0; ax < 3; ax++) {
        if (s.normal[ax] !== 0) continue;
        const e = [0, 0, 0]; e[ax] = 1;
        const vel = [e[1] * c[2] - e[2] * c[1], e[2] * c[0] - e[0] * c[2], e[0] * c[1] - e[1] * c[0]];
        const vv = this.view(vel), sl = Math.hypot(vv[0], vv[1]);
        if (sl < 1e-6) continue;
        const score = (vv[0] * d[0] - vv[1] * d[1]) / (sl * dl);
        if (!best || Math.abs(score) > Math.abs(best.score)) best = { score, mv: { axis: ax, layer: s.pos[ax], dir: score > 0 ? 1 : -1 } };
      }
      return best && best.mv;
    },
    burst() {
      if (reducedMotion) return;
      const { width, height } = this.canvas.getBoundingClientRect();
      this.confetti = Array.from({ length: 90 }, () => ({
        x: width / 2, y: height / 2, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 9 - 3,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4, c: STICKER[Math.floor(Math.random() * 6)], born: now(),
      }));
    },
    drawConfetti(ctx, w, h, t) {
      if (!this.confetti.length) return;
      this.confetti = this.confetti.filter((p) => t - p.born < 2600 && p.y < h + 20);
      for (const p of this.confetti) {
        p.vy += 0.25; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-4, -6, 8, 12);
        ctx.restore();
      }
    },
  };

  function roundedPoly(ctx, pts, r) {
    const n = pts.length, lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = pts[i], prev = pts[(i + n - 1) % n], next = pts[(i + 1) % n];
      const a = lerp(p, prev, r), b = lerp(p, next, r);
      if (i === 0) ctx.moveTo(a[0], a[1]); else ctx.lineTo(a[0], a[1]);
      ctx.quadraticCurveTo(p[0], p[1], b[0], b[1]);
    }
    ctx.closePath();
  }

  // ---------- Circle graph view

  const graph = {
    canvas: root.querySelector("#pg-graph"),
    hover: null, drag: null,
    transform() {
      const r = this.canvas.getBoundingClientRect();
      const s = Math.min(r.width / BOUNDS.w, r.height / BOUNDS.h);
      return { s, ox: r.width / 2 - (BOUNDS.x + BOUNDS.w / 2) * s, oy: r.height / 2 - (BOUNDS.y + BOUNDS.h / 2) * s };
    },
    toUnit(p) { const { s, ox, oy } = this.transform(); return [(p[0] - ox) / s, (p[1] - oy) / s]; },
    draw(t) {
      const { ctx, w, h } = setupCanvas(this.canvas);
      ctx.clearRect(0, 0, w, h);
      const L = game.layout, g = game.geo, { s, ox, oy } = this.transform();
      const sp = (p) => [ox + p[0] * s, oy + p[1] * s];
      const a = game.anim, k = game.progress(t);
      for (let ax = 0; ax < 3; ax++) {
        const c = sp(CENTERS[ax]);
        for (const v of g.layers) {
          const active = a && a.mv.axis === ax && a.mv.layer === v;
          const hover = this.hover && this.hover.axis === ax && this.hover.layer === v;
          ctx.beginPath();
          ctx.arc(c[0], c[1], L.radius(ax, v) * s, 0, Math.PI * 2);
          ctx.strokeStyle = FAMILY[ax];
          if (active || hover) {
            ctx.globalAlpha = active ? 0.95 : 0.6;
            ctx.lineWidth = 2.2;
            ctx.shadowColor = FAMILY[ax];
            ctx.shadowBlur = 10;
          } else {
            ctx.globalAlpha = 0.28;
            ctx.lineWidth = 1;
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        }
      }
      ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ["U", "D", "F", "B", "R", "L"].forEach((name, f) => {
        const pc = L.petals[f], dx = pc[0], dy = pc[1] - 0.25, d = Math.max(0.001, Math.hypot(dx, dy));
        const q = sp([pc[0] + (dx / d) * 0.62, pc[1] + (dy / d) * 0.62]);
        ctx.fillText(name, q[0], q[1]);
      });
      const dr = L.dot * s;
      g.slots.forEach((slot, i) => {
        const p = sp(a && slot.pos[a.mv.axis] === a.mv.layer ? L.animated(i, a.mv, k) : L.points[i]);
        ctx.beginPath(); ctx.arc(p[0], p[1], dr + 1.2, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fill();
        ctx.beginPath(); ctx.arc(p[0], p[1], dr, 0, Math.PI * 2); ctx.fillStyle = STICKER[game.display[i]]; ctx.fill();
        ctx.beginPath(); ctx.ellipse(p[0] - dr * 0.15, p[1] - dr * 0.47, dr * 0.4, dr * 0.27, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.28)"; ctx.fill();
      });
    },
  };

  // ---------- Input

  let interacted = false;
  function wake() {
    if (interacted) return;
    interacted = true;
    cube.spin = false;
    ui.update();
  }

  cube.canvas.addEventListener("pointerdown", (e) => {
    wake();
    const p = pointer(e, cube.canvas);
    cube.drag = { start: p, last: p, slot: cube.stickerAt(p), done: false };
    cube.canvas.setPointerCapture(e.pointerId);
  });
  cube.canvas.addEventListener("pointermove", (e) => {
    const d = cube.drag;
    if (!d) return;
    const p = pointer(e, cube.canvas);
    if (d.slot !== null) {
      if (!d.done && Math.hypot(p[0] - d.start[0], p[1] - d.start[1]) > 8) {
        d.done = true;
        const mv = cube.moveFor(d.slot, [p[0] - d.start[0], p[1] - d.start[1]]);
        if (mv) game.turn(mv);
      }
    } else {
      cube.yaw += (p[0] - d.last[0]) * 0.01;
      cube.pitch = Math.max(-1.35, Math.min(1.35, cube.pitch + (p[1] - d.last[1]) * 0.01));
      d.last = p;
    }
  });
  const endCubeDrag = () => { cube.drag = null; };
  cube.canvas.addEventListener("pointerup", endCubeDrag);
  cube.canvas.addEventListener("pointercancel", endCubeDrag);

  graph.canvas.addEventListener("pointerdown", (e) => {
    wake();
    const p = pointer(e, graph.canvas);
    graph.drag = { start: p, done: false };
    graph.canvas.setPointerCapture(e.pointerId);
  });
  graph.canvas.addEventListener("pointermove", (e) => {
    const p = pointer(e, graph.canvas);
    const d = graph.drag;
    if (!d) {
      graph.hover = game.layout.nearest(graph.toUnit(p));
      graph.canvas.style.cursor = graph.hover ? "pointer" : "default";
      return;
    }
    if (!d.done && Math.hypot(p[0] - d.start[0], p[1] - d.start[1]) > 10) {
      d.done = true;
      const mv = game.layout.moveAt(graph.toUnit(d.start), [p[0] - d.start[0], p[1] - d.start[1]]);
      if (mv) game.turn(mv);
    }
  });
  graph.canvas.addEventListener("pointerup", (e) => {
    const d = graph.drag;
    graph.drag = null;
    if (d && !d.done) {
      const mv = game.layout.tapAt(graph.toUnit(pointer(e, graph.canvas)));
      if (mv) game.turn(mv);
    }
  });
  graph.canvas.addEventListener("pointercancel", () => { graph.drag = null; });
  graph.canvas.addEventListener("pointerleave", () => { graph.hover = null; });

  // Keyboard: U D L R F B turn faces (Shift = counter-clockwise), arrows rotate the view.
  root.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.tagName === "SELECT") return;
    const m = game.geo.n - 1;
    const faces = { R: [0, m, -1], L: [0, -m, 1], U: [1, m, -1], D: [1, -m, 1], F: [2, m, -1], B: [2, -m, 1] };
    const f = faces[e.key.toUpperCase()];
    if (f) {
      wake();
      e.preventDefault();
      game.turn({ axis: f[0], layer: f[1], dir: e.shiftKey ? -f[2] : f[2] });
      return;
    }
    const arrows = { ArrowLeft: [-0.15, 0], ArrowRight: [0.15, 0], ArrowUp: [0, -0.15], ArrowDown: [0, 0.15] };
    if (arrows[e.key]) {
      wake();
      e.preventDefault();
      cube.yaw += arrows[e.key][0];
      cube.pitch = Math.max(-1.35, Math.min(1.35, cube.pitch + arrows[e.key][1]));
    }
  });

  // ---------- Controls + status

  const $ = (sel) => root.querySelector(sel);
  const ui = {
    status: $("#pg-status"), time: $("#pg-time"), size: 3, difficulty: "easy",
    update() {
      const p = game.phase;
      this.time.textContent = fmt(game.elapsed);
      this.time.classList.toggle("live", p === "solving");
      let msg;
      if (p === "scrambling") msg = "Scrambling…";
      else if (p === "ready") msg = "Your move. The clock starts on your first twist.";
      else if (p === "solving") msg = `Moves ${game.moves}${game.lastMove ? " · " + game.lastMove : ""}`;
      else if (p === "solved") msg = `Solved in ${fmt(game.elapsed)} with ${game.moves} ${game.moves === 1 ? "move" : "moves"}!`;
      else if (p === "rewinding") msg = "Rewinding every twist…";
      else if (interacted && game.moves) msg = `Free play · ${game.moves} ${game.moves === 1 ? "move" : "moves"} · ${game.lastMove}. Scramble to race the clock.`;
      else msg = interacted ? "Drag a sticker or a circle. Hit Scramble to race the clock." : "Try it: drag a sticker or a circle.";
      if (this.status.textContent !== msg) this.status.textContent = msg;
      root.classList.toggle("pg-solved", p === "solved");
    },
    celebrate() {
      cube.burst();
      const cta = $("#pg-cta");
      if (cta) cta.hidden = false;
    },
  };

  root.querySelectorAll("[data-size]").forEach((b) => b.addEventListener("click", () => {
    wake();
    ui.size = Number(b.dataset.size);
    root.querySelectorAll("[data-size]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    game.setSize(ui.size);
  }));
  $("#pg-difficulty").addEventListener("change", (e) => { ui.difficulty = e.target.value; });
  $("#pg-scramble").addEventListener("click", () => {
    wake();
    game.scramble(SCRAMBLE[ui.difficulty](game.geo.n));
  });
  $("#pg-solve").addEventListener("click", () => { wake(); game.rewind(); });

  // ---------- Loop (paused when off-screen or hidden)

  game.setSize(3);
  if (location.hash === "#debug") window.__rubiq = game;
  let visible = true, nextIdle = now() + 1200, raf = 0;
  function frame(t) {
    raf = 0;
    if (!interacted && !reducedMotion && !game.busy() && t > nextIdle) {
      const g = game.geo, mv = { axis: Math.floor(Math.random() * 3), layer: g.layers[Math.floor(Math.random() * g.layers.length)], dir: Math.random() < 0.5 ? 1 : -1 };
      game.history.push(mv);
      game.enqueue(mv, 0.5);
      nextIdle = t + 1300;
    }
    if (cube.spin) cube.yaw += 0.003;
    game.tick(t);
    cube.draw(t);
    graph.draw(t);
    ui.update();
    if (visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  const start = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); };
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; start(); }).observe(root);
  document.addEventListener("visibilitychange", start);
  window.addEventListener("resize", start);
  root.classList.add("pg-ready");
  start();
})();
