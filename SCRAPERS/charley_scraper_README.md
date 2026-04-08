# Charley Project Scraper

Crawls [charleyproject.org](https://charleyproject.org) (16,000+ missing persons cases) and produces structured data files mapped to the Cold Case Investigation Platform database schema.

## License Compliance

The Charley Project is licensed under **Creative Commons Attribution-NonCommercial 2.0**. This scraper includes proper attribution and is for non-commercial research use only.

## Quick Start

```bash
pip install requests beautifulsoup4 lxml

# Test with 5 cases
python charley_scraper.py --test 5

# Scrape one letter
python charley_scraper.py --letter A

# Full crawl (~16,000 cases, ~7 hours at 1.5s delay)
python charley_scraper.py

# Resume interrupted crawl
python charley_scraper.py --resume
```

## Output Files

All output goes to `./output/`:

| File | DB Table | Description |
|------|----------|-------------|
| `cases.ndjson` | `cases` | One record per missing person case |
| `entities.ndjson` | `entities` | Victim entity records with physical descriptors |
| `sources.ndjson` | `sources` | Charley Project page + external source links |
| `evidence.ndjson` | `evidence` | Case description as a document evidence record |
| `entity_evidence.ndjson` | `entity_evidence` | Junction linking victim entity ↔ evidence |
| `raw_staging.ndjson` | `raw_staging` | Raw scrape metadata for the pipeline |
| `scrape_jobs.ndjson` | `scrape_jobs` | Scrape job tracking records |
| `scrape_meta.ndjson` | — | Images, phone numbers, extra metadata |
| `load_charley_data.sql` | — | Bulk SQL loader script |

## Loading into PostgreSQL

```bash
# After a crawl completes:
psql -d coldcase -f output/load_charley_data.sql
```

The SQL loader uses a temp JSONB table + `\copy` for bulk inserts with `ON CONFLICT` handling for idempotent re-runs.

## Schema Mapping

```
Charley Project Field     →  DB Column
─────────────────────────────────────────
Name (h1)                 →  cases.victim_name, entities.canonical_name
Missing Since             →  cases.date_occurred
Missing From              →  cases.location_city, cases.location_state
Classification            →  cases.crime_type, cases.crime_subtypes
Sex / Race / DOB          →  entities.attributes (JSONB)
Height and Weight         →  entities.attributes.height_inches, .weight_lbs
Distinguishing Chars      →  entities.summary, entities.attributes
Details of Disappearance  →  cases.summary, evidence.full_text
Investigating Agency      →  cases.primary_agency
Source Information links   →  sources table (one row per link)
Case URL                  →  sources.url, scrape_jobs.target_url
```

## Architecture

```
Phase 1: Discovery
  Alphabetical index (A-Z) → collect all /case/slug URLs

Phase 2: Extraction
  For each case URL:
    → fetch HTML
    → parse structured metadata fields
    → parse narrative text sections
    → extract source links and images
    → generate deterministic UUIDs (uuid5 from URL)

Phase 3: Output
  → NDJSON files per table (append-mode, resumable)
  → SQL bulk loader script
```

## Polite Scraping

- 1.5 second delay between requests
- Descriptive User-Agent header
- Retry with exponential backoff on failure
- Resume support to avoid re-scraping
