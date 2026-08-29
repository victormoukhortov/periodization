# periodization

Three single-file workout trackers, hosted on GitHub Pages. No dependencies, no build step, no
server. Each one keeps its whole training log in the browser it is installed in.

| App | File | What it runs |
| --- | --- | --- |
| **PPL Block** | [`indie.html`](indie.html) | A 4-day Push / Pull / Legs / Full Body split on five-week blocks. Logs sets, asks the RP-style soreness / pump / volume questions, and derives the next session's sets, weight and reps from the answers. Four weeks of work at 3, 2, 1 then 0 reps in reserve, then a deload. |
| **Rolling Five** | [`victor.html`](victor.html) | A 5-slot rolling cycle — Push, Pull, Legs, Skill A, Skill B — for barbell strength alongside the handstand pushup and front lever. Double progression on the bar, position progression on the skills, and a program that cuts itself back when your elbows, your legs or your cycle rate say so. |
| **Prove It** | [`meep.html`](meep.html) | Upper / lower, four days a week, for building muscle in a commercial gym. Every exercise ends in a proof set taken to failure; the load comes off that set, volume is a reward for intensity, and deloads are earned rather than scheduled. |

Everything else in this repo is deployment plumbing or tests.

| File | Role |
| --- | --- |
| `indie.html`, `victor.html`, `meep.html` | The applications, entire. |
| `index.html` | Site root; offers all three apps. |
| `sw.js` | Service worker: network first, cache fallback, so any of them opens offline. |
| `manifest.webmanifest`, `victor.webmanifest`, `meep.webmanifest` | PWA manifests for home-screen install. Icons are inline data URIs. |
| `.nojekyll` | Serve the files verbatim; no Jekyll processing. |
| `.github/workflows/test.yml` | Runs all three suites on every push and pull request. |
| `test.mjs`, `test-victor.mjs`, `test-meep.mjs` | Headless regression suites. No test framework. |
| `CLAUDE.md` | Architecture and the constraints that hold it together. |

## Rolling Five, in one screen

The cycle has no weeks in it. You advance through the five slots in order and put rest days
wherever fatigue says; the app tracks **cycles completed per month**, which is the number the
program actually cares about, and tells you where the rest days want to go.

- **Barbell and dumbbell work** is double progression: the load holds until every set reaches the
  top of the rep range, then goes up 5 lb (10 lb lower body) and the reps drop back to the bottom.
  Within 40 lb of loading every plate you own it stops climbing and switches you to 3-second
  eccentrics and paused reps instead.
- **The two skills progress by position.** Handstand pushup: pike → back to wall → chest to wall →
  deficit → freestanding negatives, advancing at 3 × 8 clean. Front lever: tuck → advanced tuck →
  one leg → straddle → full, advancing at 3 × 15s clean. Rate a session as having broken down and
  it hands the position back rather than letting you grind a degraded hold.
- **The program cuts itself back.** Grumpy elbows halve the straight-arm volume for a week rather
  than stopping it. A heavy-feeling handstand day takes the seated dumbbell press off your next
  Push. Legs going to mush, or dropping under four cycles a month, cuts Skill B to fifteen minutes
  of practice — Skill B is what gives, not sleep and not the barbell work.
- **A rest timer** sits at the top of an open session and starts itself the moment you check a set
  off. Pick a duration from the chips, play / pause / reset by hand. The alarm is a real sound, and
  it works with the app in your pocket or the screen locked, because it is delivered as media
  playback rather than as a notification — see the note below.
- **Baseline tests** live on the Skills tab. Retest every four to six cycles. Eight strict pike
  pushups plus a 30-second chest-to-wall hold is what starts the handstand pushup ladder on the
  wall instead of on a box.

## How the rest alarm works, and where it stops

A page served from static hosting cannot schedule a future notification: iOS has no local
scheduling API, and Web Push needs a server. Nor can it rely on `setTimeout` — a backgrounded or
locked phone stops running it. So the alarm is not a notification at all.

When a rest starts, the app builds a WAV in memory — the remaining seconds as inaudible signal,
then a desk bell struck twice — and plays it through an `<audio>` element. Phones keep playing media
when you switch away or lock the screen, and no code has to run at the moment the tone arrives,
so it lands on time. On iOS it also plays with the ringer switch on silent, which Web Audio does
not.

What that buys and what it does not:

- **Works:** app backgrounded, screen locked, phone in your pocket. Lock-screen play/pause
  controls the rest.
- **Works:** foreground, obviously — and the screen is held awake while a rest runs.
- **Does not work:** the app force-quit from the app switcher. Nothing on the web can wake it.
- **Best effort:** a notification banner when the rest ends, if you grant permission. It is the
  banner only; web notification sounds are not controllable.

## Prove It, in one screen

Four sessions on rotation — Upper Push, Lower Squat, Upper Pull, Lower Hinge — advancing when you
train them, so a missed day slides the week rather than dropping a session.

**Each muscle gets one heavy compound a week and one easy day.** Upper Push opens with the heavy
dumbbell press; back's work that day is a machine row and a pulldown. Upper Pull opens with the
heavy barbell row; chest's work that day is a machine press and a pec deck. The lower days do the
same for quads against hips and hamstrings. Because every exercise ends in a set taken to failure,
two heavy sessions a week on the same muscle is two failure sets 72 hours apart — which is where
the fatigue comes from. It also decides the exercise list: nothing sits in a heavy slot that is
dangerous to fail alone, so there is no barbell bench and no back squat.

- **The last set of every exercise is a proof set**, taken until the reps stop. The sets before it
  stop short and build volume; the proof set is the measurement, and every load comes off it.
- **No rating leaves the weight alone.** Reps you say were left over are treated as evidence the
  load was light and added to it. The only way to keep a weight is to finish the set.
- **Volume is a reward for intensity.** Soreness moves your set counts, but only for a muscle whose
  work was actually taken near failure. Sail through work you did not really do and you get
  nothing for it. It is not asked until there is a previous outing of that session to be sore
  from, so the first week collects effort ratings only.
- **Deloads are earned.** There is no deload week on the calendar. One arrives when your proof sets
  go backwards two sessions running, which is what fatigue actually looks like.
- **The session runs in one order: watch, work, rate, next.** You are on one exercise at a time;
  everything past it is dimmed and takes no input until the one you are on is finished — every set
  logged and the proof set rated. Exercises behind you stay open so a mistyped set can be fixed.
  If a machine is busy, every dimmed card has a lit lock beside its title — tap it and that
  exercise opens where it stands. The order is how the session wants to go, not a cage.
- **New movements are gated by a form demo.** The exercise you are on sits behind a prompt to
  watch it, and its card is inert until you tap through. A movement asks for the first four
  sessions of *it*, so anything added later gets its own run however long you have been training.
  There is no skip — but the unlock is the tap, not the video loading, so a gym with no signal
  still lets you train.
- **One number on the front of Progress:** the share of proof sets you took to one-more-or-nothing
  over the last four weeks. Target is 80%.

## Deploying

Pages serves the branch directly — **Settings → Pages → Source: Deploy from a branch, `main`,
`/ (root)`.** Pushing to `main` is deploying: GitHub's own `pages-build-deployment` run copies
the repo root to the site a moment later. There is no build step and no deploy workflow.

The site is at <https://victormoukhortov.github.io/periodization/>, and the apps at
<https://victormoukhortov.github.io/periodization/indie.html>,
<https://victormoukhortov.github.io/periodization/victor.html> and
<https://victormoukhortov.github.io/periodization/meep.html>.

Because publishing is GitHub's job and not a workflow's, **a red test does not stop a deploy.**
`test.yml` tells you whether what you just shipped is sound; it cannot hold it back. Run the
suites before pushing.

`.nojekyll` matters in this mode: without it Pages runs the tree through Jekyll, which drops
files and directories beginning with an underscore.

Every path in the deployment is relative, so the project subpath needs no configuration and a
fork or a rename keeps working.

## Installing to a phone

Open the app's Pages URL in Safari → Share → Add to Home Screen. It launches full screen, keeps
its own `localStorage`, and works without a signal after the first load. The apps install
separately and never see each other's data.

## Running it locally

Any of them opens straight off disk with no server — double-click it. Over `file://` the manifest
file and service worker are skipped (the page falls back to an inline blob manifest) and iOS may
treat that storage as ephemeral, so real training logs belong on the hosted copy.

For a hosted-equivalent local run:

```
python3 -m http.server 8000   # then open http://localhost:8000/
```

## Tests

```
node test.mjs          # PPL Block, 31 checks
node test-victor.mjs   # Rolling Five, 54 checks
node test-meep.mjs     # Prove It, 43 checks
```

They cover the progression engines, the reducers, and the fact that every screen renders. CI runs
both on pushes and pull requests. It reports; it cannot hold back a deploy, so run them yourself
before pushing to `main`.
