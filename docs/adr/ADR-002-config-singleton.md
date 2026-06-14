# ADR-002: Config Table — Singleton Row Pattern

**Status:** Accepted
**Date:** 2026-06-14
**Version:** 1.0.0

## Context

`config` holds app-wide settings (`version`, `default_timezone`, `currency`,
`last_updated`). This is a small, fixed, known set of fields — not an
arbitrary user-defined key/value store.

## Decision

Model `config` as a **single typed row** with `id INTEGER PRIMARY KEY CHECK
(id = 1)`. CRUD is adapted to this shape:

- `GET /config` — read the row.
- `PUT /config` — update `version` / `default_timezone` / `currency`;
  `last_updated` is set to `unixepoch()` on every write.
- `POST /config` and `DELETE /config` — `405 Method Not Allowed`.

The row is seeded by the initial migration (`id=1, version='1.0.0',
default_timezone='Asia/Jakarta', currency='IDR'`).

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Key-value table (`config_key TEXT, config_value TEXT`) | Loses column typing (e.g. `last_updated` as INTEGER), needs a query per key or a pivot, and the field set is fixed/known — KV flexibility isn't needed. |
| Multiple config rows (versioned history) | No requirement for config history in Phase 1; adds query complexity for "get current config". |

## Consequences

- `CHECK (id = 1)` makes a second row impossible at the DB level.
- Reads/writes are always a single-row `WHERE id = 1` — no list endpoint needed.
- If config history is ever needed, it can be added as a separate
  `config_history` table without touching this one.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-06-14 | Initial decision |