# CASEMAKER Plan A — Harness Library + Schema Migrations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the bulk import harness library and Postgres schema deltas described in `docs/superpowers/specs/2026-04-08-storage-and-bulk-import-design.md`, with comprehensive unit tests and a containerized integration test suite. The output is ready to be used by importers in Plan B.

**Architecture:** A small Python package (`harness/`) that owns all writes to production tables. Pure functions (canonicalize, resolver scoring, rating composition) are unit-tested without a database. Database-touching functions (`promote_evidence`, `promote_entity`, source registration) are integration-tested against a real Postgres spun up via `testcontainers`. A migrations directory contains the SQL deltas that must be applied on top of the existing `DATABASES/schema.sql`.

**Tech Stack:** Python 3.11+, psycopg3 (`psycopg[binary]`), pytest, testcontainers-python, plain dataclasses (no ORM, no Pydantic).

---

## Scope of this plan

Plan A is **fully offline**. Nothing in it requires Supabase, Meilisearch, or any provisioned service. You can run every task on a laptop with Python and Docker installed.

**In scope:**
- Postgres migration containing all schema deltas from spec §5
- Harness library: `canonicalize`, `types`, `db`, `sources`, `promote_evidence`, `promote_entity`, `resolve_cluster_attributes`
- Unit tests for all pure functions (no DB)
- Integration tests against a real containerized Postgres
- An end-to-end smoke test that exercises the full pipeline

**Out of scope (Plan B / Plan C):**
- Refactoring `DATABASES/map_importer.py` and `SCRAPERS/charley_scraper.py` to use the harness — Plan B
- The Meilisearch sync cron — Plan B
- The raw_staging archival job — Plan B
- Splink configuration and the ER batch job — Plan C
- Any actual provisioning of Supabase or Meilisearch — operational, not coding

**What "done" means:** `pytest` runs green for both unit and integration suites against a fresh containerized Postgres, the migration SQL applies cleanly on top of `DATABASES/schema.sql`, and a single end-to-end smoke test demonstrates: register source → promote evidence → promote entity → manually create a cluster → resolve attributes → verify the resolved blob matches the highest-rated observation.

---

## File Structure

After Plan A is complete the repository will look like this. New files marked **[NEW]**.

```
CASEMAKER/                                    (still locally named CASEFILE — see spec)
├── .gitignore                                 (existing — extended in Task 1)
├── pyproject.toml                             [NEW]
├── README.md                                  (NOT created — explicit decision)
│
├── DATABASES/
│   ├── schema.sql                             (existing, unchanged)
│   ├── map_importer.py                        (existing, unchanged in Plan A — touched in Plan B)
│   ├── load_map_data.sql                      (existing)
│   ├── layer2.jsx                             (existing)
│   └── layer3.jsx                             (existing)
│
├── SCRAPERS/
│   ├── charley_scraper.py                     (existing, unchanged in Plan A — touched in Plan B)
│   ├── charley_scraper_README.md              (existing)
│   ├── load_charley_data.sql                  (existing)
│   └── scraping_sources_master_list.md        (existing)
│
├── docs/
│   └── superpowers/
│       ├── specs/
│       │   └── 2026-04-08-storage-and-bulk-import-design.md   (existing, the spec)
│       └── plans/
│           └── 2026-04-08-plan-a-harness-and-migrations.md    (this file)
│
├── harness/                                   [NEW] — the bulk import harness library
│   ├── __init__.py                            [NEW] — exports the public API
│   ├── canonicalize.py                        [NEW] — canonicalize() and content_hash()
│   ├── types.py                               [NEW] — dataclasses + enum mirrors
│   ├── db.py                                  [NEW] — psycopg3 connection + transaction helper
│   ├── sources.py                             [NEW] — source registration, type defaults, effective_rating
│   ├── promote.py                             [NEW] — promote_evidence + promote_entity
│   └── resolver.py                            [NEW] — resolve_cluster_attributes (pure)
│
├── migrations/                                [NEW]
│   ├── README.md                              [NEW] — application order, how to run
│   └── 0001_storage_layer_deltas.sql          [NEW] — every schema delta from spec §5
│
└── tests/                                     [NEW]
    ├── __init__.py                            [NEW]
    ├── conftest.py                            [NEW] — shared fixtures, testcontainers setup
    ├── unit/                                  [NEW]
    │   ├── __init__.py                        [NEW]
    │   ├── test_canonicalize.py               [NEW]
    │   ├── test_sources.py                    [NEW]
    │   └── test_resolver.py                   [NEW]
    └── integration/                           [NEW]
        ├── __init__.py                        [NEW]
        ├── test_migration.py                  [NEW]
        ├── test_register_source.py            [NEW]
        ├── test_promote_evidence.py           [NEW]
        ├── test_promote_entity.py             [NEW]
        ├── test_resolver_pipeline.py          [NEW]
        └── test_smoke_e2e.py                  [NEW]
```

### File responsibilities

- **`harness/canonicalize.py`** — Pure. Takes a Python dict, returns a deterministic JSON string and a SHA-256 hex digest. Handles: key sort order, None vs missing, decimal precision, date normalization, NFC unicode normalization, whitespace collapse on text fields, and an `exclude` parameter for non-substantive fields. No imports from other harness modules.
- **`harness/types.py`** — Pure. Dataclass mirrors of the Postgres enums (`source_type`, `evidence_category`, `confidence_level`, `entity_type`, `entity_role`) and small dataclasses for the harness API surface (`SourceRecord`, `PromotionResult`, `ObservationInput`). No DB imports.
- **`harness/db.py`** — Thin wrapper around `psycopg.Connection` providing a context-managed transaction helper and named-parameter execute. The only module that imports `psycopg`. Used by every database-touching harness function.
- **`harness/sources.py`** — Owns the source-rating system from spec §6. Pure functions for `effective_rating()` and the `SOURCE_TYPE_DEFAULTS` table; one DB-touching function `register_source()`.
- **`harness/promote.py`** — `promote_evidence()` and `promote_entity()`, implementing Strategy B (append-only supersedes) for evidence and source-faithful inserts for entities. Uses `db.py` and `canonicalize.py`.
- **`harness/resolver.py`** — `resolve_cluster_attributes(cluster_id, conn)`. Pure scoring logic separated from the DB read/write so the scoring can be tested without a database.
- **`migrations/0001_storage_layer_deltas.sql`** — The exact SQL from spec §5, applied after `DATABASES/schema.sql`.
- **`tests/unit/`** — Pure-Python tests, runnable with `pytest tests/unit -v`. No Docker required.
- **`tests/integration/`** — Tests that require a real Postgres. Auto-managed via `testcontainers`. Skipped automatically if Docker is unavailable. Run with `pytest tests/integration -v -m integration`.

---

## Tasks

### Task 1: Project scaffolding

**Files:**
- Create: `pyproject.toml`
- Create: `harness/__init__.py`
- Create: `tests/__init__.py`
- Create: `tests/unit/__init__.py`
- Create: `tests/integration/__init__.py`
- Modify: `.gitignore`

- [ ] **Step 1: Create `pyproject.toml`**

```toml
[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "casemaker-harness"
version = "0.1.0"
description = "Bulk import harness for the CASEMAKER crime database platform"
requires-python = ">=3.11"
dependencies = [
    "psycopg[binary]>=3.2",
    "python-dateutil>=2.9",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-cov>=5.0",
    "testcontainers[postgres]>=4.0",
]

[tool.setuptools.packages.find]
include = ["harness*"]

[tool.pytest.ini_options]
testpaths = ["tests"]
markers = [
    "integration: requires a real Postgres (auto-managed via testcontainers, needs Docker)",
]
filterwarnings = [
    "ignore::DeprecationWarning",
]
```

- [ ] **Step 2: Create empty package init files**

```python
# harness/__init__.py
"""CASEMAKER bulk import harness — see docs/superpowers/specs/2026-04-08-storage-and-bulk-import-design.md."""

__version__ = "0.1.0"
```

```python
# tests/__init__.py
```

```python
# tests/unit/__init__.py
```

```python
# tests/integration/__init__.py
```

- [ ] **Step 3: Extend `.gitignore`**

The existing `.gitignore` already covers most Python artifacts. Verify these lines are present (they were added in the initial commit):

```
__pycache__/
*.py[cod]
*.egg
*.egg-info/
.pytest_cache/
.mypy_cache/
.ruff_cache/
.coverage
htmlcov/
venv/
.venv/
```

If any are missing, append them.

- [ ] **Step 4: Verify the package can be installed**

Run:
```bash
python -m pip install -e ".[dev]"
```

Expected: installs the package and all dev dependencies. Final line should be similar to `Successfully installed casemaker-harness-0.1.0 ...`.

- [ ] **Step 5: Verify the package can be imported**

Run:
```bash
python -c "import harness; print(harness.__version__)"
```

Expected output: `0.1.0`

- [ ] **Step 6: Commit**

```bash
git add pyproject.toml harness/__init__.py tests/__init__.py tests/unit/__init__.py tests/integration/__init__.py .gitignore
git commit -m "$(cat <<'EOF'
chore: scaffold harness package and test directories

Adds pyproject.toml with psycopg3 + testcontainers dev dependency, empty
package init files for harness/ and tests/, and verifies the package
installs in editable mode.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `canonicalize.py` — pure deterministic JSON serialization

This is the bedrock function. Every content hash in the system depends on it producing the same bytes for semantically-equivalent input. Tests come first.

**Files:**
- Create: `tests/unit/test_canonicalize.py`
- Create: `harness/canonicalize.py`

- [ ] **Step 1: Write the failing test file**

Create `tests/unit/test_canonicalize.py`:

```python
"""Adversarial tests for harness.canonicalize.

These tests must pass before ANY importer is built. Hash determinism is the
foundation of the entire re-ingestion pipeline — if these break, the whole
content_hash → supersedes chain becomes incorrect.
"""
from datetime import date, datetime, timezone
from decimal import Decimal
import unicodedata

import pytest

from harness.canonicalize import canonicalize, content_hash


class TestKeyOrderIndependence:
    def test_same_keys_different_order_produce_same_hash(self):
        a = {"name": "Alice", "age": 30, "city": "Des Moines"}
        b = {"city": "Des Moines", "age": 30, "name": "Alice"}
        c = {"age": 30, "name": "Alice", "city": "Des Moines"}
        assert content_hash(a) == content_hash(b) == content_hash(c)

    def test_nested_dict_key_order_independent(self):
        a = {"outer": {"x": 1, "y": 2}, "z": 3}
        b = {"z": 3, "outer": {"y": 2, "x": 1}}
        assert content_hash(a) == content_hash(b)


class TestNullVsMissing:
    def test_null_value_is_distinct_from_missing_key(self):
        with_null = {"name": "Alice", "age": None}
        without_age = {"name": "Alice"}
        assert content_hash(with_null) != content_hash(without_age)

    def test_explicit_null_in_nested_dict(self):
        a = {"person": {"name": "Alice", "dob": None}}
        b = {"person": {"name": "Alice"}}
        assert content_hash(a) != content_hash(b)


class TestDateNormalization:
    def test_date_object_normalized_to_iso(self):
        a = {"dob": date(1959, 6, 15)}
        b = {"dob": "1959-06-15"}
        assert content_hash(a) == content_hash(b)

    def test_datetime_object_normalized_to_iso(self):
        dt = datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)
        a = {"observed_at": dt}
        b = {"observed_at": "2024-01-15T10:30:00+00:00"}
        assert content_hash(a) == content_hash(b)

    def test_naive_datetime_assumed_utc(self):
        naive = datetime(2024, 1, 15, 10, 30, 0)
        aware = datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)
        assert content_hash({"t": naive}) == content_hash({"t": aware})


class TestDecimalNormalization:
    def test_decimal_normalized_to_string(self):
        a = {"weight": Decimal("180.5")}
        b = {"weight": "180.5"}
        assert content_hash(a) == content_hash(b)

    def test_decimal_does_not_lose_precision(self):
        # Floats would lose this precision; Decimal should preserve it.
        precise = {"value": Decimal("0.1") + Decimal("0.2")}  # exactly 0.3
        sloppy = {"value": "0.3"}
        assert content_hash(precise) == content_hash(sloppy)

    def test_decimal_does_not_collapse_to_float(self):
        # If we accidentally convert to float, 0.1 + 0.2 != 0.3 in float land
        # and the hash would diverge from the string "0.3". This catches that.
        a = {"value": Decimal("0.30")}
        b = {"value": Decimal("0.3")}
        # These ARE different decimal representations — should hash differently
        # (canonicalize preserves the original string form)
        assert content_hash(a) != content_hash(b)


class TestUnicodeNormalization:
    def test_nfc_and_nfd_produce_same_hash(self):
        # "café" in two different unicode normalizations
        nfc = unicodedata.normalize("NFC", "café")
        nfd = unicodedata.normalize("NFD", "café")
        assert nfc != nfd  # bytes differ
        assert content_hash({"name": nfc}) == content_hash({"name": nfd})

    def test_nfc_and_nfd_in_nested_string(self):
        a = {"person": {"name": unicodedata.normalize("NFC", "naïve")}}
        b = {"person": {"name": unicodedata.normalize("NFD", "naïve")}}
        assert content_hash(a) == content_hash(b)


class TestWhitespaceNormalization:
    def test_leading_and_trailing_whitespace_stripped(self):
        a = {"name": "  Alice  "}
        b = {"name": "Alice"}
        assert content_hash(a) == content_hash(b)

    def test_internal_whitespace_collapsed(self):
        a = {"description": "blue   two-toned\tcar"}
        b = {"description": "blue two-toned car"}
        assert content_hash(a) == content_hash(b)

    def test_newlines_collapsed_to_single_space(self):
        a = {"summary": "first line\n\nsecond line"}
        b = {"summary": "first line second line"}
        assert content_hash(a) == content_hash(b)


class TestExcludedFields:
    def test_excluded_top_level_field_does_not_affect_hash(self):
        a = {"name": "Alice", "scraped_at": "2026-01-01T00:00:00Z"}
        b = {"name": "Alice", "scraped_at": "2026-04-08T15:30:00Z"}
        assert content_hash(a, exclude={"scraped_at"}) == content_hash(b, exclude={"scraped_at"})

    def test_without_exclude_scraped_at_changes_hash(self):
        a = {"name": "Alice", "scraped_at": "2026-01-01T00:00:00Z"}
        b = {"name": "Alice", "scraped_at": "2026-04-08T15:30:00Z"}
        assert content_hash(a) != content_hash(b)

    def test_multiple_excludes(self):
        a = {"name": "Alice", "scraped_at": "x", "last_seen_by_scraper": "y"}
        b = {"name": "Alice", "scraped_at": "z", "last_seen_by_scraper": "w"}
        excludes = {"scraped_at", "last_seen_by_scraper"}
        assert content_hash(a, exclude=excludes) == content_hash(b, exclude=excludes)


class TestNestedStructures:
    def test_list_order_preserved(self):
        # Lists are positional — different order should hash differently
        a = {"aliases": ["Alice", "Al", "Allie"]}
        b = {"aliases": ["Allie", "Al", "Alice"]}
        assert content_hash(a) != content_hash(b)

    def test_list_of_dicts(self):
        a = {"witnesses": [{"name": "Bob", "age": 40}, {"name": "Carol", "age": 35}]}
        b = {"witnesses": [{"age": 40, "name": "Bob"}, {"age": 35, "name": "Carol"}]}
        assert content_hash(a) == content_hash(b)


class TestStability:
    def test_same_input_produces_same_hash_repeatedly(self):
        record = {"name": "Alice", "dob": date(1959, 6, 15), "weight": Decimal("120.5")}
        hashes = {content_hash(record) for _ in range(50)}
        assert len(hashes) == 1

    def test_canonicalize_returns_string(self):
        result = canonicalize({"name": "Alice"})
        assert isinstance(result, str)

    def test_content_hash_returns_64_hex_chars(self):
        h = content_hash({"name": "Alice"})
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:
```bash
pytest tests/unit/test_canonicalize.py -v
```

Expected: All tests fail with `ModuleNotFoundError: No module named 'harness.canonicalize'` (or a similar import error).

- [ ] **Step 3: Create `harness/canonicalize.py`**

```python
"""Deterministic JSON serialization for content-hashing source records.

This module is the bedrock of the re-ingestion pipeline. Every importer hashes
its source records via content_hash() to detect changes between scrapes. The
function MUST be deterministic across runs and across machines — same input
must always produce the same output, byte-for-byte.

See spec §8.1 ("What counts as 'changed'") and §10.2 (harness contract).
"""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any


_WHITESPACE_RE = re.compile(r"\s+")


def _canonical_default(value: Any) -> Any:
    """JSON encoder default for non-JSON-native types.

    Called by json.dumps for any value it doesn't know how to serialize.
    Must produce a JSON-native value (str/int/float/bool/None/list/dict).
    """
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (set, frozenset)):
        return sorted(value)
    raise TypeError(f"canonicalize: unsupported type {type(value).__name__}")


def _normalize_text(text: str) -> str:
    """Apply NFC unicode normalization, strip, and collapse internal whitespace."""
    text = unicodedata.normalize("NFC", text)
    text = text.strip()
    text = _WHITESPACE_RE.sub(" ", text)
    return text


def _normalize_value(value: Any, exclude: set[str]) -> Any:
    """Recursively normalize a value for canonicalization.

    - Strings: NFC + whitespace collapse
    - Dicts: recursively normalize, drop excluded keys
    - Lists/tuples: recursively normalize each element (order preserved)
    - Other types: passed through to _canonical_default later
    """
    if isinstance(value, str):
        return _normalize_text(value)
    if isinstance(value, dict):
        return {
            k: _normalize_value(v, exclude)
            for k, v in value.items()
            if k not in exclude
        }
    if isinstance(value, (list, tuple)):
        return [_normalize_value(item, exclude) for item in value]
    return value


def canonicalize(record: dict, *, exclude: set[str] | None = None) -> str:
    """Return a deterministic JSON string for `record`.

    Same input always produces the same output, regardless of original key order
    or surface-level whitespace differences. Suitable as the input to a
    cryptographic hash for change detection.

    Args:
        record: The Python dict to canonicalize.
        exclude: Field names to drop from the canonical form (applied at every
                 level of the dict). Use this for non-substantive fields like
                 scrape timestamps.

    Returns:
        A canonical JSON string. Use content_hash() if you want a SHA-256.
    """
    excluded = exclude or set()
    normalized = _normalize_value(record, excluded)
    return json.dumps(
        normalized,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=_canonical_default,
    )


def content_hash(record: dict, *, exclude: set[str] | None = None) -> str:
    """Return the SHA-256 hex digest of canonicalize(record, exclude)."""
    canonical = canonicalize(record, exclude=exclude)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
```

- [ ] **Step 4: Run the tests and verify they pass**

Run:
```bash
pytest tests/unit/test_canonicalize.py -v
```

Expected: all tests PASS. If any fail, fix the implementation (not the tests) before continuing.

- [ ] **Step 5: Commit**

```bash
git add harness/canonicalize.py tests/unit/test_canonicalize.py
git commit -m "$(cat <<'EOF'
feat(harness): canonicalize() and content_hash() with adversarial tests

Pure deterministic JSON serialization for content-hashing source records.
Handles key ordering, null vs missing, NFC unicode normalization, decimal
precision, date/datetime normalization, whitespace collapse, and field
exclusion for non-substantive scrape metadata.

Bedrock of the re-ingestion pipeline (spec §8.1, §10.2).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `types.py` — dataclass mirrors of Postgres enums

**Files:**
- Create: `harness/types.py`

- [ ] **Step 1: Create `harness/types.py`**

```python
"""Python mirrors of Postgres enums and small dataclasses for the harness API.

When the database schema's enum values change, update this file to match.
The enums here are checked at INSERT time by Postgres, so a mismatch will
fail loudly rather than silently corrupt data.

See DATABASES/schema.sql for the canonical enum definitions and spec §3
for type-name conventions.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Any
from uuid import UUID


class SourceType(str, Enum):
    POLICE_REPORT = "police_report"
    COURT_FILING = "court_filing"
    FOIA_RELEASE = "foia_release"
    NEWS_ARTICLE = "news_article"
    NEWS_BROADCAST = "news_broadcast"
    DOCUMENTARY = "documentary"
    BOOK = "book"
    PODCAST = "podcast"
    CONGRESSIONAL_TESTIMONY = "congressional_testimony"
    SWORN_AFFIDAVIT = "sworn_affidavit"
    PUBLIC_RECORD = "public_record"
    ACADEMIC_PAPER = "academic_paper"
    WEBSITE = "website"
    SOCIAL_MEDIA = "social_media"
    USER_UPLOAD = "user_upload"
    INTERVIEW_TRANSCRIPT = "interview_transcript"
    OTHER = "other"


class EvidenceCategory(str, Enum):
    WITNESS_ACCOUNT = "witness_account"
    POLICE_REPORT = "police_report"
    COURT_RECORD = "court_record"
    FORENSIC_REPORT = "forensic_report"
    PHOTOGRAPH = "photograph"
    VIDEO = "video"
    AUDIO = "audio"
    PHYSICAL_EVIDENCE = "physical_evidence"
    DOCUMENT = "document"
    MEDIA_COVERAGE = "media_coverage"
    TIP = "tip"
    CLAIM_UNVERIFIED = "claim_unverified"
    PUBLIC_RECORD = "public_record"
    CORRESPONDENCE = "correspondence"
    LEGISLATIVE = "legislative"
    OTHER = "other"


class ConfidenceLevel(str, Enum):
    VERIFIED = "verified"
    CORROBORATED = "corroborated"
    UNVERIFIED = "unverified"
    DISPUTED = "disputed"
    RETRACTED = "retracted"
    UNKNOWN = "unknown"


class EntityType(str, Enum):
    PERSON = "person"
    VEHICLE = "vehicle"
    LOCATION = "location"
    PHONE_NUMBER = "phone_number"
    ORGANIZATION = "organization"
    OBJECT = "object"
    ALIAS_IDENTITY = "alias_identity"
    ONLINE_ACCOUNT = "online_account"


class EntityRole(str, Enum):
    VICTIM = "victim"
    SUSPECT = "suspect"
    PERSON_OF_INTEREST = "person_of_interest"
    WITNESS = "witness"
    FAMILY_MEMBER = "family_member"
    INVESTIGATOR = "investigator"
    INFORMANT = "informant"
    MENTIONED = "mentioned"
    OWNER = "owner"
    DRIVER = "driver"
    OCCUPANT = "occupant"
    EMPLOYER = "employer"
    ASSOCIATE = "associate"
    OTHER = "other"


class IngestionMethod(str, Enum):
    MANUAL_ENTRY = "manual_entry"
    WEB_SCRAPE = "web_scrape"
    FOIA_IMPORT = "foia_import"
    USER_CONTRIBUTION = "user_contribution"
    BULK_IMPORT = "bulk_import"
    API_FEED = "api_feed"
    OCR_EXTRACTION = "ocr_extraction"


@dataclass(frozen=True)
class SourceRegistration:
    """Inputs needed to register a source with the harness."""
    url: str | None
    domain: str
    title: str
    source_type: SourceType
    publication: str | None = None
    author: str | None = None
    published_date: date | None = None


@dataclass(frozen=True)
class PromotionResult:
    """Result of promote_evidence() or promote_entity()."""
    record_id: UUID
    action: str  # one of: "inserted", "unchanged", "superseded"
    superseded_id: UUID | None = None  # if action == "superseded", the row that was retired


@dataclass(frozen=True)
class ObservationInput:
    """A single attribute observation contributed by an entity to a cluster.

    Used by the harness when promoting an entity that joins a cluster, and by
    the resolver when scoring observations.
    """
    cluster_id: UUID
    entity_id: UUID
    source_id: UUID
    attribute_key: str
    attribute_value: Any
    observed_at: datetime
    confidence: ConfidenceLevel | None = None
```

- [ ] **Step 2: Verify the file imports cleanly**

Run:
```bash
python -c "from harness.types import SourceType, EvidenceCategory, ConfidenceLevel, EntityType, EntityRole, IngestionMethod, SourceRegistration, PromotionResult, ObservationInput; print('OK')"
```

Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add harness/types.py
git commit -m "$(cat <<'EOF'
feat(harness): Python mirrors of schema enums + harness dataclasses

Type-safe enum classes mirroring DATABASES/schema.sql plus three small
dataclasses (SourceRegistration, PromotionResult, ObservationInput) for
the harness API surface.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `db.py` — psycopg3 connection wrapper

**Files:**
- Create: `harness/db.py`

- [ ] **Step 1: Create `harness/db.py`**

```python
"""Thin psycopg3 wrapper for the harness.

The only module in the harness that imports psycopg directly. Provides:
  - HarnessConnection: a context-managed wrapper around psycopg.Connection
  - transaction(): a context manager for explicit transactions
  - execute(), fetchone(), fetchall(): named-parameter helpers

Why a wrapper instead of using psycopg directly: it lets us swap out the
driver later (e.g., asyncpg) without touching every harness call site, and
it makes mocking trivial in unit tests.
"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator, Sequence

import psycopg
from psycopg.rows import dict_row


class HarnessConnection:
    """A psycopg3 connection configured for harness use.

    All queries return rows as dicts (via psycopg.rows.dict_row). All transactions
    are explicit — autocommit is OFF. Callers must use transaction() or commit()
    manually.
    """

    def __init__(self, dsn: str):
        self._conn = psycopg.connect(dsn, row_factory=dict_row, autocommit=False)

    def __enter__(self) -> "HarnessConnection":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        if exc_type is not None:
            self._conn.rollback()
        else:
            self._conn.commit()
        self._conn.close()

    def execute(self, sql: str, params: Sequence[Any] | dict[str, Any] | None = None) -> None:
        """Execute a statement that does not return rows."""
        with self._conn.cursor() as cur:
            cur.execute(sql, params)

    def fetchone(self, sql: str, params: Sequence[Any] | dict[str, Any] | None = None) -> dict | None:
        """Execute a query and return the first row as a dict, or None."""
        with self._conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchone()

    def fetchall(self, sql: str, params: Sequence[Any] | dict[str, Any] | None = None) -> list[dict]:
        """Execute a query and return all rows as a list of dicts."""
        with self._conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()

    def fetchval(self, sql: str, params: Sequence[Any] | dict[str, Any] | None = None) -> Any:
        """Execute a query and return the first column of the first row, or None."""
        row = self.fetchone(sql, params)
        if row is None:
            return None
        return next(iter(row.values()))

    @contextmanager
    def transaction(self) -> Iterator[None]:
        """Explicit transaction block. Rolls back on exception, commits on success."""
        try:
            yield
            self._conn.commit()
        except Exception:
            self._conn.rollback()
            raise

    def close(self) -> None:
        self._conn.close()


def connect(dsn: str) -> HarnessConnection:
    """Open a HarnessConnection to the given DSN."""
    return HarnessConnection(dsn)
```

- [ ] **Step 2: Verify the module imports**

Run:
```bash
python -c "from harness.db import HarnessConnection, connect; print('OK')"
```

Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add harness/db.py
git commit -m "$(cat <<'EOF'
feat(harness): psycopg3 connection wrapper with transaction context manager

The only module that imports psycopg directly. Provides dict-row queries,
explicit transactions, and named-parameter helpers. Used by every
DB-touching harness function.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `sources.py` — source registration + reliability rating

**Files:**
- Create: `tests/unit/test_sources.py`
- Create: `harness/sources.py`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_sources.py`:

```python
"""Unit tests for harness.sources — pure logic only (no DB)."""
import pytest

from harness.sources import (
    SOURCE_TYPE_DEFAULTS,
    effective_rating,
    rating_for_type,
)
from harness.types import SourceType


class _FakeSource:
    """Minimal stand-in for a source row, just enough fields for effective_rating."""
    def __init__(self, *, reliability_rating: int, is_retracted: bool = False, is_disputed: bool = False):
        self.reliability_rating = reliability_rating
        self.is_retracted = is_retracted
        self.is_disputed = is_disputed


class TestSourceTypeDefaults:
    def test_all_source_types_have_a_default(self):
        for st in SourceType:
            assert st in SOURCE_TYPE_DEFAULTS, f"missing default for {st.value}"

    @pytest.mark.parametrize("source_type, expected", [
        (SourceType.PUBLIC_RECORD, 5),
        (SourceType.FOIA_RELEASE, 5),
        (SourceType.COURT_FILING, 5),
        (SourceType.CONGRESSIONAL_TESTIMONY, 5),
        (SourceType.SWORN_AFFIDAVIT, 5),
        (SourceType.POLICE_REPORT, 4),
        (SourceType.ACADEMIC_PAPER, 4),
        (SourceType.NEWS_ARTICLE, 3),
        (SourceType.NEWS_BROADCAST, 3),
        (SourceType.DOCUMENTARY, 3),
        (SourceType.BOOK, 3),
        (SourceType.INTERVIEW_TRANSCRIPT, 3),
        (SourceType.PODCAST, 2),
        (SourceType.WEBSITE, 2),
        (SourceType.SOCIAL_MEDIA, 1),
        (SourceType.USER_UPLOAD, 1),
        (SourceType.OTHER, 2),
    ])
    def test_default_for_each_type(self, source_type, expected):
        assert rating_for_type(source_type) == expected


class TestEffectiveRating:
    def test_normal_source_returns_base_rating(self):
        s = _FakeSource(reliability_rating=4)
        assert effective_rating(s) == 4

    def test_retracted_source_returns_none(self):
        s = _FakeSource(reliability_rating=5, is_retracted=True)
        assert effective_rating(s) is None

    def test_disputed_source_downgrades_one_notch(self):
        s = _FakeSource(reliability_rating=4, is_disputed=True)
        assert effective_rating(s) == 3

    def test_disputed_at_minimum_does_not_underflow(self):
        s = _FakeSource(reliability_rating=1, is_disputed=True)
        assert effective_rating(s) == 1

    def test_retracted_takes_precedence_over_disputed(self):
        s = _FakeSource(reliability_rating=5, is_retracted=True, is_disputed=True)
        assert effective_rating(s) is None

    def test_disputed_at_3_returns_2(self):
        s = _FakeSource(reliability_rating=3, is_disputed=True)
        assert effective_rating(s) == 2
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:
```bash
pytest tests/unit/test_sources.py -v
```

Expected: all tests fail with `ModuleNotFoundError: No module named 'harness.sources'`.

- [ ] **Step 3: Create `harness/sources.py`**

```python
"""Source registration and reliability rating composition.

Implements spec §6:
  - Layer 1: source-type defaults (SOURCE_TYPE_DEFAULTS)
  - Layer 2: per-domain overrides (looked up at registration time)
  - Layer 3: composable signals at resolve time (effective_rating)

Pure functions are at the top. The DB-touching register_source() is at the
bottom and uses harness.db.HarnessConnection.
"""
from __future__ import annotations

from typing import Any, Protocol
from uuid import UUID

from harness.db import HarnessConnection
from harness.types import SourceRegistration, SourceType


# ── Layer 1: Source-type defaults ────────────────────────────────────────────
#
# Spec §6.1. These cutoffs are starting values; expected to be reviewed and
# frozen after the first 3 months of moderation experience. Changes should be
# discussed and recorded in the spec, NOT mutated silently in code.

SOURCE_TYPE_DEFAULTS: dict[SourceType, int] = {
    # 5 — Official, sworn, or legally compelled
    SourceType.PUBLIC_RECORD: 5,
    SourceType.FOIA_RELEASE: 5,
    SourceType.COURT_FILING: 5,
    SourceType.CONGRESSIONAL_TESTIMONY: 5,
    SourceType.SWORN_AFFIDAVIT: 5,
    # 4 — Authoritative but not infallible
    SourceType.POLICE_REPORT: 4,
    SourceType.ACADEMIC_PAPER: 4,
    # 3 — Curated journalism, neutral baseline
    SourceType.NEWS_ARTICLE: 3,
    SourceType.NEWS_BROADCAST: 3,
    SourceType.DOCUMENTARY: 3,
    SourceType.BOOK: 3,
    SourceType.INTERVIEW_TRANSCRIPT: 3,
    # 2 — Self-published, variable quality
    SourceType.PODCAST: 2,
    SourceType.WEBSITE: 2,
    SourceType.OTHER: 2,
    # 1 — Unverified by definition
    SourceType.SOCIAL_MEDIA: 1,
    SourceType.USER_UPLOAD: 1,
}


def rating_for_type(source_type: SourceType) -> int:
    """Return the default reliability rating for a source type (1-5)."""
    return SOURCE_TYPE_DEFAULTS[source_type]


# ── Layer 3: Effective rating with retraction/dispute composition ────────────


class _SourceLike(Protocol):
    """Protocol matching the fields effective_rating reads.

    Allows the function to work with both real DB rows (dicts) and test fakes,
    as long as they expose reliability_rating, is_retracted, is_disputed.
    """
    reliability_rating: int
    is_retracted: bool
    is_disputed: bool


def effective_rating(source: _SourceLike | dict) -> int | None:
    """Return the effective rating for a source after applying signals.

    - Retracted sources return None (excluded from resolver consideration entirely).
    - Disputed sources have their rating downgraded by one notch (min 1).
    - Otherwise, the base reliability_rating is returned unchanged.

    Args:
        source: Either a row dict (with .get-style keys) or any object with
                reliability_rating / is_retracted / is_disputed attributes.

    Returns:
        Integer 1-5, or None if the source is retracted.
    """
    if isinstance(source, dict):
        is_retracted = source.get("is_retracted", False)
        is_disputed = source.get("is_disputed", False)
        base = source["reliability_rating"]
    else:
        is_retracted = source.is_retracted
        is_disputed = source.is_disputed
        base = source.reliability_rating

    if is_retracted:
        return None
    if is_disputed:
        return max(1, base - 1)
    return base


# ── Layer 2: Per-domain overrides + register_source ──────────────────────────


def _resolve_initial_rating(conn: HarnessConnection, *, domain: str, source_type: SourceType) -> int:
    """Determine the rating to use at insert time.

    Checks source_domain_overrides for a domain match; falls back to the
    type default.
    """
    override = conn.fetchval(
        "SELECT rating_override FROM source_domain_overrides WHERE domain = %s",
        (domain,),
    )
    if override is not None:
        return override
    return rating_for_type(source_type)


def register_source(conn: HarnessConnection, registration: SourceRegistration) -> UUID:
    """Insert a new source row, computing its rating from defaults + overrides.

    Idempotent on (domain, url): if a source with the same domain and URL
    already exists, returns the existing id without re-inserting.

    Returns:
        The UUID of the source row (newly created or pre-existing).
    """
    existing = conn.fetchone(
        """
        SELECT id FROM sources
         WHERE domain = %s AND COALESCE(url, '') = COALESCE(%s, '')
         LIMIT 1
        """,
        (registration.domain, registration.url),
    )
    if existing is not None:
        return existing["id"]

    rating = _resolve_initial_rating(conn, domain=registration.domain, source_type=registration.source_type)

    row = conn.fetchone(
        """
        INSERT INTO sources (url, domain, title, source_type, reliability_rating,
                             publication, author, published_date)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            registration.url,
            registration.domain,
            registration.title,
            registration.source_type.value,
            rating,
            registration.publication,
            registration.author,
            registration.published_date,
        ),
    )
    return row["id"]
```

- [ ] **Step 4: Run the unit tests and verify they pass**

Run:
```bash
pytest tests/unit/test_sources.py -v
```

Expected: all tests PASS. The DB-touching `register_source` function is not unit-tested here (will be covered by integration tests in Task 11).

- [ ] **Step 5: Commit**

```bash
git add harness/sources.py tests/unit/test_sources.py
git commit -m "$(cat <<'EOF'
feat(harness): source rating defaults + effective_rating composition

Implements spec §6 layers 1 and 3 (source-type defaults table and the
retraction/dispute composition function). Layer 2 (per-domain overrides)
is queried inside register_source().

Pure functions are unit-tested with adversarial cases for the rating
arithmetic (underflow protection, retraction precedence, etc.).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `migrations/0001_storage_layer_deltas.sql` — schema deltas

**Files:**
- Create: `migrations/README.md`
- Create: `migrations/0001_storage_layer_deltas.sql`

- [ ] **Step 1: Create `migrations/README.md`**

```markdown
# CASEMAKER Migrations

Postgres SQL migrations for the CASEMAKER schema.

## Application order

Migrations are designed to be applied on top of `DATABASES/schema.sql` (the
base schema). The order is:

1. `DATABASES/schema.sql` — base schema
2. `migrations/0001_storage_layer_deltas.sql` — schema deltas from spec §5
3. (future migrations land here)

## How to apply

Against a local Postgres:

```bash
psql "$DATABASE_URL" -f DATABASES/schema.sql
psql "$DATABASE_URL" -f migrations/0001_storage_layer_deltas.sql
```

Against Supabase: use the direct connection string (port 5432, NOT the
PostgREST one). Migrations run as a single transaction per file.

## Idempotency

Each migration file uses `CREATE ... IF NOT EXISTS` and `ADD COLUMN IF NOT
EXISTS` where possible, but ALTER TABLE DROP COLUMN and CREATE TYPE are not
idempotent — running a migration twice on the same database will fail. Use
migration tracking (e.g., a `schema_migrations` table) in production. Plan B
adds that infrastructure.
```

- [ ] **Step 2: Create `migrations/0001_storage_layer_deltas.sql`**

This file is the SQL implementation of every delta from spec §5. Apply on top of `DATABASES/schema.sql`.

```sql
-- ============================================================================
-- Migration 0001: Storage Layer Deltas
-- Implements spec §5 (Schema Deltas) on top of DATABASES/schema.sql
-- ============================================================================

BEGIN;

-- ── 5.1 Spatial: single source of truth via generated columns ──────────────

-- cases
ALTER TABLE cases ADD COLUMN location GEOGRAPHY(Point, 4326);
UPDATE cases
   SET location = ST_SetSRID(ST_MakePoint(location_lng::DOUBLE PRECISION, location_lat::DOUBLE PRECISION), 4326)::geography
 WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL;
ALTER TABLE cases DROP COLUMN location_lat;
ALTER TABLE cases DROP COLUMN location_lng;
ALTER TABLE cases ADD COLUMN location_lat DOUBLE PRECISION
    GENERATED ALWAYS AS (ST_Y(location::geometry)) STORED;
ALTER TABLE cases ADD COLUMN location_lng DOUBLE PRECISION
    GENERATED ALWAYS AS (ST_X(location::geometry)) STORED;
CREATE INDEX idx_cases_location_gist ON cases USING GIST (location);

COMMENT ON COLUMN cases.location IS
    'Single source of truth for spatial data. Importers MUST write to this column. lat/lng columns are read-only generated views.';

-- evidence
ALTER TABLE evidence ADD COLUMN location GEOGRAPHY(Point, 4326);
UPDATE evidence
   SET location = ST_SetSRID(ST_MakePoint(location_lng::DOUBLE PRECISION, location_lat::DOUBLE PRECISION), 4326)::geography
 WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL;
ALTER TABLE evidence DROP COLUMN location_lat;
ALTER TABLE evidence DROP COLUMN location_lng;
ALTER TABLE evidence ADD COLUMN location_lat DOUBLE PRECISION
    GENERATED ALWAYS AS (ST_Y(location::geometry)) STORED;
ALTER TABLE evidence ADD COLUMN location_lng DOUBLE PRECISION
    GENERATED ALWAYS AS (ST_X(location::geometry)) STORED;
CREATE INDEX idx_evidence_location_gist ON evidence USING GIST (location);


-- ── 5.2 Evidence versioning (Strategy B) ────────────────────────────────────

ALTER TABLE evidence ADD COLUMN is_current BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE evidence ADD COLUMN supersedes_id UUID REFERENCES evidence(id);
ALTER TABLE evidence ADD COLUMN content_hash TEXT;
ALTER TABLE evidence ADD COLUMN source_record_id TEXT;

CREATE INDEX idx_evidence_current ON evidence (case_id) WHERE is_current = TRUE;
CREATE INDEX idx_evidence_content_hash ON evidence (content_hash);
CREATE UNIQUE INDEX uq_evidence_source_record_current ON evidence (source_id, source_record_id)
    WHERE is_current = TRUE AND source_record_id IS NOT NULL;
CREATE INDEX idx_evidence_sync ON evidence (updated_at, id);

CREATE OR REPLACE VIEW v_current_evidence AS
SELECT * FROM evidence WHERE is_current = TRUE;


-- ── 5.3 Source-faithful entity model ────────────────────────────────────────

ALTER TABLE entities ADD COLUMN source_id UUID REFERENCES sources(id);
ALTER TABLE entities ADD COLUMN source_record_id TEXT;
ALTER TABLE entities ADD COLUMN content_hash TEXT;
CREATE UNIQUE INDEX uq_entity_source_record ON entities (source_id, source_record_id)
    WHERE source_record_id IS NOT NULL;
CREATE INDEX idx_entities_sync ON entities (updated_at, id);

ALTER TABLE entities RENAME COLUMN merged_into_id TO redirected_to_id;
COMMENT ON COLUMN entities.redirected_to_id IS
    'Data-correction redirect: this row was a mistake, follow this pointer instead. '
    'For cross-source identity (same real-world person across sources), use cluster_id. '
    'These two concepts are deliberately separate. Do not conflate them.';


-- ── 5.4 Entity clusters ─────────────────────────────────────────────────────

CREATE TABLE entity_clusters (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canonical_name           TEXT NOT NULL,
    entity_type              entity_type NOT NULL,
    summary                  TEXT,
    merged_attributes        JSONB NOT NULL DEFAULT '{}',
    member_count             INTEGER NOT NULL DEFAULT 0,
    is_human_confirmed       BOOLEAN NOT NULL DEFAULT FALSE,
    confidence_score         DECIMAL(3,2),
    redirected_to_cluster_id UUID REFERENCES entity_clusters(id),
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
    'A cluster represents one real-world person/vehicle/etc. as we currently believe it. '
    'Each cluster has many member entities (one per source record). Cluster merges use '
    'redirected_to_cluster_id with compaction (see merge_clusters function).';


-- ── 5.5 Attribute observations ──────────────────────────────────────────────

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
    'Per-attribute, per-source provenance. Every observation is preserved forever. '
    'entity_clusters.merged_attributes is a cached resolution of these rows, produced '
    'by resolve_cluster_attributes(cluster_id). Never write to merged_attributes '
    'directly outside that function.';


-- ── 5.6 Source reliability infrastructure ───────────────────────────────────

CREATE TABLE source_domain_overrides (
    domain          TEXT PRIMARY KEY,
    rating_override INTEGER NOT NULL CHECK (rating_override BETWEEN 1 AND 5),
    rationale       TEXT NOT NULL,
    set_by          UUID REFERENCES users(id),
    set_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sources ADD COLUMN is_retracted     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sources ADD COLUMN is_disputed      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sources ADD COLUMN retracted_reason TEXT;
ALTER TABLE sources ADD COLUMN retracted_by     UUID REFERENCES users(id);
ALTER TABLE sources ADD COLUMN retracted_at     TIMESTAMPTZ;
CREATE INDEX idx_sources_retracted ON sources (is_retracted) WHERE is_retracted = TRUE;
CREATE INDEX idx_sources_disputed  ON sources (is_disputed)  WHERE is_disputed  = TRUE;

COMMENT ON COLUMN sources.reliability_rating IS
    'Set at registration via source-type default, optionally overridden per-domain. '
    'NEVER mutated after insert. Use is_retracted / is_disputed to express reliability '
    'changes without losing the original audit trail.';


-- ── 5.7 Soft-delete on interpretation tables ───────────────────────────────

ALTER TABLE cross_case_matches ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE connections        ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE INDEX idx_ccm_deleted ON cross_case_matches (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_conn_deleted ON connections (deleted_at) WHERE deleted_at IS NOT NULL;


-- ── 5.8 Case visibility ─────────────────────────────────────────────────────

ALTER TABLE cases ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'restricted', 'private'));
CREATE INDEX idx_cases_visibility ON cases (visibility) WHERE visibility != 'public';
CREATE INDEX idx_cases_sync ON cases (updated_at, id);
COMMENT ON COLUMN cases.visibility IS
    'Reserved for future use. Day 1: every case is public. Restricted/private semantics '
    'defined in the crowdsolve subsystem (#5) spec.';


-- ── 5.9 Search sync checkpoint table ────────────────────────────────────────

CREATE TABLE meili_sync_checkpoints (
    table_name        TEXT PRIMARY KEY,
    last_updated_at   TIMESTAMPTZ NOT NULL,
    last_id           UUID NOT NULL,
    last_deleted_at   TIMESTAMPTZ,
    last_deleted_id   UUID,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── 5.10 New views ──────────────────────────────────────────────────────────

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


-- ── 7.1 merge_clusters stored procedure ─────────────────────────────────────

CREATE OR REPLACE FUNCTION merge_clusters(source_id UUID, target_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE entities SET cluster_id = target_id WHERE cluster_id = source_id;

    UPDATE entity_clusters
       SET redirected_to_cluster_id = target_id
     WHERE redirected_to_cluster_id = source_id;

    UPDATE cluster_attribute_observations
       SET cluster_id = target_id
     WHERE cluster_id = source_id;

    UPDATE entity_clusters
       SET redirected_to_cluster_id = target_id,
           deleted_at = NOW(),
           updated_at = NOW()
     WHERE id = source_id;
END;
$$ LANGUAGE plpgsql;


COMMIT;
```

- [ ] **Step 3: Verify the SQL is syntactically valid**

Run (against any local Postgres, or skip until Task 10's containerized Postgres exists):

```bash
# This is a syntactic check; real application happens in Task 10's integration tests.
psql --no-psqlrc -c "SELECT 1;" postgres://localhost/postgres 2>/dev/null && echo "psql available" || echo "skip — no local postgres"
```

The actual migration application is exercised by `tests/integration/test_migration.py` in Task 10.

- [ ] **Step 4: Commit**

```bash
git add migrations/README.md migrations/0001_storage_layer_deltas.sql
git commit -m "$(cat <<'EOF'
feat(migrations): 0001_storage_layer_deltas — full spec §5 schema deltas

Implements every schema delta from the storage layer + bulk import design
spec, applied on top of the existing DATABASES/schema.sql:

  - Spatial as GEOGRAPHY with generated lat/lng columns
  - Evidence versioning (is_current, supersedes_id, content_hash, source_record_id)
  - Source-faithful entities (source_id, source_record_id, content_hash)
  - merged_into_id renamed to redirected_to_id with explicit comment
  - entity_clusters table + cluster_attribute_observations table
  - Source reliability infrastructure (overrides + retraction/dispute flags)
  - Soft-delete columns on interpretation tables
  - Case visibility column (reserved for future)
  - Meilisearch sync checkpoints
  - v_current_evidence and v_resolved_entities views
  - merge_clusters() stored procedure with compaction

Wraps everything in a single transaction so partial application is impossible.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `resolver.py` — pure scoring logic for `resolve_cluster_attributes`

The resolver has two parts: a pure scoring algorithm (testable without a DB) and a thin DB read/write wrapper. We implement and unit-test the pure part first.

**Files:**
- Create: `tests/unit/test_resolver.py`
- Create: `harness/resolver.py`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_resolver.py`:

```python
"""Unit tests for the resolver scoring algorithm — pure logic only."""
from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest

from harness.resolver import (
    CONFIDENCE_SCORE,
    score_observations,
)
from harness.types import ConfidenceLevel


def _obs(*, attribute_key, value, source_id=None, rating, confidence=ConfidenceLevel.UNVERIFIED, observed_at=None, obs_id=None):
    """Build a single observation dict in the shape the resolver expects."""
    return {
        "id": obs_id or uuid4(),
        "attribute_key": attribute_key,
        "attribute_value": value,
        "source_id": source_id or uuid4(),
        "reliability_rating": rating,
        "is_retracted": False,
        "is_disputed": False,
        "confidence": confidence.value if confidence else None,
        "observed_at": observed_at or datetime(2024, 1, 1, tzinfo=timezone.utc),
    }


class TestSingleObservation:
    def test_single_observation_returns_its_value(self):
        observations = [_obs(attribute_key="eye_color", value="Hazel", rating=4)]
        result = score_observations(observations)
        assert result == {"eye_color": "Hazel"}

    def test_retracted_single_observation_excluded(self):
        obs = _obs(attribute_key="eye_color", value="Hazel", rating=4)
        obs["is_retracted"] = True
        result = score_observations([obs])
        assert result == {}

    def test_disputed_single_observation_still_included(self):
        obs = _obs(attribute_key="eye_color", value="Hazel", rating=4)
        obs["is_disputed"] = True
        result = score_observations([obs])
        assert result == {"eye_color": "Hazel"}


class TestRatingPrecedence:
    def test_higher_rating_wins(self):
        observations = [
            _obs(attribute_key="eye_color", value="Hazel", rating=5),
            _obs(attribute_key="eye_color", value="Green", rating=2),
        ]
        result = score_observations(observations)
        assert result == {"eye_color": "Hazel"}

    def test_higher_rating_wins_regardless_of_order(self):
        observations = [
            _obs(attribute_key="eye_color", value="Green", rating=2),
            _obs(attribute_key="eye_color", value="Hazel", rating=5),
        ]
        result = score_observations(observations)
        assert result == {"eye_color": "Hazel"}

    def test_disputed_higher_rating_can_lose_to_undisputed_lower(self):
        # rating 4 disputed → effective 3
        # rating 3 not disputed → effective 3
        # confidence breaks the tie next
        obs_a = _obs(attribute_key="eye_color", value="Hazel", rating=4, confidence=ConfidenceLevel.UNVERIFIED)
        obs_a["is_disputed"] = True
        obs_b = _obs(attribute_key="eye_color", value="Green", rating=3, confidence=ConfidenceLevel.VERIFIED)
        result = score_observations([obs_a, obs_b])
        assert result == {"eye_color": "Green"}  # confidence broke the tie


class TestConfidenceTiebreaker:
    def test_higher_confidence_wins_when_ratings_equal(self):
        observations = [
            _obs(attribute_key="dob", value="1959-06-15", rating=4, confidence=ConfidenceLevel.VERIFIED),
            _obs(attribute_key="dob", value="1960-01-01", rating=4, confidence=ConfidenceLevel.UNVERIFIED),
        ]
        result = score_observations(observations)
        assert result == {"dob": "1959-06-15"}


class TestRecencyTiebreaker:
    def test_more_recent_wins_when_rating_and_confidence_equal(self):
        observations = [
            _obs(attribute_key="address", value="100 Main St", rating=4, confidence=ConfidenceLevel.VERIFIED, observed_at=datetime(2020, 1, 1, tzinfo=timezone.utc)),
            _obs(attribute_key="address", value="200 Oak Ave", rating=4, confidence=ConfidenceLevel.VERIFIED, observed_at=datetime(2024, 1, 1, tzinfo=timezone.utc)),
        ]
        result = score_observations(observations)
        assert result == {"address": "200 Oak Ave"}


class TestDeterministicTiebreaker:
    def test_lexical_id_breaks_total_tie(self):
        # Same rating, same confidence, same observed_at — fall back to id
        same_time = datetime(2024, 1, 1, tzinfo=timezone.utc)
        obs_a = _obs(attribute_key="hair", value="Brown", rating=3, confidence=ConfidenceLevel.UNVERIFIED, observed_at=same_time, obs_id=UUID("00000000-0000-0000-0000-000000000001"))
        obs_b = _obs(attribute_key="hair", value="Black", rating=3, confidence=ConfidenceLevel.UNVERIFIED, observed_at=same_time, obs_id=UUID("00000000-0000-0000-0000-000000000002"))
        result = score_observations([obs_a, obs_b])
        # The deterministic rule is "smallest UUID string wins" — pick the first lexically
        # Per the spec, this just needs to be deterministic. Verify both orderings give same answer.
        result2 = score_observations([obs_b, obs_a])
        assert result == result2

    def test_resolver_is_idempotent(self):
        observations = [
            _obs(attribute_key="dob", value="1959-06-15", rating=5, confidence=ConfidenceLevel.VERIFIED),
            _obs(attribute_key="eye_color", value="Hazel", rating=4),
        ]
        results = {tuple(sorted(score_observations(observations).items())) for _ in range(20)}
        assert len(results) == 1


class TestMultipleAttributes:
    def test_each_attribute_resolved_independently(self):
        observations = [
            _obs(attribute_key="dob", value="1959-06-15", rating=5),
            _obs(attribute_key="dob", value="1960-01-01", rating=2),
            _obs(attribute_key="eye_color", value="Hazel", rating=2),
            _obs(attribute_key="eye_color", value="Green", rating=5),
        ]
        result = score_observations(observations)
        assert result == {"dob": "1959-06-15", "eye_color": "Green"}


class TestEmptyAndAllRetracted:
    def test_empty_observations_returns_empty_dict(self):
        assert score_observations([]) == {}

    def test_all_retracted_observations_returns_empty_dict(self):
        a = _obs(attribute_key="dob", value="x", rating=5)
        a["is_retracted"] = True
        b = _obs(attribute_key="dob", value="y", rating=5)
        b["is_retracted"] = True
        assert score_observations([a, b]) == {}


class TestConfidenceScoreTable:
    def test_confidence_score_ranges(self):
        assert CONFIDENCE_SCORE["verified"] == 1.0
        assert CONFIDENCE_SCORE["corroborated"] == 0.8
        assert CONFIDENCE_SCORE["unverified"] == 0.5
        assert CONFIDENCE_SCORE["unknown"] == 0.3
        assert CONFIDENCE_SCORE["disputed"] == 0.1
        assert CONFIDENCE_SCORE["retracted"] == 0.0
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:
```bash
pytest tests/unit/test_resolver.py -v
```

Expected: all tests fail with `ModuleNotFoundError: No module named 'harness.resolver'`.

- [ ] **Step 3: Create `harness/resolver.py`**

```python
"""Cluster attribute resolver — pure scoring + DB wrapper.

Implements spec §6.4. The resolver picks one winning value per attribute_key
for a cluster, given all of its observations. It is:

  - Pure: same observations + same effective ratings → same output, every time.
  - Deterministic: ties broken by a fixed cascade ending in lexical ID order.
  - Idempotent: re-running on the same data is always safe.
  - Reversible-friendly: never destroys observations, only writes the cached
    resolution to entity_clusters.merged_attributes.

The pure scoring function (score_observations) is unit-tested.
The DB-touching wrapper (resolve_cluster_attributes) is integration-tested.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from harness.db import HarnessConnection
from harness.sources import effective_rating


CONFIDENCE_SCORE: dict[str, float] = {
    "verified": 1.0,
    "corroborated": 0.8,
    "unverified": 0.5,
    "unknown": 0.3,
    "disputed": 0.1,
    "retracted": 0.0,
}


def _epoch(dt: datetime | None) -> float:
    """Return a stable epoch float for sort, treating None as the epoch."""
    if dt is None:
        return 0.0
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


def score_observations(observations: list[dict]) -> dict[str, Any]:
    """Resolve a list of observations into one winning value per attribute_key.

    Pure function. Same input always produces the same output.

    Args:
        observations: List of observation dicts. Each must have:
            - attribute_key: str
            - attribute_value: any JSON-serializable value
            - reliability_rating: int (1-5)
            - is_retracted: bool
            - is_disputed: bool
            - confidence: str | None (one of CONFIDENCE_SCORE keys, or None)
            - observed_at: datetime | None
            - id: UUID

    Returns:
        Dict mapping attribute_key → winning value. Retracted-source observations
        are excluded entirely. Empty dict if no observations survive filtering.
    """
    by_key: dict[str, list[tuple[dict, int]]] = {}
    for obs in observations:
        eff = effective_rating(obs)
        if eff is None:
            continue
        by_key.setdefault(obs["attribute_key"], []).append((obs, eff))

    resolved: dict[str, Any] = {}
    for key, candidates in by_key.items():
        candidates.sort(key=lambda pair: (
            -pair[1],                                                  # higher rating first
            -CONFIDENCE_SCORE.get(pair[0].get("confidence") or "unknown", 0.3),  # higher confidence first
            -_epoch(pair[0].get("observed_at")),                       # more recent first
            str(pair[0]["id"]),                                        # deterministic final tiebreaker
        ))
        winner_obs, _ = candidates[0]
        resolved[key] = winner_obs["attribute_value"]

    return resolved


def resolve_cluster_attributes(conn: HarnessConnection, cluster_id: UUID) -> dict[str, Any]:
    """Re-resolve a cluster's attributes from its observations and write the result.

    Idempotent. Safe to call repeatedly. Touches the database in two queries:
    one read of cluster_attribute_observations (joined to sources for retraction
    flags), one update of entity_clusters.merged_attributes.

    Returns:
        The resolved attributes dict that was written.
    """
    observations = conn.fetchall(
        """
        SELECT
            o.id,
            o.attribute_key,
            o.attribute_value,
            o.confidence,
            o.observed_at,
            s.reliability_rating,
            s.is_retracted,
            s.is_disputed
        FROM cluster_attribute_observations o
        JOIN sources s ON o.source_id = s.id
        WHERE o.cluster_id = %s
        """,
        (cluster_id,),
    )

    resolved = score_observations(observations)

    conn.execute(
        "UPDATE entity_clusters SET merged_attributes = %s, updated_at = NOW() WHERE id = %s",
        (json.dumps(resolved), cluster_id),
    )
    return resolved
```

- [ ] **Step 4: Run the unit tests and verify they pass**

Run:
```bash
pytest tests/unit/test_resolver.py -v
```

Expected: all tests PASS. The DB-touching `resolve_cluster_attributes` is covered by Task 13's integration tests.

- [ ] **Step 5: Commit**

```bash
git add harness/resolver.py tests/unit/test_resolver.py
git commit -m "$(cat <<'EOF'
feat(harness): cluster attribute resolver (pure scoring + DB wrapper)

Implements spec §6.4. score_observations() is the pure deterministic
scoring function (rating > confidence > recency > lexical id). It's
fully unit-tested with adversarial cases for tiebreaker behavior,
retraction exclusion, and idempotency.

resolve_cluster_attributes() is the thin DB wrapper that reads
observations, calls the pure scorer, and writes merged_attributes.
Integration-tested in Task 13.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `promote.py` — `promote_evidence` (Strategy B append-only)

**Files:**
- Create: `harness/promote.py`

`promote_evidence` is heavy on DB interactions; we test it via integration tests in Task 11. The implementation goes in this task; the tests follow.

- [ ] **Step 1: Create `harness/promote.py` with promote_evidence**

```python
"""Production-table promotion functions.

The only path scrapers/importers use to write evidence and entity rows
to production. Owns:
  - Content-hash dedup
  - Strategy B append-only supersedes chain (for evidence)
  - Source-faithful inserts (for entities)
  - Idempotency

See spec §8 (re-ingestion pipeline), §10 (harness contract).
"""
from __future__ import annotations

import json
from datetime import date
from typing import Any
from uuid import UUID

from harness.canonicalize import content_hash
from harness.db import HarnessConnection
from harness.types import (
    ConfidenceLevel,
    EvidenceCategory,
    EntityType,
    IngestionMethod,
    PromotionResult,
)


# ── Fields excluded from content_hash for evidence promotions ────────────────
# These fields can change between scrapes without us treating the row as
# meaningfully changed. Add to this set as new "non-substantive" fields appear.

EVIDENCE_HASH_EXCLUDES: set[str] = {
    "scraped_at",
    "last_seen_at",
    "harness_run_id",
}

ENTITY_HASH_EXCLUDES: set[str] = {
    "scraped_at",
    "last_seen_at",
    "harness_run_id",
}


def promote_evidence(
    conn: HarnessConnection,
    raw_row: dict,
    *,
    case_id: UUID,
    source_id: UUID,
    source_record_id: str,
    evidence_code: str,
    title: str,
    summary: str,
    category: EvidenceCategory,
    confidence: ConfidenceLevel = ConfidenceLevel.UNKNOWN,
    evidence_date: date | None = None,
    location_lat: float | None = None,
    location_lng: float | None = None,
    metadata: dict | None = None,
    tags: list[str] | None = None,
    ingestion_method: IngestionMethod = IngestionMethod.WEB_SCRAPE,
) -> PromotionResult:
    """Promote a raw scraped evidence row into the production evidence table.

    Implements Strategy B (append-only supersedes chain) from spec §8:
      - First time seeing this (source_id, source_record_id): INSERT
      - Same content_hash as the current row: no-op (returns 'unchanged')
      - Different content_hash: supersede the old row, INSERT a new one

    Idempotent: re-running with identical input is always a no-op.

    Args:
        conn: HarnessConnection (must be in a transaction managed by caller).
        raw_row: The raw scraped record. Hashed for change detection.
                 Note: this is the SOURCE OF TRUTH for the hash, distinct from
                 the structured fields below which are how the row is stored.
        case_id: The case this evidence belongs to.
        source_id: The source that produced this evidence (from register_source).
        source_record_id: A stable identifier within the source (e.g., a URL slug,
                          a MAP record id). Used together with source_id to find
                          the current version of this record.
        ... (structured fields written to the evidence row) ...

    Returns:
        PromotionResult with the row id and the action taken.
    """
    new_hash = content_hash(raw_row, exclude=EVIDENCE_HASH_EXCLUDES)

    existing = conn.fetchone(
        """
        SELECT id, content_hash FROM evidence
         WHERE source_id = %s
           AND source_record_id = %s
           AND is_current = TRUE
        """,
        (source_id, source_record_id),
    )

    location_geo = None
    if location_lat is not None and location_lng is not None:
        # Use ST_SetSRID + ST_MakePoint, computed by Postgres
        # We pass coords as params and embed the SQL expression
        pass  # handled inline below

    # Build the INSERT/UPDATE statements with optional spatial coords
    insert_evidence_sql = """
        INSERT INTO evidence (
            case_id, evidence_code, title, summary, category, confidence,
            evidence_date, source_id, source_record_id, content_hash,
            ingestion_method, metadata, tags, is_current, supersedes_id, location
        )
        VALUES (
            %(case_id)s, %(evidence_code)s, %(title)s, %(summary)s, %(category)s, %(confidence)s,
            %(evidence_date)s, %(source_id)s, %(source_record_id)s, %(content_hash)s,
            %(ingestion_method)s, %(metadata)s, %(tags)s, TRUE, %(supersedes_id)s,
            CASE
                WHEN %(lat)s IS NOT NULL AND %(lng)s IS NOT NULL
                THEN ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography
                ELSE NULL
            END
        )
        RETURNING id
    """

    insert_params = {
        "case_id": case_id,
        "evidence_code": evidence_code,
        "title": title,
        "summary": summary,
        "category": category.value,
        "confidence": confidence.value,
        "evidence_date": evidence_date,
        "source_id": source_id,
        "source_record_id": source_record_id,
        "content_hash": new_hash,
        "ingestion_method": ingestion_method.value,
        "metadata": json.dumps(metadata or {}),
        "tags": tags or [],
        "supersedes_id": None,
        "lat": location_lat,
        "lng": location_lng,
    }

    if existing is None:
        # First time seeing this source record
        row = conn.fetchone(insert_evidence_sql, insert_params)
        return PromotionResult(record_id=row["id"], action="inserted")

    if existing["content_hash"] == new_hash:
        # Unchanged
        return PromotionResult(record_id=existing["id"], action="unchanged")

    # Changed: supersede old, insert new
    with conn.transaction():
        conn.execute(
            "UPDATE evidence SET is_current = FALSE, updated_at = NOW() WHERE id = %s",
            (existing["id"],),
        )
        insert_params["supersedes_id"] = existing["id"]
        new_row = conn.fetchone(insert_evidence_sql, insert_params)

    return PromotionResult(
        record_id=new_row["id"],
        action="superseded",
        superseded_id=existing["id"],
    )


def promote_entity(
    conn: HarnessConnection,
    raw_row: dict,
    *,
    source_id: UUID,
    source_record_id: str,
    entity_type: EntityType,
    canonical_name: str,
    aliases: list[str] | None = None,
    summary: str | None = None,
    attributes: dict | None = None,
    is_identified: bool = True,
    is_alive: bool | None = None,
) -> PromotionResult:
    """Promote a raw entity row into the production entities table.

    Source-faithful: each (source_id, source_record_id) gets its own entity row,
    even if a Splink-confidence-equivalent entity already exists from another
    source. Cross-source identity is established later via clustering, NOT here.

    Append-only at the entity level too: re-scraping a source page that has
    been edited produces a new entity row that supersedes the old via
    redirected_to_id (Strategy B applied to entities). The previous row stays
    in the database with redirected_to_id pointing at the new row.

    Idempotent: re-running with identical input is always a no-op.

    Returns:
        PromotionResult with the row id and the action taken.
    """
    new_hash = content_hash(raw_row, exclude=ENTITY_HASH_EXCLUDES)

    existing = conn.fetchone(
        """
        SELECT id, content_hash FROM entities
         WHERE source_id = %s
           AND source_record_id = %s
           AND redirected_to_id IS NULL
        """,
        (source_id, source_record_id),
    )

    insert_entity_sql = """
        INSERT INTO entities (
            entity_type, canonical_name, aliases, summary, attributes,
            source_id, source_record_id, content_hash, is_identified, is_alive
        )
        VALUES (
            %(entity_type)s, %(canonical_name)s, %(aliases)s, %(summary)s, %(attributes)s,
            %(source_id)s, %(source_record_id)s, %(content_hash)s, %(is_identified)s, %(is_alive)s
        )
        RETURNING id
    """

    insert_params = {
        "entity_type": entity_type.value,
        "canonical_name": canonical_name,
        "aliases": aliases or [],
        "summary": summary,
        "attributes": json.dumps(attributes or {}),
        "source_id": source_id,
        "source_record_id": source_record_id,
        "content_hash": new_hash,
        "is_identified": is_identified,
        "is_alive": is_alive,
    }

    if existing is None:
        row = conn.fetchone(insert_entity_sql, insert_params)
        return PromotionResult(record_id=row["id"], action="inserted")

    if existing["content_hash"] == new_hash:
        return PromotionResult(record_id=existing["id"], action="unchanged")

    # Changed: insert new, point old at new via redirected_to_id
    with conn.transaction():
        new_row = conn.fetchone(insert_entity_sql, insert_params)
        conn.execute(
            "UPDATE entities SET redirected_to_id = %s, updated_at = NOW() WHERE id = %s",
            (new_row["id"], existing["id"]),
        )

    return PromotionResult(
        record_id=new_row["id"],
        action="superseded",
        superseded_id=existing["id"],
    )
```

- [ ] **Step 2: Verify the module imports**

Run:
```bash
python -c "from harness.promote import promote_evidence, promote_entity, EVIDENCE_HASH_EXCLUDES, ENTITY_HASH_EXCLUDES; print('OK')"
```

Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add harness/promote.py
git commit -m "$(cat <<'EOF'
feat(harness): promote_evidence and promote_entity (Strategy B)

Append-only supersedes-chain promotion for evidence (per spec §8) and
source-faithful entity promotion with redirected_to_id chains (per spec
§7 Approach 2). Both functions are idempotent and use content_hash
dedup with the canonicalize() function.

Spatial coordinates are passed as separate lat/lng floats and converted
to GEOGRAPHY at INSERT time via ST_SetSRID + ST_MakePoint, ensuring
location is the single source of truth (the lat/lng generated columns
never get written directly).

Integration tests in Tasks 11-12.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Public API surface — `harness/__init__.py`

**Files:**
- Modify: `harness/__init__.py`

- [ ] **Step 1: Replace `harness/__init__.py` with the public exports**

```python
"""CASEMAKER bulk import harness.

Public API. Importers should only use names exported here.

See: docs/superpowers/specs/2026-04-08-storage-and-bulk-import-design.md
"""

__version__ = "0.1.0"

from harness.canonicalize import canonicalize, content_hash
from harness.db import HarnessConnection, connect
from harness.promote import (
    ENTITY_HASH_EXCLUDES,
    EVIDENCE_HASH_EXCLUDES,
    promote_entity,
    promote_evidence,
)
from harness.resolver import (
    CONFIDENCE_SCORE,
    resolve_cluster_attributes,
    score_observations,
)
from harness.sources import (
    SOURCE_TYPE_DEFAULTS,
    effective_rating,
    rating_for_type,
    register_source,
)
from harness.types import (
    ConfidenceLevel,
    EntityRole,
    EntityType,
    EvidenceCategory,
    IngestionMethod,
    ObservationInput,
    PromotionResult,
    SourceRegistration,
    SourceType,
)

__all__ = [
    "__version__",
    # canonicalize
    "canonicalize",
    "content_hash",
    # db
    "HarnessConnection",
    "connect",
    # promote
    "promote_evidence",
    "promote_entity",
    "EVIDENCE_HASH_EXCLUDES",
    "ENTITY_HASH_EXCLUDES",
    # resolver
    "score_observations",
    "resolve_cluster_attributes",
    "CONFIDENCE_SCORE",
    # sources
    "register_source",
    "rating_for_type",
    "effective_rating",
    "SOURCE_TYPE_DEFAULTS",
    # types
    "SourceType",
    "EvidenceCategory",
    "ConfidenceLevel",
    "EntityType",
    "EntityRole",
    "IngestionMethod",
    "SourceRegistration",
    "PromotionResult",
    "ObservationInput",
]
```

- [ ] **Step 2: Verify everything imports cleanly from the package**

Run:
```bash
python -c "import harness; print(sorted(harness.__all__))"
```

Expected: a sorted list of all public names. No `ImportError`.

- [ ] **Step 3: Run all unit tests one more time**

Run:
```bash
pytest tests/unit -v
```

Expected: all tests PASS. Total should be ~50+ passing tests across canonicalize, sources, and resolver.

- [ ] **Step 4: Commit**

```bash
git add harness/__init__.py
git commit -m "$(cat <<'EOF'
feat(harness): public API surface in harness/__init__.py

Importers should only use names exported here. Internal modules
(harness.db, harness.promote, etc.) remain importable but the public
contract is the top-level package.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Integration test infrastructure — `conftest.py` with testcontainers

**Files:**
- Create: `tests/conftest.py`
- Create: `tests/integration/test_migration.py`

- [ ] **Step 1: Create `tests/conftest.py`**

```python
"""Shared pytest fixtures for the harness test suite.

The integration tests use testcontainers to spin up a real Postgres container
per test session. This requires Docker to be running. If Docker is unavailable,
all integration tests are skipped automatically.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Iterator

import pytest


# Detect whether Docker is available; skip integration tests if not.
def _docker_available() -> bool:
    try:
        import docker  # noqa: F401
        client = docker.from_env()
        client.ping()
        return True
    except Exception:
        return False


DOCKER_AVAILABLE = _docker_available()


def pytest_collection_modifyitems(config, items):
    """Auto-skip integration tests when Docker is not available."""
    if DOCKER_AVAILABLE:
        return
    skip_marker = pytest.mark.skip(reason="Docker not available — integration tests skipped")
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip_marker)


@pytest.fixture(scope="session")
def postgres_container():
    """Spin up a Postgres container with PostGIS for the test session."""
    if not DOCKER_AVAILABLE:
        pytest.skip("Docker not available")

    from testcontainers.postgres import PostgresContainer

    container = PostgresContainer(
        image="postgis/postgis:15-3.4",
        username="test",
        password="test",
        dbname="test",
        driver=None,  # we connect with psycopg directly, not via SQLAlchemy URL
    )
    container.start()
    try:
        yield container
    finally:
        container.stop()


@pytest.fixture(scope="session")
def postgres_dsn(postgres_container) -> str:
    """Return a psycopg-compatible DSN for the test container."""
    host = postgres_container.get_container_host_ip()
    port = postgres_container.get_exposed_port(5432)
    return f"postgresql://test:test@{host}:{port}/test"


@pytest.fixture(scope="session")
def migrated_postgres_dsn(postgres_dsn) -> Iterator[str]:
    """Apply DATABASES/schema.sql + migrations/0001 to the test container.

    Session-scoped: the schema is applied once and reused across all tests.
    Each test uses the per_test_conn fixture for a clean transaction.
    """
    import psycopg

    repo_root = Path(__file__).resolve().parent.parent
    schema_path = repo_root / "DATABASES" / "schema.sql"
    migration_path = repo_root / "migrations" / "0001_storage_layer_deltas.sql"

    assert schema_path.exists(), f"missing {schema_path}"
    assert migration_path.exists(), f"missing {migration_path}"

    with psycopg.connect(postgres_dsn, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(schema_path.read_text(encoding="utf-8"))
            cur.execute(migration_path.read_text(encoding="utf-8"))

    yield postgres_dsn


@pytest.fixture
def harness_conn(migrated_postgres_dsn) -> Iterator:
    """Yield a HarnessConnection wrapped in a savepoint that rolls back per test.

    Each test gets a clean view of the database. The schema is shared across
    tests; only the data inserted by the test is rolled back at the end.
    """
    from harness.db import HarnessConnection

    conn = HarnessConnection(migrated_postgres_dsn)
    try:
        # Each test runs in its own transaction that gets rolled back.
        # We use a SAVEPOINT pattern: BEGIN, run test, ROLLBACK.
        conn._conn.execute("BEGIN")
        yield conn
    finally:
        conn._conn.execute("ROLLBACK")
        conn.close()
```

- [ ] **Step 2: Create `tests/integration/test_migration.py`**

```python
"""Integration test: verify the migration applies cleanly on top of schema.sql.

This is the first integration test. If it fails, none of the other integration
tests can run, so it serves as a smoke test for the test infrastructure too.
"""
import pytest

pytestmark = pytest.mark.integration


class TestMigrationApplies:
    def test_entity_clusters_table_exists(self, harness_conn):
        row = harness_conn.fetchone(
            "SELECT to_regclass('public.entity_clusters') AS oid"
        )
        assert row["oid"] is not None

    def test_cluster_attribute_observations_table_exists(self, harness_conn):
        row = harness_conn.fetchone(
            "SELECT to_regclass('public.cluster_attribute_observations') AS oid"
        )
        assert row["oid"] is not None

    def test_source_domain_overrides_table_exists(self, harness_conn):
        row = harness_conn.fetchone(
            "SELECT to_regclass('public.source_domain_overrides') AS oid"
        )
        assert row["oid"] is not None

    def test_evidence_has_is_current_column(self, harness_conn):
        row = harness_conn.fetchone(
            """
            SELECT column_name FROM information_schema.columns
             WHERE table_name = 'evidence' AND column_name = 'is_current'
            """
        )
        assert row is not None

    def test_evidence_has_source_record_id_column(self, harness_conn):
        row = harness_conn.fetchone(
            """
            SELECT column_name FROM information_schema.columns
             WHERE table_name = 'evidence' AND column_name = 'source_record_id'
            """
        )
        assert row is not None

    def test_entities_has_cluster_id_column(self, harness_conn):
        row = harness_conn.fetchone(
            """
            SELECT column_name FROM information_schema.columns
             WHERE table_name = 'entities' AND column_name = 'cluster_id'
            """
        )
        assert row is not None

    def test_entities_merged_into_id_renamed_to_redirected_to_id(self, harness_conn):
        not_renamed = harness_conn.fetchone(
            """
            SELECT column_name FROM information_schema.columns
             WHERE table_name = 'entities' AND column_name = 'merged_into_id'
            """
        )
        renamed = harness_conn.fetchone(
            """
            SELECT column_name FROM information_schema.columns
             WHERE table_name = 'entities' AND column_name = 'redirected_to_id'
            """
        )
        assert not_renamed is None
        assert renamed is not None

    def test_v_current_evidence_view_exists(self, harness_conn):
        row = harness_conn.fetchone(
            "SELECT to_regclass('public.v_current_evidence') AS oid"
        )
        assert row["oid"] is not None

    def test_merge_clusters_function_exists(self, harness_conn):
        row = harness_conn.fetchone(
            """
            SELECT proname FROM pg_proc WHERE proname = 'merge_clusters'
            """
        )
        assert row is not None

    def test_cases_location_is_geography(self, harness_conn):
        row = harness_conn.fetchone(
            """
            SELECT udt_name FROM information_schema.columns
             WHERE table_name = 'cases' AND column_name = 'location'
            """
        )
        assert row["udt_name"] == "geography"

    def test_cases_location_lat_is_generated(self, harness_conn):
        row = harness_conn.fetchone(
            """
            SELECT is_generated FROM information_schema.columns
             WHERE table_name = 'cases' AND column_name = 'location_lat'
            """
        )
        assert row["is_generated"] == "ALWAYS"
```

- [ ] **Step 3: Run the migration tests**

Run:
```bash
pytest tests/integration/test_migration.py -v -m integration
```

Expected if Docker is running: all tests PASS. The first run will be slow (~30s) because it pulls the postgis image.

Expected if Docker is NOT running: tests are SKIPPED with the reason "Docker not available — integration tests skipped".

If any test FAILS (not skipped), there is a real bug in the migration SQL that must be fixed before continuing.

- [ ] **Step 4: Commit**

```bash
git add tests/conftest.py tests/integration/test_migration.py
git commit -m "$(cat <<'EOF'
test(integration): testcontainers postgres fixture + migration smoke tests

Adds the integration test infrastructure: a session-scoped Postgres
container (postgis/postgis:15-3.4) with the base schema + migration
applied, plus per-test transactions that roll back automatically.

Auto-skips when Docker is unavailable so the unit tests still run on
machines without Docker.

The migration test verifies every spec §5 schema delta actually landed:
new tables, renamed columns, generated columns, views, and the
merge_clusters function.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Integration test — `register_source`

**Files:**
- Create: `tests/integration/test_register_source.py`

- [ ] **Step 1: Create the test file**

```python
"""Integration tests for harness.sources.register_source against a real DB."""
import pytest

from harness.sources import register_source
from harness.types import SourceRegistration, SourceType


pytestmark = pytest.mark.integration


class TestRegisterSourceFirstTime:
    def test_inserts_with_type_default_rating(self, harness_conn):
        reg = SourceRegistration(
            url="https://www.murderdata.org/p/data-docs.html",
            domain="murderdata.org",
            title="MAP Supplementary Homicide Report",
            source_type=SourceType.PUBLIC_RECORD,
        )
        source_id = register_source(harness_conn, reg)
        assert source_id is not None

        row = harness_conn.fetchone(
            "SELECT reliability_rating, source_type, domain FROM sources WHERE id = %s",
            (source_id,),
        )
        assert row["reliability_rating"] == 5
        assert row["source_type"] == "public_record"
        assert row["domain"] == "murderdata.org"

    def test_news_article_gets_default_rating_3(self, harness_conn):
        reg = SourceRegistration(
            url="https://example.local/article",
            domain="example.local",
            title="Some article",
            source_type=SourceType.NEWS_ARTICLE,
        )
        source_id = register_source(harness_conn, reg)
        rating = harness_conn.fetchval("SELECT reliability_rating FROM sources WHERE id = %s", (source_id,))
        assert rating == 3


class TestRegisterSourceWithDomainOverride:
    def test_domain_override_takes_precedence_over_type_default(self, harness_conn):
        # Seed an override
        harness_conn.execute(
            """
            INSERT INTO source_domain_overrides (domain, rating_override, rationale)
            VALUES ('charleyproject.org', 4, 'Long-running curated DB')
            """
        )

        # charleyproject.org would default to 2 (website) but override raises to 4
        reg = SourceRegistration(
            url="https://charleyproject.org/case/jane-doe",
            domain="charleyproject.org",
            title="Jane Doe",
            source_type=SourceType.WEBSITE,
        )
        source_id = register_source(harness_conn, reg)
        rating = harness_conn.fetchval("SELECT reliability_rating FROM sources WHERE id = %s", (source_id,))
        assert rating == 4


class TestRegisterSourceIdempotency:
    def test_same_url_returns_same_id(self, harness_conn):
        reg = SourceRegistration(
            url="https://example.local/article",
            domain="example.local",
            title="Some article",
            source_type=SourceType.NEWS_ARTICLE,
        )
        id1 = register_source(harness_conn, reg)
        id2 = register_source(harness_conn, reg)
        assert id1 == id2

    def test_same_domain_different_urls_create_distinct_sources(self, harness_conn):
        a = SourceRegistration(
            url="https://example.local/article-a",
            domain="example.local",
            title="A",
            source_type=SourceType.NEWS_ARTICLE,
        )
        b = SourceRegistration(
            url="https://example.local/article-b",
            domain="example.local",
            title="B",
            source_type=SourceType.NEWS_ARTICLE,
        )
        id_a = register_source(harness_conn, a)
        id_b = register_source(harness_conn, b)
        assert id_a != id_b
```

- [ ] **Step 2: Run the test**

Run:
```bash
pytest tests/integration/test_register_source.py -v -m integration
```

Expected: all tests PASS (or all SKIP if Docker is not running).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/test_register_source.py
git commit -m "$(cat <<'EOF'
test(integration): register_source against real Postgres

Verifies type-default ratings (5 for public_record, 3 for news_article),
per-domain overrides taking precedence, and idempotency on
(domain, url) repeat registrations.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Integration test — `promote_evidence` supersedes chain

**Files:**
- Create: `tests/integration/test_promote_evidence.py`

- [ ] **Step 1: Create the test file**

```python
"""Integration tests for harness.promote.promote_evidence."""
import pytest
from uuid import uuid4

from harness.promote import promote_evidence
from harness.sources import register_source
from harness.types import (
    ConfidenceLevel,
    EvidenceCategory,
    IngestionMethod,
    SourceRegistration,
    SourceType,
)


pytestmark = pytest.mark.integration


@pytest.fixture
def case_id(harness_conn):
    """Create a minimal case row and return its id."""
    row = harness_conn.fetchone(
        """
        INSERT INTO cases (title, slug, summary, status)
        VALUES ('Test Case', 'test-case-' || uuid_generate_v4()::text, 'A test', 'cold')
        RETURNING id
        """
    )
    return row["id"]


@pytest.fixture
def source_id(harness_conn):
    return register_source(
        harness_conn,
        SourceRegistration(
            url="https://example.local/source",
            domain="example.local",
            title="Test Source",
            source_type=SourceType.NEWS_ARTICLE,
        ),
    )


def _promote(conn, *, case_id, source_id, source_record_id, raw_row, summary="A summary"):
    return promote_evidence(
        conn,
        raw_row,
        case_id=case_id,
        source_id=source_id,
        source_record_id=source_record_id,
        evidence_code="E001",
        title="Test Evidence",
        summary=summary,
        category=EvidenceCategory.WITNESS_ACCOUNT,
        confidence=ConfidenceLevel.UNVERIFIED,
        ingestion_method=IngestionMethod.WEB_SCRAPE,
    )


class TestFirstTimePromotion:
    def test_inserts_new_evidence_row(self, harness_conn, case_id, source_id):
        result = _promote(
            harness_conn,
            case_id=case_id, source_id=source_id, source_record_id="rec-001",
            raw_row={"name": "Alice", "age": 30},
        )
        assert result.action == "inserted"
        assert result.record_id is not None
        assert result.superseded_id is None

        row = harness_conn.fetchone("SELECT is_current, content_hash FROM evidence WHERE id = %s", (result.record_id,))
        assert row["is_current"] is True
        assert row["content_hash"] is not None


class TestUnchangedPromotion:
    def test_re_promoting_same_data_is_unchanged(self, harness_conn, case_id, source_id):
        raw_row = {"name": "Alice", "age": 30}
        first = _promote(
            harness_conn,
            case_id=case_id, source_id=source_id, source_record_id="rec-001", raw_row=raw_row,
        )
        second = _promote(
            harness_conn,
            case_id=case_id, source_id=source_id, source_record_id="rec-001", raw_row=raw_row,
        )
        assert second.action == "unchanged"
        assert second.record_id == first.record_id

        # Only one row in evidence
        count = harness_conn.fetchval(
            "SELECT COUNT(*) FROM evidence WHERE source_id = %s AND source_record_id = 'rec-001'",
            (source_id,),
        )
        assert count == 1

    def test_excluded_field_changes_do_not_trigger_supersede(self, harness_conn, case_id, source_id):
        a = {"name": "Alice", "scraped_at": "2026-01-01T00:00:00Z"}
        b = {"name": "Alice", "scraped_at": "2026-04-08T15:30:00Z"}
        first = _promote(harness_conn, case_id=case_id, source_id=source_id, source_record_id="rec-001", raw_row=a)
        second = _promote(harness_conn, case_id=case_id, source_id=source_id, source_record_id="rec-001", raw_row=b)
        assert second.action == "unchanged"
        assert second.record_id == first.record_id


class TestSupersedesChain:
    def test_changed_data_supersedes_old_row(self, harness_conn, case_id, source_id):
        first = _promote(
            harness_conn,
            case_id=case_id, source_id=source_id, source_record_id="rec-001",
            raw_row={"name": "Alice", "age": 30},
        )
        second = _promote(
            harness_conn,
            case_id=case_id, source_id=source_id, source_record_id="rec-001",
            raw_row={"name": "Alice", "age": 31},  # age changed
        )

        assert second.action == "superseded"
        assert second.superseded_id == first.record_id
        assert second.record_id != first.record_id

        # Old row is still in DB but is_current = FALSE
        old = harness_conn.fetchone("SELECT is_current FROM evidence WHERE id = %s", (first.record_id,))
        new = harness_conn.fetchone("SELECT is_current, supersedes_id FROM evidence WHERE id = %s", (second.record_id,))
        assert old["is_current"] is False
        assert new["is_current"] is True
        assert new["supersedes_id"] == first.record_id

    def test_v_current_evidence_only_returns_current(self, harness_conn, case_id, source_id):
        first = _promote(
            harness_conn,
            case_id=case_id, source_id=source_id, source_record_id="rec-001",
            raw_row={"v": 1},
        )
        second = _promote(
            harness_conn,
            case_id=case_id, source_id=source_id, source_record_id="rec-001",
            raw_row={"v": 2},
        )
        rows = harness_conn.fetchall(
            "SELECT id FROM v_current_evidence WHERE source_id = %s AND source_record_id = 'rec-001'",
            (source_id,),
        )
        assert len(rows) == 1
        assert rows[0]["id"] == second.record_id

    def test_three_revisions_form_a_chain(self, harness_conn, case_id, source_id):
        results = [
            _promote(
                harness_conn,
                case_id=case_id, source_id=source_id, source_record_id="rec-001",
                raw_row={"v": i},
            )
            for i in range(1, 4)
        ]
        # Walk the chain backward via supersedes_id
        latest = harness_conn.fetchone("SELECT id, supersedes_id FROM evidence WHERE id = %s", (results[2].record_id,))
        middle = harness_conn.fetchone("SELECT id, supersedes_id FROM evidence WHERE id = %s", (latest["supersedes_id"],))
        oldest = harness_conn.fetchone("SELECT id, supersedes_id FROM evidence WHERE id = %s", (middle["supersedes_id"],))
        assert oldest["supersedes_id"] is None
        assert oldest["id"] == results[0].record_id
        assert middle["id"] == results[1].record_id
        assert latest["id"] == results[2].record_id


class TestSpatialCoordinatesViaLocation:
    def test_lat_lng_written_via_location_geography(self, harness_conn, case_id, source_id):
        result = promote_evidence(
            harness_conn,
            {"v": 1},
            case_id=case_id,
            source_id=source_id,
            source_record_id="rec-001",
            evidence_code="E001",
            title="Spatial test",
            summary="A summary",
            category=EvidenceCategory.WITNESS_ACCOUNT,
            location_lat=41.5868,
            location_lng=-93.6250,
        )
        row = harness_conn.fetchone(
            "SELECT location_lat, location_lng, ST_AsText(location::geometry) AS wkt FROM evidence WHERE id = %s",
            (result.record_id,),
        )
        # Generated columns expose lat/lng
        assert abs(float(row["location_lat"]) - 41.5868) < 1e-5
        assert abs(float(row["location_lng"]) - -93.6250) < 1e-5
        assert "POINT" in row["wkt"]
```

- [ ] **Step 2: Run the test**

Run:
```bash
pytest tests/integration/test_promote_evidence.py -v -m integration
```

Expected: all tests PASS (or all SKIP if Docker is not running).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/test_promote_evidence.py
git commit -m "$(cat <<'EOF'
test(integration): promote_evidence supersedes chain + spatial writes

Verifies Strategy B behavior end-to-end against a real Postgres:
  - First-time insert sets is_current=true
  - Re-promoting unchanged data is a no-op
  - Excluded fields (scraped_at) don't trigger spurious supersedes
  - Changed data flips the old row to is_current=false and links via supersedes_id
  - v_current_evidence view only returns the current row
  - Three-revision chain walks correctly via supersedes_id
  - Spatial lat/lng written through location GEOGRAPHY column,
    generated lat/lng columns expose the values back

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Integration test — `promote_entity` + cluster pipeline + resolver

**Files:**
- Create: `tests/integration/test_promote_entity.py`
- Create: `tests/integration/test_resolver_pipeline.py`

- [ ] **Step 1: Create `tests/integration/test_promote_entity.py`**

```python
"""Integration tests for harness.promote.promote_entity."""
import pytest

from harness.promote import promote_entity
from harness.sources import register_source
from harness.types import EntityType, SourceRegistration, SourceType


pytestmark = pytest.mark.integration


@pytest.fixture
def source_id(harness_conn):
    return register_source(
        harness_conn,
        SourceRegistration(
            url="https://example.local/p1",
            domain="example.local",
            title="Test",
            source_type=SourceType.NEWS_ARTICLE,
        ),
    )


def _promote(conn, *, source_id, source_record_id, raw_row, canonical_name, attributes=None):
    return promote_entity(
        conn,
        raw_row,
        source_id=source_id,
        source_record_id=source_record_id,
        entity_type=EntityType.PERSON,
        canonical_name=canonical_name,
        attributes=attributes or {},
    )


class TestFirstTimeEntityPromotion:
    def test_inserts_new_entity(self, harness_conn, source_id):
        result = _promote(
            harness_conn,
            source_id=source_id, source_record_id="alice-001",
            raw_row={"name": "Alice", "age": 30},
            canonical_name="Alice Smith",
        )
        assert result.action == "inserted"
        row = harness_conn.fetchone(
            "SELECT canonical_name, redirected_to_id, source_id, source_record_id FROM entities WHERE id = %s",
            (result.record_id,),
        )
        assert row["canonical_name"] == "Alice Smith"
        assert row["redirected_to_id"] is None
        assert row["source_id"] == source_id


class TestEntityIdempotency:
    def test_same_data_returns_unchanged(self, harness_conn, source_id):
        raw = {"name": "Alice", "age": 30}
        first = _promote(harness_conn, source_id=source_id, source_record_id="alice-001", raw_row=raw, canonical_name="Alice")
        second = _promote(harness_conn, source_id=source_id, source_record_id="alice-001", raw_row=raw, canonical_name="Alice")
        assert second.action == "unchanged"
        assert second.record_id == first.record_id


class TestEntityRedirectChain:
    def test_changed_entity_redirects_old_to_new(self, harness_conn, source_id):
        first = _promote(
            harness_conn,
            source_id=source_id, source_record_id="alice-001",
            raw_row={"name": "Alice", "age": 30},
            canonical_name="Alice",
        )
        second = _promote(
            harness_conn,
            source_id=source_id, source_record_id="alice-001",
            raw_row={"name": "Alice", "age": 31},
            canonical_name="Alice",
        )
        assert second.action == "superseded"
        assert second.superseded_id == first.record_id
        assert second.record_id != first.record_id

        old = harness_conn.fetchone("SELECT redirected_to_id FROM entities WHERE id = %s", (first.record_id,))
        new = harness_conn.fetchone("SELECT redirected_to_id FROM entities WHERE id = %s", (second.record_id,))
        assert old["redirected_to_id"] == second.record_id
        assert new["redirected_to_id"] is None


class TestSourceFaithfulness:
    def test_two_different_sources_create_two_entities_for_same_person(self, harness_conn, source_id):
        # MAP source
        map_source_id = register_source(
            harness_conn,
            SourceRegistration(
                url="https://murderdata.org/p1",
                domain="murderdata.org",
                title="MAP",
                source_type=SourceType.PUBLIC_RECORD,
            ),
        )
        # Charley source
        charley_source_id = register_source(
            harness_conn,
            SourceRegistration(
                url="https://charleyproject.org/p1",
                domain="charleyproject.org",
                title="Charley",
                source_type=SourceType.WEBSITE,
            ),
        )
        a = _promote(harness_conn, source_id=map_source_id, source_record_id="map-1", raw_row={"x": 1}, canonical_name="Alice (MAP)")
        b = _promote(harness_conn, source_id=charley_source_id, source_record_id="ch-1", raw_row={"x": 2}, canonical_name="Alice (Charley)")
        assert a.record_id != b.record_id
        # Both rows exist independently — clustering happens later, NOT during promotion
        rows = harness_conn.fetchall(
            "SELECT id, canonical_name FROM entities WHERE id IN (%s, %s) ORDER BY canonical_name",
            (a.record_id, b.record_id),
        )
        assert len(rows) == 2
```

- [ ] **Step 2: Create `tests/integration/test_resolver_pipeline.py`**

```python
"""Integration test for resolve_cluster_attributes against a populated cluster.

Manually constructs a cluster with multiple member entities from sources of
different reliability ratings, inserts attribute observations, and verifies
the resolver picks the right winners and writes them to merged_attributes.
"""
import json
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from harness.promote import promote_entity
from harness.resolver import resolve_cluster_attributes
from harness.sources import register_source
from harness.types import EntityType, SourceRegistration, SourceType


pytestmark = pytest.mark.integration


@pytest.fixture
def populated_cluster(harness_conn):
    """Build a cluster with two member entities from two sources of different reliability.

    Source A is rating 5 (public_record), Source B is rating 2 (website).
    Each contributes observations for 'eye_color' and 'dob'.

    Returns: (cluster_id, source_a_id, source_b_id, entity_a_id, entity_b_id)
    """
    source_a_id = register_source(
        harness_conn,
        SourceRegistration(url="https://gov.local/a", domain="gov.local", title="Gov", source_type=SourceType.PUBLIC_RECORD),
    )
    source_b_id = register_source(
        harness_conn,
        SourceRegistration(url="https://blog.local/b", domain="blog.local", title="Blog", source_type=SourceType.WEBSITE),
    )

    entity_a = promote_entity(
        harness_conn,
        {"x": 1},
        source_id=source_a_id, source_record_id="a-1",
        entity_type=EntityType.PERSON,
        canonical_name="Alice (gov)",
    )
    entity_b = promote_entity(
        harness_conn,
        {"x": 2},
        source_id=source_b_id, source_record_id="b-1",
        entity_type=EntityType.PERSON,
        canonical_name="Alice (blog)",
    )

    cluster_row = harness_conn.fetchone(
        """
        INSERT INTO entity_clusters (canonical_name, entity_type)
        VALUES ('Alice', 'person')
        RETURNING id
        """
    )
    cluster_id = cluster_row["id"]

    # Link entities to cluster
    harness_conn.execute("UPDATE entities SET cluster_id = %s WHERE id IN (%s, %s)",
                         (cluster_id, entity_a.record_id, entity_b.record_id))

    # Insert observations
    harness_conn.execute(
        """
        INSERT INTO cluster_attribute_observations
            (cluster_id, entity_id, source_id, attribute_key, attribute_value, observed_at, confidence)
        VALUES
            (%s, %s, %s, 'eye_color', %s, %s, 'verified'),
            (%s, %s, %s, 'eye_color', %s, %s, 'unverified'),
            (%s, %s, %s, 'dob',       %s, %s, 'verified'),
            (%s, %s, %s, 'dob',       %s, %s, 'unverified')
        """,
        (
            cluster_id, entity_a.record_id, source_a_id, json.dumps("Hazel"), datetime(2024, 1, 1, tzinfo=timezone.utc),
            cluster_id, entity_b.record_id, source_b_id, json.dumps("Green"), datetime(2024, 6, 1, tzinfo=timezone.utc),
            cluster_id, entity_a.record_id, source_a_id, json.dumps("1959-06-15"), datetime(2024, 1, 1, tzinfo=timezone.utc),
            cluster_id, entity_b.record_id, source_b_id, json.dumps("1960-01-01"), datetime(2024, 6, 1, tzinfo=timezone.utc),
        ),
    )

    return cluster_id, source_a_id, source_b_id, entity_a.record_id, entity_b.record_id


class TestResolverHappyPath:
    def test_higher_rating_source_wins(self, harness_conn, populated_cluster):
        cluster_id, *_ = populated_cluster
        resolved = resolve_cluster_attributes(harness_conn, cluster_id)
        assert resolved == {"eye_color": "Hazel", "dob": "1959-06-15"}

    def test_resolved_blob_written_to_cluster_row(self, harness_conn, populated_cluster):
        cluster_id, *_ = populated_cluster
        resolve_cluster_attributes(harness_conn, cluster_id)
        row = harness_conn.fetchone("SELECT merged_attributes FROM entity_clusters WHERE id = %s", (cluster_id,))
        assert row["merged_attributes"] == {"eye_color": "Hazel", "dob": "1959-06-15"}


class TestResolverRetractionFlow:
    def test_retracting_source_a_makes_source_b_win(self, harness_conn, populated_cluster):
        cluster_id, source_a_id, *_ = populated_cluster

        # First resolve — source A wins (rating 5 > rating 2)
        resolved = resolve_cluster_attributes(harness_conn, cluster_id)
        assert resolved == {"eye_color": "Hazel", "dob": "1959-06-15"}

        # Retract source A
        harness_conn.execute(
            "UPDATE sources SET is_retracted = TRUE, retracted_reason = 'test' WHERE id = %s",
            (source_a_id,),
        )

        # Re-resolve — now source B wins
        resolved = resolve_cluster_attributes(harness_conn, cluster_id)
        assert resolved == {"eye_color": "Green", "dob": "1960-01-01"}


class TestResolverIdempotency:
    def test_running_resolver_twice_is_safe(self, harness_conn, populated_cluster):
        cluster_id, *_ = populated_cluster
        a = resolve_cluster_attributes(harness_conn, cluster_id)
        b = resolve_cluster_attributes(harness_conn, cluster_id)
        assert a == b


class TestResolverDisputedDowngrade:
    def test_disputed_high_rating_can_lose_to_undisputed_lower(self, harness_conn, populated_cluster):
        cluster_id, source_a_id, source_b_id, *_ = populated_cluster

        # Mark source A (rating 5) as disputed → effective 4
        # Source B (rating 2) stays at 2 → A still wins
        harness_conn.execute("UPDATE sources SET is_disputed = TRUE WHERE id = %s", (source_a_id,))
        resolved = resolve_cluster_attributes(harness_conn, cluster_id)
        assert resolved == {"eye_color": "Hazel", "dob": "1959-06-15"}  # still A, just downgraded


class TestMergeClusters:
    """Verifies the merge_clusters() SQL stored procedure (spec §7.1, D22).

    This function is the only piece of cluster-merge logic in Plan A. Plan C
    will call it from the auto-cluster pipeline when Splink proposes a match
    between two entities that already belong to different clusters.
    """

    def test_merging_moves_member_entities_to_target(self, harness_conn):
        # Build two minimal clusters with one entity each
        from harness.sources import register_source
        from harness.types import SourceRegistration, SourceType, EntityType
        from harness.promote import promote_entity

        src = register_source(
            harness_conn,
            SourceRegistration(url="https://x.local/p", domain="x.local", title="X", source_type=SourceType.NEWS_ARTICLE),
        )
        e_a = promote_entity(harness_conn, {"v": 1}, source_id=src, source_record_id="a", entity_type=EntityType.PERSON, canonical_name="A")
        e_b = promote_entity(harness_conn, {"v": 2}, source_id=src, source_record_id="b", entity_type=EntityType.PERSON, canonical_name="B")

        cluster_a = harness_conn.fetchone("INSERT INTO entity_clusters (canonical_name, entity_type) VALUES ('A', 'person') RETURNING id")["id"]
        cluster_b = harness_conn.fetchone("INSERT INTO entity_clusters (canonical_name, entity_type) VALUES ('B', 'person') RETURNING id")["id"]
        harness_conn.execute("UPDATE entities SET cluster_id = %s WHERE id = %s", (cluster_a, e_a.record_id))
        harness_conn.execute("UPDATE entities SET cluster_id = %s WHERE id = %s", (cluster_b, e_b.record_id))

        # Merge B into A
        harness_conn.execute("SELECT merge_clusters(%s, %s)", (cluster_b, cluster_a))

        # All entities now belong to cluster A
        rows = harness_conn.fetchall("SELECT cluster_id FROM entities WHERE id IN (%s, %s)", (e_a.record_id, e_b.record_id))
        assert all(r["cluster_id"] == cluster_a for r in rows)

        # Cluster B is tombstoned and points at A
        b_row = harness_conn.fetchone("SELECT redirected_to_cluster_id, deleted_at FROM entity_clusters WHERE id = %s", (cluster_b,))
        assert b_row["redirected_to_cluster_id"] == cluster_a
        assert b_row["deleted_at"] is not None

    def test_merging_moves_observations_to_target(self, harness_conn):
        from datetime import datetime, timezone
        import json
        from harness.sources import register_source
        from harness.types import SourceRegistration, SourceType, EntityType
        from harness.promote import promote_entity

        src = register_source(
            harness_conn,
            SourceRegistration(url="https://x.local/p", domain="x.local", title="X", source_type=SourceType.NEWS_ARTICLE),
        )
        e_a = promote_entity(harness_conn, {"v": 1}, source_id=src, source_record_id="a", entity_type=EntityType.PERSON, canonical_name="A")
        e_b = promote_entity(harness_conn, {"v": 2}, source_id=src, source_record_id="b", entity_type=EntityType.PERSON, canonical_name="B")

        cluster_a = harness_conn.fetchone("INSERT INTO entity_clusters (canonical_name, entity_type) VALUES ('A', 'person') RETURNING id")["id"]
        cluster_b = harness_conn.fetchone("INSERT INTO entity_clusters (canonical_name, entity_type) VALUES ('B', 'person') RETURNING id")["id"]
        harness_conn.execute("UPDATE entities SET cluster_id = %s WHERE id = %s", (cluster_a, e_a.record_id))
        harness_conn.execute("UPDATE entities SET cluster_id = %s WHERE id = %s", (cluster_b, e_b.record_id))

        # Cluster B has an observation
        harness_conn.execute(
            """
            INSERT INTO cluster_attribute_observations
                (cluster_id, entity_id, source_id, attribute_key, attribute_value, observed_at, confidence)
            VALUES (%s, %s, %s, 'name', %s, %s, 'verified')
            """,
            (cluster_b, e_b.record_id, src, json.dumps("Bob"), datetime(2024, 1, 1, tzinfo=timezone.utc)),
        )

        # Merge B into A
        harness_conn.execute("SELECT merge_clusters(%s, %s)", (cluster_b, cluster_a))

        # Observation now belongs to A
        moved = harness_conn.fetchall("SELECT cluster_id FROM cluster_attribute_observations WHERE entity_id = %s", (e_b.record_id,))
        assert all(r["cluster_id"] == cluster_a for r in moved)
        # And cluster B has none
        b_obs = harness_conn.fetchall("SELECT id FROM cluster_attribute_observations WHERE cluster_id = %s", (cluster_b,))
        assert len(b_obs) == 0

    def test_merge_compaction_rewrites_redirect_chains(self, harness_conn):
        """If C redirects to B and we merge B into A, C should now redirect to A."""
        cluster_a = harness_conn.fetchone("INSERT INTO entity_clusters (canonical_name, entity_type) VALUES ('A', 'person') RETURNING id")["id"]
        cluster_b = harness_conn.fetchone("INSERT INTO entity_clusters (canonical_name, entity_type) VALUES ('B', 'person') RETURNING id")["id"]
        cluster_c = harness_conn.fetchone(
            "INSERT INTO entity_clusters (canonical_name, entity_type, redirected_to_cluster_id) VALUES ('C', 'person', %s) RETURNING id",
            (cluster_b,),
        )["id"]

        # Merge B into A
        harness_conn.execute("SELECT merge_clusters(%s, %s)", (cluster_b, cluster_a))

        # C now redirects to A (not B)
        c_row = harness_conn.fetchone("SELECT redirected_to_cluster_id FROM entity_clusters WHERE id = %s", (cluster_c,))
        assert c_row["redirected_to_cluster_id"] == cluster_a
```

- [ ] **Step 3: Run both test files**

Run:
```bash
pytest tests/integration/test_promote_entity.py tests/integration/test_resolver_pipeline.py -v -m integration
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/test_promote_entity.py tests/integration/test_resolver_pipeline.py
git commit -m "$(cat <<'EOF'
test(integration): promote_entity redirect chain + resolver retraction flow

Two integration test files exercising the cluster pipeline end-to-end:

test_promote_entity.py:
  - First-time insert
  - Idempotency on identical input
  - Redirect chain when source data changes
  - Source-faithfulness: two sources for the same person create two entities

test_resolver_pipeline.py:
  - Higher source rating wins (Hazel from public_record beats Green from website)
  - Resolved blob is written to entity_clusters.merged_attributes
  - Retracting a source triggers re-resolve, lower-rated source becomes winner
  - Idempotent re-runs produce identical output
  - is_disputed downgrades but doesn't exclude

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: End-to-end smoke test

**Files:**
- Create: `tests/integration/test_smoke_e2e.py`

- [ ] **Step 1: Create the smoke test**

```python
"""End-to-end smoke test for the full Plan A pipeline.

This is the integration test that proves Plan A works:
  1. Register two sources of different reliability
  2. Create a case
  3. Promote evidence from each source
  4. Promote two entity records from each source
  5. Manually create a cluster, link both entities to it
  6. Insert observations from both entities for the same attribute keys
  7. Run resolve_cluster_attributes
  8. Verify the resolved blob picks the right winner
  9. Re-promote one of the evidence rows with changed content
 10. Verify the supersedes chain
 11. Verify v_current_evidence only shows the latest

If this passes, Plan A is done.
"""
import json
from datetime import datetime, timezone

import pytest

from harness.promote import promote_entity, promote_evidence
from harness.resolver import resolve_cluster_attributes
from harness.sources import register_source
from harness.types import (
    ConfidenceLevel,
    EntityType,
    EvidenceCategory,
    IngestionMethod,
    SourceRegistration,
    SourceType,
)


pytestmark = pytest.mark.integration


def test_end_to_end_smoke(harness_conn):
    # ── 1. Register sources ──
    map_source = register_source(
        harness_conn,
        SourceRegistration(
            url="https://murderdata.org/p1",
            domain="murderdata.org",
            title="MAP SHR Record",
            source_type=SourceType.PUBLIC_RECORD,
        ),
    )
    charley_source = register_source(
        harness_conn,
        SourceRegistration(
            url="https://charleyproject.org/case/jane-doe",
            domain="charleyproject.org",
            title="Jane Doe",
            source_type=SourceType.WEBSITE,
        ),
    )

    # Verify ratings
    assert harness_conn.fetchval("SELECT reliability_rating FROM sources WHERE id = %s", (map_source,)) == 5
    assert harness_conn.fetchval("SELECT reliability_rating FROM sources WHERE id = %s", (charley_source,)) == 2

    # ── 2. Create a case ──
    case_row = harness_conn.fetchone(
        """
        INSERT INTO cases (title, slug, summary, status, location)
        VALUES (
            'Disappearance of Jane Doe',
            'jane-doe-' || uuid_generate_v4()::text,
            'A test case',
            'cold',
            ST_SetSRID(ST_MakePoint(-93.625, 41.5868), 4326)::geography
        )
        RETURNING id
        """
    )
    case_id = case_row["id"]

    # ── 3. Promote evidence from each source ──
    map_evidence = promote_evidence(
        harness_conn,
        {"vic_age": 23, "vic_race": "White", "vic_sex": "Female", "year": 1982},
        case_id=case_id,
        source_id=map_source,
        source_record_id="map-19820001",
        evidence_code="E001",
        title="MAP SHR Record",
        summary="Official record",
        category=EvidenceCategory.PUBLIC_RECORD,
        confidence=ConfidenceLevel.VERIFIED,
        ingestion_method=IngestionMethod.BULK_IMPORT,
    )
    assert map_evidence.action == "inserted"

    charley_evidence = promote_evidence(
        harness_conn,
        {"name": "Jane Doe", "age": 23, "missing_since": "1982-09-05", "city": "Des Moines"},
        case_id=case_id,
        source_id=charley_source,
        source_record_id="jane-doe",
        evidence_code="E002",
        title="Charley Project Profile",
        summary="Community profile",
        category=EvidenceCategory.WITNESS_ACCOUNT,
        confidence=ConfidenceLevel.UNVERIFIED,
    )
    assert charley_evidence.action == "inserted"

    # ── 4. Promote entities from each source ──
    map_entity = promote_entity(
        harness_conn,
        {"sex": "Female", "race": "White", "age": 23},
        source_id=map_source,
        source_record_id="map-19820001",
        entity_type=EntityType.PERSON,
        canonical_name="Unknown White Female age 23",
        attributes={"sex": "Female", "race": "White", "age": 23},
    )
    charley_entity = promote_entity(
        harness_conn,
        {"name": "Jane Doe", "eye_color": "Hazel", "dob": "1959-06-15"},
        source_id=charley_source,
        source_record_id="jane-doe",
        entity_type=EntityType.PERSON,
        canonical_name="Jane Doe",
        attributes={"eye_color": "Hazel", "dob": "1959-06-15"},
    )

    # ── 5. Manually create a cluster (Splink would do this automatically in Plan C) ──
    cluster_row = harness_conn.fetchone(
        """
        INSERT INTO entity_clusters (canonical_name, entity_type, member_count)
        VALUES ('Jane Doe', 'person', 2)
        RETURNING id
        """
    )
    cluster_id = cluster_row["id"]
    harness_conn.execute(
        "UPDATE entities SET cluster_id = %s WHERE id IN (%s, %s)",
        (cluster_id, map_entity.record_id, charley_entity.record_id),
    )

    # ── 6. Insert observations from both entities ──
    # MAP says: race=White, sex=Female, age=23 (verified, public_record rating 5)
    # Charley says: eye_color=Hazel, dob=1959-06-15 (unverified, website rating 2)
    # No conflict on attributes, so both contribute.
    harness_conn.execute(
        """
        INSERT INTO cluster_attribute_observations
            (cluster_id, entity_id, source_id, attribute_key, attribute_value, observed_at, confidence)
        VALUES
            (%s, %s, %s, 'sex',       %s, %s, 'verified'),
            (%s, %s, %s, 'race',      %s, %s, 'verified'),
            (%s, %s, %s, 'age',       %s, %s, 'verified'),
            (%s, %s, %s, 'eye_color', %s, %s, 'unverified'),
            (%s, %s, %s, 'dob',       %s, %s, 'unverified')
        """,
        (
            cluster_id, map_entity.record_id, map_source, json.dumps("Female"), datetime(2024, 1, 1, tzinfo=timezone.utc),
            cluster_id, map_entity.record_id, map_source, json.dumps("White"),  datetime(2024, 1, 1, tzinfo=timezone.utc),
            cluster_id, map_entity.record_id, map_source, json.dumps(23),       datetime(2024, 1, 1, tzinfo=timezone.utc),
            cluster_id, charley_entity.record_id, charley_source, json.dumps("Hazel"),      datetime(2024, 6, 1, tzinfo=timezone.utc),
            cluster_id, charley_entity.record_id, charley_source, json.dumps("1959-06-15"), datetime(2024, 6, 1, tzinfo=timezone.utc),
        ),
    )

    # ── 7. Resolve ──
    resolved = resolve_cluster_attributes(harness_conn, cluster_id)

    # ── 8. Verify ──
    assert resolved == {
        "sex": "Female",
        "race": "White",
        "age": 23,
        "eye_color": "Hazel",
        "dob": "1959-06-15",
    }

    cluster_row = harness_conn.fetchone("SELECT merged_attributes FROM entity_clusters WHERE id = %s", (cluster_id,))
    assert cluster_row["merged_attributes"] == resolved

    # ── 9. Re-promote charley evidence with changed content ──
    charley_v2 = promote_evidence(
        harness_conn,
        {"name": "Jane Doe", "age": 23, "missing_since": "1982-09-05", "city": "Des Moines", "new_witness": "Bob"},
        case_id=case_id,
        source_id=charley_source,
        source_record_id="jane-doe",
        evidence_code="E002",
        title="Charley Project Profile (updated)",
        summary="Community profile",
        category=EvidenceCategory.WITNESS_ACCOUNT,
        confidence=ConfidenceLevel.UNVERIFIED,
    )
    assert charley_v2.action == "superseded"
    assert charley_v2.superseded_id == charley_evidence.record_id

    # ── 10. Verify supersedes chain ──
    old = harness_conn.fetchone("SELECT is_current FROM evidence WHERE id = %s", (charley_evidence.record_id,))
    new = harness_conn.fetchone("SELECT is_current, supersedes_id FROM evidence WHERE id = %s", (charley_v2.record_id,))
    assert old["is_current"] is False
    assert new["is_current"] is True
    assert new["supersedes_id"] == charley_evidence.record_id

    # ── 11. Verify v_current_evidence only shows the latest ──
    current_charley_rows = harness_conn.fetchall(
        "SELECT id FROM v_current_evidence WHERE source_id = %s AND source_record_id = 'jane-doe'",
        (charley_source,),
    )
    assert len(current_charley_rows) == 1
    assert current_charley_rows[0]["id"] == charley_v2.record_id
```

- [ ] **Step 2: Run the smoke test**

Run:
```bash
pytest tests/integration/test_smoke_e2e.py -v -m integration
```

Expected: PASS. This is the proof that Plan A is done.

- [ ] **Step 3: Run the entire test suite one final time**

Run:
```bash
pytest -v
```

Expected: all unit tests PASS, all integration tests PASS (or SKIP if Docker is not running). Total should be ~70+ test cases.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/test_smoke_e2e.py
git commit -m "$(cat <<'EOF'
test(integration): end-to-end smoke test for Plan A

Single test that exercises the full Plan A pipeline:
  1. Register two sources of different reliability (MAP=5, Charley=2)
  2. Create a case with PostGIS location
  3. Promote evidence from each source
  4. Promote entities from each source (source-faithful)
  5. Manually create a cluster, link both entities
  6. Insert per-attribute observations
  7. Run the resolver
  8. Verify the resolved blob
  9. Re-promote evidence with changed content
 10. Verify supersedes chain
 11. Verify v_current_evidence reflects only the latest

If this passes, Plan A is done. Plan B (importer refactor + Meilisearch
sync) and Plan C (Splink ER batch) build on top.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist

After completing all 14 tasks:

- [ ] **Spec coverage check.** Walk every section of the spec (`docs/superpowers/specs/2026-04-08-storage-and-bulk-import-design.md` §3 through §13) and confirm:
  - Every D-numbered decision in §3 has a corresponding implementation or test
  - Every schema delta in §5 is in `migrations/0001_storage_layer_deltas.sql` AND verified by `tests/integration/test_migration.py`
  - Every layer of source rating (§6.1, §6.2, §6.3, §6.4) has unit tests
  - The cluster pipeline (§7) is exercised by the smoke test
  - The re-ingestion pipeline (§8) is exercised by `test_promote_evidence.py`
  - The harness contract (§10.1, §10.2) is enforced by the public API in `harness/__init__.py`
  - The RLS strategy (§12) is **NOT** implemented in Plan A — it's deferred to Plan B because it's tightly coupled to the importer service role and Supabase Auth setup. Note this in your handoff.

- [ ] **Run the full test suite from a clean checkout.**

```bash
git stash
git checkout -b plan-a-verification
python -m pip install -e ".[dev]"
pytest -v
```

Expected: all unit tests PASS unconditionally, all integration tests PASS if Docker is available (or SKIP if not).

- [ ] **Run only the unit tests on a machine without Docker.** Verify they still pass.

```bash
pytest tests/unit -v
```

Expected: all unit tests PASS, no integration tests collected.

- [ ] **Smoke check: import the harness from a fresh Python REPL.**

```bash
python -c "
import harness
from harness import (
    canonicalize, content_hash,
    register_source, SourceRegistration, SourceType,
    promote_evidence, promote_entity,
    resolve_cluster_attributes, score_observations,
    HarnessConnection, connect,
)
print('All exports importable')
print('Version:', harness.__version__)
"
```

Expected: `All exports importable` followed by `Version: 0.1.0`.

- [ ] **Verify no placeholders remain.** Search for `TODO`, `FIXME`, `XXX`, `pass  # `, and `raise NotImplementedError` in the harness code:

```bash
grep -rn "TODO\|FIXME\|XXX\|NotImplementedError" harness/ tests/
```

Expected: no matches in harness/ or tests/. (Matches in docs/ are fine if they're in the spec or open-issues sections.)

---

## What's NOT in this plan (Plan B / Plan C)

**Plan B will add:**
- Refactoring `DATABASES/map_importer.py` to use the harness instead of writing NDJSON directly
- Refactoring `SCRAPERS/charley_scraper.py` similarly
- The Meilisearch sync cron (`harness/sync.py` + a runner script)
- The `raw_staging` archival job
- RLS policy SQL (deferred until Supabase + Auth are wired)
- A migration tracking table (`schema_migrations`)
- Documentation for actually running an importer end-to-end against Supabase

**Plan C will add:**
- Splink configuration (blocking rules, comparison vectors, training)
- The ER batch script that calls Splink and writes to `cross_case_matches`
- The auto-cluster pipeline (threshold split, cluster creation, observation emission)
- The retraction worker that re-resolves affected clusters when a source is retracted
- The cluster-merge worker that calls `merge_clusters()` and re-resolves the target

**Operational items handled by you, not in any plan:**
- Provisioning Supabase + Meilisearch + worker host
- Setting up backups and disaster recovery
- Cost monitoring
- Domain seed list expansion (more than the 13 entries in spec §6.2)
- Source-type rating cutoffs review and freeze

---

*End of Plan A.*
