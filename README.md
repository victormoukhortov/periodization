# periodization

A single-file workout tracker for a 4-day Push / Pull / Legs / Full Body split, hosted on GitHub
Pages. It logs sets, asks the RP-style soreness / pump / volume questions after each session, and
derives the next session's sets, weight, and reps from the answers. Training runs in five-week
blocks: four weeks of work at 3, 2, 1, then 0 reps in reserve, followed by a deload week.

**The app is [`indy.html`](indy.html).** Everything else in this repo is deployment plumbing or
tests.

| File | Role |
| --- | --- |
| `indy.html` | The entire application. No dependencies, no build step. |
| `index.html` | Redirect so the site root lands on `indy.html`. |
| `sw.js` | Service worker: network first, cache fallback, so the app opens offline. |
| `manifest.webmanifest` | PWA manifest for home-screen install. Icons are inline data URIs. |
| `.nojekyll` | Serve the files verbatim; no Jekyll processing. |
| `.github/workflows/test.yml` | Runs `test.mjs` on every push and pull request. |
| `test.mjs` | Headless regression suite. `node test.mjs`. No test framework. |
| `CLAUDE.md` | Architecture and the constraints that hold it together. |

## Deploying

Pages serves the branch directly — **Settings → Pages → Source: Deploy from a branch, `main`,
`/ (root)`.** Pushing to `main` is deploying: GitHub's own `pages-build-deployment` run copies
the repo root to the site a moment later. There is no build step and no deploy workflow.

The site is at <https://victormoukhortov.github.io/periodization/>, and the app itself at
<https://victormoukhortov.github.io/periodization/indy.html>.

Because publishing is GitHub's job and not a workflow's, **a red test does not stop a deploy.**
`test.yml` tells you whether what you just shipped is sound; it cannot hold it back. Run
`node test.mjs` before pushing.

`.nojekyll` matters in this mode: without it Pages runs the tree through Jekyll, which drops
files and directories beginning with an underscore.

Every path in the deployment is relative, so the project subpath needs no configuration and a
fork or a rename keeps working.

## Installing to a phone

Open the Pages URL in Safari → Share → Add to Home Screen. It launches full screen, keeps its own
`localStorage`, and works without a signal after the first load.

## Running it locally

`indy.html` opens straight off disk with no server — double-click it. Over `file://` the manifest
file and service worker are skipped (the page falls back to an inline blob manifest) and iOS may
treat that storage as ephemeral, so real training logs belong on the hosted copy.

For a hosted-equivalent local run:

```
python3 -m http.server 8000   # then open http://localhost:8000/indy.html
```

## Tests

```
node test.mjs
```

22 checks covering the progression engine, the reducers, and the fact that every screen renders.
CI runs the same command on pushes and pull requests. It reports; it cannot hold back a deploy,
so run it yourself before pushing to `main`.
