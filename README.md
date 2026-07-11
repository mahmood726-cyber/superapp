# superapp

Living Meta-Analysis Starter: Lightweight Template for Rapid Living Evidence Applications

_Status: Needs triage (portfolio registry)._

## Overview

A meta-analysis platform with pairwise pooling (fixed / random effects,
DL / REML / PM tau2), prediction intervals, publication-bias tests, network
meta-analysis (NMA), diagnostic-test-accuracy (DTA), Bayesian and moderator
methods. The statistical engine lives under `js/engine/` with shared
distribution helpers in `js/utils/stats.js`.

## Usage

Open the app pages under `js/pages/` in a browser, or import the engine
modules directly, e.g.:

```js
import { calculateLogOR, randomEffectsDL } from './js/engine/meta-analysis.js';
```

All engine modules are ES modules (`"type": "module"`).

## Testing

Primary suite (JavaScript engine, Jest):

```bash
npm install
npm test          # runs all Jest suites under tests/ (engine + utils)
npm run test:coverage
```

The primary suite requires Node >= 18. Tests validate the engine against R
`metafor` reference values with a 1e-6 tolerance for point estimates.

Secondary suite (browser UI, pytest + Selenium):

```bash
python -m pytest tests/test_ui.py
```

The UI tests require a running Chrome/Chromedriver plus `selenium` installed;
they are skipped in headless CI without a browser.

R validation (optional, requires `Rscript`):

```bash
npm run validate:r
```

## Layout

- `js/engine/` — statistical engines (meta-analysis, NMA, DTA, Bayesian, etc.)
- `js/utils/stats.js` — distribution helpers (normal, t, chi-square, gamma, beta)
- `js/pages/` — browser UI pages
- `tests/engine/`, `tests/utils/` — Jest suites
- `tests/test_ui.py` — Selenium UI tests
- `validation/` — R benchmark scripts

## License

MIT
