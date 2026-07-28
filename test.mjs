/**
 * Headless regression tests for indy.html.
 *
 * The app is a single HTML file with no build step, so there is nothing to
 * import. This extracts the <script> body, stubs the handful of browser APIs
 * it touches, and drives it through a full block by firing the same synthetic
 * click/input events the real UI would.
 *
 *   node test.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "indy.html"), "utf8");
const js = html.match(/<script>\n([\s\S]*)\n<\/script>/)[1];

const STUB = `
var __handlers = {};
var localStorage = { _d:{}, getItem:function(k){return this._d[k]||null;}, setItem:function(k,v){this._d[k]=v;} };
function mkEl(){ return {innerHTML:"", style:{}, dataset:{}, appendChild:function(){}}; }
var document = {
  getElementById: function(){ return mkEl(); },
  addEventListener: function(t,f){ __handlers[t] = f; },
  createElement: function(){ return mkEl(); },
  head: { appendChild: function(){} }
};
var window = { scrollY:0, scrollTo:function(){}, addEventListener:function(){} };
var location = { protocol:"file:" };
var navigator = {};
var URL = { createObjectURL: function(){ return "blob:stub"; } };
function Blob(){}
var setTimeout = function(f){ f(); };
var clearTimeout = function(){};
`;

const DRIVER = `
function click(attrs){
  var el = {dataset: attrs};
  __handlers.click({ target: { closest: function(){ return el; } } });
}
function type(exId, i, f, val){
  __handlers.input({ target: {dataset:{ex:exId, i:String(i), f:f}, value:String(val)} });
}
/**
 * Run one whole session.
 *   pickLoad(ex)        -> weight to use when there is no target yet
 *   pickReps(ex,target) -> reps to log on every set
 *   rir                 -> reps-in-reserve tapped for each exercise
 *   pickFb(muscle)      -> {s,p,v} feedback
 */
function runSession(pickLoad, pickReps, rir, pickFb){
  var c = ctx();
  click({a:"start"});
  c = ctx();
  c.day.exercises.forEach(function(ex){
    var t = c.targets[ex.id];
    state.draft.sets[ex.id].forEach(function(r, i){
      type(ex.id, i, "w", t.weight == null ? pickLoad(ex) : t.weight);
      type(ex.id, i, "r", pickReps(ex, t));
      click({a:"toggle", ex:ex.id, i:String(i)});
    });
    if (!ex.time) click({a:"rir", ex:ex.id, v:String(rir)});
  });
  click({a:"finish"});
  if (!c.dl){
    musclesOf(c.day).forEach(function(m){
      var f = pickFb(m);
      if (trainedBefore(m)) click({a:"fb", m:m, k:"s", v:String(f.s)});
      click({a:"fb", m:m, k:"p", v:String(f.p)});
      click({a:"fb", m:m, k:"v", v:String(f.v)});
    });
    click({a:"fbsave"});
  }
  click({a:"summarydone"});
  return c;
}
return {
  click: click, type: type, runSession: runSession,
  api: function(){ return {
    state: state, ctx: ctx, setsDelta: setsDelta, roundLoad: roundLoad,
    platesPerSide: platesPerSide, setCountsForDay: setCountsForDay,
    prescribe: prescribe, plannedSets: plannedSets, DAYS: DAYS,
    weekOf: weekOf, isDeload: isDeload, RIR_BY_WEEK: RIR_BY_WEEK,
    SESSIONS_PER_BLOCK: SESSIONS_PER_BLOCK, WEEKS_PER_BLOCK: WEEKS_PER_BLOCK,
    DELOAD_WEEK: DELOAD_WEEK
  };}
};
`;

const boot = () => new Function(STUB + js + DRIVER)();

/* ------------------------------------------------------------------ */

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (err) {
    failures++;
    console.log("  FAIL " + name + "\n       " + err.message);
  }
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error((label || "value") + ": got " + a + ", expected " + b);
}
function ok(cond, label) {
  if (!cond) throw new Error(label || "assertion failed");
}

const STARTING = {
  p1:135, p2:75, p3:50, p4:15, p5:60, p6:40,
  l1:0, l2:115, l3:100, l4:30, l5:25, l6:25,
  g1:185, g2:155, g3:35, g4:70, g5:135, g6:0,
  f1:225, f2:0, f3:110, f4:270, f5:15, f6:40, f7:45, f8:0
};
const load = (ex) => STARTING[ex.id];
const topOfRange = (ex, t) => (ex.time ? t.reps : Math.max(t.reps, ex.hi));
const midRange = (ex, t) => (ex.time ? t.reps : Math.min(t.reps, ex.hi));

console.log("\npure functions");

check("plate math off a 45 lb bar", () => {
  const { platesPerSide } = boot().api();
  eq(platesPerSide(45), null, "empty bar");
  eq(platesPerSide(135), "45", "135");
  eq(platesPerSide(205), "45 · 35", "205");
  eq(platesPerSide(225), "45 · 45", "225");
});

check("loads snap to 5 lb, barbells floor at 45", () => {
  const { roundLoad } = boot().api();
  eq(roundLoad({ gear: "Barbell" }, 137.5), 140);
  eq(roundLoad({ gear: "Barbell" }, 20), 45);
  eq(roundLoad({ gear: "Cable" }, 3), 5);
  eq(roundLoad({ gear: "Dumbbell" }, 52), 50);
});

check("set deltas follow the feedback matrix", () => {
  const { setsDelta } = boot().api();
  eq(setsDelta({ s: 0, p: 0, v: 0 }), 3, "fresh + flat + light");
  eq(setsDelta({ s: 3, p: 1, v: 2 }), -1, "still sore + high volume");
  eq(setsDelta({ s: 3, p: 1, v: 1 }), 0, "still sore, moderate volume");
  eq(setsDelta({ s: 2, p: 2, v: 1 }), 0, "healed on time + big pump");
  eq(setsDelta({ s: 1, p: 1, v: 3 }), -1, "too much");
  eq(setsDelta({ s: 0, p: 1, v: 2 }), 0, "pushed my limits holds");
});

console.log("\nprogression");

check("top of the rep range adds a jump and resets reps", () => {
  const app = boot();
  // four sessions gets through the week and back around to push
  for (let i = 0; i < 4; i++) app.runSession(load, topOfRange, 3, () => ({ s: 1, p: 1, v: 1 }));
  const c = app.api().ctx();
  eq(c.day.id, "push", "back on push");
  eq(c.targets.p1.weight, 140, "bench +5");
  eq(c.targets.p1.reps, 5, "reps reset to bottom");
  eq(c.targets.g1 === undefined, true, "targets scoped to the day");
});

check("lower body moves in 10 lb steps", () => {
  const app = boot();
  const fb = () => ({ s: 1, p: 1, v: 1 });
  app.runSession(load, topOfRange, 3, fb); // push
  app.runSession(load, topOfRange, 3, fb); // pull
  eq(app.api().ctx().day.id, "legs", "third day of the week is legs");
  app.runSession(load, topOfRange, 3, fb); // legs, squat topped out at 185
  for (let i = 0; i < 3; i++) app.runSession(load, topOfRange, 3, fb); // full, push, pull
  eq(app.api().ctx().day.id, "legs", "back around to legs");
  eq(app.api().ctx().targets.g1.weight, 195, "squat +10");
});

check("staying inside the range keeps the load and adds a rep", () => {
  const app = boot();
  // logs 5s on bench, the bottom of its 5-8 range, so the bar should not move
  for (let i = 0; i < 4; i++) app.runSession(load, midRange, 2, () => ({ s: 1, p: 1, v: 1 }));
  const c = app.api().ctx();
  eq(c.day.id, "push", "back on push");
  eq(c.targets.p1.weight, 135, "bench held");
  eq(c.targets.p1.reps, 6, "one more than the 5 logged");
});

check("still sore holds the load instead of climbing", () => {
  const app = boot();
  for (let i = 0; i < 4; i++) app.runSession(load, topOfRange, 3, () => ({ s: 3, p: 1, v: 1 }));
  const c = app.api().ctx();
  eq(c.targets.p1.weight, 135, "bench repeats");
});

console.log("\nblock structure");

check("the block runs four weeks of work and one deload week", () => {
  const { weekOf, isDeload, RIR_BY_WEEK, SESSIONS_PER_BLOCK, WEEKS_PER_BLOCK, DELOAD_WEEK } = boot().api();
  eq(SESSIONS_PER_BLOCK, 20, "four sessions a week for five weeks");
  eq(WEEKS_PER_BLOCK, 5, "five weeks");
  eq([0, 3, 4, 7, 8, 12, 15, 16, 19].map(weekOf), [1, 1, 2, 2, 3, 4, 4, 5, 5], "week boundaries");
  const deloads = [];
  for (let i = 0; i < SESSIONS_PER_BLOCK; i++) if (isDeload(i)) deloads.push(i);
  eq(deloads, [16, 17, 18, 19], "only the fifth week deloads");
  eq([1, 2, 3, 4].map((w) => RIR_BY_WEEK[w]), [3, 2, 1, 0], "effort ramps a rep a week");
  eq(RIR_BY_WEEK[DELOAD_WEEK], 5, "deload stops 5 short");
});

check("deload lands in week 5 and halves the work", () => {
  const app = boot();
  for (let i = 0; i < 16; i++) app.runSession(load, topOfRange, 3, () => ({ s: 1, p: 1, v: 1 }));
  const c = app.api().ctx();
  ok(c.dl, "session 17 is a deload");
  eq(c.week, 5, "week 5");
  const { plannedSets, DAYS } = app.api();
  const bench = DAYS[0].exercises[0];
  eq(plannedSets(c, bench), Math.max(1, Math.ceil(c.counts.p1 / 2)), "sets halved");
  ok(c.targets.p1.weight < 135, "load backed off");
});

check("the next block ignores the deload and resumes from working loads", () => {
  const app = boot();
  for (let i = 0; i < 16; i++) app.runSession(load, topOfRange, 3, () => ({ s: 1, p: 1, v: 1 }));
  const beforeDeload = app.api().state.history[15];
  ok(beforeDeload, "week 4 full body logged");
  for (let i = 0; i < 4; i++) app.runSession(load, topOfRange, 3, () => ({ s: 1, p: 1, v: 1 }));
  const c = app.api().ctx();
  eq(c.week, 1, "back to week 1");
  eq(c.block, 2, "block 2");
  // 135 → 140 in week 2, then the 3 RIR logged against week 3's target of 1 and
  // week 4's target of 0 buys double jumps: 150, 160. Week 1 adds a single 5.
  eq(c.targets.p1.weight, 165, "bench kept climbing across the deload");
});

check("set counts never exceed the per-muscle cap", () => {
  const app = boot();
  for (let i = 0; i < 20; i++) app.runSession(load, topOfRange, 4, () => ({ s: 0, p: 0, v: 0 }));
  const { setCountsForDay, state } = app.api();
  const counts = setCountsForDay("push", state.history);
  const chest = counts.p1 + counts.p3;
  const triceps = counts.p5 + counts.p6;
  ok(chest <= 10, "chest capped at 10, got " + chest);
  ok(triceps <= 10, "triceps capped at 10, got " + triceps);
  Object.keys(counts).forEach((k) => ok(counts[k] <= 6, k + " capped at 6"));
});

check("volume feedback can also take sets away", () => {
  const app = boot();
  for (let i = 0; i < 4; i++) app.runSession(load, topOfRange, 0, () => ({ s: 3, p: 2, v: 3 }));
  const { setCountsForDay, state } = app.api();
  const counts = setCountsForDay("push", state.history);
  ok(counts.p1 + counts.p3 < 7, "chest sets fell below the starting 7");
});

console.log("\nsession state");

check("an unfinished session is resumable", () => {
  const app = boot();
  app.click({ a: "start" });
  app.type("p1", 0, "w", 135);
  app.type("p1", 0, "r", 8);
  const { state } = app.api();
  eq(state.draft.sets.p1[0].w, "135", "typed weight retained");
  eq(state.draft.sets.p1[0].r, "8", "typed reps retained");
  ok(state.draft !== null, "draft still open");
});

check("the first-ever session does not autofill a zero weight", () => {
  const app = boot();
  app.click({ a: "start" });
  app.click({ a: "toggle", ex: "p1", i: "0" });
  const row = app.api().state.draft.sets.p1[0];
  eq(row.w, "", "weight left blank for the user to enter");
  eq(row.r, "5", "reps prefilled from the target");
  eq(row.done, true, "set marked done");
});

check("every screen renders without throwing", () => {
  const app = boot();
  app.runSession(load, topOfRange, 3, () => ({ s: 1, p: 1, v: 1 }));
  ["progress", "plan", "settings", "workout"].forEach((t) => app.click({ a: "nav", tab: t }));
  app.click({ a: "nav", tab: "progress" });
  app.click({ a: "selex", ex: "p1" });
});

check("erasing returns to block 1 week 1", () => {
  const app = boot();
  app.runSession(load, topOfRange, 3, () => ({ s: 1, p: 1, v: 1 }));
  app.click({ a: "nav", tab: "settings" });
  app.click({ a: "erase-ask" });
  app.click({ a: "erase-yes" });
  const { state, ctx } = app.api();
  eq(state.history.length, 0, "history cleared");
  eq(ctx().block, 1, "block 1");
  eq(ctx().week, 1, "week 1");
});

console.log(
  "\n" + (failures ? failures + " failing check" + (failures === 1 ? "" : "s") : "all checks passed") + "\n"
);
process.exit(failures ? 1 : 0);
