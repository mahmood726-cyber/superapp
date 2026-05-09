# Overmind Decisions

- **2026-05-07** [RESOLVED] Legacy `selenium_comprehensive_test.py` was a stale, non-headless, fixed-port harness with old engine result-field assumptions. It now uses loopback binding, preferred port 8000 with fallback, temp-profile headless Chrome, UTF-8-safe output, idempotent teardown, and current engine APIs; `python selenium_comprehensive_test.py` now passes 15/15.
- **2026-05-07** [RESOLVED] `validateModerators` rejected object-of-arrays moderator inputs even though multi-moderator regression, Meta-CART, and Meta-Forest consume that shape internally. Validator now supports object-of-arrays while preserving the existing array-row contract; full Jest remains green at 211 tests.

- **2026-05-06** [RESOLVED] Root cause was the Copas selection-model default grid search, not WMI. Reduced deterministic default grid/inner iterations while preserving caller override via `nGrid`; `npm test` now passes 207 tests in 49.697s.
- **2026-05-06** [RESOLVED] Selenium UI smoke was blocked by Chrome profile/cache startup state. `tests/test_ui.py` now uses a per-test temp Chrome profile/cache; `python -m pytest -q` now passes 3 tests in 94.65s.
- **2026-05-06** [RESOLVED] Stale Sentinel BLOCK was from a hardcoded app directory in `selenium_comprehensive_test.py`. The script now resolves the app root from its own location; a repo Sentinel scan reports BLOCK=0 WARN=0 INFO=0.

- **2026-05-05** [TIMEOUT] Process timed out: Project hung — process tree killed after 1800s — Action: Check for WMI deadlock (Python 3.13), infinite loop, or slow test
- **2026-05-06** [TIMEOUT] Process timed out: Timed out after 120s — Action: Check for WMI deadlock (Python 3.13), infinite loop, or slow test
