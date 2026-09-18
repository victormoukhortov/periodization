/**
 * Headless regression tests for hex.html.
 *
 * Same harness as the other three: extract the <script> body, stub the browser
 * APIs it touches (here mostly a <canvas> that records nothing), and drive it
 * with the synthetic click and pointer events the real UI fires.
 *
 *   node test-hex.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "hex.html"), "utf8");
const js = html.match(/<script>\n([\s\S]*)\n<\/script>/)[1];

const STUB = `
var __handlers = {};
var localStorage = __store;
function mkCtx(){
  var noop = function(){};
  return { fillRect:noop, clearRect:noop, beginPath:noop, moveTo:noop, lineTo:noop, closePath:noop,
    fill:noop, stroke:noop, arc:noop, save:noop, restore:noop, translate:noop, scale:noop,
    setTransform:noop, drawImage:noop, fillText:noop, rotate:noop, fillStyle:"", strokeStyle:"", lineWidth:1, font:"", textAlign:"", textBaseline:"" };
}
function mkEl(){
  return {innerHTML:"", style:{}, dataset:{}, width:0, height:0, clientWidth:400, clientHeight:600,
    appendChild:function(){}, getContext:function(){ return mkCtx(); },
    getBoundingClientRect:function(){ return {left:0, top:0, width:400, height:600}; },
    setPointerCapture:function(){}, releasePointerCapture:function(){},
    addEventListener:function(t,f){ __handlers["el:"+t] = f; }, focus:function(){}, select:function(){},
    toDataURL:function(){ return "data:image/png;base64,"; }, click:function(){} };
}
var __els = {};
var document = {
  visibilityState: "visible",
  getElementById: function(id){ return __els[id] || (__els[id] = mkEl()); },
  querySelector: function(){ return null; },
  querySelectorAll: function(sel){
    var attr = sel.indexOf('data-pv') >= 0 ? 'data-pv' : (sel.indexOf('data-shape') >= 0 ? 'data-shape' : null);
    if (!attr) return [];
    var m = (__els.app.innerHTML.match(new RegExp(attr + '="[^"]+"', 'g')) || []);
    return m.map(function(x){ var el = mkEl(); el.dataset[attr === 'data-pv' ? 'pv' : 'shape'] = x.slice(attr.length + 2, -1); el.width = 320; el.height = 380; return el; });
  },
  addEventListener: function(t,f){ __handlers[t] = f; },
  createElement: function(){ return mkEl(); },
  body: { appendChild:function(){}, removeChild:function(){} },
  head: { appendChild: function(){} }
};
var window = { scrollY:0, innerWidth:400, innerHeight:700, devicePixelRatio:2, scrollTo:function(){}, addEventListener:function(){} };
var location = { protocol:"file:" };
var navigator = {};
var URL = { createObjectURL: function(){ return "blob:stub"; }, revokeObjectURL: function(){} };
function Blob(){}
var requestAnimationFrame = function(f){ f(); return 1; };
var setTimeout = function(f){ f(); return 1; };
var clearTimeout = function(){};
`;

const DRIVER = `
function click(attrs){
  var el = {dataset: attrs};
  __handlers.click({ target: { closest: function(){ return el; } } });
}
function typeIn(id, val){
  __handlers.input({ target: {dataset:{f:id}, value:String(val)} });
}
`;

const mkStore = () => ({ _d:{}, getItem:function(k){return this._d[k]||null;}, setItem:function(k,v){this._d[k]=v;} });
const suite = (store) => new Function("__store", STUB + js + DRIVER + `
return { click:click, typeIn:typeIn, H:__handlers, els:__els, S:{
  FLOOR:FLOOR, SEGMENTS:SEGMENTS, fixed:fixed, floor:floor, hexCenter:hexCenter, hexAt:hexAt, key:key,
  toggleCell:toggleCell, paintCell:paintCell, undo:undo, counts:counts, serialize:serialize,
  deserialize:deserialize, blankLayout:blankLayout, state:function(){return state;}, render:render,
  saveState:saveState, loadState:loadState, viewFor:viewFor, tab:function(){return tab;},
  fitView:fitView, KEY:KEY, segmentCells:segmentCells, GUIDES:GUIDES, cacheRegion:cacheRegion,
  cacheCovers:cacheCovers, BOUNDS:BOUNDS, guides:function(){return guides;}, PRESETS:PRESETS,
  ROOMS:ROOMS, roomOf:roomOf, mirrorCells:mirrorCells, toggleMirror:toggleMirror, paintMirror:paintMirror,
  mirror:function(){return mirror;}, SHAPES:SHAPES, toAxial:toAxial, fromAxial:fromAxial, rotAxial:rotAxial,
  shapeCells:shapeCells, stampToggle:stampToggle, stampPaint:stampPaint, shapeFromCells:shapeFromCells,
  shapeById:shapeById, shapeId:function(){return shapeId;}, rot:function(){return rot;}, capture:function(){return capture;},
  dirtyN:function(){return dirtyN;}, hover:function(){return hover;}, DIRTY_MAX:DIRTY_MAX
}};
`)(store || mkStore());

let passed = 0, failed = 0;
function check(name, fn){
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { failed++; console.log("FAIL  " + name + "\n      " + (e && e.stack ? e.stack.split("\n").slice(0,3).join("\n      ") : e)); }
}
function eq(a, b, msg){ if (a !== b) throw new Error((msg || "") + " expected " + JSON.stringify(b) + " got " + JSON.stringify(a)); }
function ok(v, msg){ if (!v) throw new Error(msg || "expected truthy"); }

console.log("hex.html");

/* ---- the fixed border, counted against the photos ---------------------- */

const store = mkStore();
const app = suite(store);
const S = app.S;

const EXPECT = {
  "main-north": 30, "main-east": 35, "main-west": 35,
  "step-east": 10, "neck-east": 8, "threshold": 16, "neck-west": 8, "step-west": 6,
  "shower-north": 17, "shower-south": 17, "shower-west": 18, "shower-east": 18,
  "wc-north": 17, "wc-south": 17, "wc-east": 10, "wc-west": 10
};

check("every border segment has the dot count read off the photos", () => {
  const seen = {};
  S.SEGMENTS.forEach(seg => {
    seen[seg.id] = true;
    eq(S.segmentCells(seg).length, EXPECT[seg.id], seg.id);
    eq(seg.dots, EXPECT[seg.id], seg.id + " declared count");
  });
  Object.keys(EXPECT).forEach(id => ok(seen[id], "segment " + id + " missing"));
});

check("the main border closes: north row spans the same width as the stepped south side", () => {
  const cells = id => S.segmentCells(S.SEGMENTS.find(s => s.id === id));
  const north = cells("main-north");
  const xs = north.map(c => c[0]);
  eq(Math.min(...xs), 0); eq(Math.max(...xs), 58);
  const east = cells("step-east").map(c => c[0]), west = cells("step-west").map(c => c[0]);
  const thr = cells("threshold").map(c => c[0]);
  eq(Math.max(...east), 58); eq(Math.min(...east), Math.max(...thr));
  eq(Math.min(...west), 0); eq(Math.max(...west), Math.min(...thr));
});

check("the toilet room sits directly under the shower: same width, same east and west columns", () => {
  const cells = id => S.segmentCells(S.SEGMENTS.find(s => s.id === id));
  const sw = cells("shower-west"), se = cells("shower-east"), ww = cells("wc-west"), we = cells("wc-east");
  eq(sw[0][0], ww[0][0]); eq(se[0][0], we[0][0]);
  eq(se[0][0] - sw[0][0], 32);
  ok(ww[0][1] > sw[sw.length - 1][1], "toilet room starts south of the shower's last row");
  ok(!S.floor["-20,45"] && !S.floor["-20,47"], "the niche wall is not floor");
  ok(S.floor["-20,43"] && S.floor["-20,48"], "tile on both sides of it");
});

check("row-lines step two columns, column-lines step two rows, all on even rows", () => {
  S.SEGMENTS.forEach(seg => {
    const cells = S.segmentCells(seg);
    for (let i = 1; i < cells.length; i++){
      const d = [cells[i][0] - cells[i-1][0], cells[i][1] - cells[i-1][1]];
      ok((d[0] === 2 && d[1] === 0) || (d[0] === 0 && d[1] === 2), seg.id + " step " + d);
    }
    cells.forEach(c => eq(c[1] % 2, 0, seg.id + " odd row " + c));
  });
});

check("every fixed dot sits on the floor, and corners are shared not doubled", () => {
  let n = 0;
  S.SEGMENTS.forEach(seg => { n += S.segmentCells(seg).length; });
  const fixedN = Object.keys(S.fixed).length;
  ok(fixedN < n, "corners should merge");
  Object.keys(S.fixed).forEach(k => ok(S.floor[k], "fixed cell off floor " + k));
  /* 16 shared corners: four each on the main border, the door recess, the shower and the
     toilet room. */
  eq(fixedN, n - 16);
});

check("the floor is one connected region", () => {
  const keys = Object.keys(S.floor);
  const start = keys[0], seen = {}; seen[start] = true;
  const stack = [start];
  while (stack.length){
    const [c, r] = stack.pop().split(",").map(Number);
    const odd = ((r % 2) + 2) % 2;
    const nb = [[c-1,r],[c+1,r],[c-1+odd,r-1],[c+odd,r-1],[c-1+odd,r+1],[c+odd,r+1]];
    nb.forEach(([x,y]) => { const k = x + "," + y; if (S.floor[k] && !seen[k]){ seen[k] = true; stack.push(k); } });
  }
  eq(Object.keys(seen).length, keys.length);
});

check("centre guides: the main upright is the door's centre, the others bisect their rooms", () => {
  const by = room => S.GUIDES.filter(g => g.room === room);
  const main = by("main"), sh = by("shower"), wc = by("wc");
  eq(main.find(g => g.v != null).v, (10 + 40) / 2);
  ok(main.find(g => g.v != null).r1 >= 82, "runs through the threshold");
  eq(main.find(g => g.h != null).h, (0 + 68) / 2);
  eq(sh.find(g => g.v != null).v, (-41 + -9) / 2); eq(sh.find(g => g.h != null).h, (8 + 42) / 2);
  eq(wc.find(g => g.v != null).v, (-41 + -9) / 2); eq(wc.find(g => g.h != null).h, (50 + 68) / 2);
});

check("the bitmap cache covers the view, stays under the pixel cap, and is invalidated by a zoom", () => {
  const fit = S.fitView(400, 600);
  const q = S.cacheRegion(fit, 400, 600, 3);
  ok(S.cacheCovers(q, fit, 400, 600), "fit view covered");
  ok(q.x0 >= S.BOUNDS.minx && q.x1 <= S.BOUNDS.maxx, "clamped to the floor");
  const big = {scale: 90, tx: -2000, ty: -3000};
  const qb = S.cacheRegion(big, 1400, 1000, 3);
  ok((qb.x1 - qb.x0) * 90 * qb.dpr * (qb.y1 - qb.y0) * 90 * qb.dpr <= 12e6 + 1, "under the cap");
  ok(S.cacheCovers(qb, big, 1400, 1000), "zoomed view covered");
  ok(!S.cacheCovers(qb, {scale: 45, tx: -2000, ty: -3000}, 1400, 1000), "a different scale needs a rebuild");
  ok(!S.cacheCovers(qb, {scale: 90, tx: -5000, ty: -3000}, 1400, 1000), "leaving the region needs a rebuild");
  ok(S.cacheCovers(q, {scale: fit.scale, tx: fit.tx - 500, ty: fit.ty}, 400, 600), "the whole floor cached: a pan never rebuilds");
});

check("presets are paintable cells, symmetric about the door line and the cross line, narrow end to the door", () => {
  S.PRESETS.forEach(P => {
    const set = {}; P.cells.forEach(k => set[k] = 1);
    P.cells.forEach(k => {
      const [c, r] = k.split(",").map(Number);
      ok(S.floor[k] && !S.fixed[k], P.id + " " + k + " not paintable");
      const mx = (r % 2 === 0 ? 50 - c : 49 - c) + "," + r, my = c + "," + (68 - r);
      ok(set[mx], P.id + " no mirror of " + k + " about the door line");
      ok(set[my], P.id + " no mirror of " + k + " about the cross line");
    });
    const rows = P.cells.map(k => +k.split(",")[1]), cols = P.cells.map(k => +k.split(",")[0]);
    ok(Math.max(...rows) - Math.min(...rows) > 2 * (Math.max(...cols) - Math.min(...cols)), P.id + " should be elongated north-south");
    ok(set["25,34"] && set["24,33"] && set["26,34"], P.id + " rosette at the centre");
  });
  const before = S.state().layouts.length;
  app.click({a:"tab", t:"layouts"});
  ok(app.els.app.innerHTML.indexOf('data-pv="preset:wave-15"') >= 0, "preset preview rendered");
  app.click({a:"preset", id:"wave-20"});
  eq(S.tab(), "design");
  eq(S.state().draft.cells.length, S.PRESETS[1].cells.length);
  eq(S.state().layouts.length, before, "starting a preset does not save on its own");
});

check("mirror images: four in a quarter, two on a line, one at the centre, pairs across the odd-row door line", () => {
  const ks = cells => cells.map(c => c.join(",")).sort().join(" ");
  eq(ks(S.mirrorCells(30, 30)), ks([[30,30],[20,30],[30,38],[20,38]]));
  eq(ks(S.mirrorCells(25, 34)), "25,34");                       // the centre tile
  eq(ks(S.mirrorCells(25, 30)), ks([[25,30],[25,38]]));         // on the door line, even row
  eq(ks(S.mirrorCells(30, 34)), ks([[30,34],[20,34]]));         // on the cross row
  eq(ks(S.mirrorCells(25, 33)), ks([[25,33],[24,33],[25,35],[24,35]]));   // odd row: the line runs between 24 and 25
  eq(ks(S.mirrorCells(24, 33)), ks(S.mirrorCells(25, 33)));
  /* every image mirrors back to the same group, in every room */
  [[30,30],[25,33],[-20,20],[-30,21],[-20,55],[-24,59],[20,76],[10,-5]].forEach(([c, r]) => {
    const g = ks(S.mirrorCells(c, r));
    S.mirrorCells(c, r).forEach(q => eq(ks(S.mirrorCells(q[0], q[1])), g, "closure of " + c + "," + r));
    S.mirrorCells(c, r).forEach(q => {
      const x = S.hexCenter(q[0], q[1]).x, m = S.roomOf(c, r);
      ok(Math.abs(Math.abs(x - m.v) - Math.abs(S.hexCenter(c, r).x - m.v)) < 1e-9, "same distance from the upright");
      eq(Math.abs(q[1] - m.h), Math.abs(r - m.h), "same distance from the cross row");
    });
  });
  eq(S.roomOf(-20, 20).id, "shower"); eq(S.roomOf(-20, 55).id, "wc"); eq(S.roomOf(20, 76).id, "main");
});

check("mirrored toggle sets the whole group in one undo step, and a self-image does not flip back", () => {
  let L = S.blankLayout();
  L = S.toggleMirror(L, 30, 30);
  eq(L.cells.length, 4); eq(L.past.length, 1);
  L = S.toggleMirror(L, 20, 38);                       // any image toggles the group off
  eq(L.cells.length, 0); eq(L.past.length, 2);
  L = S.toggleMirror(L, 25, 34);
  eq(L.cells.join(), "25,34");
  L = S.toggleMirror(L, 25, 30);
  eq(L.cells.length, 3); eq(L.past.length, 4);
  L = S.undo(L); eq(L.cells.join(), "25,34");
  /* a group whose images include a fixed dot or a wall paints what it can */
  L = S.toggleMirror(S.blankLayout(), 20, 76);         // door neck: its cross-line image is up in the bay
  ok(L.cells.indexOf("20,76") >= 0 && L.cells.indexOf("30,76") >= 0, "the neck pair");
  ok(L.cells.length >= 2 && L.cells.length <= 4);
  /* brush: a continued stroke adds no undo steps */
  let B = S.blankLayout();
  B = S.paintMirror(B, 30, 30, true, false); B = S.paintMirror(B, 31, 30, true, true); B = S.paintMirror(B, 31, 30, true, true);
  eq(B.cells.length, 8); eq(B.past.length, 1);
  B = S.paintMirror(B, 31, 30, false, false);
  eq(B.cells.length, 4); eq(B.past.length, 2);
});

check("shapes: axial offsets stamp the same shape on odd and even rows, and six turns come back", () => {
  const ks = cells => cells.map(c => c.join(",")).sort().join(" ");
  [[10,10],[10,11],[-20,21],[3,-4]].forEach(([c, r]) => {
    const a = S.toAxial(c, r), b = S.fromAxial(a[0], a[1]);
    eq(b[0], c); eq(b[1], r);
  });
  const ros = S.shapeById("rosette");
  const even = S.shapeCells(ros, 20, 20, 0), odd = S.shapeCells(ros, 20, 21, 0);
  eq(even.length, 7); eq(odd.length, 7);
  /* every cell of a rosette is the centre or one of its six neighbours, whichever row it sits on */
  [[20,20,even],[20,21,odd]].forEach(([c, r, cells]) => {
    const o = ((r % 2) + 2) % 2;
    const nb = [[c-1+o,r-1],[c+o,r-1],[c-1,r],[c+1,r],[c-1+o,r+1],[c+o,r+1],[c,r]].map(x => x.join(",")).sort().join(" ");
    eq(ks(cells), nb);
  });
  const rh = S.shapeById("rhombus");
  eq(ks(S.shapeCells(rh, 1, -4, 0)), ks([[1,-4],[2,-4],[1,-3],[2,-3]]));      // the guest rhombus, exactly
  for (let k = 0; k < 6; k++) ok(S.shapeCells(rh, 10, 10, k).length === 4);
  eq(ks(S.shapeCells(rh, 10, 10, 6)), ks(S.shapeCells(rh, 10, 10, 0)));
  ok(ks(S.shapeCells(rh, 10, 10, 1)) !== ks(S.shapeCells(rh, 10, 10, 0)), "a turn changes a rhombus");
  eq(ks(S.shapeCells(ros, 10, 10, 2)), ks(S.shapeCells(ros, 10, 10, 0)), "a rosette is the same at any turn");
  eq(ks(S.shapeCells(S.shapeById("stack"), 10, 10, 0)), ks([[10,10],[10,12]]));
  eq(ks(S.shapeCells(S.shapeById("stack"), 10, 11, 0)), ks([[10,11],[10,13]]));
  eq(ks(S.shapeCells(S.shapeById("chevron"), 25, 22, 0)), ks([[25,22],[24,21],[25,21]]));
});

check("stamps flip like a tap, paint like a brush, mirror when asked, and skip walls and fixed dots", () => {
  const ros = S.shapeById("rosette");
  let L = S.blankLayout();
  L = S.stampToggle(L, ros, 30, 30, 0, false);
  eq(L.cells.length, 7); eq(L.past.length, 1);
  L = S.stampToggle(L, ros, 30, 30, 0, false);
  eq(L.cells.length, 0); eq(L.past.length, 2);
  L = S.stampToggle(L, ros, 30, 30, 0, true);
  eq(L.cells.length, 28); eq(L.past.length, 3);
  L = S.stampToggle(L, ros, 25, 34, 0, true);           // on the centre: its own mirror, seven tiles once
  eq(L.cells.length, 35);
  const near = S.stampToggle(S.blankLayout(), ros, 1, 34, 0, false);   // beside the west border: the fixed dot at (0,34) is skipped
  eq(near.cells.length, 6);
  let B = S.blankLayout();
  B = S.stampPaint(B, ros, 30, 30, 0, true, false, false); B = S.stampPaint(B, ros, 31, 30, 0, true, true, false);
  ok(B.cells.length > 7 && B.cells.length <= 14); eq(B.past.length, 1);
  const custom = S.shapeFromCells([[10,10],[11,10],[12,10],[11,11]], "Tee", "u1");
  eq(custom.cells.length, 4);
  ok(custom.cells.some(d => d[0] === 0 && d[1] === 0), "the anchor is one of its own cells");
  const back = S.shapeCells(custom, 11, 10, 0).map(c => c.join(",")).sort().join(" ");
  eq(back, "10,10 11,10 11,11 12,10");
  eq(S.shapeCells(custom, 11, 11, 0).length, 4);
});

check("the palette: pick a brush, stamp it, rotate, make a shape from picked tiles, keep it across a reload, delete it", () => {
  const st2 = mkStore(), a = suite(st2);
  a.click({a:"tab", t:"design"}); a.click({a:"new"});
  ok(a.els.app.innerHTML.indexOf('data-shape="rosette"') >= 0, "chips rendered");
  a.click({a:"shape", id:"rhombus"}); eq(a.S.shapeId(), "rhombus");
  const st = a.S.state(), v = a.S.fitView(400, 600);
  const at = (c, r) => { const p = a.S.hexCenter(c, r); return { x: p.x * v.scale + v.tx, y: p.y * v.scale + v.ty }; };
  const ev = (t, x, y) => ({ type:t, pointerId:1, clientX:x, clientY:y, pointerType:"touch", preventDefault:function(){}, button:0 });
  const tap = (c, r) => { const p = at(c, r); a.H["el:pointerdown"](ev("pointerdown", p.x, p.y)); a.H["el:pointerup"](ev("pointerup", p.x, p.y)); };
  tap(30, 30);
  eq(st.draft.cells.length, 4, "a diamond stamped");
  a.click({a:"rotate"}); eq(a.S.rot(), 1);
  tap(40, 40); eq(st.draft.cells.length, 8);
  a.click({a:"undo"}); eq(st.draft.cells.length, 4);
  /* capture three tiles as a new shape */
  a.click({a:"capstart"}); ok(a.S.capture(), "capturing");
  tap(20, 50); tap(21, 50); tap(22, 50); tap(22, 50); tap(22, 50);
  eq(Object.keys(a.S.capture().cells).length, 3);
  eq(st.draft.cells.length, 4, "capturing does not paint");
  a.typeIn("shapename", "Bar");
  a.click({a:"capdone"});
  eq(st.shapes.length, 1); eq(st.shapes[0].name, "Bar"); eq(st.shapes[0].cells.length, 3);
  eq(a.S.shapeId(), st.shapes[0].id);
  tap(30, 50); eq(st.draft.cells.length, 7, "the new brush stamps three");
  const again = suite(st2);
  eq(again.S.state().shapes.length, 1); eq(again.S.state().shapes[0].name, "Bar");
  a.click({a:"shapedel"});
  eq(st.shapes.length, 0); eq(a.S.shapeId(), "dot");
  a.click({a:"capstart"}); a.click({a:"capcancel"}); ok(!a.S.capture());
  /* a mouse moving over the floor with nothing down ghosts the brush; a touch does not; a press clears it */
  const mv = (c, r, type) => { const p = at(c, r); a.H["el:pointermove"]({ type:"pointermove", pointerId:9, clientX:p.x, clientY:p.y, pointerType:type, preventDefault:function(){} }); };
  mv(30, 30, "mouse"); ok(a.S.hover() && a.S.hover()[0] === 30 && a.S.hover()[1] === 30, "hover set");
  mv(31, 30, "touch"); eq(a.S.hover()[0], 30, "touch does not move the ghost");
  a.H["el:pointerleave"]({}); ok(!a.S.hover(), "leave clears");
  mv(32, 32, "pen"); ok(a.S.hover(), "pen hovers");
  tap(32, 32); ok(!a.S.hover(), "a press clears the ghost");
  /* a long flower stroke never lets the overlay grow past its cap */
  a.click({a:"shape", id:"rosette"}); a.click({a:"brush"});
  const p0 = at(2, 2); a.H["el:pointerdown"](ev("pointerdown", p0.x, p0.y));
  let peak = 0;
  for (let c = 3; c < 56; c += 1) for (let r = 2; r < 66; r += 8){ const p = at(c, r); a.H["el:pointermove"](ev("pointermove", p.x, p.y)); peak = Math.max(peak, a.S.dirtyN()); }
  ok(peak <= a.S.DIRTY_MAX + 7 * 4, "overlay capped, peak " + peak);
  const pe = at(55, 2); a.H["el:pointerup"](ev("pointerup", pe.x, pe.y)); eq(a.S.dirtyN(), 0);
});

/* ---- hex maths --------------------------------------------------------- */

check("hexAt inverts hexCenter, including odd and negative rows", () => {
  [[0,0],[5,3],[-9,8],[-41,42],[58,68],[10,82],[-27,110],[13,-13],[3,-1]].forEach(([c,r]) => {
    const p = S.hexCenter(c, r);
    const h = S.hexAt(p.x, p.y);
    eq(h[0], c, "col of " + c + "," + r); eq(h[1], r, "row of " + c + "," + r);
    const q = S.hexAt(p.x + 0.4, p.y + 0.2);
    eq(q[0], c); eq(q[1], r);
  });
});

check("odd rows sit half a cell east", () => {
  eq(S.hexCenter(4, 3).x - S.hexCenter(4, 2).x, 0.5);
  eq(S.hexCenter(4, -1).x - S.hexCenter(4, 0).x, 0.5);
  ok(Math.abs(S.hexCenter(0, 2).y - 2 * 0.8660254) < 1e-9);
});

/* ---- the layout reducers ----------------------------------------------- */

check("a white floor tile toggles black and back; fixed and off-floor tiles never move", () => {
  let L = S.blankLayout();
  eq(L.cells.length, 0);
  L = S.toggleCell(L, 20, 20);
  eq(L.cells.indexOf("20,20") >= 0, true);
  L = S.toggleCell(L, 20, 20);
  eq(L.cells.indexOf("20,20"), -1);
  const before = L.cells.slice();
  L = S.toggleCell(L, 0, 0);          // fixed corner
  eq(L.cells.join("|"), before.join("|"));
  L = S.toggleCell(L, 200, 200);      // nowhere
  eq(L.cells.join("|"), before.join("|"));
  L = S.toggleCell(L, -20, 46);       // inside the niche wall
  eq(L.cells.join("|"), before.join("|"));
});

check("paint sets a colour and does not flip it back on a second pass", () => {
  let L = S.blankLayout();
  L = S.paintCell(L, 20, 20, true); L = S.paintCell(L, 20, 20, true);
  eq(L.cells.length, 1);
  L = S.paintCell(L, 20, 20, false); L = S.paintCell(L, 20, 20, false);
  eq(L.cells.length, 0);
  L = S.paintCell(L, 0, 0, false);    // cannot whiten a fixed dot
  eq(S.counts(L).black, S.counts(S.blankLayout()).black);
});

check("undo walks back one change at a time and stops at the beginning", () => {
  let L = S.blankLayout();
  L = S.toggleCell(L, 20, 20); L = S.toggleCell(L, 21, 20);
  eq(L.cells.length, 2);
  L = S.undo(L); eq(L.cells.length, 1); eq(L.cells[0], "20,20");
  L = S.undo(L); eq(L.cells.length, 0);
  L = S.undo(L); eq(L.cells.length, 0);
});

check("counts: black includes the fixed border, white is the rest of the floor", () => {
  const blank = S.counts(S.blankLayout());
  eq(blank.black, Object.keys(S.fixed).length);
  eq(blank.black + blank.white, Object.keys(S.floor).length);
  const one = S.counts(S.toggleCell(S.blankLayout(), 20, 20));
  eq(one.black, blank.black + 1); eq(one.white, blank.white - 1);
});

check("serialize round-trips and drops anything that is not a paintable floor tile", () => {
  let L = S.blankLayout(); L = S.toggleCell(L, 20, 20); L.name = "Test";
  const back = S.deserialize(JSON.parse(JSON.stringify(S.serialize(L))));
  eq(back.name, "Test"); eq(back.cells.join(), "20,20");
  const junk = S.deserialize({name:"J", cells:["20,20", "0,0", "999,999", "x", "-20,46"]});
  eq(junk.cells.join(), "20,20");
});

/* ---- storage and the screens ------------------------------------------ */

check("every tab renders without throwing", () => {
  ["design", "layouts", "plan"].forEach(t => {
    app.click({a:"tab", t});
    const html = app.els.app.innerHTML;
    ok(html.length > 100, t + " empty");
  });
});

check("save names a layout, save again overwrites, save-as makes a second one", () => {
  app.click({a:"tab", t:"design"});
  app.click({a:"new"});
  const st = S.state();
  st.draft = S.toggleCell(st.draft, 20, 20);
  app.typeIn("name", "Checker");
  app.click({a:"save"});
  eq(st.layouts.length, 1); eq(st.layouts[0].name, "Checker");
  eq(st.layouts[0].cells.join(), "20,20");
  st.draft = S.toggleCell(st.draft, 21, 20);
  app.click({a:"save"});
  eq(st.layouts.length, 1); eq(st.layouts[0].cells.length, 2);
  app.click({a:"saveas"});
  eq(st.layouts.length, 2);
  ok(st.layouts[1].id !== st.layouts[0].id);
  eq(st.draft.id, st.layouts[1].id);
});

check("layouts tab lists every saved layout with a preview canvas, and open loads it", () => {
  app.click({a:"tab", t:"layouts"});
  const html = app.els.app.innerHTML;
  eq((html.match(/<canvas/g) || []).length, 2 + S.PRESETS.length);
  ok(html.indexOf("Checker") >= 0);
  const st = S.state();
  app.click({a:"open", id: st.layouts[0].id});
  eq(S.tab(), "design");
  eq(st.draft.id, st.layouts[0].id);
  eq(st.draft.cells.length, 2);
});

check("rename, duplicate and delete", () => {
  const st = S.state();
  const id = st.layouts[0].id;
  app.click({a:"rename", id});
  app.typeIn("rename", "Chess");
  app.click({a:"renameok", id});
  eq(st.layouts[0].name, "Chess");
  app.click({a:"dup", id});
  eq(st.layouts.length, 3);
  ok(st.layouts[2].name.indexOf("Chess") >= 0);
  app.click({a:"del", id});      // asks first
  eq(st.layouts.length, 3);
  app.click({a:"delok", id});
  eq(st.layouts.length, 2);
  eq(st.layouts.some(l => l.id === id), false);
});

check("the open design survives a reload, saved or not", () => {
  const st = S.state();
  app.click({a:"new"});
  st.draft = S.toggleCell(st.draft, 30, 30);
  S.saveState();
  const again = suite(store);
  const d = again.S.state().draft;
  eq(d.cells.join(), "30,30");
  eq(again.S.state().layouts.length, 2);
});

check("blocked storage falls back to memory and never throws", () => {
  const hostile = { getItem:function(){ throw new Error("blocked"); }, setItem:function(){ throw new Error("blocked"); } };
  const app2 = suite(hostile);
  const st = app2.S.state();
  st.draft = app2.S.toggleCell(st.draft, 20, 20);
  app2.S.saveState();
  app2.click({a:"save"});
  eq(st.layouts.length, 1);
  eq(suite(hostile).S.state().layouts.length, 0);
});

check("tap toggles a tile, a drag pans, and brush mode paints along the drag", () => {
  const a = suite(mkStore());
  a.click({a:"tab", t:"design"});
  a.click({a:"new"});
  const st = a.S.state();
  const cv = a.els.floor;
  const v = a.S.fitView(400, 600);
  const p = a.S.hexCenter(20, 20);
  const px = { x: p.x * v.scale + v.tx, y: p.y * v.scale + v.ty };
  let py0; const ev = (t, x, y, id) => ({ type:t, pointerId:id||1, clientX:x, clientY:y, pointerType:"touch",
    preventDefault:function(){}, button:0 });
  a.H["el:pointerdown"](ev("pointerdown", px.x, px.y));
  a.H["el:pointerup"](ev("pointerup", px.x, px.y));
  eq(st.draft.cells.join(), "20,20", "tap");
  /* a drag from the same spot moves the view, not the tile */
  a.H["el:pointerdown"](ev("pointerdown", px.x, px.y));
  a.H["el:pointermove"](ev("pointermove", px.x + 40, px.y + 30));
  a.H["el:pointerup"](ev("pointerup", px.x + 40, px.y + 30));
  eq(st.draft.cells.join(), "20,20", "drag should not toggle");
  a.click({a:"fit"});
  a.click({a:"brush"});
  const q = a.S.hexCenter(22, 20), qx = { x: q.x * v.scale + v.tx, y: q.y * v.scale + v.ty };
  a.H["el:pointerdown"](ev("pointerdown", px.x, px.y));
  a.H["el:pointermove"](ev("pointermove", (px.x + qx.x) / 2, px.y));
  a.H["el:pointermove"](ev("pointermove", qx.x, qx.y));
  a.H["el:pointerup"](ev("pointerup", qx.x, qx.y));
  ok(st.draft.cells.indexOf("21,20") >= 0 && st.draft.cells.indexOf("22,20") >= 0, "brush paints the path: " + st.draft.cells);
  eq(a.S.dirtyN(), 0, "the stroke's tiles were folded into the bitmap on the lift");
  /* mid-stroke, changed tiles wait in the overlay rather than touching the bitmap */
  a.H["el:pointerdown"](ev("pointerdown", px.x, py0 = px.y + 60));
  a.H["el:pointermove"](ev("pointermove", qx.x, py0));
  ok(a.S.dirtyN() > 0, "dirty while the finger is down");
  a.H["el:pointerup"](ev("pointerup", qx.x, py0));
  eq(a.S.dirtyN(), 0);
  eq(st.draft.cells.indexOf("20,20") >= 0, true, "brush keeps the start black rather than flipping it");
  a.click({a:"undo"}); a.click({a:"undo"});
  ok(st.draft.cells.length < 3, "undo removed the brush strokes");
  eq(a.S.guides(), true);
  a.click({a:"guides"});
  eq(a.S.guides(), false);
  /* mirror mode from the toolbar: a tap fills all four quarters, a brush stroke too */
  a.click({a:"new"}); a.click({a:"tap"});
  a.click({a:"mirror"}); eq(a.S.mirror(), true);
  const s2 = a.S.state();
  const m = a.S.hexCenter(30, 30), mp = { x: m.x * v.scale + v.tx, y: m.y * v.scale + v.ty };
  a.H["el:pointerdown"](ev("pointerdown", mp.x, mp.y));
  a.H["el:pointerup"](ev("pointerup", mp.x, mp.y));
  eq(s2.draft.cells.slice().sort().join(" "), "20,30 20,38 30,30 30,38");
  a.click({a:"brush"});
  const n2 = a.S.hexCenter(32, 30), np = { x: n2.x * v.scale + v.tx, y: n2.y * v.scale + v.ty };
  a.H["el:pointerdown"](ev("pointerdown", mp.x, mp.y));
  a.H["el:pointermove"](ev("pointermove", np.x, np.y));
  a.H["el:pointerup"](ev("pointerup", np.x, np.y));
  ok(s2.draft.cells.indexOf("18,38") >= 0 && s2.draft.cells.indexOf("32,30") >= 0, "brush mirrored: " + s2.draft.cells);
  a.click({a:"mirror"}); eq(a.S.mirror(), false);
});

console.log("\n" + passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
