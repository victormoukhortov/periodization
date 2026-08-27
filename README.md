# periodization

Two single-file workout trackers, hosted on GitHub Pages. No dependencies, no build step, no
server. Each one keeps its whole training log in the browser it is installed in.

| App | File | What it runs |
| --- | --- | --- |
| **PPL Block** | [`indie.html`](indie.html) | A 4-day Push / Pull / Legs / Full Body split on five-week blocks. Logs sets, asks the RP-style soreness / pump / volume questions, and derives the next session's sets, weight and reps from the answers. Four weeks of work at 3, 2, 1 then 0 reps in reserve, then a deload. |
| **Rolling Five** | [`victor.html`](victor.html) | A 5-slot rolling cycle — Push, Pull, Legs, Skill A, Skill B — for barbell strength alongside the handstand pushup and front lever. Double progression on the bar, position progression on the skills, and a program that cuts itself back when your elbows, your legs or your cycle rate say so. |

Everything else in this repo is deployment plumbing or tests.

| File | Role |
| --- | --- |
| `indie.html`, `victor.html` | The applications, entire. |
| `index.html` | Site root; offers both apps. |
| `sw.js` | Service worker: network first, cache fallback, so either app opens offline. |
| `manifest.webmanifest`, `victor.webmanifest` | PWA manifests for home-screen install. Icons are inline data URIs. |
| `.nojekyll` | Serve the files verbatim; no Jekyll processing. |
| `.github/workflows/test.yml` | Runs both suites on every push and pull request. |
| `test.mjs`, `test-victor.mjs` | Headless regression suites. No test framework. |
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
  than stopping it. A heavy-feeling handstand day takes the standing overhead press off your next
  Push. Legs going to mush, or dropping under four cycles a month, cuts Skill B to fifteen minutes
  of practice — Skill B is what gives, not sleep and not the barbell work.
- **Baseline tests** live on the Skills tab. Retest every four to six cycles. Eight strict pike
  pushups plus a 30-second chest-to-wall hold is what starts the handstand pushup ladder on the
  wall instead of on a box.

## Deploying

Pages serves the branch directly — **Settings → Pages → Source: Deploy from a branch, `main`,
`/ (root)`.** Pushing to `main` is deploying: GitHub's own `pages-build-deployment` run copies
the repo root to the site a moment later. There is no build step and no deploy workflow.

The site is at <https://victormoukhortov.github.io/periodization/>, and the apps at
<https://victormoukhortov.github.io/periodization/indie.html> and
<https://victormoukhortov.github.io/periodization/victor.html>.

Because publishing is GitHub's job and not a workflow's, **a red test does not stop a deploy.**
`test.yml` tells you whether what you just shipped is sound; it cannot hold it back. Run the
suites before pushing.

`.nojekyll` matters in this mode: without it Pages runs the tree through Jekyll, which drops
files and directories beginning with an underscore.

Every path in the deployment is relative, so the project subpath needs no configuration and a
fork or a rename keeps working.

## Installing to a phone

Open the app's Pages URL in Safari → Share → Add to Home Screen. It launches full screen, keeps
its own `localStorage`, and works without a signal after the first load. The two apps install
separately and never see each other's data.

## Running it locally

Either app opens straight off disk with no server — double-click it. Over `file://` the manifest
file and service worker are skipped (the page falls back to an inline blob manifest) and iOS may
treat that storage as ephemeral, so real training logs belong on the hosted copy.

For a hosted-equivalent local run:

```
python3 -m http.server 8000   # then open http://localhost:8000/
```

## Tests

```
node test.mjs          # PPL Block, 31 checks
node test-victor.mjs   # Rolling Five, 44 checks
```

They cover the progression engines, the reducers, and the fact that every screen renders. CI runs
both on pushes and pull requests. It reports; it cannot hold back a deploy, so run them yourself
before pushing to `main`.
