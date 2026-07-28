/**
 * Headless regression tests for indie.html.
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
const html = readFileSync(join(here, "indie.html"), "utf8");
const js = html.match(/<script>\n([\s\S]*)\n<\/script>/)[1];

const STUB = `
var __handlers = {};
var localStorage = { _d:{}, getItem:function(k){return this._d[k]||null;}, setItem:function(k,v){this._d[k]=v;} };
function mkEl(){ return {innerHTML:"", style:{}, dataset:{}, appendChild:function(){}}; }
var document = {
  getElementById: function(){ return mkEl(); },
  querySelector: function(){ return null; },
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
/* typing then leaving the field, which is what carries a weight down */
function fill(exId, i, f, val){
  type(exId, i, f, val);
  __handlers.focusout({ target: {dataset:{ex:exId, i:String(i), f:f}, value:String(val)} });
}
/**
 * Run one whole session.
 *   pickLoad(ex)        -> weight to use when there is no target yet
 *   pickReps(ex,target) -> reps to log on every set
 *   rir                 -> reps-in-reserve tapped for each exercise
 *   pickFb(muscle)      -> {s,p,v} feedback
 */
/* Answer whatever sheet the session just opened, the way a thumb would. */
function answerSheet(pickFb){
  while (ask){
    var m = ask.m, f = pickFb(m);
    ask.kinds.forEach(function(k){ click({a:"ask", m:m, k:k, v:String(f[k])}); });
    click({a:"asksave"});
  }
}
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
      answerSheet(pickFb);
    });
    if (!ex.time) click({a:"rir", ex:ex.id, v:String(rir)});
  });
  click({a:"finish"});
  /* a still-open draft means something went unanswered and the end screen asked */
  if (state.draft){
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
  click: click, type: type, fill: fill, runSession: runSession,
  api: function(){ return {
    state: state, ctx: ctx, ask: ask, view: view, html: app.innerHTML,
    setsDelta: setsDelta, roundLoad: roundLoad,
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
  l7:120, l2:115, l3:100, l4:30, l5:25, l6:25,
  g7:270, g2:155, g3:35, g4:70, g5:135, g6:0,
  f1:225, f2:0, f3:110, f9:200, f5:15, f6:40, f7:45, f8:0
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
  app.runSession(load, topOfRange, 3, fb); // legs, leg press topped out at 270
  for (let i = 0; i < 3; i++) app.runSession(load, topOfRange, 3, fb); // full, push, pull
  eq(app.api().ctx().day.id, "legs", "back around to legs");
  eq(app.api().ctx().targets.g7.weight, 280, "leg press +10");
});

check("a retired lift does not hand its loads to whatever replaced it", () => {
  const app = boot();
  const { state, ctx, DAYS } = app.api();
  const legs = DAYS.filter((d) => d.id === "legs")[0];
  const pull = DAYS.filter((d) => d.id === "pull")[0];
  ok(!legs.exercises.some((e) => e.id === "g1"), "the squat is off the program");
  eq(legs.exercises[0].id, "g7", "leg press took the slot");
  ok(!pull.exercises.some((e) => e.id === "l1"), "the pull-up is off the program");
  eq(pull.exercises[0].id, "l7", "lat pulldown took the slot");

  // the pulldown must not inherit a pull-up's rep count either
  state.history.push({
    ts: 0, block: 1, week: 1, dayId: "pull", deload: false,
    sets: { l1: [{ w: "0", r: "12", done: true }] }, rir: { l1: 2 }, feedback: {}
  });
  state.index = 1;
  eq(ctx().targets.l7.weight, null, "pulldown starts by picking a load");
  eq(ctx().targets.l7.reps, 6, "at the bottom of its range, not the pull-up's 13");
  state.history.length = 0;

  // a log from back when the squat was programmed
  state.history.push({
    ts: 0, block: 1, week: 1, dayId: "legs", deload: false,
    sets: { g1: [{ w: "185", r: "8", done: true }] }, rir: { g1: 3 }, feedback: {}
  });
  state.index = 2; // legs
  eq(ctx().targets.g7.weight, null, "leg press starts from scratch, not from 185");
  eq(ctx().targets.g1 === undefined, true, "and nothing prescribes the squat any more");
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

check("bodyweight work progresses in reps and never asks for a load", () => {
  const { prescribe, DAYS } = boot().api();
  const dips = DAYS[3].exercises.filter((e) => e.id === "f2")[0]; // 8-12, bodyweight
  const log = (reps, rir) => [{
    deload: false, dayId: "full", sets: { f2: [{ w: "0", r: String(reps), done: true }] }, rir: { f2: rir }
  }];

  const first = prescribe(dips, 0, [], null);
  eq(first.weight, 0, "no load to pick, even on day one");
  eq(first.reps, 8, "start at the bottom of the range");

  const mid = prescribe(dips, 0, log(9, 2), null);
  eq([mid.weight, mid.reps], [0, 10], "inside the range: one more rep");

  // the old rule stalled reps at the top and told you to hang a plate on a belt
  const top = prescribe(dips, 0, log(12, 2), null);
  eq([top.weight, top.reps], [0, 13], "past the top of the range it keeps climbing");
  ok(!/belt|plate|lb/i.test(top.why), "and never mentions adding weight: " + top.why);

  const sore = prescribe(dips, 0, log(12, 2), 3);
  eq([sore.weight, sore.reps], [0, 12], "still sore repeats instead of adding");

  const dl = prescribe(dips, 16, log(12, 2), null); // week 5
  eq([dl.weight, dl.reps], [0, 8], "deload drops back to the bottom, still no load");
  ok(!/60%/.test(dl.why), "no talk of 60% of nothing: " + dl.why);
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

check("a set will not log without a weight behind it", () => {
  const app = boot();
  app.click({ a: "start" });
  app.click({ a: "toggle", ex: "p1", i: "0" });
  let row = app.api().state.draft.sets.p1[0];
  eq(row.done, false, "refused — there is nothing to record");
  eq(row.w, "", "and no zero invented on the lifter's behalf");

  app.type("p1", 0, "w", 135);
  app.click({ a: "toggle", ex: "p1", i: "0" });
  row = app.api().state.draft.sets.p1[0];
  eq(row.done, true, "logs once a weight is in");
  eq(row.r, "5", "reps prefilled from the target");
});

check("bodyweight movements log with no weight at all", () => {
  const app = boot();
  const { state } = app.api();
  state.index = 2; // legs, which carries the Hanging Leg Raise
  app.click({ a: "start" });
  app.click({ a: "toggle", ex: "g6", i: "0" });
  const row = app.api().state.draft.sets.g6[0];
  eq(row.done, true, "logged");
  eq(row.w, "0", "recorded as carrying nothing");
});

check("the top set's weight fills the rest when you leave the field", () => {
  const app = boot();
  app.click({ a: "start" });
  const rows = app.api().state.draft.sets.p1;

  app.type("p1", 0, "w", 135); // mid-typing: the rows below stay untouched
  eq(rows.map((r) => r.w), ["135", "", "", ""], "nothing flickers down while typing");

  app.fill("p1", 0, "w", 135);
  eq(rows.map((r) => r.w), rows.map(() => "135"), "leaving the field fills them for real");

  app.click({ a: "toggle", ex: "p1", i: "1" }); // set 2 logged at 135
  app.fill("p1", 0, "w", 140);
  eq(rows[1].w, "135", "a logged set keeps the weight it was logged with");
  eq(rows[2].w, "140", "the rest follow the top row");
  eq(rows[0].w, "140", "including the top row itself");

  app.fill("p1", 2, "w", 150); // a lower row is its own business
  eq(rows[3].w, "140", "leaving a lower row does not carry anything");
});

check("you can look ahead through the block and come back", () => {
  const app = boot();
  app.runSession(load, topOfRange, 3, () => ({ s: 1, p: 1, v: 1 })); // now on pull
  const { state, ctx } = app.api();
  const here = state.index;

  app.click({ a: "peeknext" });
  app.click({ a: "peeknext" });
  eq(state.index, here, "looking ahead does not move you");
  eq(ctx().day.id, "pull", "the live session is still the next one you owe");

  app.click({ a: "peekat", i: String(here + 5) }); // straight from the plan
  app.click({ a: "peektoday" });
  eq(state.index, here, "and coming back leaves you where you were");
});

check("a session you are only looking at cannot be logged", () => {
  const app = boot();
  app.click({ a: "peeknext" });
  app.click({ a: "start" });          // the button the home screen hides while peeking
  const { state } = app.api();
  eq(state.draft.index, 0, "the draft belongs to the live session, not the peeked one");

  // and the engine never hands a peeked index to anything that writes
  app.type("p1", 0, "w", 100);
  app.click({ a: "toggle", ex: "p1", i: "0" });
  eq(state.draft.sets.p1[0].w, "100", "logging still lands on the live session");
  eq(state.history.length, 0, "nothing committed by looking around");
});

check("looking ahead never runs off the end of the block", () => {
  const app = boot();
  const { state, ctx } = app.api();
  for (let i = 0; i < 40; i++) app.click({ a: "peeknext" });
  eq(state.index, 0, "still session 1");
  app.click({ a: "peekat", i: "999" });
  app.click({ a: "peektoday" });
  eq(ctx().idx, 0, "clamped, and home again");
});

/* Log every set of a session, handing each sheet to `onSheet`. */
function playSession(app, onSheet) {
  const { state, ctx } = app.api();
  app.click({ a: "start" });
  ctx().day.exercises.forEach((ex) => {
    state.draft.sets[ex.id].forEach((r, i) => {
      app.fill(ex.id, i, "w", 100);
      app.click({ a: "toggle", ex: ex.id, i: String(i) });
      while (app.api().ask) onSheet(app.api().ask);
    });
  });
}

check("the first set of a muscle asks how sore it got last time", () => {
  const app = boot();
  app.runSession(load, topOfRange, 3, () => ({ s: 1, p: 1, v: 1 })); // a push session on the books
  const { state } = app.api();
  state.index = 0; // back to push, so chest has a last time to ask about
  state.draft = null;

  app.click({ a: "start" });
  ok(!app.api().ask, "nothing asked before a set is logged");
  app.fill("p1", 0, "w", 135);
  app.click({ a: "toggle", ex: "p1", i: "0" });

  const q = app.api().ask;
  eq(q.m, "chest", "about the muscle just worked");
  eq(q.kinds, ["s"], "soreness only — the chest work is not finished yet");

  app.click({ a: "ask", m: "chest", k: "s", v: "2" });
  app.click({ a: "asksave" });
  ok(!app.api().ask, "sheet closes");
  eq(state.draft.fb.chest.s, 2, "and the answer is on the draft");
});

check("the last set of a muscle asks about pump and volume", () => {
  const app = boot();
  const { state, ctx } = app.api();
  app.click({ a: "start" }); // first ever session: no soreness to ask about
  const chest = ctx().day.exercises.filter((e) => e.muscle === "chest");
  const total = chest.reduce((a, ex) => a + state.draft.sets[ex.id].length, 0);

  let logged = 0;
  chest.forEach((ex) => {
    state.draft.sets[ex.id].forEach((r, i) => {
      app.fill(ex.id, i, "w", 100);
      app.click({ a: "toggle", ex: ex.id, i: String(i) });
      logged++;
      if (logged < total) ok(!app.api().ask, "nothing asked with chest sets still to do");
    });
  });

  const q = app.api().ask;
  eq([q.m, q.kinds], ["chest", ["p", "v"]], "pump and volume once the last chest set is in");
});

check("changing the number of sets asks about the volume again", () => {
  const app = boot();
  app.runSession(load, topOfRange, 3, () => ({ s: 1, p: 1, v: 1 }));
  const { state, ctx } = app.api();
  state.index = 0; // back to push, so chest has a soreness question too
  state.draft = null;
  app.click({ a: "start" });

  const chest = ctx().day.exercises.filter((e) => e.muscle === "chest");
  chest.forEach((ex) =>
    state.draft.sets[ex.id].forEach((r, i) => {
      app.fill(ex.id, i, "w", 100);
      app.click({ a: "toggle", ex: ex.id, i: String(i) });
      while (app.api().ask) {
        const q = app.api().ask;
        q.kinds.forEach((k) => app.click({ a: "ask", m: q.m, k: k, v: "1" }));
        app.click({ a: "asksave" });
      }
    })
  );
  eq(state.draft.fb.chest, { s: 1, p: 1, v: 1 }, "answered on the way through");

  app.click({ a: "addset", ex: "p1" });
  eq(state.draft.fb.chest, { s: 1, p: null, v: null }, "volume answers dropped, soreness kept");
  ok(!app.api().ask, "not asked until the extra set is actually done");

  const last = state.draft.sets.p1.length - 1;
  app.fill("p1", last, "w", 100);
  app.click({ a: "toggle", ex: "p1", i: String(last) });
  eq(app.api().ask.kinds, ["p", "v"], "asked again once the extra set is in");
  app.click({ a: "ask", m: "chest", k: "p", v: "2" });
  app.click({ a: "ask", m: "chest", k: "v", v: "2" });
  app.click({ a: "asksave" });

  app.click({ a: "dropset", ex: "p1" });
  eq(app.api().ask.kinds, ["p", "v"], "dropping one asks straight away, the rest being done");
});

check("answering as you go leaves nothing for the end screen", () => {
  const app = boot();
  playSession(app, (q) => {
    q.kinds.forEach((k) => app.click({ a: "ask", m: q.m, k: k, v: "1" }));
    app.click({ a: "asksave" });
  });
  app.click({ a: "finish" });

  eq(app.api().state.draft, null, "committed on the spot");
  eq(app.api().view, "summary", "straight to the summary, no feedback screen");
  eq(app.api().state.history[0].feedback.chest, { s: null, p: 1, v: 1 }, "answers reached history");
});

check("what you wave away is still asked at the end", () => {
  const app = boot();
  playSession(app, () => app.click({ a: "asklater" }));
  app.click({ a: "finish" });

  eq(app.api().view, "feedback", "the end screen catches the skipped questions");
  ok(app.api().state.draft, "session still open until they are answered");
  ["chest", "delts", "triceps"].forEach((m) => {
    app.click({ a: "fb", m: m, k: "p", v: "1" });
    app.click({ a: "fb", m: m, k: "v", v: "1" });
  });
  app.click({ a: "fbsave" });
  eq(app.api().state.history.length, 1, "and saving commits the session");
});

check("a session cannot be finished with sets outstanding", () => {
  const app = boot();
  const { state, ctx } = app.api();
  app.click({ a: "start" });

  app.click({ a: "finish" });
  ok(state.draft, "finishing does nothing with everything still to do");
  eq(state.history.length, 0, "and nothing reaches history");
  ok(app.api().html.indexOf("still to log") >= 0, "the button says what is left instead");

  // log all but the very last set
  const ids = ctx().day.exercises.map((e) => e.id);
  ids.forEach((id) =>
    state.draft.sets[id].forEach((r, i) => {
      app.fill(id, i, "w", 100);
      app.click({ a: "toggle", ex: id, i: String(i) });
      while (app.api().ask) app.click({ a: "asklater" });
    })
  );
  const lastId = ids[ids.length - 1];
  const lastI = state.draft.sets[lastId].length - 1;
  app.click({ a: "toggle", ex: lastId, i: String(lastI) }); // un-log one

  app.click({ a: "finish" });
  ok(state.draft, "one unlogged set is still one too many");

  app.click({ a: "toggle", ex: lastId, i: String(lastI) });
  app.click({ a: "finish" });
  eq(app.api().view, "feedback", "with every set in, finishing proceeds");
});

check("dropping the sets you are not doing unblocks the finish", () => {
  const app = boot();
  const { state, ctx } = app.api();
  app.click({ a: "start" });
  ctx().day.exercises.forEach((ex) => {
    // do one set of each, then drop the rest
    app.fill(ex.id, 0, "w", 100);
    app.click({ a: "toggle", ex: ex.id, i: "0" });
    while (app.api().ask) app.click({ a: "asklater" });
    while (state.draft.sets[ex.id].length > 1) app.click({ a: "dropset", ex: ex.id });
  });
  app.click({ a: "finish" });
  eq(app.api().view, "feedback", "a trimmed session is a complete one");
});

check("every exercise offers a video search", () => {
  const app = boot();
  app.click({ a: "start" });
  const { html, ctx } = app.api();
  ctx().day.exercises.forEach((ex) => {
    const url = "https://www.youtube.com/results?search_query=" + encodeURIComponent(ex.name);
    ok(html.indexOf('href="' + url + '"') >= 0, ex.name + " links to a search for itself");
  });
  ok(html.indexOf("Overhead%20Press") >= 0, "names are encoded, not pasted raw");
  ok(html.indexOf('rel="noopener noreferrer"') >= 0, "and open without handing over the opener");
  ok(html.indexOf('<a class="vid" target="_blank" data-a') < 0, "no data-a, so it never fires an action");
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
