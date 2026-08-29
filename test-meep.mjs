/**
 * Headless regression tests for meep.html.
 *
 * The app is a single HTML file with no build step, so there is nothing to
 * import. This extracts the <script> body, stubs the handful of browser APIs
 * it touches, and drives it through whole weeks by firing the same synthetic
 * click/input events the real UI would.
 *
 *   node test-meep.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "meep.html"), "utf8");
const js = html.match(/<script>\n([\s\S]*)\n<\/script>/)[1];

const STUB = `
var __handlers = {};
var localStorage = { _d:{}, getItem:function(k){return this._d[k]||null;}, setItem:function(k,v){this._d[k]=v;} };
function mkEl(){ return {innerHTML:"", style:{}, dataset:{}, appendChild:function(){}}; }
var document = {
  getElementById: function(){ return mkEl(); },
  querySelector: function(){ return null; },
  querySelectorAll: function(){ return []; },
  addEventListener: function(t,f){ __handlers[t] = f; },
  createElement: function(){ return mkEl(); },
  head: { appendChild: function(){} }
};
var window = { scrollY:0, scrollTo:function(){}, addEventListener:function(){} };
var location = { protocol:"file:" };
var navigator = {};
var URL = { createObjectURL: function(){ return "blob:stub"; }, revokeObjectURL: function(){} };
function Blob(){}
var setTimeout = function(f){ f(); };
var clearTimeout = function(){};
var setInterval = function(){ return 1; };
var clearInterval = function(){};
`;

const DRIVER = `
function click(attrs){
  var el = {dataset: attrs};
  __handlers.click({ target: { closest: function(){ return el; } } });
}
function type(exId, i, f, val){
  __handlers.input({ target: {dataset:{ex:exId, i:String(i), f:f}, value:String(val)} });
}
function fill(exId, i, f, val){
  type(exId, i, f, val);
  __handlers.focusout({ target: {dataset:{ex:exId, i:String(i), f:f}, value:String(val)} });
}
/**
 * Run one whole session.
 *   pickLoad(ex)             -> load to use when there is no target yet
 *   pickReps(ex, target, isProof) -> reps to log
 *   pickEffort(ex)           -> 0..3, how many reps she says were left
 *   pickSore(muscle)         -> 0..3
 */
function runSession(pickLoad, pickReps, pickEffort, pickSore){
  var c = ctx();
  click({a:"start"});
  c = ctx();
  c.exercises.forEach(function(ex){
    var t = c.targets[ex.id], rows = state.draft.sets[ex.id];
    rows.forEach(function(r, i){
      var proof = isProof(c, ex, i, rows);
      if (!loadless(ex)) fill(ex.id, i, "w", t.weight == null ? pickLoad(ex) : t.weight);
      type(ex.id, i, "r", pickReps(ex, t, proof));
      click({a:"toggle", ex:ex.id, i:String(i)});
    });
    if (!c.dl) click({a:"effort", ex:ex.id, v:String(pickEffort(ex))});
  });
  click({a:"finish"});
  if (state.draft){
    c.asked.forEach(function(m){ click({a:"sore", m:m, v:String(pickSore(m))}); });
    click({a:"fbsave"});
  }
  click({a:"summarydone"});
  return c;
}
return {
  click: click, type: type, fill: fill, runSession: runSession,
  api: function(){ return {
    state: state, ctx: ctx, view: view, html: app.innerHTML,
    roundLoad: roundLoad, platesPerSide: platesPerSide, prescribe: prescribe,
    proofOf: proofOf, proofRun: proofRun,
    setsDelta: setsDelta, workedHard: workedHard, setCountsFor: setCountsFor,
    deloadDue: deloadDue, regressed: regressed, effortScore: effortScore,
    askedMuscles: askedMuscles, plannedSets: plannedSets, isProof: isProof,
    exById: exById, slotOf: slotOf, weekOf: weekOf, loadless: loadless,
    learning: learning, learnDaysLeft: learnDaysLeft, LEARN_DAYS: LEARN_DAYS,
    SLOTS: SLOTS, SLOT_COUNT: SLOT_COUNT, HARD: HARD, CAP_MUSCLE: CAP_MUSCLE,
    CAP_EX: CAP_EX, SANDBAG_TRIGGER: SANDBAG_TRIGGER, EFFORT_GOAL: EFFORT_GOAL, claimRun: claimRun,
    DELOAD_LOAD: DELOAD_LOAD, DAY_MS: DAY_MS
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

/* One past session: the proof set is the last row, and `effort` is what she
   said was left in the tank on it. */
function session(exId, load, reps, effort, extra) {
  const row = {
    ts: 0, week: 1, slot: "ua", deload: false,
    sets: {}, effort: {}, sore: (extra && extra.sore) || {}
  };
  row.sets[exId] = reps.map((r) => ({ w: String(load), r: String(r), done: true }));
  if (effort != null) row.effort[exId] = effort;
  return row;
}

const START = { a1:25, a2:60, a3:70, a4:15, a5:10, a6:30, a7:12,
  b1:90, b2:65, b3:20, b4:50, b5:40, b6:90, b7:0,
  c1:25, c2:70, c3:50, c4:70, c5:30,
  d1:95, d2:180, d3:40, d4:20, d5:70, d6:70, d7:40,
  e1:65, e2:50 };
const load = (ex) => (START[ex.id] == null ? 20 : START[ex.id]);
/* she stops the proof set exactly at the top of the range and says 2 were left */
const sandbagger = (ex, t, proof) => (proof ? ex.hi : t.reps);
const grinder = (ex, t, proof) => (proof ? ex.hi + 1 : t.reps);
const SAYS_TWO_LEFT = () => 1;
const SAYS_NOTHING_LEFT = () => 3;
const HEALED_EARLY = () => 1;

console.log("\nthe proof set");

check("the last set of every exercise is the proof set, and only that one", () => {
  const app = boot();
  const { ctx, isProof } = app.api();
  app.click({ a: "start" });
  const c = ctx();
  c.exercises.forEach((ex) => {
    const rows = app.api().state.draft.sets[ex.id];
    rows.forEach((r, i) => {
      eq(isProof(c, ex, i, rows), i === rows.length - 1, ex.name + " set " + (i + 1));
    });
  });
  ok(app.api().html.indexOf('class="pmark"') >= 0, "and it is marked as such on the card");
});

check("the load comes off the proof set, not off the working sets", () => {
  const { prescribe, exById } = boot().api();
  const press = exById("a1"); // the heavy chest compound, 6-10, dumbbell, 5 lb steps
  // heavy working sets but a proof set that stopped inside the range
  const h = [session("a1", 30, [12, 12, 8], 3)];
  const p = prescribe(press, h);
  eq([p.weight, p.reps], [30, 9], "held at 30 with the target one rep past the proof set");
  ok(/one more rep/.test(p.why), "and it says so: " + p.why);
});

check("the load moves by what the evidence is worth, in whole steps", () => {
  const { prescribe, exById } = boot().api();
  // a 30 lb dumbbell moves in 5s, which is already 17% — one step is the floor
  // and also, on this exercise, the ceiling
  const press = exById("a1"); // 6-10, step 5
  eq(prescribe(press, [session("a1", 30, [8, 8, 10], 3)]).weight, 35, "topped the range with nothing left: up");
  eq(prescribe(press, [session("a1", 30, [8, 8, 10], 0)]).weight, 35,
    "and three reps of claimed reserve cannot buy more than the rack has");
  eq(prescribe(press, [session("a1", 30, [8, 8, 10], 0)]).reps, 6, "reps reset to the bottom");

  // the leg press moves in 20s and carries enough load for the reserve to count
  const legs = exById("d2"); // 10-15, step 20
  eq(prescribe(legs, [session("d2", 300, [12, 12, 15], 3)]).weight, 320, "15 with nothing left: one step");
  eq(prescribe(legs, [session("d2", 300, [12, 12, 15], 0)]).weight, 320,
    "15 with three in the tank: still one step, since only two of those three count as spare");
  eq(prescribe(legs, [session("d2", 300, [12, 12, 20], 3)]).weight, 340,
    "but five reps past the top is two steps — 300 lb is enough for 3% a rep to add up");
});

check("reps inside the range plus a claimed reserve still moves the load", () => {
  const { prescribe, exById } = boot().api();
  const press = exById("a1");
  const p = prescribe(press, [session("a1", 30, [10, 10, 10], 1)]);
  eq(p.weight, 35, "10 reps but two left in the tank — the load goes up anyway");
  ok(/you said 2 more were there/.test(p.why), "and it explains why: " + p.why);
});

check("falling under the range takes the load back down", () => {
  const { prescribe, exById } = boot().api();
  const p = prescribe(exById("a1"), [session("a1", 40, [7, 6, 5], 3)]);
  eq([p.weight, p.reps], [35, 6], "5 reps against a 6-10 range: one step down, back to the bottom");
});

check("each implement moves in its own step", () => {
  const { prescribe, exById } = boot().api();
  const up = (id, w) => {
    const ex = exById(id);
    return prescribe(ex, [session(id, w, [ex.lo, ex.lo, ex.hi], 3)]).weight - w;
  };
  eq(up("a5", 10), 5, "cables move in 5");
  eq(up("b4", 50), 10, "machines in 10");
  eq(up("b1", 90), 20, "the hack squat in 20");
  eq(up("d2", 180), 20, "and the leg press in 20");
});

check("a first session asks for a load and explains what the proof set is for", () => {
  const { prescribe, exById } = boot().api();
  const p = prescribe(exById("a1"), []);
  eq(p.weight, null, "nothing to prescribe yet");
  eq(p.reps, 6, "opening at the bottom of the range");
  ok(/until the reps stop/.test(p.why), "and it says what to do with the last set: " + p.why);
});

console.log("\nthe audit");

check("the app counts how many sessions running she has held reps back", () => {
  const { claimRun } = boot().api();
  const soft = session("a1", 30, [10, 10, 10], 1);   // two left
  const empty = session("a1", 30, [10, 10, 10], 3);  // nothing left

  eq(claimRun("a1", [soft, soft, soft]), 3, "three in a row");
  eq(claimRun("a1", [empty, empty]), 0, "emptying the tank does not count");
  eq(claimRun("a1", [soft, empty]), 0, "and one honest session ends the run");
  eq(claimRun("a1", [empty, soft]), 1, "counting back from the most recent");
});

check("there is no rating that leaves the weight where it is", () => {
  const { prescribe, exById } = boot().api();
  const press = exById("a1"); // 6-10, step 5
  // eight reps, inside the range: the only answers that hold the load are the honest ones
  eq(prescribe(press, [session("a1", 30, [8, 8, 8], 3)]).weight, 30, "nothing left: hold, chase the rep");
  eq(prescribe(press, [session("a1", 30, [8, 8, 8], 2)]).weight, 30, "one left: hold, chase the rep");
  eq(prescribe(press, [session("a1", 30, [8, 8, 8], 1)]).weight, 35, "two left: that is a lighter load than she needs");
  eq(prescribe(press, [session("a1", 30, [8, 8, 8], 0)]).weight, 35, "three or more left: same");
});

check("stopping short of the range is not treated as failing it", () => {
  const { prescribe, exById } = boot().api();
  const press = exById("a1"); // 6-10

  const quit = prescribe(press, [session("a1", 40, [7, 6, 4], 1)]);   // 4 reps, says 2 were left
  ok(quit.forced, "the audit overrode the ordinary rule");
  eq(quit.weight, 40, "nothing comes off — that was an abandoned set");
  ok(/stopping early, not failing/.test(quit.why), "and it says so: " + quit.why);

  const failed = prescribe(press, [session("a1", 40, [7, 6, 4], 3)]); // 4 reps, emptied
  ok(!failed.forced, "genuinely failing is a different thing");
  eq(failed.weight, 35, "and that does come down a step");
});

check("an honest stall is left alone", () => {
  const { prescribe, exById } = boot().api();
  const stalling = [
    session("a1", 30, [8, 8, 9], 3),
    session("a1", 30, [8, 8, 8], 3),
    session("a1", 30, [8, 8, 8], 3)
  ];
  const p = prescribe(exById("a1"), stalling);
  ok(!p.forced, "nothing forced — she is emptying the tank, the reps just are not there");
  eq(p.weight, 30, "the load holds");
  eq(p.reps, 9, "and the job is one more rep than last time");
});

console.log("\nvolume follows intensity");

check("sets rise only for a muscle that was actually taken close to failure", () => {
  const { setsDelta } = boot().api();
  eq(setsDelta(0, true), 2, "never sore off honest work: two sets on");
  eq(setsDelta(1, true), 1, "healed early: one on");
  eq(setsDelta(2, true), 0, "healed just in time: hold");
  eq(setsDelta(3, true), -1, "still sore: one off");
  eq(setsDelta(0, false), 0, "never sore off soft work buys nothing");
  eq(setsDelta(1, false), 0, "nor does healing early off soft work");
  eq(setsDelta(3, false), -1, "but still sore always backs off");
});

check("a muscle counts as worked hard when half its sets went the distance", () => {
  const { workedHard } = boot().api();
  // a1 and c1 are chest; a6 is triceps
  const s = {effort: {a1: 3, a3: 0}};
  eq(workedHard(s, "chest"), true, "the chest work was rated nothing-left");
  eq(workedHard(s, "back"), false, "the back work was not");
  eq(workedHard({effort: {}}, "chest"), false, "and no rating is not a pass");
});

check("soreness moves the set count for the next time that session comes round", () => {
  const app = boot();
  const { setCountsFor, state, SLOTS } = app.api();
  const base = setCountsFor("ua", []);
  eq(base.a1, 4, "the program's own set count to begin with — a1 is a heavy compound");

  state.history.push({
    ts: 0, week: 1, slot: "ua", deload: false,
    sets: {}, effort: {a1: 3, c1: 3}, sore: {chest: 0}
  });
  const after = setCountsFor("ua", state.history);
  eq(after.a1, 5, "never sore off honest chest work: sets on, capped per exercise");

  state.history[0].effort = {a1: 0};        // she says three were left
  eq(setCountsFor("ua", state.history).a1, 4, "the same soreness buys nothing when the work was soft");
});

check("set counts stay inside their caps", () => {
  const app = boot();
  const { setCountsFor, state, CAP_MUSCLE, CAP_EX, SLOTS } = app.api();
  for (let i = 0; i < 12; i++){
    state.history.push({
      ts: 0, week: 1, slot: "ua", deload: false,
      sets: {}, effort: {a1: 3, a2: 3, a3: 3}, sore: {chest: 0, back: 0}
    });
  }
  const counts = setCountsFor("ua", state.history);
  const ua = SLOTS[0].exercises;
  ["chest", "back"].forEach((m) => {
    const n = ua.filter((e) => e.muscle === m).reduce((a, e) => a + counts[e.id], 0);
    ok(n <= CAP_MUSCLE, m + " capped at " + CAP_MUSCLE + ", got " + n);
  });
  Object.keys(counts).forEach((k) => ok(counts[k] <= CAP_EX, k + " capped at " + CAP_EX));
});

check("soreness is only asked about muscles the session actually works", () => {
  const { askedMuscles, setCountsFor, SLOTS } = boot().api();
  const ua = askedMuscles(SLOTS[0], setCountsFor("ua", []));
  eq(ua, ["chest", "delts", "back"], "upper push: not the three-set triceps work");
  const la = askedMuscles(SLOTS[1], setCountsFor("la", []));
  eq(la, ["quads", "glutes"], "lower squat: hamstrings are asked about on the day they are loaded");
  const lb = askedMuscles(SLOTS[3], setCountsFor("lb", []));
  eq(lb, ["glutes", "hamstrings", "quads"], "lower hinge: hamstrings are asked here, where they are loaded");
});

console.log("\nearned deloads");

check("a deload arrives when the proof sets go backwards, not on a schedule", () => {
  const app = boot();
  const { deloadDue, state } = app.api();
  const s = (reps) => ({
    ts: 0, week: 1, slot: "ua", deload: false, effort: {}, sore: {},
    sets: {a1:[{w:"30",r:"10",done:true}], a2:[{w:"60",r:String(reps),done:true}],
           a3:[{w:"70",r:String(reps),done:true}], a4:[{w:"15",r:String(reps),done:true}]}
  });
  state.history.push(s(12), s(12), s(12));
  eq(deloadDue("ua", state.history), false, "holding steady is not fatigue");

  state.history.length = 0;
  state.history.push(s(12), s(10), s(8));
  eq(deloadDue("ua", state.history), true, "two sessions of going backwards is");

  state.history.length = 0;
  state.history.push(s(12), s(10), s(12));
  eq(deloadDue("ua", state.history), false, "one bad session on its own is not");
});

check("the deload halves the sets, drops the load and takes the proof sets away", () => {
  const app = boot();
  const { state, ctx, plannedSets, DELOAD_LOAD } = app.api();
  const s = (reps) => ({
    ts: 0, week: 1, slot: "ua", deload: false, effort: {}, sore: {},
    sets: {a1:[{w:"30",r:String(reps),done:true}], a2:[{w:"60",r:String(reps),done:true}],
           a3:[{w:"70",r:String(reps),done:true}], a4:[{w:"15",r:String(reps),done:true}]}
  });
  state.history.push(s(12), s(10), s(8));
  const c = ctx();
  ok(c.dl, "the next Upper A is a deload");
  const full = c.counts.a1;
  eq(plannedSets(c, c.exercises[0]), Math.max(1, Math.ceil(full / 2)), "half the sets");
  ok(c.targets.a1.weight < 30, "and a lighter load");
  eq(c.asked.length >= 0, true, "nothing crashes");
  eq(c.targets.a1.deload, true, "flagged as a deload prescription");
});

console.log("\nthe headline number");

check("the effort score is the share of proof sets taken the distance", () => {
  const app = boot();
  const { effortScore, state, DAY_MS } = app.api();
  const now = Date.now();
  eq(effortScore([], now), null, "nothing logged, nothing to say");

  state.history.push({ts: now, deload: false, sets: {}, effort: {a1: 3, a2: 2, a3: 1, a4: 0}});
  const e = effortScore(state.history, now);
  eq([e.sets, Math.round(e.score * 100)], [4, 50], "two of four went to one-or-none left");

  state.history.push({ts: now - 60 * DAY_MS, deload: false, sets: {}, effort: {a1: 0, a2: 0}});
  eq(effortScore(state.history, now).sets, 4, "and it only looks at the last four weeks");
});

console.log("\na week of training");

check("four sessions rotate upper, lower, upper, lower", () => {
  const { slotOf, weekOf, SLOT_COUNT } = boot().api();
  eq(SLOT_COUNT, 4, "four slots");
  eq([0,1,2,3,4,5].map((i) => slotOf(i).id), ["ua","la","ub","lb","ua","la"], "and they rotate");
  eq([0,3,4,7,8].map(weekOf), [1,1,2,2,3], "week boundaries");
});

check("a full week logs, and the loads move on what the proof sets did", () => {
  const app = boot();
  for (let i = 0; i < 4; i++) app.runSession(load, grinder, SAYS_NOTHING_LEFT, HEALED_EARLY);
  const { state, ctx } = app.api();
  eq(state.history.map((h) => h.slot), ["ua","la","ub","lb"], "one of each");
  eq(ctx().slot.id, "ua", "back to Upper A");
  eq(ctx().week, 2, "in week 2");
  eq(ctx().targets.a1.weight, START.a1 + 5, "and the dumbbell press went up a step");
  ok(ctx().counts.a1 > 3, "with a set added off the soreness answer");
});

check("a sandbagged week gets caught and the loads climb anyway", () => {
  const app = boot();
  // every proof set stopped exactly at the top of the range, rated 'two more left'
  for (let i = 0; i < 12; i++) app.runSession(load, sandbagger, SAYS_TWO_LEFT, HEALED_EARLY);
  const { state, ctx } = app.api();
  const w = ctx().targets.a1.weight;
  ok(w >= START.a1 + 15, "three sessions of claimed reserve pushed the load up every time, got " + w);
  eq(ctx().targets.a1.run, 3, "and it is counting the run");
  const e = app.api().effortScore(state.history, Date.now());
  ok(e.score === 0, "and the effort score reads zero, which is the point");
  ok(app.api().html.indexOf("proof sets") >= 0, "the home screen says so");
});

console.log("\nsession state");

check("a session cannot be finished with sets outstanding", () => {
  const app = boot();
  const { state, ctx } = app.api();
  app.click({ a: "start" });
  app.click({ a: "finish" });
  ok(state.draft, "nothing committed");
  ok(app.api().html.indexOf("still to log") >= 0, "the button says what is left");
});

check("a session cannot be finished without rating the proof sets", () => {
  const app = boot();
  const { state, ctx } = app.api();
  app.click({ a: "start" });
  ctx().exercises.forEach((ex) => {
    state.draft.sets[ex.id].forEach((r, i) => {
      app.fill(ex.id, i, "w", 20);
      app.click({ a: "toggle", ex: ex.id, i: String(i) });
    });
  });
  app.click({ a: "finish" });
  eq(app.api().view, "feedback", "it stops at the questions");
  app.click({ a: "fbsave" });
  ok(app.api().state.draft, "and will not save while any are unanswered");

  ctx().exercises.forEach((ex) => app.click({ a: "effort", ex: ex.id, v: "3" }));
  app.click({ a: "fbsave" });
  ok(app.api().state.draft, "still not — the soreness questions are outstanding");
  ctx().asked.forEach((m) => app.click({ a: "sore", m: m, v: "1" }));
  app.click({ a: "fbsave" });
  eq(app.api().state.history.length, 1, "answered, it commits");
});

check("rating appears once the proof set is logged, and dies if the sets change", () => {
  const app = boot();
  const { state, ctx } = app.api();
  app.click({ a: "start" });
  ok(app.api().html.indexOf("How many more could you have done?") < 0, "not asked before the work");

  const rows = state.draft.sets.a1;
  rows.forEach((r, i) => {
    app.fill("a1", i, "w", 25);
    app.click({ a: "toggle", ex: "a1", i: String(i) });
  });
  ok(app.api().html.indexOf("How many more could you have done?") >= 0, "asked once the last set is in");

  app.click({ a: "effort", ex: "a1", v: "3" });
  eq(state.draft.effort.a1, 3, "answer recorded");

  app.click({ a: "addset", ex: "a1" });
  eq(state.draft.effort.a1, null, "a new last set is a new proof set, so the rating goes");
});

check("logging a set starts the rest timer", () => {
  const app = boot();
  app.click({ a: "start" });
  app.fill("a1", 0, "w", 25);
  app.click({ a: "toggle", ex: "a1", i: "0" });
  ok(app.api().state.timer.startedAt, "the rest is running");
  eq(app.api().state.timer.dur, 90, "90 seconds by default, which is a hypertrophy rest");
});

check("the top set's weight fills the rest when you leave the field", () => {
  const app = boot();
  app.click({ a: "start" });
  const rows = app.api().state.draft.sets.a1;
  app.type("a1", 0, "w", 25);
  eq(rows.map((r) => r.w), ["25", "", "", ""], "nothing moves while typing");
  app.fill("a1", 0, "w", 25);
  eq(rows.map((r) => r.w), ["25", "25", "25", "25"], "leaving the field fills them");
});

check("you can look ahead and come back", () => {
  const app = boot();
  const { state, ctx } = app.api();
  app.click({ a: "peeknext" });
  app.click({ a: "peeknext" });
  eq(state.index, 0, "looking does not move you");
  app.click({ a: "start" });
  eq(state.draft.index, 0, "and the draft belongs to the live session");
  for (let i = 0; i < 20; i++) app.click({ a: "peeknext" });
  app.click({ a: "peektoday" });
  eq(ctx().slot.id, "ua", "clamped to the week in front of you");
});

console.log("\nform prompts");

check("the prompts run for four weeks from the first logged session", () => {
  const { learning, learnDaysLeft, LEARN_DAYS, DAY_MS } = boot().api();
  const now = Date.now();
  eq(LEARN_DAYS, 28, "four weeks");

  ok(learning([], now), "nothing logged yet: the window has not even opened");
  eq(learnDaysLeft([], now), 28, "and the full four weeks are ahead");

  const started = (daysAgo) => [{ts: now - daysAgo * DAY_MS}];
  ok(learning(started(1), now), "a day in");
  ok(learning(started(27), now), "and on day 27");
  eq(learnDaysLeft(started(27), now), 1, "with a day to run");
  ok(!learning(started(28), now), "but not on day 28");
  eq(learnDaysLeft(started(40), now), 0, "and it does not go negative afterwards");

  // the window is anchored to the first session, not the most recent one
  const long = [{ts: now - 200 * DAY_MS}, {ts: now - DAY_MS}];
  ok(!learning(long, now), "training for months does not reopen it");
});

check("each exercise offers the demo until its first set is logged", () => {
  const app = boot();
  const { state, ctx } = app.api();
  app.click({ a: "start" });
  const first = ctx().exercises[0];

  ok(app.api().html.indexOf("Watch the demo before your first set") >= 0, "prompted to begin with");
  ok(app.api().html.indexOf('class="vid hot"') >= 0, "and the video button is lit");
  const before = (app.api().html.match(/class="watch"/g) || []).length;
  eq(before, ctx().exercises.length, "one on every exercise");

  app.fill(first.id, 0, "w", 25);
  app.click({ a: "toggle", ex: first.id, i: "0" });
  const after = (app.api().html.match(/class="watch"/g) || []).length;
  eq(after, before - 1, "and it clears off the one you have started");
});

check("the prompts are gone once the four weeks are up", () => {
  const app = boot();
  const { state, DAY_MS } = app.api();
  // a first session logged five weeks ago
  state.history.push({
    ts: Date.now() - 35 * DAY_MS, week: 1, slot: "ua", deload: false,
    sets: {a1:[{w:"25",r:"8",done:true}]}, effort: {a1: 3}, sore: {}
  });
  state.index = 4;                       // back round to Upper Push
  app.click({ a: "start" });
  eq((app.api().html.match(/class="watch"/g) || []).length, 0, "no prompts");
  eq(app.api().html.indexOf('class="vid hot"'), -1, "and nothing lit");
  ok(app.api().html.indexOf('class="vid"') >= 0, "the demo link itself is still there, just not shouted about");
});

console.log("\nscreens");

check("every exercise offers a video search", () => {
  const app = boot();
  app.click({ a: "start" });
  const { html, ctx } = app.api();
  ctx().exercises.forEach((ex) => {
    const url = "https://www.youtube.com/results?search_query=" + encodeURIComponent(ex.name);
    ok(html.indexOf('href="' + url + '"') >= 0, ex.name + " links to a search for itself");
  });
});

check("every screen renders without throwing", () => {
  const app = boot();
  for (let i = 0; i < 4; i++) app.runSession(load, grinder, SAYS_NOTHING_LEFT, HEALED_EARLY);
  ["progress", "plan", "settings", "train"].forEach((t) => app.click({ a: "nav", tab: t }));
  app.click({ a: "nav", tab: "progress" });
  app.click({ a: "selex", ex: "b1" });
  app.click({ a: "nav", tab: "train" });
  app.click({ a: "start" });
  app.click({ a: "why", ex: "a1" });
  ok(app.api().html.indexOf("Target") >= 0, "the session screen has targets");
});

check("erasing goes back to week 1", () => {
  const app = boot();
  app.runSession(load, grinder, SAYS_NOTHING_LEFT, HEALED_EARLY);
  app.click({ a: "nav", tab: "settings" });
  app.click({ a: "erase-ask" });
  app.click({ a: "erase-yes" });
  const { state, ctx } = app.api();
  eq(state.history.length, 0, "history cleared");
  eq([ctx().week, ctx().slot.id], [1, "ua"], "week 1, Upper A");
});

console.log(
  "\n" + (failures ? failures + " failing check" + (failures === 1 ? "" : "s") : "all checks passed") + "\n"
);
process.exit(failures ? 1 : 0);
