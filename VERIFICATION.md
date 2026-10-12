# Local verification

- Dependencies installed successfully; npm audit reported zero vulnerabilities at installation.
- Production React build completed successfully.
- All 14 automated integration and startup regression tests passed.
- Browser walkthrough passed in installed Microsoft Edge: Silver worked example, tier upgrade, cancellation reversal, Bronze pending approval, manager queue and mobile layout.
- No browser JavaScript errors were detected during the walkthrough.
- Actual screenshots captured for pitch slides 2–4, plus a mobile screenshot.
- Desktop screenshots visually reviewed for readable tables, totals, actions and history.
- Restart verified: four users, historical and demo orders, and Silver's restored 4,900-point balance persisted without reseeding.
- Duplicate startup verified: the second process reports the running app before launching MongoDB. An unrelated occupied app port produces a controlled error. Local MongoDB port conflicts are checked before launch.

The default database is local MongoDB, not a substitute for the paper's required relational database. The ERP receiver is a local mock. No Git remote was provided and no remote push was performed.
