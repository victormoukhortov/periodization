# PPL Block

A single-file workout tracker for a 4-day Push / Pull / Legs / Full Body split. It logs sets,
asks the RP-style soreness / pump / volume questions after each session, and derives the next
session's sets, weight, and reps from the answers. Installable to an iPhone home screen as a PWA.
Deployed to GitHub Pages from the repo root.

## Files

| File | Role |
| --- | --- |
| `indy.html` | The entire application. No dependencies, no build step. |
| `index.html` | Redirect from the site root to `indy.html`. |
| `sw.js` | Service worker for the hosted copy. Network first, cache fallback. |
| `manifest.webmanifest` | PWA manifest for the hosted copy. Icons are inline data URIs. |
| `.nojekyll` | Keeps Pages from running the files through Jekyll. |
| `.github/workflows/test.yml` | `node test.mjs` on pushes and pull requests. |
| `test.mjs` | Headless regression suite. `node test.mjs`. No test framework. |
| `CLAUDE.md` | This file. |

## Hard constraints

These are not preferences. Breaking any of them breaks the deployment model.

1. **One file.** `indy.html` ships as a single artifact: inline CSS, inline JS, base64 icons.
   No npm, no bundler, no CDN. It must run correctly when opened directly from disk — that is the
   test for whether a change belongs in the file or beside it. `sw.js` and `manifest.webmanifest`
   are the only siblings, they exist purely for the hosted copy, and the app degrades cleanly to
   its inline fallbacks when they are missing. Do not grow that list.
2. **No framework.** Vanilla ES5-flavoured JS, `var` and `function`, so it parses on old
   WebKit without transpilation. Do not introduce React, JSX, or module syntax.
3. **Pounds only.** 45 lb bar, plates down to 2.5. Every prescribed load passes through
   `roundLoad()` so it is always something you can actually build on a US rack.
4. **The engine is pure.** Everything from `weekOf` down to `prescribe` takes arguments and
   returns values. It touches no DOM, no globals, no clock. This is what makes `test.mjs`
   possible — keep new logic on that side of the line.
5. **History is the source of truth.** Set counts and loads are *derived* from `state.history`
   on every render, never cached in state. `setCountsForDay` replays feedback from scratch each
   time. Do not add a mutable `plan` object; it will drift.

## Layout of `indy.html`

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

## Testing

```
node test.mjs
```

`test.mjs` extracts the `<script>` body from the HTML, stubs the handful of browser APIs the app
touches, and drives it by firing the same synthetic `click` and `input` events the real UI
fires. It runs whole simulated blocks, so it covers the engine, the reducers, and the fact that
every screen renders without throwing. 28 checks, all passing at handoff.

Add a check for any progression rule you change. The suite is fast enough to run on every edit.

## Deploying

GitHub Pages, source **Deploy from a branch** — `main`, `/ (root)`. A push to `main` is a
deploy: GitHub's own `pages-build-deployment` run copies the repo root to the site. There is no
deploy workflow, and `.github/workflows/test.yml` only runs the suite — **it cannot block a
publish**, so run `node test.mjs` before you push. The app lands at
`https://<owner>.github.io/periodization/indy.html`, and `/` redirects there.

Do not add an `actions/deploy-pages` workflow back. With a branch source it cannot work:
`configure-pages` wants the site's build type to be `workflow`, and switching that is an
admin-scoped call `GITHUB_TOKEN` is refused for.

Every URL in the deployment is relative — `start_url`, `scope`, the manifest link, the worker
registration, the worker's precache list. Nothing knows the repo name, so a rename or a fork
keeps working. Do not introduce a root-absolute path; on Pages the site lives under a project
subpath and `/sw.js` would resolve off the site.

Home-screen install needs `https://`. Opened over `file://` it still runs and still saves, but
iOS may treat that storage as ephemeral, so real training logs should be hosted.

## Backlog

- Export / import of `state` as JSON. There is currently no way off the device, and a browser
  data clear takes the whole training history with it. Highest-value missing feature.
- Rest timer between sets.
- Exercise substitution — the program is hardcoded by design, but a swap that preserves the
  exercise id and muscle would keep history intact.
- Per-muscle weekly volume chart, not just per-exercise e1RM.
- The engine trusts the reps-in-reserve tap. Consider flagging when logged reps and reported RIR
  disagree across several sessions.
