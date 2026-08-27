/**
 * Headless regression tests for victor.html.
 *
 * The app is a single HTML file with no build step, so there is nothing to
 * import. This extracts the <script> body, stubs the handful of browser APIs
 * it touches, and drives it through whole cycles by firing the same synthetic
 * click/input events the real UI would.
 *
 *   node test-victor.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "victor.html"), "utf8");
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
var __lastBlob = null;
function Blob(parts){ __lastBlob = parts; }
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
function typeTest(id, val){
  __handlers.input({ target: {dataset:{t:id}, value:String(val)} });
}
/* typing then leaving the field, which is what carries a weight down */
function fill(exId, i, f, val){
  type(exId, i, f, val);
  __handlers.focusout({ target: {dataset:{ex:exId, i:String(i), f:f}, value:String(val)} });
}
/* Answer whatever sheet the session just opened, the way a thumb would. */
function answerSheet(answer){
  while (ask){
    ask.keys.forEach(function(k){ click({a:"ask", k:k, v:String(answer(k))}); });
    click({a:"asksave"});
  }
}
/**
 * Run one whole session.
 *   pickLoad(ex)        -> load to use when there is no target yet
 *   pickReps(ex,target) -> reps or seconds to log on every set
 *   answer(key)         -> 0..2 for each question the session asks
 */
function runSession(pickLoad, pickReps, answer){
  var c = ctx();
  click({a:"start"});
  c = ctx();
  c.exercises.forEach(function(ex){
    var t = c.targets[ex.id];
    state.draft.sets[ex.id].forEach(function(r, i){
      if (!loadless(ex)) fill(ex.id, i, "w", t.weight == null ? pickLoad(ex) : t.weight);
      type(ex.id, i, "r", pickReps(ex, t));
      click({a:"toggle", ex:ex.id, i:String(i)});
      answerSheet(answer);
    });
  });
  click({a:"finish"});
  /* a still-open draft means something went unanswered and the end screen asked */
  if (state.draft){
    c.questions.forEach(function(k){ click({a:"fbans", k:k, v:String(answer(k))}); });
    click({a:"fbsave"});
  }
  click({a:"summarydone"});
  return c;
}
return {
  click: click, type: type, fill: fill, typeTest: typeTest, runSession: runSession,
  api: function(){ return {
    state: state, ctx: ctx, ask: ask, view: view, html: app.innerHTML,
    roundLoad: roundLoad, platesPerSide: platesPerSide, prescribe: prescribe,
    lastPerformance: lastPerformance, levelRun: levelRun, critHits: critHits,
    startLevel: startLevel, straightArmCut: straightArmCut, skillBTrim: skillBTrim,
    pressCut: pressCut, cyclesPerMonth: cyclesPerMonth, questionsFor: questionsFor,
    restAdvice: restAdvice, nearCeiling: nearCeiling, plannedSets: plannedSets,
    exById: exById, slotOf: slotOf, cycleOf: cycleOf, loadless: loadless,
    SLOTS: SLOTS, SKILLS: SKILLS, SLOT_COUNT: SLOT_COUNT, DAY_MS: DAY_MS,
    CEILING_GAP: CEILING_GAP, ELBOW_DAYS: ELBOW_DAYS, CYCLE_FLOOR: CYCLE_FLOOR,
    timerLeft: timerLeft, timerPhase: timerPhase, timerStart: timerStart,
    timerPause: timerPause, timerResume: timerResume, timerToggle: timerToggle,
    timerReset: timerReset, timerSetDur: timerSetDur, timerBlank: timerBlank,
    fmtClock: fmtClock, TIMER_MAX: TIMER_MAX, TIMER_DEFAULT: TIMER_DEFAULT,
    TIMER_STEPS: TIMER_STEPS
  };},
  /* the alarm file itself, so the tone's position in it can be measured */
  wavFor: function(sec){ alarmSrc(sec); return __lastBlob[0]; }
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

/* A one-session history for one exercise, at one load. */
function log(exId, weight, reps, extra) {
  const row = {
    ts: 0, cycle: 1, slot: "push", fb: (extra && extra.fb) || {},
    sets: {}
  };
  row.sets[exId] = reps.map((r) => ({ w: String(weight), r: String(r), done: true }));
  return [row];
}

const STARTING = {
  p1: 135, p2: 50, p4: 15, p5: 60, p6: 50,
  u1: 25, u2: 115, u3: 60, u4: 15, u5: 50, u6: 30,
  g1: 185, g2: 155, g3: 40, g5: 45
};
const load = (ex) => (STARTING[ex.id] == null ? 20 : STARTING[ex.id]);
const topOfRange = (ex, t) => (ex.accum ? t.reps : Math.max(t.reps, ex.hi));
const clean = () => 0;

console.log("\nloading");

check("plate math off a 45 lb bar and a 25 lb EZ bar", () => {
  const { platesPerSide } = boot().api();
  const bb = { gear: "Barbell" }, ez = { gear: "EZ Bar" };
  eq(platesPerSide(bb, 45), null, "empty bar");
  eq(platesPerSide(bb, 135), "45", "135");
  eq(platesPerSide(bb, 225), "45 · 45", "225");
  eq(platesPerSide(ez, 25), null, "empty EZ bar");
  eq(platesPerSide(ez, 75), "25", "75 on the EZ bar is a 25 a side");
});

check("each implement snaps and floors at its own weight", () => {
  const { roundLoad } = boot().api();
  eq(roundLoad({ gear: "Barbell" }, 137.5), 140, "bars round to 5");
  eq(roundLoad({ gear: "Barbell" }, 20), 45, "and never go under the bar");
  eq(roundLoad({ gear: "EZ Bar" }, 10), 25, "the EZ bar floors at 25");
  eq(roundLoad({ gear: "Dumbbell" }, 51), 50, "dumbbells move in 2.5");
  eq(roundLoad({ gear: "Dumbbell" }, 52), 52.5, "up as well as down");
  eq(roundLoad({ gear: "Added" }, 0), 0, "an added load of nothing is a real answer");
  eq(roundLoad({ gear: "Added" }, -10), 0, "and it never goes negative");
});

console.log("\ndouble progression");

check("the load holds until every set reaches the top of the range", () => {
  const { prescribe, exById } = boot().api();
  const bench = exById("p1"); // 5-8

  const short = prescribe(bench, log("p1", 135, [8, 8, 7, 6]));
  eq([short.weight, short.reps], [135, 8], "one set short of the top: same load");
  ok(/8, 8, 7, 6/.test(short.why), "and it says what was logged: " + short.why);

  const all = prescribe(bench, log("p1", 135, [8, 8, 8, 8]));
  eq([all.weight, all.reps], [140, 5], "every set at the top: +5 and back to the bottom");
});

check("lower body moves in 10 lb steps", () => {
  const { prescribe, exById } = boot().api();
  const squat = exById("g1"); // 8-10, lower
  const up = prescribe(squat, log("g1", 185, [10, 10, 10]));
  eq([up.weight, up.reps], [195, 8], "squat +10");
  const rdl = prescribe(exById("g2"), log("g2", 155, [10, 10, 10]));
  eq(rdl.weight, 165, "RDL +10");
});

check("a session that misses the bottom of the range takes the load back down", () => {
  const { prescribe, exById } = boot().api();
  const bench = prescribe(exById("p1"), log("p1", 135, [4, 4, 3, 3]));
  eq([bench.weight, bench.reps], [130, 8], "every set under 5 reps: −5 lb");

  // a fixed prescription has no range to fall out of
  const flye = prescribe(exById("u4"), log("u4", 15, [14, 14, 14])); // 3 x 15
  eq(flye.weight, 15, "one rep short of a flat 15 repeats rather than backing off");
});

check("the plate ceiling stops the load and switches to tempo", () => {
  const { prescribe, exById, CEILING_GAP } = boot().api();
  const squat = exById("g1");
  const room = prescribe(squat, log("g1", 290, [10, 10, 10]), { plateLb: 300 });
  eq(room.weight, 300, "45 lb of room left, so it still climbs");
  ok(!room.tempo, "and no tempo yet");

  const tight = prescribe(squat, log("g1", 310, [10, 10, 10]), { plateLb: 300 });
  eq(tight.weight, 310, "within " + CEILING_GAP + " lb of everything you own: held");
  ok(tight.tempo, "flagged for a 3-second eccentric");
  ok(/3-second/.test(tight.why), "and it says so: " + tight.why);

  const more = prescribe(squat, log("g1", 310, [10, 10, 10]), { plateLb: 400 });
  eq(more.weight, 320, "buy more plates and it climbs again");
});

check("a first session picks a load and aims at the top of the range", () => {
  const { prescribe, exById } = boot().api();
  const first = prescribe(exById("p1"), []);
  eq(first.weight, null, "nothing prescribed until something is logged");
  eq(first.reps, 8, "the target is the top of the range");
  const chin = prescribe(exById("u1"), []);
  ok(/0 is a fine answer/.test(chin.why), "and a chin-up may be added-load zero: " + chin.why);
});

check("bodyweight and band work climbs to the top of its range and holds", () => {
  const { prescribe, exById } = boot().api();
  const nordic = exById("g4"); // 6-10, band / bodyweight
  eq(prescribe(nordic, []).reps, 6, "opens at the bottom");
  eq(prescribe(nordic, log("g4", 0, [7, 7, 7])).reps, 8, "adds one");
  const top = prescribe(nordic, log("g4", 0, [10, 10, 10]));
  eq(top.reps, 10, "and stops at the top rather than climbing forever");
  ok(/stricter/.test(top.why), "telling you what to do instead: " + top.why);

  const band = prescribe(exById("b4"), log("b4", 0, [10, 10, 10]));
  eq(band.reps, 10, "the band pulldown holds at 10");
  ok(/thicker band/.test(band.why), "and the progression is the band: " + band.why);
});

check("accumulated wall time chases the total, then the size of the pieces", () => {
  const { prescribe, exById } = boot().api();
  const wall = exById("k1"); // 60s across 3 sets
  eq(prescribe(wall, []).reps, 20, "20s a set makes 60");
  const short = prescribe(wall, log("k1", 0, [15, 15, 15])); // 45s, short
  eq(short.reps, 20, "still 60s to find");
  const made = prescribe(wall, log("k1", 0, [20, 20, 20])); // 60s exactly
  eq(made.reps, 25, "60s in the bank: same total, longer holds");
});

console.log("\nskill ladders");

check("skill reps climb past the top of the working range toward the criterion", () => {
  const { prescribe, exById, SKILLS } = boot().api();
  const hspu = exById("k2"); // 4 x 3-6, criterion 3 x 8
  eq(SKILLS.hspu.crit, 8, "the criterion sits above the working range");
  eq(prescribe(hspu, [], { level: 1, levelFrom: 0 }).reps, 3, "opens at the bottom");
  const on = prescribe(hspu, log("k2", 0, [6, 6, 5]), { level: 1, levelFrom: 0 });
  eq(on.reps, 7, "past the top of 3–6, because 8 is what earns the next step");
  ok(/Advance at 3 × 8/.test(on.why), "and it says what earns it: " + on.why);
});

check("a clean session at the criterion moves the position up and resets the reps", () => {
  const { levelRun, prescribe, exById } = boot().api();
  const hist = [
    { ts: 0, cycle: 1, slot: "skilla", fb: { "sk:hspu": 0 },
      sets: { k2: [8, 8, 8].map((r) => ({ w: "0", r: String(r), done: true })) } }
  ];
  const run = levelRun("hspu", hist, {});
  eq(run.level, 2, "three clean sets of 8 earns step 2");
  eq(run.from, 1, "and the position starts from the session after it");

  const next = prescribe(exById("k2"), hist, { level: run.level, levelFrom: run.from });
  eq(next.reps, 3, "reps start again at the bottom on the new step");
  ok(/Wall HSPU, back to wall/.test(next.position), "at the next position: " + next.position);
});

check("ragged holds the position and a breakdown gives one back", () => {
  const { levelRun } = boot().api();
  const session = (q) => ({
    ts: 0, cycle: 1, slot: "skilla", fb: { "sk:fl": q },
    sets: { k3: [15, 15, 15].map((r) => ({ w: "0", r: String(r), done: true })) }
  });
  eq(levelRun("fl", [session(0)], {}).level, 2, "clean at 3 × 15s moves up");
  eq(levelRun("fl", [session(1)], {}).level, 1, "ragged holds, criterion or not");
  eq(levelRun("fl", [session(0), session(0)], {}).level, 3, "twice clean, twice up");
  eq(levelRun("fl", [session(0), session(2)], {}).level, 1, "a session that broke down gives it back");
});

check("two exercises share one ladder but keep their own rep counts", () => {
  const { levelRun, prescribe, exById } = boot().api();
  // Skill A and Skill B both press. Only the ladder is shared.
  const hist = [
    { ts: 0, cycle: 1, slot: "skilla", fb: { "sk:hspu": 1 },
      sets: { k2: [6, 6, 6, 5].map((r) => ({ w: "0", r: String(r), done: true })) } },
    { ts: 0, cycle: 1, slot: "skillb", fb: { "sk:hspu": 1 },
      sets: { b2: [4, 4, 3].map((r) => ({ w: "0", r: String(r), done: true })) } }
  ];
  const run = levelRun("hspu", hist, {});
  eq(run.level, 1, "nothing clean at 8, so the position holds");
  eq(prescribe(exById("k2"), hist, { level: 1, levelFrom: 0 }).reps, 7, "Skill A picks up from its own 6");
  eq(prescribe(exById("b2"), hist, { level: 1, levelFrom: 0 }).reps, 5, "Skill B from its own 4, a rep behind");
});

check("the entry test decides where the handstand pushup ladder starts", () => {
  const { startLevel } = boot().api();
  eq(startLevel("hspu", {}), 1, "no tests: start at the pike pushup");
  eq(startLevel("hspu", { pike: [{ v: 12 }], c2w: [{ v: 20 }] }), 1, "hold under 30s: still step 1");
  eq(startLevel("hspu", { pike: [{ v: 5 }], c2w: [{ v: 45 }] }), 1, "under 8 pike reps: still step 1");
  eq(startLevel("hspu", { pike: [{ v: 8 }], c2w: [{ v: 30 }] }), 2, "8 reps and 30s: straight to the wall");
  eq(startLevel("fl", { pike: [{ v: 20 }] }), 1, "the front lever always starts in a tuck");
});

check("logging a test moves the ladder that reads it", () => {
  const app = boot();
  eq(app.api().ctx().levels.hspu.level, 1, "step 1 to begin with");
  app.click({ a: "nav", tab: "skills" });
  app.typeTest("pike", 10);
  app.click({ a: "logtest", t: "pike" });
  app.typeTest("c2w", 40);
  app.click({ a: "logtest", t: "c2w" });
  eq(app.api().ctx().levels.hspu.level, 2, "both entry marks cleared, so it opens on the wall");
  eq(app.api().state.tests.pike[0].v, 10, "and the test is on the record");
});

console.log("\nwhat the program cuts");

check("grumpy elbows halve the straight-arm sets for a week", () => {
  const app = boot();
  const { state, ctx, straightArmCut, DAY_MS, ELBOW_DAYS } = app.api();
  const now = Date.now();
  state.history.push({ ts: now, cycle: 1, slot: "skilla", sets: {}, fb: { elbow: 1 } });

  const cut = straightArmCut(state.history, now);
  ok(cut, "the cut is on");
  eq(cut.daysLeft, ELBOW_DAYS, "for a week");

  state.index = 3; // Skill A
  const c = ctx();
  eq(c.counts.k3, 3, "six front lever holds become three");
  eq(c.counts.k4, 2, "three tuck rows become two");
  eq(c.counts.k5, 3, "and the handstand shrugs, which are not straight-arm, are untouched");
  ok(c.exercises.some((e) => e.id === "k3"), "halved, never removed — tendons want reduced load, not zero");

  state.history[0].ts = now - (ELBOW_DAYS + 1) * DAY_MS;
  eq(straightArmCut(state.history, now), null, "and it expires on its own");
  eq(ctx().counts.k3, 6, "back to six holds");
});

check("heavy handstand work takes the cuttable press off Push", () => {
  const app = boot();
  const { state, ctx, pressCut } = app.api();
  state.history.push({ ts: Date.now(), cycle: 1, slot: "skilla", sets: {}, fb: { hsload: 2 } });
  ok(pressCut(state.history), "the press is cut");
  eq(ctx().slot.id, "push", "and the live session is a push session");
  ok(!ctx().exercises.some((e) => e.id === "p6"), "the seated dumbbell press is gone");
  ok(ctx().exercises.some((e) => e.id === "p1"), "the bench is not");

  state.history.push({ ts: Date.now(), cycle: 1, slot: "skillb", sets: {}, fb: { hsload: 1 } });
  ok(ctx().exercises.some((e) => e.id === "p6"), "reporting it normal brings the press back");
});

check("a retired lift does not hand its loads to whatever replaced it", () => {
  const app = boot();
  const { state, ctx, exById, SLOTS } = app.api();
  const push = SLOTS[0];
  ok(!push.exercises.some((e) => e.id === "p3"), "the standing press is off the program");
  ok(push.exercises.some((e) => e.id === "p6"), "the seated dumbbell press took the slot");
  ok(exById("p3"), "but it is still readable, so Progress keeps its curve");
  eq(exById("p6").gear, "Dumbbell", "and the replacement is its own movement");

  // a log from back when the standing press was programmed
  state.history.push({
    ts: 0, cycle: 1, slot: "push", fb: {},
    sets: { p3: [{ w: "95", r: "8", done: true }] }
  });
  eq(ctx().targets.p6.weight, null, "the dumbbells start by picking a load, not from 95");
  eq(ctx().targets.p3, undefined, "and nothing prescribes the standing press any more");
});

check("Skill B is what gives, and it gives for two reasons", () => {
  const app = boot();
  const { state, ctx, skillBTrim, cyclesPerMonth, DAY_MS, CYCLE_FLOOR } = app.api();
  const now = Date.now();
  eq(skillBTrim([], now), null, "nothing to cut with no history");

  state.history.push({ ts: now, cycle: 1, slot: "legs", sets: {}, fb: { legs: 2 } });
  ok(skillBTrim(state.history, now), "legs went to mush");

  state.index = 4; // Skill B
  const c = ctx();
  eq(c.exercises.map((e) => e.id), ["b1"], "practice only: wall holds and kick-ups");
  eq(c.questions.indexOf("elbow"), -1, "and it stops asking about elbows it never loaded");
  ok(c.questions.indexOf("balance") >= 0, "balance is still worth knowing");

  // a slow month does it too, on its own
  const slow = [];
  for (let i = 0; i < 12; i++) slow.push({ ts: now - (40 - i * 3) * DAY_MS, cycle: 1, slot: "push", sets: {}, fb: {} });
  ok(cyclesPerMonth(slow, now) < CYCLE_FLOOR, "under four cycles a month");
  ok(skillBTrim(slow, now), "so Skill B is cut back rather than resting more");
});

check("cycles a month says nothing until there is enough log to say it", () => {
  const { cyclesPerMonth, DAY_MS, SLOT_COUNT } = boot().api();
  const now = Date.now();
  eq(cyclesPerMonth([], now), null, "no history");
  eq(cyclesPerMonth([{ ts: now - 5 * DAY_MS }], now), null, "five days in is not a rate");
  const busy = [];
  for (let i = 0; i < 25; i++) busy.push({ ts: now - (30 - i) * DAY_MS });
  eq(cyclesPerMonth(busy, now), 25 / SLOT_COUNT, "25 sessions in the last month is five cycles");
});

check("the rest day rules land on the right slots", () => {
  const { restAdvice, SLOTS } = boot().api();
  const now = Date.now();
  const heads = (abs, hist) => restAdvice(abs, hist || [], now).map((n) => n.head).join(" | ");
  eq(SLOTS[3].id, "skilla", "slot 4 is Skill A");
  ok(/Rest here/.test(heads(3)), "the gap the program wants opened is before Skill A");
  ok(!/Rest here/.test(heads(0)), "and not before Push");

  const off = [{ ts: now, cycle: 1, slot: "skilla", sets: {}, fb: { balance: 2 } }];
  ok(/Take a rest day/.test(heads(4, off)), "balance off puts a rest day before Skill B");
  const solid = [{ ts: now, cycle: 1, slot: "skilla", sets: {}, fb: { balance: 0 } }];
  ok(!/Take a rest day/.test(heads(4, solid)), "solid balance does not");
});

check("questions are derived from what the session actually contained", () => {
  const { questionsFor, SLOTS } = boot().api();
  const q = (i) => questionsFor(SLOTS[i].exercises, SLOTS[i]);
  eq(q(0), ["elbow"], "push asks about elbows, because skullcrushers are on it");
  eq(q(1), ["elbow"], "pull loads the elbows too and nothing else worth asking");
  eq(q(2), ["legs"], "legs asks about legs");
  eq(q(3), ["sk:hspu", "sk:fl", "balance", "hsload", "elbow"], "skill A asks the lot");
  eq(q(4), ["sk:hspu", "sk:fl", "balance", "hsload", "elbow"], "so does skill B");
});

console.log("\nthe cycle");

check("five slots roll forward and the cycle count follows", () => {
  const { slotOf, cycleOf, SLOT_COUNT } = boot().api();
  eq(SLOT_COUNT, 5, "five slots");
  eq([0, 1, 2, 3, 4, 5, 9, 10].map((i) => slotOf(i).id),
    ["push", "pull", "legs", "skilla", "skillb", "push", "skillb", "push"], "and they roll");
  eq([0, 4, 5, 9, 10].map(cycleOf), [1, 1, 2, 2, 3], "cycle boundaries");
});

check("a full cycle of sessions lands in history in order", () => {
  const app = boot();
  for (let i = 0; i < 5; i++) app.runSession(load, topOfRange, clean);
  const { state, ctx } = app.api();
  eq(state.history.map((h) => h.slot), ["push", "pull", "legs", "skilla", "skillb"], "one of each");
  eq(state.index, 5, "and you are back at the top");
  eq(ctx().slot.id, "push", "on push");
  eq(ctx().cycle, 2, "in cycle 2");
});

check("a cycle of topped-out sessions moves every load", () => {
  const app = boot();
  for (let i = 0; i < 5; i++) app.runSession(load, topOfRange, clean);
  app.runSession(load, topOfRange, clean); // push again
  const { state } = app.api();
  const second = state.history[5];
  eq(second.sets.p1[0].w, "140", "bench went up 5");
  const legs = state.history[2];
  eq(legs.sets.g1[0].w, String(STARTING.g1), "squat opened where it was told to");
  const app2 = boot();
  for (let i = 0; i < 7; i++) app2.runSession(load, topOfRange, clean); // back around to legs
  eq(app2.api().ctx().targets.g1.weight, STARTING.g1 + 10, "and comes back 10 heavier");
});

check("three clean skill sessions walk the front lever up the ladder", () => {
  const app = boot();
  const { state } = app.api();
  state.index = 3; // Skill A
  // hold everything at 15s, rate it clean: the criterion is 3 sets at 15s
  app.runSession(load, (ex) => (ex.time ? 15 : 8), clean);
  eq(app.api().ctx().levels.fl.level, 2, "front lever to advanced tuck");
  eq(app.api().ctx().levels.hspu.level, 2, "and the press to the wall, 3 sets of 8 being clean");
  eq(app.api().state.index, 4, "on to Skill B");
  app.runSession(load, (ex) => (ex.time ? 15 : 8), clean);
  eq(app.api().ctx().levels.fl.level, 3, "Skill B counts toward the same ladder");
});

console.log("\nrest timer");

check("a rest is a value read off the clock, not a countdown", () => {
  const { timerLeft, timerPhase, timerBlank, timerStart } = boot().api();
  const t0 = 1_000_000;
  const idle = timerBlank(120);
  eq([timerLeft(idle, t0), timerPhase(idle, t0)], [120, "idle"], "idle sits at its duration");

  const run = timerStart(idle, t0);
  eq(timerPhase(run, t0), "running", "started");
  eq(timerLeft(run, t0 + 30_000), 90, "thirty seconds later, ninety left");
  eq(timerLeft(run, t0 + 119_000), 1, "one to go");
  eq(timerPhase(run, t0 + 120_000), "over", "and then it is over");
  eq(timerPhase(run, t0 + 900_000), "over", "still over an hour later, not wrapped around");
  // the display never shows a negative, but the value knows
  ok(timerLeft(run, t0 + 130_000) < 0, "the overrun is real");
  eq(fmt(boot().api(), -10), "0:00", "the clock floors at zero");
});

function fmt(api, v){ return api.fmtClock(v); }

check("the clock reads in minutes and seconds", () => {
  const { fmtClock } = boot().api();
  eq([45, 60, 90, 120, 300, 605].map(fmtClock), ["0:45", "1:00", "1:30", "2:00", "5:00", "10:05"]);
});

check("pause holds the seconds served and resume carries on from them", () => {
  const { timerStart, timerPause, timerResume, timerLeft, timerPhase, timerBlank } = boot().api();
  const t0 = 1_000_000;
  const run = timerStart(timerBlank(120), t0);
  const held = timerPause(run, t0 + 45_000);

  eq(timerPhase(held, t0 + 45_000), "paused", "paused");
  eq(timerLeft(held, t0 + 45_000), 75, "75 left");
  eq(timerLeft(held, t0 + 600_000), 75, "and it stays 75 however long you stand there");

  const back = timerResume(held, t0 + 600_000);
  eq(timerLeft(back, t0 + 600_000), 75, "resuming does not lose them");
  eq(timerLeft(back, t0 + 610_000), 65, "and it runs again from there");
});

check("changing the duration keeps the seconds already rested", () => {
  const { timerStart, timerSetDur, timerLeft, timerBlank, TIMER_MAX } = boot().api();
  const t0 = 1_000_000;
  const run = timerStart(timerBlank(120), t0);
  const longer = timerSetDur(run, 180);
  eq(timerLeft(longer, t0 + 40_000), 140, "40s in, switching to 3:00 leaves 2:20 — not a fresh 3:00");

  const shorter = timerSetDur(run, 45);
  ok(timerLeft(shorter, t0 + 60_000) <= 0, "and shortening below what you have rested ends it");

  eq(timerSetDur(run, 9999).dur, TIMER_MAX, "durations are capped");
  eq(timerSetDur(run, 1).dur, 5, "and floored");
});

check("a tap on a finished rest starts the next one", () => {
  const { timerStart, timerToggle, timerPhase, timerLeft, timerReset, timerBlank } = boot().api();
  const t0 = 1_000_000, over = t0 + 200_000;
  const done = timerStart(timerBlank(120), t0);
  eq(timerPhase(done, over), "over", "this one is spent");

  const next = timerToggle(done, over);
  eq(timerPhase(next, over), "running", "tapping play starts a fresh rest");
  eq(timerLeft(next, over), 120, "at the full duration, not at zero");

  const cleared = timerReset(next);
  eq([timerPhase(cleared, over), timerLeft(cleared, over)], ["idle", 120], "reset puts it back");
  eq(cleared.dur, 120, "keeping the duration you chose");
});

check("logging a set starts the rest, un-logging leaves it alone", () => {
  const app = boot();
  const { state, ctx } = app.api();
  eq(app.api().state.timer.startedAt, null, "nothing running to begin with");

  app.type("p1", 0, "w", 135);
  app.click({ a: "start" });
  app.type("p1", 0, "w", 135);
  app.click({ a: "toggle", ex: "p1", i: "0" });
  ok(app.api().state.timer.startedAt, "checking a set off starts the rest");
  eq(app.api().timerPhase(app.api().state.timer, Date.now()), "running", "and it is running");

  const started = app.api().state.timer.startedAt;
  app.click({ a: "toggle", ex: "p1", i: "0" }); // un-log it
  eq(app.api().state.timer.startedAt, started, "un-checking does not restart anything");
});

check("play, pause and reset are on the bar", () => {
  const app = boot();
  app.click({ a: "start" });
  app.click({ a: "tplay" });
  eq(app.api().timerPhase(app.api().state.timer, Date.now()), "running", "play starts it");
  app.click({ a: "tplay" });
  eq(app.api().state.timer.startedAt, null, "and pauses it — nothing is counting");
  app.click({ a: "treset" });
  eq(app.api().timerPhase(app.api().state.timer, Date.now()), "idle", "reset clears it");

  app.click({ a: "tdur", v: "180" });
  eq(app.api().state.timer.dur, 180, "and the duration chips set the duration");
});

check("finishing the session clears the rest behind it", () => {
  const app = boot();
  app.runSession(load, topOfRange, clean);
  eq(app.api().state.timer.startedAt, null, "nothing left running once a session is committed");
  eq(app.api().state.timer.dur, 120, "but the duration you chose is still yours");
});

check("the timer bar is in the session header and nowhere else", () => {
  const app = boot();
  ok(app.api().html.indexOf('id="tmr"') < 0, "not on the home screen");
  app.click({ a: "start" });
  const h = app.api().html;
  ok(h.indexOf('id="tmr"') >= 0, "on the open session");
  ok(h.indexOf('id="t-clock"') >= 0, "with a clock the tick can write into");
  ok(h.indexOf('data-a="tplay"') >= 0 && h.indexOf('data-a="treset"') >= 0, "play and reset");
  ok(h.indexOf('data-a="tdur" data-v="120"') >= 0, "and every duration on offer");
  ok(h.indexOf("</header>") > h.indexOf('id="tmr"'), "inside the sticky header, so it stays in reach");

  app.click({ a: "nav", tab: "plan" });
  ok(app.api().html.indexOf('id="tmr"') < 0, "and not on the other tabs");
});

check("the alarm file is the rest in silence, then the tone", () => {
  const app = boot();
  const RATE = 8000, TAIL = 4;
  const buf = app.wavFor(90);
  const dv = new DataView(buf);
  const str = (o, n) => String.fromCharCode(...new Uint8Array(buf, o, n));

  eq([str(0, 4), str(8, 4)], ["RIFF", "WAVE"], "it is a wav");
  eq(dv.getUint32(24, true), RATE, "8 kHz");
  eq(dv.getUint16(34, true), 16, "16-bit");
  eq(dv.getUint16(22, true), 1, "mono");

  const samples = dv.getUint32(40, true) / 2;
  eq(samples, (90 + TAIL) * RATE, "90 seconds of rest and then the alarm");
  eq(buf.byteLength, 44 + samples * 2, "and the header agrees with the body");

  // the lead-in is inaudible, the tail is not
  let leadPeak = 0, tailPeak = 0;
  for (let i = 0; i < 90 * RATE; i += 37) leadPeak = Math.max(leadPeak, Math.abs(dv.getInt16(44 + i * 2, true)));
  for (let i = 90 * RATE; i < samples; i += 7) tailPeak = Math.max(tailPeak, Math.abs(dv.getInt16(44 + i * 2, true)));
  ok(leadPeak <= 2, "the rest itself is 84 dB down — real audio, but nothing you can hear");
  ok(tailPeak > 8000, "and the alarm at the end is not, got " + tailPeak);

  eq(new DataView(app.wavFor(0)).getUint32(40, true) / 2, TAIL * RATE, "a zero rest is the tone alone");
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

check("a set will not log without a load behind it", () => {
  const app = boot();
  app.click({ a: "start" });
  app.click({ a: "toggle", ex: "p1", i: "0" });
  let row = app.api().state.draft.sets.p1[0];
  eq(row.done, false, "refused — there is nothing to record");
  eq(row.w, "", "and no zero invented on the lifter's behalf");

  app.type("p1", 0, "w", 135);
  app.click({ a: "toggle", ex: "p1", i: "0" });
  row = app.api().state.draft.sets.p1[0];
  eq(row.done, true, "logs once a load is in");
  eq(row.r, "8", "reps prefilled from the target");
});

check("bodyweight work logs with no load at all", () => {
  const app = boot();
  const { state } = app.api();
  state.index = 3; // Skill A
  app.click({ a: "start" });
  app.click({ a: "toggle", ex: "k3", i: "0" }); // front lever hold
  const row = app.api().state.draft.sets.k3[0];
  eq(row.done, true, "logged");
  eq(row.w, "0", "recorded as carrying nothing");
  eq(row.r, "8", "at the target hold");
});

check("a weighted chin-up may be logged at zero added", () => {
  const app = boot();
  const { state } = app.api();
  state.index = 1; // pull
  app.click({ a: "start" });
  app.type("u1", 0, "w", 0);
  app.click({ a: "toggle", ex: "u1", i: "0" });
  eq(app.api().state.draft.sets.u1[0].done, true, "zero is a real answer, not an empty field");
});

check("the top set's weight fills the rest when you leave the field", () => {
  const app = boot();
  app.click({ a: "start" });
  const rows = app.api().state.draft.sets.p1;

  app.type("p1", 0, "w", 135); // mid-typing: the rows below stay untouched
  eq(rows.map((r) => r.w), ["135", "", "", ""], "nothing flickers down while typing");

  app.fill("p1", 0, "w", 135);
  eq(rows.map((r) => r.w), rows.map(() => "135"), "leaving the field fills them for real");

  app.click({ a: "toggle", ex: "p1", i: "1" });
  app.fill("p1", 0, "w", 140);
  eq(rows[1].w, "135", "a logged set keeps the weight it was logged with");
  eq(rows[2].w, "140", "the rest follow the top row");
});

check("per-set placeholders come from what you did last time", () => {
  const app = boot();
  app.runSession(load, (ex, t) => (ex.id === "p1" ? 6 : topOfRange(ex, t)), clean);
  const { state, ctx } = app.api();
  state.index = 0; // back to push
  eq(ctx().targets.p1.lastReps, [6, 6, 6, 6], "the whole row is carried, not a best");
  app.click({ a: "start" });
  app.type("p1", 0, "w", 135);
  app.click({ a: "toggle", ex: "p1", i: "0" });
  eq(app.api().state.draft.sets.p1[0].r, "6", "and an empty field logs what you did before");
});

check("a session cannot be finished with sets outstanding", () => {
  const app = boot();
  const { state, ctx } = app.api();
  app.click({ a: "start" });

  app.click({ a: "finish" });
  ok(state.draft, "finishing does nothing with everything still to do");
  eq(state.history.length, 0, "and nothing reaches history");
  ok(app.api().html.indexOf("still to log") >= 0, "the button says what is left instead");

  const ids = ctx().exercises.map((e) => e.id);
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
  state.index = 2; // legs, which does ask a question
  app.click({ a: "start" });
  ctx().exercises.forEach((ex) => {
    app.fill(ex.id, 0, "w", 100);
    app.click({ a: "toggle", ex: ex.id, i: "0" });
    while (app.api().ask) app.click({ a: "asklater" });
    while (state.draft.sets[ex.id].length > 1) app.click({ a: "dropset", ex: ex.id });
  });
  app.click({ a: "finish" });
  eq(app.api().view, "feedback", "a trimmed session is a complete one");
});

check("the skill question arrives when that skill's work is done, not at the end", () => {
  const app = boot();
  const { state, ctx } = app.api();
  state.index = 3; // Skill A
  app.click({ a: "start" });

  const press = ctx().exercises.filter((e) => e.skill === "hspu");
  const total = press.reduce((a, ex) => a + state.draft.sets[ex.id].length, 0);
  let logged = 0;
  press.forEach((ex) => {
    state.draft.sets[ex.id].forEach((r, i) => {
      app.click({ a: "toggle", ex: ex.id, i: String(i) });
      logged++;
      if (logged < total) ok(!app.api().ask, "nothing asked with press sets still to do");
    });
  });
  eq(app.api().ask.keys, ["sk:hspu"], "asked the moment the last one is in");
  app.click({ a: "ask", k: "sk:hspu", v: "0" });
  app.click({ a: "asksave" });
  eq(state.draft.fb["sk:hspu"], 0, "and the answer is on the draft, where a reload keeps it");
});

check("changing the number of sets asks about that skill again", () => {
  const app = boot();
  const { state, ctx } = app.api();
  state.index = 3;
  app.click({ a: "start" });
  ctx().exercises.filter((e) => e.skill === "hspu").forEach((ex) => {
    state.draft.sets[ex.id].forEach((r, i) => {
      app.click({ a: "toggle", ex: ex.id, i: String(i) });
      while (app.api().ask) {
        app.api().ask.keys.forEach((k) => app.click({ a: "ask", k: k, v: "0" }));
        app.click({ a: "asksave" });
      }
    });
  });
  eq(state.draft.fb["sk:hspu"], 0, "answered on the way through");

  app.click({ a: "addset", ex: "k2" });
  eq(state.draft.fb["sk:hspu"], null, "the answer described a set count that no longer happened");
  ok(!app.api().ask, "not asked again until the extra set is actually done");

  const last = state.draft.sets.k2.length - 1;
  app.click({ a: "toggle", ex: "k2", i: String(last) });
  eq(app.api().ask.keys, ["sk:hspu"], "asked again once it is in");
});

check("what you wave away is caught by the end screen", () => {
  const app = boot();
  const { state, ctx } = app.api();
  state.index = 3;
  app.click({ a: "start" });
  ctx().exercises.forEach((ex) =>
    state.draft.sets[ex.id].forEach((r, i) => {
      app.click({ a: "toggle", ex: ex.id, i: String(i) });
      while (app.api().ask) app.click({ a: "asklater" });
    })
  );
  app.click({ a: "finish" });
  eq(app.api().view, "feedback", "the end screen catches the skipped questions");
  ok(state.draft, "session still open until they are answered");
  app.click({ a: "fbsave" });
  ok(app.api().state.draft, "and saving does nothing while any are unanswered");

  ["sk:hspu", "sk:fl", "balance", "hsload", "elbow"].forEach((k) => app.click({ a: "fbans", k: k, v: "1" }));
  app.click({ a: "fbsave" });
  eq(app.api().state.history.length, 1, "answered, it commits");
  eq(app.api().state.history[0].fb.balance, 1, "with the answers on the record");
});

check("you can look ahead through the cycle and come back", () => {
  const app = boot();
  app.runSession(load, topOfRange, clean); // now on pull
  const { state, ctx } = app.api();
  const here = state.index;

  app.click({ a: "peeknext" });
  app.click({ a: "peeknext" });
  eq(state.index, here, "looking ahead does not move you");
  eq(ctx().slot.id, "pull", "the live session is still the next one you owe");

  app.click({ a: "peekat", i: String(here + 3) });
  app.click({ a: "peektoday" });
  eq(state.index, here, "and coming back leaves you where you were");

  for (let i = 0; i < 20; i++) app.click({ a: "peeknext" });
  app.click({ a: "peektoday" });
  eq(ctx().slot.id, "pull", "peeking is clamped to the cycle in front of you");
});

check("a session you are only looking at cannot be logged", () => {
  const app = boot();
  app.click({ a: "peeknext" });
  app.click({ a: "start" });
  const { state } = app.api();
  eq(state.draft.index, 0, "the draft belongs to the live session, not the peeked one");
  app.type("p1", 0, "w", 100);
  app.click({ a: "toggle", ex: "p1", i: "0" });
  eq(state.draft.sets.p1[0].w, "100", "logging still lands on the live session");
  eq(state.history.length, 0, "nothing committed by looking around");
});

check("an open session keeps its shape even if the program changes underneath", () => {
  const app = boot();
  const { state, ctx } = app.api();
  state.index = 3;
  app.click({ a: "start" });
  const before = ctx().exercises.length;
  // an elbow report lands mid-session; the sets already on screen do not move
  state.history.push({ ts: Date.now(), cycle: 1, slot: "pull", sets: {}, fb: { elbow: 1 } });
  eq(ctx().exercises.length, before, "same exercises");
  eq(ctx().counts.k3, 6, "and the same six holds it was started with");
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
  ok(html.indexOf("Bench%20Press") >= 0, "names are encoded, not pasted raw");
  ok(html.indexOf('rel="noopener noreferrer"') >= 0, "and open without handing over the opener");
});

check("every screen renders without throwing", () => {
  const app = boot();
  for (let i = 0; i < 5; i++) app.runSession(load, topOfRange, clean);
  ["skills", "progress", "plan", "settings", "cycle"].forEach((t) => app.click({ a: "nav", tab: t }));
  app.click({ a: "nav", tab: "progress" });
  app.click({ a: "selex", ex: "k3" });
  app.click({ a: "selex", ex: "p1" });
  app.click({ a: "nav", tab: "cycle" });
  app.click({ a: "start" });
  app.click({ a: "why", ex: "p1" });
  ok(app.api().html.indexOf("Target") >= 0, "the session screen has targets on it");
});

check("the plate ceiling is a setting you can move", () => {
  const app = boot();
  app.click({ a: "nav", tab: "settings" });
  const start = app.api().state.plates;
  app.click({ a: "plates", v: "25" });
  eq(app.api().state.plates, start + 25, "plates went up");
  app.click({ a: "plates", v: "-25" });
  eq(app.api().state.plates, start, "and back down");
});

check("erasing returns to cycle 1, slot 1", () => {
  const app = boot();
  app.runSession(load, topOfRange, clean);
  app.click({ a: "nav", tab: "settings" });
  app.click({ a: "erase-ask" });
  app.click({ a: "erase-yes" });
  const { state, ctx } = app.api();
  eq(state.history.length, 0, "history cleared");
  eq(ctx().cycle, 1, "cycle 1");
  eq(ctx().slot.id, "push", "slot 1");
  eq(state.tests, {}, "and the baseline tests with it");
});

console.log(
  "\n" + (failures ? failures + " failing check" + (failures === 1 ? "" : "s") : "all checks passed") + "\n"
);
process.exit(failures ? 1 : 0);
