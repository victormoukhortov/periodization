# periodization

A single-file workout tracker for a 4-day Push / Pull / Legs / Full Body split, hosted on GitHub
Pages. It logs sets, asks the RP-style soreness / pump / volume questions after each session, and
derives the next session's sets, weight, and reps from the answers.

**The app is [`indy.html`](indy.html).** Everything else in this repo is deployment plumbing or
tests.

| File | Role |
| --- | --- |
| `indy.html` | The entire application. No dependencies, no build step. |
| `index.html` | Redirect so the site root lands on `indy.html`. |
| `sw.js` | Service worker: network first, cache fallback, so the app opens offline. |
| `manifest.webmanifest` | PWA manifest for home-screen install. Icons are inline data URIs. |
| `.nojekyll` | Serve the files verbatim; no Jekyll processing. |
| `.github/workflows/pages.yml` | Runs `test.mjs`, then publishes the repo root to Pages. |
| `test.mjs` | Headless regression suite. `node test.mjs`. No test framework. |
| `CLAUDE.md` | Architecture and the constraints that hold it together. |

## Deploying

The workflow publishes on every push to `main`. It needs Pages pointed at Actions once, by hand:

**Settings → Pages → Build and deployment → Source: GitHub Actions.**

Until that is set, the `deploy` job fails at `configure-pages` with `Get Pages site failed …
Not Found`. The workflow cannot do it for you: creating the Pages site is an admin-scoped API
call and `GITHUB_TOKEN` is refused with `Resource not accessible by integration`, so
`enablement: true` does not work either. Once the setting is flipped, re-run the latest run
(or push anything to `main`) and it deploys.

The site then serves at `https://<owner>.github.io/periodization/`, and the app itself at
`https://<owner>.github.io/periodization/indy.html`.

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

16 checks covering the progression engine, the reducers, and the fact that every screen renders.
CI runs the same command on pull requests and blocks the deploy if it fails.
