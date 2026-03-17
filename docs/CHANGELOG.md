# Changelog

## [2026-03-17]
- Added persistence of `user_product_id` in `order` during `ml_item` enrichment phase.
- Persistence rule: set `user_product_id` only when ML item returns a non-empty string (trimmed); do not overwrite with null/undefined/empty.
- Added technical docs baseline in `docs/`:
  - `ARCHITECTURE.md`
  - `ENGINEERING_PRACTICES.md`
  - `README.md`
  - `RELEASE_PROCESS.md`
  - `SDD.md`
  - `CHANGELOG.md`
- Added persistent AI context docs in `docs/ai/` (system map, current state, working rules, skills).
- Smoke validated with order `2000015581952128`: `user_product_id` persisted in `order`.
