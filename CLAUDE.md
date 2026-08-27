# periodization

Two single-file workout trackers, deployed together to GitHub Pages from the repo root.

| App | File | Program |
| --- | --- | --- |
| **PPL Block** | `indie.html` | 4-day Push / Pull / Legs / Full Body split on five-week blocks, RP-style autoregulation. |
| **Rolling Five** | `victor.html` | 5-slot rolling cycle — push, pull, legs, and two skill days for the handstand pushup and front lever. |

They share nothing at runtime: separate files, separate `localStorage` keys, separate manifests,
separate home-screen installs. They share the constraints below and the deployment.

## Files

| File | Role |
| --- | --- |
| `indie.html` | PPL Block, entire. No dependencies, no build step. |
| `victor.html` | Rolling Five, entire. Same rules. |
| `index.html` | Site root. Offers both apps; installs go straight to the app files. |
| `sw.js` | Service worker for the hosted copies. Network first, cache fallback, both apps in the shell. |
| `manifest.webmanifest` | PWA manifest for PPL Block. Icons are inline data URIs. |
| `victor.webmanifest` | PWA manifest for Rolling Five. |
| `.nojekyll` | Keeps Pages from running the files through Jekyll. |
| `.github/workflows/test.yml` | `node test.mjs` and `node test-victor.mjs` on pushes and pull requests. |
| `test.mjs` | PPL Block regression suite. No test framework. |
| `test-victor.mjs` | Rolling Five regression suite. Same harness, same style. |
| `CLAUDE.md` | This file. |

## Hard constraints

These are not preferences, and they apply to both apps. Breaking any of them breaks the
deployment model.

1. **One file.** Each app ships as a single artifact: inline CSS, inline JS, base64 icons.
   No npm, no bundler, no CDN. It must run correctly when opened directly from disk — that is the
   test for whether a change belongs in the file or beside it. The service worker and the two
   manifests are the only siblings, they exist purely for the hosted copies, and each app degrades
   cleanly to its inline fallbacks when they are missing. Do not grow that list, and do not start
   sharing code between the two apps — a shared file is a second file.
2. **No framework.** Vanilla ES5-flavoured JS, `var` and `function`, so it parses on old
   WebKit without transpilation. Do not introduce React, JSX, or module syntax.
3. **Pounds only.** 45 lb bar, plates down to 2.5. Every prescribed load passes through
   `roundLoad()` so it is always something you can actually build on a US rack.
4. **The engine is pure.** Everything in the `ENGINE` banner takes arguments and returns values.
   It touches no DOM, no globals, no clock — anything time-dependent takes `now` as an argument.
   This is what makes the test suites possible — keep new logic on that side of the line.
5. **History is the source of truth.** Set counts and loads are *derived* from `state.history`
   on every render, never cached in state. `setCountsForDay` replays feedback from scratch each
   time. Do not add a mutable `plan` object; it will drift.

# PPL Block (`indie.html`)

## Layout of `indie.html`

Section banners in the script mark the regions:

- `PROGRAM` — `DAYS`, the hardcoded workout. Exercise ids (`p1`, `l3`, `g2`, `f7`) are the
  primary key for everything and appear in saved history. **Never renumber or reuse an id**;
  doing so silently rewrites a user's training log. Add new exercises with fresh ids.
  Swapping a movement out is the same rule: give the replacement a fresh id and move the old
  definition to `RETIRED`, which is off the program but still read by Progress so the old lift
  keeps its curve. Three are in there: `g1` Back Squat (replaced by `g7` Leg Press), `l1`
  Pull-Up (by `l7` Lat Pulldown), and `f4` Leg Press (by `f9` Hack Squat). Set counts survive a
  swap on their own, because they are tracked per muscle rather than per exercise.
- `ENGINE` — the pure progression logic. See below.
- `STORAGE` — `localStorage` under key `ppl-block-v1`, with an in-memory fallback when storage
  is blocked (private browsing, some `file://` contexts). Never let a storage failure throw.
- `STATE` — the single `state` object plus `ctx(absIndex)`, which computes a session's day, week,
  set counts, and targets. Called with no argument it describes the live session; called with an
  absolute index it describes any session, which is what browsing the block uses.
- `VIEWS` — each screen is a function returning an HTML string.
- `RENDER` — `render(keepScroll)` replaces `#app.innerHTML` wholesale.
- `ACTIONS` — one delegated `click` listener keyed on `data-a`, plus delegated `input` and
  `focusout` listeners for the set fields.
- `PWA` — `beforeinstallprompt`, plus an `ONDISK` split: served over http(s) the page uses the
  real `manifest.webmanifest` linked in `<head>` and registers `sw.js`; opened from `file://`
  that link 404s, so it builds the manifest as a blob instead and registers nothing.

### Render discipline

Re-rendering blows away focus and dismisses the keyboard. Therefore:

- The `input` handler writes into `state.draft` and **never** calls `render()`.
- Everything else re-renders; taps that happen mid-session pass `render(true)` to preserve
  scroll position.

If you add a control that lives near a text field, keep it on the no-render path or the user
loses their keyboard mid-set. `carryWeightDown` is the pattern to copy when a keystroke has to
change something other than the field being typed in: write the state, then poke the sibling
inputs' `.value` directly. Never re-render from the `input` handler.

### Logging a set

A set cannot be marked done with an empty weight — `roundLoad` and `lastPerformance` would take
the blank as 0 and quietly wreck the next prescription. The toggle refuses, flags the field, and
sets `needWeight`. Anything with a target already fills from the target instead of nagging.

`loadless(ex)` — bodyweight or timed — is the exception, and it goes further than not nagging:
those rows render a static **N/A** in place of the weight input, so there is nothing to type,
and `loadLabel` prints N/A wherever a load would otherwise appear. They log at 0 and progress on
reps or seconds alone. If you add a movement that *can* be loaded, leave `bw` off it.

Leaving the first weight field — `focusout`, not `input` — carries that weight into every set
below it that is not already logged, as real values rather than a placeholder hinting at them.
Logged sets keep what they were logged with, and blurring a lower row carries nothing. The
trigger is blur on purpose: carrying per keystroke flickers 1, 13, 135 down the column.

### Finishing

A session closes only when every planned set is logged. Until then the Finish button is replaced
by a dead one counting what is left, and the `finish` action checks `setsLeft()` itself, so the
invariant does not depend on the button being rendered correctly. The way out of work you are
not doing is `− Set`, which is why that control keeps its floor of one set per exercise — an
exercise you skip entirely still needs one logged set to close the session.

### Feedback timing

The RP questions are asked during the session, per muscle, by `pendingFor`:

- **soreness** when the first set of that muscle is logged. It asks about *last* time, so asking
  it before the work is done keeps the answer from drifting into how today went.
- **pump and volume** when the last planned set of every exercise for that muscle is logged,
  while the muscle still remembers.

Both arrive in one sheet if they fall together (a one-exercise, one-set muscle). Answers live on
`state.draft.fb`, not a module global, so they survive a reload mid-session; `loadState`
backfills `fb` on drafts written before this existed.

`+ Set` and `− Set` run `volumeChanged`, which throws away that muscle's pump and volume answers
and asks again — they described an amount of work that is no longer what happened. Soreness is
about last time, so it stands. Dropping a set re-asks immediately when the rest are already
logged; adding one waits until the new set is done.

Finish then commits straight to the summary when nothing is outstanding. `missingFeedback` is
what decides, and the end-of-session screen still exists for whatever was waved away with "Not
now" — it lists only the unanswered questions. Deloads ask nothing at all, in the sheet or at
the end.

### Peeking

`peek` holds the absolute index of the session the home screen is showing, or `null` for the
live one. It is view state, never persisted, and it is bounded to
`[state.index, state.index + SESSIONS_PER_BLOCK - 1]` — you browse forward, never into the past,
because a past session rendered from today's history would show targets that were never
prescribed.

**Only the live session is writable, and the mechanism is that every action calls `ctx()` with
no argument.** `render` is the one place that passes an index, and only to `viewHome`. Keep it
that way: an action that reaches for `ctx(peekIndex())` would let a user log sets against a
workout they have not arrived at, and `state.draft` would end up stamped with the wrong index.
Anything that moves `state.index` — starting, committing, skipping, erasing — clears `peek`.

Targets for a peeked session are a projection: `prescribe` runs against the history that exists
now, so the numbers move as the user trains. The home screen says so when `peek` is set; if you
surface them anywhere else, say it there too.

## Progression rules

Two independent mechanisms. Do not entangle them.

**Load and reps, per exercise**, from the last non-deload performance of that exercise:

- reps at or above the top of the range → +5 lb, or +10 on lower body (`ex.lower`), reps reset to the bottom
- same, with 2+ reps in reserve still logged → double the jump
- reps inside the range → same load, one more rep
- reps below the range → one step down
- muscle rated "still sore" last time → repeat the load, no increase
- failure logged in week 1 → repeat, do not chase
- bodyweight movements (`ex.bw`) never carry a load at all: no first-load prompt, no belt
  suggestion, no deload percentage. Reps go up by one each session and keep going past the top
  of the range; "still sore" and week-1 failure repeat, same as loaded work. Timed work
  (`ex.time`) is the same idea in seconds.

**Sets, per muscle**, from `setsDelta(fb)`:

- volume "too much" → −1
- still sore, with volume at "pushed my limits" or above → −1; otherwise hold
- "pushed my limits" → hold
- otherwise base 2 (or 1 if soreness healed just on time), +1 for light volume, +1 for a low
  pump, −1 for an amazing pump, clamped to 0–3

Deltas are distributed by `applyDelta`, which adds to the least-loaded exercise for that muscle
and removes from the most-loaded. Caps: 10 sets per muscle per session, 6 per exercise, floor of
1 per exercise.

**Block shape:** five weeks of four sessions, 20 in all. Weeks 1–4 are work and tighten by a rep
a week — 3, 2, 1, then 0 RIR. Week 5 is a deload at half sets and 60% load. Deload sessions
collect no feedback and are excluded from `lastPerformance`, so the next block resumes from the
last real working set. Then it repeats, carrying tuned set counts forward.

`WEEKS_PER_BLOCK` and `DELOAD_WEEK` are the shape; `SESSIONS_PER_BLOCK` derives from
`DAYS.length`, and `weekOf` / `isDeload` derive from those, so a different length is a two-line
change. `RIR_BY_WEEK` and `WEEK_COPY` must both carry an entry for every week — they are keyed
by week number and nothing falls back.

Note how the ramp interacts with the load rule: logging 3 RIR in a week that asks for 1 or 0
trips the "2+ reps in reserve at the top of the range" branch and doubles the jump. That is
intended — the tighter target is what makes the extra headroom mean something.

## Backlog

- Export / import of `state` as JSON. There is currently no way off the device, and a browser
  data clear takes the whole training history with it. Highest-value missing feature.
- Rest timer between sets.
- Exercise substitution — the program is hardcoded by design, but a swap that preserves the
  exercise id and muscle would keep history intact.
- Per-muscle weekly volume chart, not just per-exercise e1RM.
- The engine trusts the reps-in-reserve tap. Consider flagging when logged reps and reported RIR
  disagree across several sessions.

# Rolling Five (`victor.html`)

Victor's program: a five-slot rolling cycle — Push, Pull, Legs, Skill A, Skill B — with barbell
strength on double progression and two skills, the handstand pushup and the front lever,
progressing by *position* rather than load. It is a different app, not a mode of the other one.
Same storage discipline, same render discipline, different engine.

## What makes it not PPL Block

- **No weeks and no deload.** Slots advance when you train them. You put the rest days in
  yourself, and the app tells you where the program wants them. The only rate that matters is
  cycles completed per month, which the app computes from timestamps.
- **No RP autoregulation.** Set counts are fixed by the program; they are not tuned by soreness,
  pump and volume. What the feedback moves instead is *what the session contains* — see the three
  levers below.
- **Two progression mechanisms that never touch.** Load and reps by double progression on the
  barbell and dumbbell work; position on the skills. Do not entangle them.

## Layout of `victor.html`

Same section banners as `indie.html`, and the same responsibilities:

- `PROGRAM` — `SLOTS` (five, in cycle order), `SKILLS` (the two ladders), `TESTS` (the baseline
  battery), and the constants. Exercise ids (`p1`, `u4`, `g1`, `k3`, `b2`) are the primary key for
  everything and appear in saved history. **Never renumber or reuse an id.** A swapped movement
  gets a fresh id and the old definition moves to `RETIRED`, which is off the program but still
  read by Progress so the old lift keeps its curve. `RETIRED` is empty at handoff; the machinery
  is there for when it is not.
- `ENGINE` — pure. `prescribe`, the ladder replay, and the three levers all take history and
  `now` as arguments.
- `STORAGE` — `localStorage` under `rolling-five-v1`, in-memory fallback when storage is blocked.
  A different key from PPL Block, so the two apps cannot see each other.
- `STATE` — `state` (`index`, `history`, `draft`, `tests`, `plates`) plus `ctx(absIndex)`.
- `VIEWS`, `RENDER`, `ACTIONS`, `PWA` — as in `indie.html`, including the rule that the `input`
  handler never re-renders and `carryWeightDown` pokes sibling inputs directly.

`ctx()` is the one place the program assembles itself: it filters the slot's exercises through the
levers, halves what needs halving, and prescribes every target. **Once a session is open, its
shape comes from `state.draft.exs` instead** — nothing may appear or vanish underneath sets that
are already logged.

## Progression rules

**Double progression, per exercise**, from the last time it was trained:

- every set at the top of the range → +5 lb, +10 on lower body (`ex.lower`), reps back to the bottom
- anything short of that → the same load, and the target stays the top of the range. The per-set
  placeholders are what you did last time, set by set, so you know which one to beat.
- every set below the bottom of the range → one step down. Only for a real range: a flat
  prescription like the 3 × 15 rear delt flye repeats instead, because one rep short of 15 is not
  a failed session.
- within `CEILING_GAP` (40 lb) of loading every plate you own → the load stops climbing for good
  and the sets pick up a 3-second eccentric and a pause. The plate total is a setting; the squat
  is what runs out of room first.
- bodyweight and band accessories climb to the top of their range and **hold there**. Past that
  the progression is a thicker band or a harder position, not another rep. This is deliberately
  unlike PPL Block, where bodyweight reps climb forever.
- accumulated wall time chases the 60s total first, then the size of the pieces it comes in.

**Position, per skill**, replayed by `levelRun` from `state.history`:

- a session rated **clean** with `critSets` sets at the criterion (3 × 8 reps for the handstand
  pushup, 3 × 15s for the front lever) → up a step
- **ragged** → hold, criterion or not
- **broke down** → back a step. Regress rather than grind; every degraded rep in a straight-arm
  hold teaches a compensation that takes months to undo.
- Rep and second targets are scoped to the sessions since the current position began, so moving up
  or down starts the count again. They climb *past* the top of the working range, because the
  criterion sits above it — 3–6 reps of work, 8 to advance.
- Both skill days share one ladder per skill and keep their own rep counts. Skill B is behind on
  its own history, which is what "one more rep in reserve than Skill A" means in practice.
- The handstand pushup ladder starts at step 2 instead of step 1 when the baseline tests show 8+
  strict pike pushups **and** a 30s+ chest-to-wall hold. That is the program's entry test, and it
  is the only thing the test battery feeds into the engine.

## The three levers

Feedback does not move set counts. It moves what the program does with itself, and every one of
these is a rule from the program text, not an invention:

| Answer | What changes | For how long |
| --- | --- | --- |
| Elbows grumpy or painful | Every `straightArm` exercise is **halved**, never removed | 7 days, expires by itself |
| Handstand work felt heavy | Standing overhead press comes off Push | Until a skill day reports light or normal |
| Legs went to mush, **or** under 4 cycles a month | Skill B is cut to `practice` exercises only | Until legs read better, or the rate recovers |

Skill B is what gives. Not sleep, and not the barbell work. `cyclesPerMonth` returns null until
there are three weeks of log, because two sessions in week one is not a rate.

`restAdvice` carries the program's two rules about rest placement — before Skill A when running
the cycle straight, and before Skill B when balance was off — and they are advice on the home
screen, never something the app enforces.

## Feedback timing

`questionsFor` derives the questions from the exercises actually in the session, not from the
slot. A trimmed Skill B stops asking about elbows it never loaded; Push asks about elbows because
skullcrushers are on it.

- **Skill form** is asked mid-session, in a sheet, the moment that skill's last set is logged,
  while the position is still in your hands. `+ Set` / `− Set` on a skill exercise throws that
  answer away and asks again — it described a set count that no longer happened.
- **Balance, handstand load, elbows, legs** are asked at the end, on one screen. A session cannot
  commit with any of them unanswered.

Answers live on `state.draft.fb`, keyed exactly as history stores them (`sk:hspu`, `sk:fl`,
`balance`, `hsload`, `elbow`, `legs`), so a reload mid-session keeps them and `levelRun` can read
them straight back out of the log.

## Peeking

Same as PPL Block, bounded to `[state.index, state.index + SLOT_COUNT - 1]` — the cycle in front
of you. Only the live session is writable, and the mechanism is the same: every action calls
`ctx()` with no argument, and `render` is the only place that passes an index.

## Backlog

- Export / import of `state` as JSON. Same gap as the other app, same priority.
- A rest timer for the front lever's two minutes between sets.
- Per-position hold-time charts, not just the per-exercise curve.
- The baseline test screen records numbers but only the pike pushup and chest-to-wall hold feed
  the engine. The chin-up 5RM and squat × 10 could seed first loads instead of asking.

# Both apps

## Testing

```
node test.mjs          # PPL Block, 31 checks
node test-victor.mjs   # Rolling Five, 44 checks
```

Each suite extracts the `<script>` body from its HTML file, stubs the handful of browser APIs the
app touches, and drives it by firing the same synthetic `click` and `input` events the real UI
fires. They run whole simulated blocks and cycles, so they cover the engines, the reducers, and
the fact that every screen renders without throwing. All passing at handoff.

Add a check for any progression rule you change. Both suites are fast enough to run on every
edit, and CI runs both.

## Deploying

GitHub Pages, source **Deploy from a branch** — `main`, `/ (root)`. A push to `main` is a
deploy: GitHub's own `pages-build-deployment` run copies the repo root to the site. There is no
deploy workflow, and `.github/workflows/test.yml` only runs the suite — **it cannot block a
publish**, so run both suites before you push. The apps land at
`https://<owner>.github.io/periodization/indie.html` and
`https://<owner>.github.io/periodization/victor.html`; `/` offers both.

Do not add an `actions/deploy-pages` workflow back. With a branch source it cannot work:
`configure-pages` wants the site's build type to be `workflow`, and switching that is an
admin-scoped call `GITHUB_TOKEN` is refused for.

Every URL in the deployment is relative — `start_url`, `scope`, the manifest link, the worker
registration, the worker's precache list. Nothing knows the repo name, so a rename or a fork
keeps working. Do not introduce a root-absolute path; on Pages the site lives under a project
subpath and `/sw.js` would resolve off the site.

Home-screen install needs `https://`. Opened over `file://` it still runs and still saves, but
iOS may treat that storage as ephemeral, so real training logs should be hosted.
