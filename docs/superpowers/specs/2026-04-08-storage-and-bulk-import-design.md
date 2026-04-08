# CASEFILE — Storage Layer + Bulk Import Pipeline

**Status:** Draft for review
**Date:** 2026-04-08
**Subsystems covered:** #1 (storage architecture) + #2 (bulk import / cross-source merge)
**Author:** Brainstorming session, reviewed adversarially by Gemini (two passes)

---

## 1. Scope

### In scope

- Storage architecture: which datastores, how they relate, hosting target
- Schema deltas to apply on top of the existing `DATABASES/schema.sql`
- Entity-resolution / cross-source merge model
- Evidence re-ingestion / versioning model
- Source reliability rating: how it is populated, maintained, and used by the resolver
- Bulk import pipeline architecture (the harness all importers plug into)
- Search sync to Meilisearch
- `raw_staging` lifecycle and archival
- RLS strategy
- Operational invariants (the disciplines that keep the design coherent)
- Migration / build sequence for getting from "nothing" to "MAP + Charley loaded, Meilisearch live"

### Out of scope (separate designs later)

- Scraper framework internals — the harness contract is defined here, but the polite-crawling, retry, change-detection, NLP-extraction details are subsystem #3
- Public website front-end, API layer, and CDN strategy — subsystem #4
- Crowdsolve webapp UI, contribution flows, reputation scoring, moderation workflows — subsystem #5
- Cross-case graph traversal beyond 2 hops — explicitly deferred until post-Growth
- Full-text search ranking and tuning — Meilisearch is wired here, tuning happens in subsystem #4
- Per-restricted-case access control — schema leaves the door open via `cases.visibility`, but enforcement is subsystem #5

---

## 2. Background

The repository already contains:

- A detailed PostgreSQL schema (`DATABASES/schema.sql`, ~1000 lines) covering 16 tables: `cases`, `sources`, `evidence`, `entities`, `entity_evidence`, `entity_cases`, `connections`, `evidence_links`, `open_questions`, `raw_staging`, `timeline_events`, `users`, `contributions`, `audit_log`, `scrape_jobs`, `cross_case_matches`. Plus enums, indexes, views, triggers, comments.
- A working MAP (Murder Accountability Project) importer (`DATABASES/map_importer.py`) that reads the SHR CSV (~334MB, ~900k homicide records 1976–2024), produces NDJSON for each table, and emits a SQL loader script using `\copy` into temp JSONB staging.
- A working Charley Project scraper (`SCRAPERS/charley_scraper.py`) for ~16k missing-persons records.
- A master list of ~46 scrapeable sources (`SCRAPERS/scraping_sources_master_list.md`) prioritized by volume, feasibility, and schema fit.
- React mockups (`DATABASES/layer2.jsx`, `layer3.jsx`) showing the crowdsolve UI direction: skill-matched task feed and case investigation threads.

The existing schema is a strong starting point. This spec extends and modifies it rather than replacing it.

The scale target is **10s of millions of rows** combined across `cases`, `evidence`, `entities`, `connections`. The MAP import alone produces ~5M rows. Once Charley (~16k cases × multi-row), Doe Network (~8k), NamUs (~41k), NCMEC (~30k), state databases, and WaPo data are layered in, ~10M is the realistic floor and ~50M is plausible at maturity.

---

## 3. Decisions Locked In

The brainstorming session (with two adversarial review passes by Gemini) settled the following decisions. Every later section depends on these.

| # | Decision | Source |
|---|---|---|
| D1 | This spec covers only subsystems #1 + #2 (storage + bulk import). Web/scraper-framework/crowdsolve get their own specs. | Scope flag |
| D2 | Pragmatic polyglot: 3 persistent stores total, each justified by a real query type | Q1 |
| D3 | Day-1 must-have query types: full-text search, map-first browsing, fuzzy entity resolution at import, personalized open-questions feed | Q2 |
| D4 | Cross-case graph traversal at depth >2 hops is explicitly deferred. No Neo4j day 1. | Q2 |
| D5 | Stack: **Postgres + S3-compatible object storage + Meilisearch + Splink batch jobs** | Q2 |
| D6 | Hosting: **Supabase Pro + Medium compute (~$135/mo MVP)** | Hosting research |
| D7 | Auth: Supabase Auth + Postgres RLS, bundled | Hosting research |
| D8 | File storage: Supabase Storage day 1; migrate file *serving* to Cloudflare R2 if egress > $200/mo | Hosting research |
| D9 | Search index: Meilisearch (Cloud, ~$29 → $199 /mo as scale grows) | Q2 |
| D10 | Search sync: batch cron, ~60s interval, **keyset-paginated by `(updated_at, id)`** | Hosting research + Gemini bug 1 |
| D11 | Spatial: convert `lat`/`lng` decimal pairs to single `GEOGRAPHY(Point, 4326)` column with **generated columns** for read-only `lat`/`lng` convenience | Gemini bug 3 |
| D12 | Read replica: not day 1; add at Growth phase (~10M rows, ~5k DAU) | Hosting research |
| D13 | Entity resolution scheduling: batch jobs during off-hours; first full ER batch runs on temporarily-scaled-up Supabase compute | Hosting research + flag (c) |
| D14 | RLS pattern: `(select auth.uid()) = user_id` subselect form, btree indexes on every `user_id` column, separate policies per operation | Hosting research |
| D15 | Public-read tables get a `FOR SELECT TO anon, authenticated USING (true)` zero-cost RLS policy | Hosting research |
| D16 | **Approach 2 — source-faithful + cluster** for entities: every source record is its own entity, `entity_clusters` groups them | Q4 |
| D17 | **Strategy B — append-only supersedes chain** for evidence re-ingestion: every change creates a new row, `is_current` partial index keeps reads fast | Q5 |
| D18 | `entities.merged_into_id` renamed to `redirected_to_id` for data corrections only; cross-source identity goes through `cluster_id` | Gemini flag (a) |
| D19 | `evidence` table is not directly readable by `anon` or `authenticated` Postgres roles — they only see `v_current_evidence`. The importer service role keeps direct access. | Gemini flag (b) |
| D20 | `cluster_attribute_observations` is a real table, not a JSONB blob inside `entity_clusters`. Per-attribute, per-source provenance is queryable. | Gemini improvement A2 |
| D21 | Soft-delete pattern (`deleted_at` column) on **interpretation** tables that feed Meilisearch: `entity_clusters`, `cross_case_matches`, `connections`. Source-record tables stay forever. | Gemini bug 2 |
| D22 | Cluster-to-cluster merges supported via `redirected_to_cluster_id` + a compaction step that rewrites the redirect graph in one transaction | Gemini bug 4 |
| D23 | The bulk import harness is the only path scrapers/importers use to write to production tables. It exposes `promote_evidence`, `promote_entity`, `canonicalize`, `register_source`. Direct INSERT bypassing the harness is a bug. | Operational invariants |
| D24 | `canonicalize()` is a single deterministic function shared across all importers. Hash inputs use `json.dumps(data, sort_keys=True, separators=(',', ':'), ensure_ascii=False, default=canonical_json_default)`. Unit-tested with adversarial inputs. | Gemini improvement 1 |
| D25 | Source reliability rating is set at registration via a source-type default, optionally overridden per-domain, and **never silently mutated**. Retraction and dispute flags compose with the base rating to produce an *effective* rating at resolve time. | Resolver design |
| D26 | The resolver function is pure: same observations + same effective ratings → same output. Re-running it after data changes is always safe. | Resolver design |
| D27 | `open_questions` is public-read by design. If restricted investigative tasking is ever required, it goes in a separate table — not as RLS on this one. Documented in the schema with a `COMMENT`. | Gemini improvement A3 |
| D28 | `cases.visibility` column added now (`'public'` default, `'restricted'`, `'private'`) so the schema doesn't paint into a corner. RLS policies join through it but every existing case stays public. | Gemini improvement A3 |

---

## 4. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         WORKER HOST                                  │
│  (Railway/Fly.io, ~$10–50/mo)                                        │
│                                                                      │
│   • Scrapers (charley, namus, doe, etc.) ──┐                         │
│   • Bulk importers (MAP, FBI CDE, WaPo) ───┤                         │
│   • Splink ER batch (cron, off-hours) ─────┤                         │
│   • Meilisearch sync cron (every 60s) ─────┤                         │
│   • Cluster resolver (called by ER batch) ─┤                         │
│   • raw_staging archival job (nightly) ────┤                         │
│                                            │                         │
└────────────────────────────────────────────┼─────────────────────────┘
                                             │
                                             │   bulk import harness
                                             │   (Python: only path
                                             │    to production tables)
                                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  SUPABASE PROJECT (Postgres 15)                      │
│                                                                      │
│   Extensions: PostGIS, pg_trgm, tsvector, uuid-ossp, btree_gist      │
│                                                                      │
│   ┌──────────────────────────────┐  ┌─────────────────────────────┐  │
│   │   raw_staging                │  │   production tables          │  │
│   │   (append-only,              │  │                              │  │
│   │    hot tier in PG +          │  │   cases, evidence, entities, │  │
│   │    cold tier in S3)          │  │   sources, entity_clusters,  │  │
│   │                              │  │   connections, contributions,│  │
│   │   ─→ cold-archived to S3 ─┐  │  │   open_questions, etc.       │  │
│   │     after retention rules │  │  │                              │  │
│   └──────────────────────────┼───┘  └─────────────────────────────┘  │
│                              │                                       │
│   Auth: Supabase Auth + Postgres RLS                                 │
│   Storage: Supabase Storage (S3-compatible API)                      │
│                              │                                       │
└──────────────────────────────┼───────────────────────────────────────┘
                               │                            │
                               │                            │
                               ▼                            ▼
                    ┌──────────────────┐         ┌────────────────────┐
                    │  S3 / Storage    │         │   Meilisearch      │
                    │  (Supabase Stor- │         │   Cloud            │
                    │   age day 1, R2  │         │   (~$29 → $199/mo) │
                    │   later if needed│         │                    │
                    │                  │         │   Indexes:         │
                    │  • files         │         │   • cases          │
                    │  • cold raw_     │         │   • evidence       │
                    │    staging       │         │   • entities       │
                    │    archive       │         │   • clusters       │
                    └──────────────────┘         └────────────────────┘
```

### Key principles

1. **Source records are immutable, interpretations are mutable.** Every row that came from outside (a scraped page, a CSV, a FOIA document) is preserved verbatim with its `scraped_at` timestamp. Anything that represents *our* interpretation (cluster membership, current evidence pointers, attribute resolution) can change. When in doubt about a future schema decision, ask which side of that line it sits on.

2. **The harness is the only writer to production.** Scrapers and importers never `INSERT INTO evidence` directly. They call `harness.promote_evidence(...)`, which handles content-hashing, supersedes-chain logic, raw_staging linkage, and idempotency. This makes correctness a property of one library rather than ~46 scrapers.

3. **`updated_at` is load-bearing.** It drives the Meilisearch sync cron. Every table that surfaces in search has `updated_at` maintained by trigger. Forgetting to bump `updated_at` is a bug class equivalent to forgetting to commit a transaction.

4. **`is_current` and `deleted_at` are also load-bearing.** They are how the search layer knows what to filter out and what to delete. Any table that participates in search must define exactly how these flip and what triggers them.

5. **Pure resolver functions.** The cluster attribute resolver is deterministic. Same observations + same effective source ratings → same output, every time. No randomness, no order dependence, no time dependence except through observation timestamps. Re-running after data changes is always safe.

---

## 5. Schema Deltas

These are applied on top of the existing `DATABASES/schema.sql`. Order matters: drop-and-recreate operations on existing columns happen before new tables are added.

### 5.1 Spatial: single source of truth

```sql
-- cases
ALTER TABLE cases ADD COLUMN location GEOGRAPHY(Point, 4326);
ALTER TABLE cases DROP COLUMN location_lat;
ALTER TABLE cases DROP COLUMN location_lng;
ALTER TABLE cases ADD COLUMN location_lat DOUBLE PRECISION
    GENERATED ALWAYS AS (ST_Y(location::geometry)) STORED;
ALTER TABLE cases ADD COLUMN location_lng DOUBLE PRECISION
    GENERATED ALWAYS AS (ST_X(location::geometry)) STORED;
CREATE INDEX idx_cases_location_gist ON cases USING GIST (location);

-- evidence
ALTER TABLE evidence ADD COLUMN location GEOGRAPHY(Point, 4326);
ALTER TABLE evidence DROP COLUMN location_lat;
ALTER TABLE evidence DROP COLUMN location_lng;
ALTER TABLE evidence ADD COLUMN location_lat DOUBLE PRECISION
    GENERATED ALWAYS AS (ST_Y(location::geometry)) STORED;
ALTER TABLE evidence ADD COLUMN location_lng DOUBLE PRECISION
    GENERATED ALWAYS AS (ST_X(location::geometry)) STORED;
CREATE INDEX idx_evidence_location_gist ON evidence USING GIST (location);

COMMENT ON COLUMN cases.location IS
    'Single source of truth for spatial data. Importers MUST write to this column. lat/lng columns are read-only generated views.';
```

**Rationale:** Maintaining lat/lng decimal pairs alongside a `GEOGRAPHY` column is a guaranteed source of drift unless trigger-synchronized. Generated columns make the relationship enforced at the storage layer with zero overhead — `lat`/`lng` are physically stored and indexable, but writes can only happen via `location`. Importers need a small adapter helper that takes `(lat, lng)` and writes `ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography`.

### 5.2 Evidence versioning (Strategy B: append-only supersedes chain)

```sql
ALTER TABLE evidence ADD COLUMN is_current BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE evidence ADD COLUMN supersedes_id UUID REFERENCES evidence(id);
ALTER TABLE evidence ADD COLUMN content_hash TEXT;
-- source_record_id matches the existing column on entities and is required by the harness
ALTER TABLE evidence ADD COLUMN source_record_id TEXT;

-- Default read path: filtered partial index makes is_current=true the cheap query
CREATE INDEX idx_evidence_current ON evidence (case_id) WHERE is_current = TRUE;
CREATE INDEX idx_evidence_content_hash ON evidence (content_hash);

-- Source record uniqueness: only one row per (source, source_record) is "current"
CREATE UNIQUE INDEX uq_evidence_source_record_current ON evidence (source_id, source_record_id)
    WHERE is_current = TRUE AND source_record_id IS NOT NULL;

-- Composite index for Meilisearch keyset-paginated sync
CREATE INDEX idx_evidence_sync ON evidence (updated_at, id);

-- The default read path for evidence — most app code reads this, never the table
CREATE OR REPLACE VIEW v_current_evidence AS
SELECT * FROM evidence WHERE is_current = TRUE;

-- Lock down direct SELECT for non-service roles (D19)
REVOKE SELECT ON evidence FROM anon, authenticated;
GRANT SELECT ON v_current_evidence TO anon, authenticated;
-- The Supabase service_role retains full access for the importer
```

### 5.3 Source-faithful entity model (Approach 2)

```sql
-- Every entity row records which source produced it
ALTER TABLE entities ADD COLUMN source_id UUID REFERENCES sources(id);
ALTER TABLE entities ADD COLUMN source_record_id TEXT;
ALTER TABLE entities ADD COLUMN content_hash TEXT;
CREATE UNIQUE INDEX uq_entity_source_record ON entities (source_id, source_record_id)
    WHERE source_record_id IS NOT NULL;
CREATE INDEX idx_entities_sync ON entities (updated_at, id);

-- Rename merged_into_id to make its purpose unmissable (D18)
ALTER TABLE entities RENAME COLUMN merged_into_id TO redirected_to_id;
COMMENT ON COLUMN entities.redirected_to_id IS
    'Data-correction redirect: this row was a mistake, follow this pointer instead.
     For cross-source identity (same real-world person across sources), use cluster_id.
     These two concepts are deliberately separate. Do not conflate them.';
```

### 5.4 Entity clusters

```sql
CREATE TABLE entity_clusters (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canonical_name           TEXT NOT NULL,
    entity_type              entity_type NOT NULL,
    summary                  TEXT,

    -- Cached resolution. Source of truth lives in cluster_attribute_observations.
    -- Refreshed by resolve_cluster_attributes(cluster_id).
    merged_attributes        JSONB NOT NULL DEFAULT '{}',

    member_count             INTEGER NOT NULL DEFAULT 0,
    is_human_confirmed       BOOLEAN NOT NULL DEFAULT FALSE,
    confidence_score         DECIMAL(3,2),

    -- Cluster-to-cluster merge support (D22)
    redirected_to_cluster_id UUID REFERENCES entity_clusters(id),

    -- Soft delete drives Meilisearch removals (D21)
    deleted_at               TIMESTAMPTZ,

    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE entities ADD COLUMN cluster_id UUID REFERENCES entity_clusters(id);
CREATE INDEX idx_entities_cluster ON entities (cluster_id);
CREATE INDEX idx_clusters_redirect ON entity_clusters (redirected_to_cluster_id)
    WHERE redirected_to_cluster_id IS NOT NULL;
CREATE INDEX idx_clusters_active_sync ON entity_clusters (updated_at, id)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_clusters_deleted_sync ON entity_clusters (deleted_at, id)
    WHERE deleted_at IS NOT NULL;

CREATE TRIGGER trg_clusters_updated BEFORE UPDATE ON entity_clusters
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

COMMENT ON TABLE entity_clusters IS
    'A cluster represents one real-world person/vehicle/etc. as we currently believe it.
     Each cluster has many member entities (one per source record). Merging clusters
     uses redirected_to_cluster_id with compaction (see merge_clusters function).';
```

### 5.5 Attribute observations (D20)

```sql
CREATE TABLE cluster_attribute_observations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cluster_id      UUID NOT NULL REFERENCES entity_clusters(id) ON DELETE CASCADE,
    entity_id       UUID NOT NULL REFERENCES entities(id),
    source_id       UUID NOT NULL REFERENCES sources(id),
    attribute_key   TEXT NOT NULL,
    attribute_value JSONB NOT NULL,
    observed_at     TIMESTAMPTZ NOT NULL,
    confidence      confidence_level,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_cao_cluster_key ON cluster_attribute_observations (cluster_id, attribute_key);
CREATE INDEX idx_cao_source ON cluster_attribute_observations (source_id);
CREATE INDEX idx_cao_entity ON cluster_attribute_observations (entity_id);

COMMENT ON TABLE cluster_attribute_observations IS
    'Per-attribute, per-source provenance. Every observation is preserved forever.
     entity_clusters.merged_attributes is a cached resolution of these rows,
     produced by resolve_cluster_attributes(cluster_id). Never write to
     merged_attributes directly outside that function.';
```

### 5.6 Source reliability infrastructure (D25)

```sql
-- Per-domain rating overrides (curated, sparse — ~50–200 entries at maturity)
CREATE TABLE source_domain_overrides (
    domain          TEXT PRIMARY KEY,
    rating_override INTEGER NOT NULL CHECK (rating_override BETWEEN 1 AND 5),
    rationale       TEXT NOT NULL,
    set_by          UUID REFERENCES users(id),
    set_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Retraction / dispute signals on existing sources table
ALTER TABLE sources ADD COLUMN is_retracted     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sources ADD COLUMN is_disputed      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sources ADD COLUMN retracted_reason TEXT;
ALTER TABLE sources ADD COLUMN retracted_by     UUID REFERENCES users(id);
ALTER TABLE sources ADD COLUMN retracted_at     TIMESTAMPTZ;
CREATE INDEX idx_sources_retracted ON sources (is_retracted) WHERE is_retracted = TRUE;
CREATE INDEX idx_sources_disputed  ON sources (is_disputed)  WHERE is_disputed  = TRUE;

COMMENT ON COLUMN sources.reliability_rating IS
    'Set at registration via source-type default, optionally overridden per-domain.
     NEVER mutated after insert. Use is_retracted / is_disputed to express reliability
     changes without losing the original audit trail.';
```

### 5.7 Soft-delete on interpretation tables (D21)

```sql
ALTER TABLE cross_case_matches ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE connections        ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE INDEX idx_ccm_deleted ON cross_case_matches (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_conn_deleted ON connections (deleted_at) WHERE deleted_at IS NOT NULL;
```

### 5.8 Case visibility (D28)

```sql
ALTER TABLE cases ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'restricted', 'private'));
CREATE INDEX idx_cases_visibility ON cases (visibility) WHERE visibility != 'public';
-- Composite index for Meilisearch keyset-paginated sync (cases is in INDEXED_TARGETS)
CREATE INDEX idx_cases_sync ON cases (updated_at, id);
COMMENT ON COLUMN cases.visibility IS
    'Reserved for future use. Day 1: every case is public. Restricted/private semantics
     defined in the crowdsolve subsystem (#5) spec.';
```

### 5.9 Search sync checkpoint table

```sql
CREATE TABLE meili_sync_checkpoints (
    table_name        TEXT PRIMARY KEY,
    last_updated_at   TIMESTAMPTZ NOT NULL,
    last_id           UUID NOT NULL,
    last_deleted_at   TIMESTAMPTZ,
    last_deleted_id   UUID,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.10 New views

```sql
-- Cluster-resolved entity view: used by app code for read-time identity resolution.
-- NOT used by the Meilisearch sync — the sync indexes entities and entity_clusters
-- as two separate Meilisearch indexes (see §11) so that keyset pagination can use
-- real indexes on the underlying tables instead of a computed view column.
CREATE OR REPLACE VIEW v_resolved_entities AS
SELECT
    COALESCE(c.id, e.id) AS resolved_id,
    COALESCE(c.canonical_name, e.canonical_name) AS canonical_name,
    e.entity_type,
    COALESCE(c.merged_attributes, e.attributes) AS attributes,
    c.id AS cluster_id,
    c.is_human_confirmed,
    e.id AS source_entity_id,
    e.source_id,
    e.source_record_id
FROM entities e
LEFT JOIN entity_clusters c ON e.cluster_id = c.id AND c.deleted_at IS NULL
WHERE e.redirected_to_id IS NULL;

-- Already exists in base schema, keep as-is:
--   v_evidence_full, v_entity_graph, v_assignable_questions,
--   v_pending_matches, v_staging_review_queue
```

### 5.11 Connections updated_at

```sql
-- The base schema's connections table has updated_at; the trigger is in place.
-- This is a no-op safety check:
ALTER TABLE connections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
```

---

## 6. Source Reliability Rating: Population and Maintenance

### 6.1 Layer 1 — Source-type defaults (automatic)

The harness has a constant table mapping `source_type` to a default rating. When a new source is registered and no domain override exists, the type default is used:

| source_type | Default rating |
|---|---|
| `public_record`, `foia_release`, `court_filing`, `congressional_testimony`, `sworn_affidavit` | **5** |
| `police_report`, `academic_paper` | **4** |
| `news_article`, `news_broadcast`, `documentary`, `book`, `interview_transcript` | **3** |
| `podcast`, `website` | **2** |
| `social_media`, `user_upload` | **1** |
| `other` | **2** |

These cutoffs are starting values. The expectation is that they will be tuned during the first few months of moderation experience and frozen after that. Changes should be discussed and recorded in this spec, not applied silently in code.

### 6.2 Layer 2 — Per-domain overrides (curated, sparse)

The `source_domain_overrides` table holds exceptions. The harness checks it before falling back to the type default:

```python
def resolve_initial_rating(domain: str, source_type: str) -> int:
    override = pg.fetchone(
        "SELECT rating_override FROM source_domain_overrides WHERE domain = %s",
        (domain,)
    )
    if override:
        return override['rating_override']
    return SOURCE_TYPE_DEFAULTS[source_type]
```

#### Day-1 seed list

```sql
INSERT INTO source_domain_overrides (domain, rating_override, rationale) VALUES
  ('charleyproject.org',    4, 'Long-running, well-curated, single editor with explicit sourcing'),
  ('doenetwork.org',        4, 'Volunteer-run with vetting standards and citation discipline'),
  ('namus.nij.ojp.gov',     5, 'Federal database, treated as official record'),
  ('missingkids.org',       5, 'NCMEC, government-funded with editorial process'),
  ('murderdata.org',        5, 'MAP — aggregator of FBI/FOIA data, treat as official'),
  ('cde.ucr.cjis.gov',      5, 'FBI Crime Data Explorer'),
  ('fbi.gov',               5, 'Official federal source'),
  ('interpol.int',          5, 'Official international source'),
  ('washingtonpost.com',    4, 'Major paper, strong investigative standards'),
  ('cnn.com',               4, 'Major news with editorial standards'),
  ('reddit.com',            1, 'Forum content: useful for leads, low for ground truth'),
  ('websleuths.com',        1, 'Same as above'),
  ('unidentified-awareness.fandom.com', 2, 'Community wiki: variable quality, often well-cited');
```

The seed list is intentionally small. Curation is a moderator job that grows over time, surfaced in the crowdsolve admin UI later.

### 6.3 Layer 3 — Composable signals at resolve time (no mutation)

`sources.reliability_rating` is set at INSERT and never changed. Two flags compose with it at resolve time:

| Flag | Effect on effective rating |
|---|---|
| `is_retracted = TRUE` | Excluded from consideration entirely (effective rating = `None`) |
| `is_disputed = TRUE` | Effective rating downgraded by one notch (min 1) |

```python
def effective_rating(source) -> int | None:
    if source.is_retracted:
        return None
    if source.is_disputed:
        return max(1, source.reliability_rating - 1)
    return source.reliability_rating
```

### 6.4 The resolver function

```python
def resolve_cluster_attributes(cluster_id: UUID) -> None:
    """
    Pure, deterministic per-attribute resolution for one cluster.
    Re-running on the same data always produces the same result.
    Idempotent and safe to call repeatedly.
    """
    observations = pg.fetchall("""
        SELECT o.*, s.is_retracted, s.is_disputed, s.reliability_rating
        FROM cluster_attribute_observations o
        JOIN sources s ON o.source_id = s.id
        WHERE o.cluster_id = %s
    """, (cluster_id,))

    CONFIDENCE_SCORE = {
        'verified': 1.0, 'corroborated': 0.8, 'unverified': 0.5,
        'unknown': 0.3, 'disputed': 0.1, 'retracted': 0.0,
    }

    by_key: dict[str, list] = defaultdict(list)
    for obs in observations:
        eff = effective_rating(obs)
        if eff is None:
            continue
        by_key[obs.attribute_key].append((obs, eff))

    resolved: dict[str, Any] = {}
    for key, candidates in by_key.items():
        candidates.sort(key=lambda x: (
            -x[1],                                                # higher rating first
            -CONFIDENCE_SCORE.get(x[0].confidence, 0.3),          # higher confidence first
            -x[0].observed_at.timestamp(),                        # more recent first
            str(x[0].id),                                         # deterministic final tiebreaker
        ))
        winner_obs, _ = candidates[0]
        resolved[key] = winner_obs.attribute_value

    pg.execute(
        "UPDATE entity_clusters SET merged_attributes = %s, updated_at = NOW() WHERE id = %s",
        (json.dumps(resolved), cluster_id),
    )
```

### 6.5 Retraction workflow

When a moderator retracts a source:

```sql
BEGIN;
UPDATE sources
   SET is_retracted = TRUE, retracted_reason = $1, retracted_by = $2, retracted_at = NOW()
 WHERE id = $3;

-- Find every cluster that drew an attribute from the retracted source
SELECT DISTINCT cluster_id
  FROM cluster_attribute_observations
 WHERE source_id = $3;
COMMIT;
```

Then the worker host re-runs `resolve_cluster_attributes(cluster_id)` for each affected cluster. Because the resolver is pure and observations are preserved, the result is correct: the retracted source is silently excluded, and a new winner is picked from the remaining observations. The audit trail is intact in `cluster_attribute_observations`.

---

## 7. The Cluster Pipeline (Entity Resolution)

```
scrape/import → raw_staging
       │
       ▼
production: entities (one row per source record, content_hash set, cluster_id NULL)
       │
       ▼
Splink batch job (off-hours, on Supabase scaled to Large for first run)
       │
       │ proposes candidate matches with score 0.0–1.0
       ▼
cross_case_matches table (one row per candidate pair)
       │
       ▼
threshold split:
   • score ≥ 0.95 → auto-create or auto-extend a cluster
   • 0.7 ≤ score < 0.95 → human review queue (v_pending_matches)
   • score < 0.7 → discarded (logged to a metrics table)
       │
       ▼
when a cluster is created or grows:
   • for each new member entity, INSERT rows into cluster_attribute_observations
     for each attribute the entity contributes (one row per attribute_key)
   • run resolve_cluster_attributes(cluster_id)
   • update entity_clusters.canonical_name from the resolver's result
   • bump member_count, recompute confidence_score, set updated_at = NOW()
       │
       ▼
when Splink proposes a match between two ALREADY-CLUSTERED entities (cluster B and cluster A):
   • call merge_clusters(B, A) stored procedure (see §7.1)
       │
       ▼
Meilisearch sync cron picks up changes via updated_at and deleted_at on next run
```

### 7.1 Cluster-to-cluster merge procedure

```sql
CREATE OR REPLACE FUNCTION merge_clusters(source_id UUID, target_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Move all member entities from source cluster to target
    UPDATE entities SET cluster_id = target_id WHERE cluster_id = source_id;

    -- Compaction: rewrite any cluster previously redirected to source → target
    UPDATE entity_clusters
       SET redirected_to_cluster_id = target_id
     WHERE redirected_to_cluster_id = source_id;

    -- Move all observations from source cluster to target
    UPDATE cluster_attribute_observations
       SET cluster_id = target_id
     WHERE cluster_id = source_id;

    -- Tombstone the source cluster
    UPDATE entity_clusters
       SET redirected_to_cluster_id = target_id,
           deleted_at = NOW(),
           updated_at = NOW()
     WHERE id = source_id;

    -- Re-resolve the target cluster's attributes with the newly merged observations
    -- (called from worker host, not from this SQL function, since it's Python)
END;
$$ LANGUAGE plpgsql;
```

The compaction step is the key correctness guarantee: redirect chains never grow beyond depth 1, so a single-step lookup always resolves to the current cluster. Cluster merges are infrequent enough (a moderator-confirmed event, or a high-confidence Splink match between existing clusters) that the O(N) compaction cost is acceptable.

The worker calls `merge_clusters(B, A)` then immediately calls `resolve_cluster_attributes(A)`.

### 7.2 The cluster invariant

**At any moment, every member entity of an active cluster contributes its observations to that cluster's `cluster_attribute_observations`. Removing an entity from a cluster removes its observations. Dissolving a cluster (`deleted_at = NOW()`) does not delete its observations — they're kept for audit, but no longer participate in the resolver because the cluster is excluded from sync.**

This means a Splink false positive caught later is recoverable: clear `cluster_id` on the wrong member, delete that member's rows from `cluster_attribute_observations`, re-run the resolver, the cluster's `merged_attributes` updates correctly. No data is lost.

---

## 8. The Re-ingestion Pipeline (Evidence Versioning)

For each source row arriving from a scraper or importer, the harness performs:

```python
def promote_evidence(harness, raw_row, *, source_id, source_record_id, case_id, **fields):
    """
    Append-only evidence promotion (Strategy B).
    Idempotent: re-running with identical input is a no-op.
    """
    canonical = canonicalize(raw_row)
    new_hash = sha256(canonical.encode('utf-8')).hexdigest()

    # Find the current version of this source record's evidence
    existing = pg.fetchone("""
        SELECT id, content_hash FROM evidence
         WHERE source_id = %s
           AND source_record_id = %s
           AND is_current = TRUE
    """, (source_id, source_record_id))

    if existing is None:
        # First time seeing this source record
        new_id = pg.fetchval("""
            INSERT INTO evidence (case_id, source_id, content_hash, is_current, ...)
            VALUES (%s, %s, %s, TRUE, ...)
            RETURNING id
        """, ...)
        return new_id

    if existing['content_hash'] == new_hash:
        # Unchanged — no-op, log as such
        log.info("evidence unchanged", source_id=source_id, source_record_id=source_record_id)
        return existing['id']

    # Changed — supersede the old row, insert the new one
    with pg.transaction():
        pg.execute("UPDATE evidence SET is_current = FALSE, updated_at = NOW() WHERE id = %s",
                   (existing['id'],))
        new_id = pg.fetchval("""
            INSERT INTO evidence (case_id, source_id, content_hash, is_current,
                                  supersedes_id, ...)
            VALUES (%s, %s, %s, TRUE, %s, ...)
            RETURNING id
        """, ..., existing['id'])
    return new_id
```

The same pattern applies to source-faithful entities: `promote_entity(...)` uses content-hash + supersedes for entity rows that change between scrapes (e.g., a Charley page where the missing-person description was edited).

### 8.1 What counts as "changed"

A row is considered changed when its `content_hash` differs from the current row's hash. The hash is computed by `canonicalize(raw_row)` which:

- sorts dict keys recursively
- normalizes None vs missing keys (None is preserved as `null`, missing keys are absent)
- normalizes dates to ISO-8601 strings
- normalizes decimals to `str(d)` (no float precision loss)
- normalizes whitespace in text fields (trim + collapse internal whitespace)
- excludes fields explicitly marked as "non-substantive" by the importer (e.g., scrape timestamps, `last_seen_by_scraper`)

This is implemented as a single function in the harness (`harness/canonicalize.py`) and unit-tested with adversarial inputs:

- key reordering
- unicode normalization (NFC vs NFD)
- decimal precision edge cases
- null vs missing
- whitespace variants
- nested structures

### 8.2 Idempotency

Because the harness uses content_hash as its dedup key and `(source_id, source_record_id)` as its lookup key, **re-running an importer is always safe**:

- If the source data is unchanged, the importer logs "unchanged" and exits.
- If the source data has changed, the importer creates new versions and supersedes the old.
- If the importer crashes mid-batch, re-running picks up where it left off — already-processed rows are detected by hash and skipped.

This is the same guarantee the existing MAP importer provides via `uuid5` deterministic UUIDs from MAP IDs. The harness generalizes this pattern.

---

## 9. raw_staging Lifecycle

`raw_staging` is append-only at the staging level — scrapers never UPDATE existing raw rows. They only INSERT new ones with the latest content_hash. This means the table grows continuously, but most rows are not actively queried after their first promotion to production.

### 9.1 Hot tier (Postgres)

Kept in the `raw_staging` table:

- All rows with `promoted_evidence_id IS NULL` (unprocessed)
- All rows with `needs_human_review = TRUE`
- The most recent 3 snapshots per `(source_url, content_hash)` regardless of age
- Any snapshot from the last 90 days

### 9.2 Cold tier (S3)

Older snapshots are moved to `s3://casefile-raw-staging-archive/{year}/{month}/{source_domain}/{snapshot_id}.json.gz`. The Postgres row is replaced with a stub containing:

```sql
ALTER TABLE raw_staging ADD COLUMN archive_s3_key TEXT;
ALTER TABLE raw_staging ADD COLUMN archived_at    TIMESTAMPTZ;
```

When `archive_s3_key IS NOT NULL`, `raw_html` and `raw_text` are nulled out and the data lives only in S3. Reprocessing requires fetching from S3.

### 9.3 Lifecycle job

A nightly cron on the worker host:

1. Identifies eligible-for-archival rows (older than 90 days, not in the most-recent-3 set, already promoted)
2. Streams them to S3 as gzipped JSON
3. Updates the Postgres stub
4. Logs summary statistics

Cold-tier rows are **never deleted** unless `is_duplicate = TRUE` AND `promoted_evidence_id IS NULL`. The principle: source data is forever, even if cheap.

---

## 10. The Bulk Import Harness

The harness is a Python library shared by every importer and scraper. It is the only path to production tables.

### 10.1 Public API

```python
class ImportHarness:
    def __init__(self, *, source_type: SourceType, base_url: str, scraper_name: str): ...

    # Source registration — called once per scraper run
    def register_source(self, *, url: str, title: str, **fields) -> UUID: ...

    # Canonical hashing — the only correct way to compute content_hash
    @staticmethod
    def canonicalize(record: dict) -> str: ...

    # Evidence promotion — handles supersedes chain, idempotency
    def promote_evidence(self, raw_row: dict, *, source_id: UUID, source_record_id: str,
                         case_id: UUID, **fields) -> UUID: ...

    # Entity promotion — source-faithful, no auto-merging
    def promote_entity(self, raw_row: dict, *, source_id: UUID, source_record_id: str,
                       entity_type: EntityType, canonical_name: str, **fields) -> UUID: ...

    # Junction promotion
    def link_entity_to_evidence(self, *, entity_id: UUID, evidence_id: UUID,
                                role: EntityRole, confidence: ConfidenceLevel) -> None: ...

    # Raw staging — append-only
    def stage_raw(self, *, url: str, raw_html: str, raw_text: str, **fields) -> UUID: ...

    # Logging / metrics
    def log_unchanged(self, source_record_id: str): ...
    def log_promoted(self, evidence_id: UUID, source_record_id: str): ...
    def log_superseded(self, old_id: UUID, new_id: UUID, source_record_id: str): ...
```

### 10.2 The harness contract

Importers MAY:
- Call any harness method
- Read freely from any production table for cross-referencing during their own run

Importers MUST:
- Use `harness.canonicalize()` for any content hashing — never roll their own
- Pass `source_id` + `source_record_id` to every `promote_*` call
- Use `harness.register_source()` rather than direct INSERT into `sources`
- Set `metadata['source_record_id']` on every evidence row

Importers MUST NOT:
- INSERT directly into `evidence`, `entities`, `connections`, `cluster_attribute_observations`, or `entity_clusters`
- UPDATE `is_current`, `deleted_at`, or `redirected_to_id` directly (the harness owns these state machines)
- Compute hashes any way other than via `harness.canonicalize()`
- Bypass the harness for "performance" reasons (the harness is fast enough; the correctness guarantees are the point)

### 10.3 Reprocess mode

The harness supports `--reprocess` which replays raw_staging into production. This is the recovery path when:

- Schema changes invalidate cached parsing
- The canonicalize() function changes and old hashes need recomputing
- A bug in an importer is found after the fact

Reprocess uses the same `promote_*` API and obeys the same idempotency rules — re-running it on the same data is a no-op.

---

## 11. Search Sync — Meilisearch

### 11.1 The cron loop

Runs every 60 seconds on the worker host. One Python script, ~200 lines.

```python
INDEXED_TARGETS = [
    # (postgres_table, meili_index_name, has_soft_delete, filterable_fields, default_filter)
    ('cases',           'cases',     False, ['visibility', 'crime_type', 'status', 'location_state'], 'visibility = "public"'),
    ('evidence',        'evidence',  False, ['is_current', 'category', 'confidence', 'case_id'],     'is_current = true'),
    ('entities',        'entities',  False, ['entity_type', 'cluster_id', 'is_identified'],          None),
    ('entity_clusters', 'clusters',  True,  ['entity_type', 'is_human_confirmed'],                   None),
]
```

**Why two separate indexes for entities and clusters** (rather than one merged index from `v_resolved_entities`): the merged view's `updated_at` would be a computed column (`GREATEST(e.updated_at, c.updated_at)`), and Postgres cannot use a real composite index for keyset pagination on a computed column. Each underlying table has its own `(updated_at, id)` index that the sync queries can use directly. The application's search layer queries both Meilisearch indexes when it needs cluster-resolved results: it first queries `entities` to find candidate matches (which carry their `cluster_id`), then optionally enriches with the corresponding `clusters` documents in a second call. This is one extra Meilisearch call per search but avoids a Postgres-side performance trap that would otherwise bite at 10M+ rows.

**Why `evidence` is indexed as a whole** (not just `v_current_evidence`): Meilisearch needs to know about superseded rows so it can update them when they flip to `is_current = false`. The default search filter `is_current = true` excludes them from user-facing results, but they remain in the index so the sync cron can update them in place rather than having to delete-and-reinsert. This is cheaper at scale and avoids the orphaned-document class of bug.

def sync_table(pg_table: str, meili_index: str, has_soft_delete: bool,
               filterable_fields: list[str], default_filter: str | None):
    cp = get_checkpoint(pg_table)
    # Idempotent: configuring filterable fields is safe to run every loop
    meili.index(meili_index).update_filterable_attributes(filterable_fields)

    # ── Upserts: keyset-paginated by (updated_at, id) ──
    while True:
        sql = f"""
            SELECT * FROM {pg_table}
            WHERE (updated_at, id) > (%s, %s)
              { 'AND deleted_at IS NULL' if has_soft_delete else '' }
            ORDER BY updated_at ASC, id ASC
            LIMIT 1000
        """
        rows = pg.fetchall(sql, (cp.last_updated_at, cp.last_id))
        if not rows:
            break
        meili.index(meili_index).add_documents([row_to_document(r) for r in rows])
        cp.last_updated_at = rows[-1]['updated_at']
        cp.last_id = rows[-1]['id']
        save_checkpoint(pg_table, cp)

    # ── Soft deletions: separate cursor pass on deleted_at ──
    if has_soft_delete:
        while True:
            sql = f"""
                SELECT id FROM {pg_table}
                WHERE deleted_at IS NOT NULL
                  AND (deleted_at, id) > (%s, %s)
                ORDER BY deleted_at ASC, id ASC
                LIMIT 1000
            """
            deleted = pg.fetchall(sql, (cp.last_deleted_at or EPOCH, cp.last_deleted_id or NULL_UUID))
            if not deleted:
                break
            meili.index(meili_index).delete_documents([d['id'] for d in deleted])
            cp.last_deleted_at = deleted[-1]['deleted_at']
            cp.last_deleted_id = deleted[-1]['id']
            save_checkpoint(pg_table, cp)


def main():
    for pg_table, meili_index, has_soft_delete, filterable, default_filter in INDEXED_TARGETS:
        try:
            sync_table(pg_table, meili_index, has_soft_delete, filterable, default_filter)
        except Exception as e:
            metric.increment("meili_sync_error", table=pg_table)
            log.exception("sync failed", table=pg_table)
```

The application's search layer is responsible for applying the `default_filter` (e.g., `is_current = true` for evidence, `visibility = "public"` for cases) on every user-facing query. This is documented in the subsystem #4 spec but the filter strings are listed here because they're tightly coupled to the index schema.

### 11.2 The pagination cursor (Gemini bug 1 fix)

The composite cursor `(updated_at, id)` with row-comparison `>` is the only correct keyset-pagination form for this query shape. Naive forms have edge cases:

- `WHERE updated_at > %s LIMIT 1000`: misses any rows that share the boundary timestamp with the previous batch (catastrophic during bulk imports)
- `WHERE updated_at >= %s AND id > %s LIMIT 1000`: misses rows where `updated_at` is strictly greater than the cursor but `id` happens to be less than the cursor's id

Postgres supports the row-comparison form natively and uses the composite index `(updated_at, id)` directly. This is the only form used in this design.

### 11.3 Soft-delete reconciliation

In addition to the per-cron deletion pass, a **nightly reconciliation cron** runs once per day:

1. For each indexed target, fetch the full set of valid Postgres ids (`SELECT id WHERE deleted_at IS NULL` or equivalent)
2. Fetch the full set of Meilisearch document ids
3. Delete any Meilisearch documents whose ids no longer exist in the valid set

This is belt-and-suspenders against any sync edge case the per-cron job missed. At 10M documents the reconciliation pass takes a few minutes — acceptable as a nightly job.

### 11.4 Initial / full re-sync

Triggered manually via `python sync_meili.py --full-sync [--table cases]`. Resets the checkpoint to epoch and replays everything. Used:

- After a schema change to indexed fields
- After a Meilisearch index recreation
- During the initial bring-up of the platform

Meilisearch handles full re-indexing fine at the projected scale.

---

## 12. RLS Strategy

### 12.1 Public-read tables

Most production tables are public-read. Each gets a zero-cost RLS policy:

```sql
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY cases_public_read ON cases
    FOR SELECT TO anon, authenticated
    USING (visibility = 'public');

-- Same shape for: sources, entity_clusters, connections, entity_evidence,
--                 entity_cases, evidence_links, timeline_events
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY sources_public_read ON sources
    FOR SELECT TO anon, authenticated USING (TRUE);
-- ... etc
```

`evidence` is special: direct SELECT is revoked (D19), only the view is granted.

`entities` is special: read goes through `v_resolved_entities` which already filters out redirected rows.

### 12.2 Writes — service role only

All production tables INSERT/UPDATE/DELETE are restricted to the Supabase `service_role` (used by the importer harness). The `anon` and `authenticated` roles cannot write.

```sql
REVOKE INSERT, UPDATE, DELETE ON cases, sources, evidence, entities,
                                  entity_clusters, connections, ...
    FROM anon, authenticated;
```

User contributions go through `contributions` (see §12.3), which flows through a moderation pipeline before any production-table change.

### 12.3 User-scoped tables

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_own_row ON users
    FOR SELECT TO authenticated USING ((select auth.uid()) = id);
CREATE POLICY users_update_own ON users
    FOR UPDATE TO authenticated USING ((select auth.uid()) = id);

ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY contributions_own_or_accepted ON contributions
    FOR SELECT TO authenticated
    USING ((select auth.uid()) = user_id OR status = 'accepted');
CREATE POLICY contributions_insert_own ON contributions
    FOR INSERT TO authenticated
    WITH CHECK ((select auth.uid()) = user_id);
-- Status updates by moderators only — separate policy in subsystem #5
```

The `(select auth.uid())` subselect form is required (not bare `auth.uid()`) — Postgres caches the JWT extraction as an initPlan, avoiding per-row evaluation. Combined with `btree(user_id)` indexes, RLS is sub-millisecond at any table size.

### 12.4 Admin / service tables

```sql
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM users
         WHERE id = (select auth.uid()) AND is_admin = TRUE
    );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

ALTER TABLE audit_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_staging       ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_domain_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_admin_only      ON audit_log         FOR SELECT USING (is_admin());
CREATE POLICY raw_staging_admin     ON raw_staging       FOR SELECT USING (is_admin());
CREATE POLICY scrape_jobs_admin     ON scrape_jobs       FOR SELECT USING (is_admin());
CREATE POLICY domain_overrides_admin ON source_domain_overrides FOR SELECT USING (is_admin());
```

### 12.5 open_questions

```sql
ALTER TABLE open_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY questions_public_read ON open_questions
    FOR SELECT TO anon, authenticated USING (TRUE);

COMMENT ON TABLE open_questions IS
    'Public-read by design: the crowdsolve product premise is that anyone can
     volunteer to answer any question. Sensitive ongoing-investigation data
     does NOT belong in this table — use a separate restricted-access table
     if that requirement ever arises. This is intentional, not an oversight.';
```

### 12.6 cross_case_matches

Two visibility states:

- Reviewed and confirmed → public-read (these are valuable cross-case leads users should see)
- Unreviewed → moderator/admin only (these are noisy ML proposals, not facts)

```sql
ALTER TABLE cross_case_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY ccm_confirmed_public ON cross_case_matches
    FOR SELECT TO anon, authenticated
    USING (is_reviewed = TRUE AND is_confirmed = TRUE AND deleted_at IS NULL);
CREATE POLICY ccm_unreviewed_admin ON cross_case_matches
    FOR SELECT USING (is_admin());
```

---

## 13. Operational Invariants

These are the disciplines that keep the design coherent over time. Some are enforced at the database level, some at the harness level, some are conventions documented here.

### 13.1 Schema-level enforcement

| Invariant | Mechanism |
|---|---|
| Public roles can only read evidence through `v_current_evidence` | `REVOKE SELECT ON evidence` + `GRANT SELECT ON v_current_evidence` |
| Spatial coords have one source of truth | `location_lat`/`lng` are `GENERATED ALWAYS STORED` from `location` |
| Source record uniqueness | `UNIQUE (source_id, source_record_id) WHERE source_record_id IS NOT NULL` |
| RLS subselect form for user-scoped reads | Code review + `pg_policies` audit during migration test |
| `updated_at` maintained on all indexed-for-search tables | Triggers in base schema + delta |
| Public-read tables use zero-cost RLS | `USING (TRUE)` policies, planner short-circuits |

### 13.2 Harness-level enforcement

| Invariant | Mechanism |
|---|---|
| All content hashes use the canonical form | The `canonicalize()` function is the only path; unit tests cover adversarial inputs |
| Importers cannot write to production tables directly | The harness is the only library imported; service role credentials are not exposed to importer scripts directly |
| Source records carry `(source_id, source_record_id)` | `promote_*` API requires these as named parameters |
| Re-running an importer is idempotent | `promote_evidence` checks content_hash before INSERT |
| First-pass observations are emitted with each entity promotion | The harness's `promote_entity` accepts an `attributes` dict and produces `cluster_attribute_observations` rows automatically when the entity is later clustered |

### 13.3 Convention-level (documented, not enforced)

| Convention | Where documented |
|---|---|
| Read evidence via `v_current_evidence`, never the table | Schema comment + this spec |
| Read entities via `v_resolved_entities`, never the table for cross-source identity queries | Schema comment + this spec |
| Only `resolve_cluster_attributes()` writes to `entity_clusters.merged_attributes` | Schema comment + this spec |
| `cluster_id` is for cross-source identity, `redirected_to_id` is for data corrections | Schema comment + this spec |
| `open_questions` is intentionally public; sensitive tasking goes elsewhere | Schema comment + this spec |
| Source rating is set at registration and never silently mutated | Schema comment + this spec |

### 13.4 Things that are forbidden by design

- Direct INSERT/UPDATE on `evidence`, `entities`, `entity_clusters`, `cluster_attribute_observations` from any code that is not the harness
- Computing content hashes outside `harness.canonicalize()`
- Writing to `entity_clusters.merged_attributes` outside `resolve_cluster_attributes()`
- Mutating `sources.reliability_rating` after insert
- Storing sensitive case data in `open_questions`
- Adding a column to `evidence` whose semantics depend on `is_current = TRUE` without also updating the supersedes pipeline

---

## 14. Migration / Build Sequence

This is also the natural shape of the implementation plan that comes after this spec.

### Phase 0: Provisioning

1. Create Supabase project on Pro plan
2. Add Medium compute add-on
3. Enable extensions: `postgis`, `pg_trgm`, `tsvector`, `uuid-ossp`, `btree_gist`
4. Provision Meilisearch Cloud project (Free tier OK for MVP, upgrade as needed)
5. Provision worker host (Railway or Fly.io)
6. Provision an S3 bucket (Supabase Storage day 1; create the `casefile-raw-staging-archive/` prefix)

### Phase 1: Schema

1. Run `DATABASES/schema.sql` against Supabase via direct connection
2. Apply schema deltas from §5 of this spec
3. Apply RLS policies from §12
4. Verify with a test query: `SELECT * FROM v_current_evidence LIMIT 1;` should work, `SELECT * FROM evidence LIMIT 1;` should fail for `anon`

### Phase 2: Harness

1. Build the bulk import harness library (`harness/`) implementing §10.1 API
2. Implement `canonicalize()` with adversarial unit tests
3. Implement `promote_evidence`, `promote_entity`, `register_source`, `link_entity_to_evidence`
4. Build the source-type defaults table and `resolve_initial_rating()`
5. Seed `source_domain_overrides` with the day-1 list from §6.2
6. Add unit tests covering: idempotency, supersedes chain, content_hash dedup, hash canonicalization edge cases

### Phase 3: First import (MAP)

1. Adapt the existing `map_importer.py` to use the harness instead of writing NDJSON directly
2. Run a `--test 100` smoke test
3. Verify counts, supersedes chain, source registration
4. Run the full MAP import (~5M rows)
   - Target: complete in < 30 minutes on Medium compute
   - If it doesn't, scale to Large temporarily
5. Validate row counts: `cases`, `evidence`, `entities`, `sources`, `entity_evidence` should match the import summary

### Phase 4: Second import (Charley)

1. Adapt `charley_scraper.py` to use the harness
2. Run a small smoke test (`--letter A`)
3. Run the full crawl (~16k cases)
4. Validate

### Phase 5: First entity resolution batch

1. Install Splink on the worker host
2. Configure Splink blocking rules and comparison vectors for the `entities` table
3. Scale Supabase compute to Large
4. Run the first ER batch on the combined MAP + Charley corpus (~5M+ entities)
5. Insert candidate matches into `cross_case_matches` with scores
6. Run the auto-cluster pipeline for `score >= 0.95` matches
7. Run `resolve_cluster_attributes()` for every newly created cluster
8. Scale Supabase compute back to Medium
9. Validate: spot-check 100 random clusters for plausibility; review a sample of the human-review queue (`v_pending_matches`)

### Phase 6: Meilisearch sync

1. Build the sync cron script (§11.1)
2. Run a full initial sync of all four indexed targets
3. Verify document counts in Meilisearch match Postgres counts
4. Schedule the cron at 60s interval
5. Build the nightly reconciliation cron (§11.3)
6. Smoke test: hit Meilisearch typeahead API with a known case title → verify hit → click through to Postgres row → verify it renders

### Phase 7: Smoke tests

1. End-to-end: scrape a single new Charley page → harness writes to staging → harness promotes to evidence → Splink picks it up in next ER run → cluster (or doesn't) → search picks up the change within 60s
2. Re-ingestion: re-scrape the same Charley page after editing the source → verify supersedes chain
3. Retraction: mark a test source as retracted → verify affected clusters get re-resolved → verify Meilisearch reflects new attributes
4. Cluster merge: manually merge two test clusters via `merge_clusters()` → verify compaction → verify Meilisearch deletes the source cluster
5. Bulk import idempotency: re-run the MAP importer → verify zero new rows, all "unchanged" log lines

### Phase 8: Done

The platform is now ready for subsystem #3 (richer scraper framework) and #4 (public website) to begin. Subsystem #5 (crowdsolve UI) builds on top of the contributions / users / RLS infrastructure already present.

---

## 15. Out of Scope (Explicitly Deferred)

| Item | Where it goes instead |
|---|---|
| Public website front-end (Next.js, React, etc.) | Subsystem #4 |
| Map rendering, vector tiles, PostGIS query optimization beyond GiST | Subsystem #4 |
| Crowdsolve contribution UI, voting, reputation scoring | Subsystem #5 |
| Restricted-case access control enforcement | Subsystem #5 |
| Moderator workflows for source domain overrides, retractions, cluster merge confirmation | Subsystem #5 |
| Polite-crawling, rate-limit handling, change-detection in scrapers | Subsystem #3 (the harness is defined here, but the polite-crawling layer is its own design) |
| NLP entity extraction from raw text into structured `entities` rows | Subsystem #3 (today, importers do this manually; the NLP harness is its own subsystem) |
| Cross-case graph traversal beyond 2 hops | Future spec, only if Postgres recursive CTEs are insufficient |
| Apache AGE / Neo4j integration | Future spec, only if needed |
| Full-text search ranking and tuning | Subsystem #4 (Meilisearch defaults are fine for MVP) |
| Read replica configuration | Operational doc, applied at Growth phase |
| Backup and disaster recovery | Operational doc; Supabase Pro provides daily backups by default |
| Cost monitoring and alerting | Operational doc |
| Staging vs production environments | Operational doc; Supabase preview branches recommended |

---

## 16. Open Issues / Future Decisions

Items that came up during brainstorming and were intentionally deferred:

1. **Source-type default ratings tuning.** The values in §6.1 are starting values. Expected to be revisited after the first 3 months of moderation experience and then frozen.
2. **Domain override seed list expansion.** §6.2 has ~13 entries. Will grow to ~50–200 over the first year. Process for adding entries lives in subsystem #5.
3. **Splink configuration.** Blocking rules, comparison vectors, and threshold cutoffs are TBD. Likely a separate small spec at Phase 5 of the migration sequence.
4. **Meilisearch index schema.** Which fields are searchable, filterable, sortable. TBD at Phase 6. Defaults are likely fine for MVP.
5. **Moderator UI for retraction, dispute, cluster merge confirmation.** Subsystem #5.
6. **`audit_log` granularity vs cost.** Currently logs every change. At 10M+ rows this could grow large. May need a retention policy or partition strategy. Future operational doc.
7. **Rate limiting / abuse on the public site.** Subsystem #4 (Cloudflare in front of Supabase, likely).

---

## 17. Glossary

- **Approach 2** — The chosen entity model: every source record is its own entity, clusters group them. See §7.
- **Strategy B** — The chosen evidence re-ingestion model: append-only with supersedes chain. See §8.
- **Cluster** — A group of `entities` rows believed to refer to the same real-world person/vehicle/etc. Stored in `entity_clusters`.
- **Observation** — A single (cluster, attribute_key, attribute_value, source) tuple. Stored in `cluster_attribute_observations`.
- **Effective rating** — A source's rating after composing `reliability_rating` with `is_retracted` and `is_disputed` flags. See §6.3.
- **Resolver** — The pure function that picks the winning observation per attribute_key for a cluster, writing the result to `entity_clusters.merged_attributes`. See §6.4.
- **Harness** — The Python library that all importers use to write to production tables. The only writer to production. See §10.
- **Promote** — The harness operation that takes a raw scraped row and produces production-table inserts (with idempotency, supersedes, content_hash dedup).
- **Source record** — A single row from a single source (one MAP CSV row, one Charley page, one NamUs case). Identified by `(source_id, source_record_id)`.
- **Production tables** — `cases`, `evidence`, `entities`, `entity_clusters`, etc. The "live" data the platform serves.
- **Raw staging** — `raw_staging` table + S3 cold tier. Where scraped content lives before promotion.
- **Public-read** — A table whose contents are visible to `anon` and `authenticated` Postgres roles via a zero-cost RLS policy.

---

*End of design document.*
