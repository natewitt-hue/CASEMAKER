#!/usr/bin/env python3
"""
Charley Project Scraper
=======================
Crawls charleyproject.org, extracts structured case data, and produces
JSON files ready for insertion into the Cold Case Investigation Platform
database schema.

Strategy:
  1. Hit alphabetical listing pages (A–Z) → collect all case URLs
  2. Fetch each case page → parse structured fields with BeautifulSoup
  3. Map parsed data → cases, entities, sources, raw_staging tables
  4. Write NDJSON output files per table, plus a combined SQL loader script

Usage:
  pip install requests beautifulsoup4 lxml
  python charley_scraper.py                # full crawl
  python charley_scraper.py --letter A     # single letter
  python charley_scraper.py --test 5       # first 5 cases only
  python charley_scraper.py --resume       # skip already-scraped slugs
"""

import argparse
import hashlib
import json
import logging
import os
import re
import sys
import time
import uuid
from datetime import datetime, date
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup, Tag

# ── Config ───────────────────────────────────────────────────────────────────

BASE_URL = "https://charleyproject.org"
ALPHA_URL = f"{BASE_URL}/case-searches/alphabetical-cases"
LETTERS = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")

REQUEST_DELAY = 1.5          # seconds between requests (be polite)
REQUEST_TIMEOUT = 30
MAX_RETRIES = 3
RETRY_BACKOFF = 5            # seconds base backoff on failure

OUTPUT_DIR = Path("output")
LOG_FILE = "charley_scraper.log"

HEADERS = {
    "User-Agent": "ColdCasePlatform-Scraper/1.0 (+https://github.com/coldcase; research-only; "
                  "respects-CC-BY-NC)",
    "Accept": "text/html,application/xhtml+xml",
}

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_FILE, mode="a"),
    ],
)
log = logging.getLogger("charley")

# ── HTTP helpers ─────────────────────────────────────────────────────────────

session = requests.Session()
session.headers.update(HEADERS)


def fetch(url: str, retries: int = MAX_RETRIES) -> Optional[str]:
    """Fetch a URL with retries and polite delay."""
    for attempt in range(1, retries + 1):
        try:
            time.sleep(REQUEST_DELAY)
            resp = session.get(url, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            return resp.text
        except requests.RequestException as e:
            wait = RETRY_BACKOFF * attempt
            log.warning(f"Attempt {attempt}/{retries} failed for {url}: {e}. "
                        f"Retrying in {wait}s...")
            time.sleep(wait)
    log.error(f"FAILED after {retries} attempts: {url}")
    return None


# ── Phase 1: Discover all case URLs ─────────────────────────────────────────

def discover_case_urls(letters: list[str] = LETTERS) -> list[dict]:
    """
    Crawl the alphabetical index pages and collect every case link.
    Returns list of {"name": str, "url": str, "slug": str}.
    """
    cases = []
    for letter in letters:
        url = f"{ALPHA_URL}?letter={letter}"
        log.info(f"Discovering cases: letter {letter}")
        html = fetch(url)
        if not html:
            continue

        soup = BeautifulSoup(html, "lxml")
        # Case links live in the main content area as plain <a> tags to /case/slug
        for a in soup.select('a[href*="/case/"]'):
            href = a.get("href", "")
            # Filter out non-case links (searches, updates, etc.)
            if "/case-searches/" in href or "/case-updates/" in href:
                continue
            name = a.get_text(strip=True)
            if not name:
                continue
            slug = href.rstrip("/").split("/")[-1]
            full_url = urljoin(BASE_URL, href)
            cases.append({"name": name, "url": full_url, "slug": slug})

        log.info(f"  Letter {letter}: found {len([c for c in cases if True])} total so far")

    # Deduplicate by slug
    seen = set()
    deduped = []
    for c in cases:
        if c["slug"] not in seen:
            seen.add(c["slug"])
            deduped.append(c)
    log.info(f"Discovered {len(deduped)} unique cases")
    return deduped


# ── Phase 2: Parse a single case page ───────────────────────────────────────

def parse_date(text: str) -> Optional[str]:
    """Try to parse MM/DD/YYYY → YYYY-MM-DD, return None on failure."""
    if not text:
        return None
    text = text.strip()
    # Handle "09/16/1974 (51)" — strip parenthetical age
    text = re.sub(r"\s*\(.*?\)\s*$", "", text)
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%B %d, %Y", "%b %d, %Y"):
        try:
            return datetime.strptime(text, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def parse_height_weight(text: str) -> dict:
    """Extract height_inches and weight_lbs from '5\'8, 160 pounds'."""
    result = {}
    # Height: 5'8 or 5'8" or 5 feet 8 inches
    hm = re.search(r"(\d+)['\u2019]\s*(\d+)", text)
    if hm:
        result["height_inches"] = int(hm.group(1)) * 12 + int(hm.group(2))
    # Weight: 160 pounds / 160 lbs
    wm = re.search(r"(\d+)\s*(?:pounds?|lbs?)", text, re.I)
    if wm:
        result["weight_lbs"] = int(wm.group(1))
    return result


def extract_city_state(location_text: str) -> dict:
    """Parse 'Los Angeles, California' → {city, state}."""
    result = {}
    if not location_text:
        return result
    parts = [p.strip() for p in location_text.split(",")]
    if len(parts) >= 2:
        result["city"] = parts[0]
        result["state"] = parts[1]
    elif len(parts) == 1:
        result["state"] = parts[0]
    return result


def parse_case_page(html: str, url: str, slug: str) -> Optional[dict]:
    """
    Parse a Charley Project case page into a structured dict matching
    the database schema fields.
    """
    soup = BeautifulSoup(html, "lxml")

    # ── Title ────────────────────────────────────────────────────────────
    title_el = soup.select_one("h1")
    if not title_el:
        log.warning(f"No <h1> found on {url}, skipping")
        return None
    victim_name = title_el.get_text(strip=True)

    # ── Metadata fields (the <li> list under the photos) ─────────────────
    meta = {}
    # They appear as: <strong>Label</strong> Value  inside <li> tags
    for li in soup.select("li"):
        strong = li.find("strong")
        if not strong:
            continue
        label = strong.get_text(strip=True).rstrip(":").strip()
        # Value is the remaining text after the <strong>
        value = li.get_text(strip=True)
        # Remove the label portion from the value
        value = value[len(strong.get_text(strip=True)):].strip()
        if label and value:
            meta[label] = value

    # ── Details of Disappearance ─────────────────────────────────────────
    details_text = ""
    details_heading = soup.find(
        lambda tag: tag.name in ("h2", "h3") and
        "details of disappearance" in tag.get_text(strip=True).lower()
    )
    if details_heading:
        parts = []
        for sib in details_heading.find_next_siblings():
            if isinstance(sib, Tag) and sib.name in ("h2", "h3"):
                break
            parts.append(sib.get_text(strip=True))
        details_text = "\n".join(p for p in parts if p)

    # ── Investigating Agency ─────────────────────────────────────────────
    agency_text = ""
    agency_phone = ""
    agency_heading = soup.find(
        lambda tag: tag.name in ("h2", "h3") and
        "investigating agency" in tag.get_text(strip=True).lower()
    )
    if agency_heading:
        parts = []
        for sib in agency_heading.find_next_siblings():
            if isinstance(sib, Tag) and sib.name in ("h2", "h3"):
                break
            parts.append(sib.get_text(strip=True))
        agency_text = " ".join(p for p in parts if p)
        # Try to pull phone number
        phone_match = re.search(r"[\d\-()]{7,}", agency_text)
        if phone_match:
            agency_phone = phone_match.group(0)
            agency_text = agency_text.replace(phone_match.group(0), "").strip()

    # ── Source links ─────────────────────────────────────────────────────
    source_links = []
    source_heading = soup.find(
        lambda tag: tag.name in ("h2", "h3") and
        "source information" in tag.get_text(strip=True).lower()
    )
    if source_heading:
        for sib in source_heading.find_next_siblings():
            if isinstance(sib, Tag) and sib.name in ("h2", "h3"):
                break
            for a in (sib.find_all("a") if isinstance(sib, Tag) else []):
                href = a.get("href", "")
                name = a.get_text(strip=True)
                if href and name:
                    source_links.append({"title": name, "url": href})

    # ── Images ───────────────────────────────────────────────────────────
    image_urls = []
    for img in soup.select("img"):
        src = img.get("src", "")
        if "wp-content/uploads" in src and "charleyproject" in src:
            image_urls.append(urljoin(BASE_URL, src))

    # ── Update info ──────────────────────────────────────────────────────
    update_text = ""
    for p in soup.find_all("p"):
        t = p.get_text(strip=True)
        if t.startswith("Updated") and "since" in t:
            update_text = t
            break

    # ── Build structured output ──────────────────────────────────────────

    missing_since = parse_date(meta.get("Missing Since", ""))
    missing_from = meta.get("Missing From", "")
    location = extract_city_state(missing_from)
    dob = parse_date(meta.get("Date of Birth", ""))
    hw = parse_height_weight(meta.get("Height and Weight", ""))
    classification = meta.get("Classification", "")
    sex = meta.get("Sex", "")
    race = meta.get("Race", "")
    age_text = meta.get("Age", "")
    age_match = re.search(r"(\d+)", age_text)
    age_at_time = int(age_match.group(1)) if age_match else None

    # Determine case_status from classification
    status_map = {
        "endangered missing": "cold",
        "missing": "cold",
        "non-family abduction": "cold",
        "family abduction": "cold",
        "lost, injured, missing": "cold",
        "runaway": "cold",
        "found deceased": "closed_unsolved",
        "resolved": "closed_solved",
    }
    case_status = status_map.get(classification.lower().strip(), "cold")

    # Crime type heuristic from classification
    crime_type_map = {
        "endangered missing": "missing_person",
        "missing": "missing_person",
        "non-family abduction": "kidnapping",
        "family abduction": "family_abduction",
        "lost, injured, missing": "missing_person",
        "runaway": "runaway",
    }
    crime_type = crime_type_map.get(classification.lower().strip(), "missing_person")

    case_id = str(uuid.uuid5(uuid.NAMESPACE_URL, url))

    case_record = {
        "id": case_id,
        "title": f"Disappearance of {victim_name}",
        "slug": slug,
        "status": case_status,
        "date_occurred": missing_since,
        "location_city": location.get("city"),
        "location_state": location.get("state"),
        "location_country": "US",
        "primary_agency": agency_text or None,
        "summary": details_text[:5000] if details_text else f"Missing person case for {victim_name}.",
        "crime_type": crime_type,
        "crime_subtypes": [classification.lower()] if classification else [],
        "victim_name": victim_name,
        "victim_age_at_time": age_at_time,
        "victim_dob": dob,
    }

    # ── Entity (victim) ──────────────────────────────────────────────────
    entity_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{url}#victim"))
    entity_record = {
        "id": entity_id,
        "entity_type": "person",
        "canonical_name": victim_name,
        "aliases": [],
        "summary": meta.get("Distinguishing Characteristics", ""),
        "attributes": {
            "dob": dob,
            "sex": sex,
            "race": race,
            "height_inches": hw.get("height_inches"),
            "weight_lbs": hw.get("weight_lbs"),
            "clothing_last_seen": meta.get("Clothing/Jewelry Description", ""),
            "distinguishing_characteristics": meta.get("Distinguishing Characteristics", ""),
            "hair": None,
            "eyes": None,
            "medical_conditions": meta.get("Medical Conditions", ""),
        },
        "first_seen_date": dob,
        "last_seen_date": missing_since,
        "is_identified": True,
        "is_alive": None,  # unknown
    }

    # Try to extract hair/eye color from distinguishing characteristics or race line
    dc = meta.get("Distinguishing Characteristics", "")
    hair_match = re.search(r"(\w+)\s+hair", dc, re.I)
    eye_match = re.search(r"(\w+)\s+eyes", dc, re.I)
    if hair_match:
        entity_record["attributes"]["hair"] = hair_match.group(1)
    if eye_match:
        entity_record["attributes"]["eyes"] = eye_match.group(1)

    # ── Sources ──────────────────────────────────────────────────────────
    source_records = []
    # Charley Project itself as a source
    cp_source_id = str(uuid.uuid5(uuid.NAMESPACE_URL, url))
    source_records.append({
        "id": cp_source_id,
        "url": url,
        "url_archive": None,
        "domain": "charleyproject.org",
        "title": f"Charley Project - {victim_name}",
        "source_type": "website",
        "reliability_rating": 3,
        "cached_text": details_text[:10000] if details_text else None,
        "content_hash": hashlib.sha256((details_text or "").encode()).hexdigest(),
    })
    # External sources listed on the page
    for sl in source_links:
        sid = str(uuid.uuid5(uuid.NAMESPACE_URL, sl["url"]))
        domain = re.sub(r"^https?://(www\.)?", "", sl["url"]).split("/")[0]
        source_records.append({
            "id": sid,
            "url": sl["url"],
            "domain": domain,
            "title": sl["title"],
            "source_type": "website",
            "reliability_rating": None,
        })

    # ── Raw staging record ───────────────────────────────────────────────
    raw_html = ""  # We don't store the full HTML in JSON output; reference only
    raw_staging_record = {
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{url}#raw")),
        "source_url": url,
        "source_domain": "charleyproject.org",
        "content_type": "text/html",
        "content_hash": hashlib.sha256(url.encode()).hexdigest(),
        "scrape_status": "completed",
        "scraped_at": datetime.utcnow().isoformat() + "Z",
    }

    # ── Evidence (the case description as a document) ────────────────────
    evidence_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{url}#evidence"))
    evidence_record = {
        "id": evidence_id,
        "case_id": case_id,
        "evidence_code": "E001",
        "title": f"Charley Project casefile - {victim_name}",
        "summary": details_text[:2000] if details_text else "",
        "full_text": details_text,
        "category": "document",
        "confidence": "corroborated",
        "evidence_date": missing_since,
        "source_id": cp_source_id,
        "source_detail": "Charley Project case page",
        "ingestion_method": "web_scrape",
        "raw_source_id": raw_staging_record["id"],
        "tags": ["charley_project", "missing_person", crime_type],
    }

    # ── Entity-Evidence junction ─────────────────────────────────────────
    entity_evidence_record = {
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{url}#ee")),
        "entity_id": entity_id,
        "evidence_id": evidence_id,
        "role": "victim",
        "first_mentioned": True,
    }

    # ── Scrape job record ────────────────────────────────────────────────
    scrape_job_record = {
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{url}#job")),
        "target_url": url,
        "target_domain": "charleyproject.org",
        "target_type": "website",
        "case_id": case_id,
        "status": "completed",
        "started_at": datetime.utcnow().isoformat() + "Z",
        "completed_at": datetime.utcnow().isoformat() + "Z",
        "pages_scraped": 1,
        "raw_staging_id": raw_staging_record["id"],
        "is_recurring": True,
        "recurrence_interval": "30 days",
    }

    return {
        "case": case_record,
        "entity": entity_record,
        "sources": source_records,
        "evidence": evidence_record,
        "entity_evidence": entity_evidence_record,
        "raw_staging": raw_staging_record,
        "scrape_job": scrape_job_record,
        "meta": {
            "images": image_urls,
            "agency_phone": agency_phone,
            "classification": classification,
            "update_note": update_text,
        },
    }


# ── Phase 3: Orchestrate the full crawl ─────────────────────────────────────

def load_scraped_slugs(out_dir: Path) -> set[str]:
    """Load already-scraped slugs from the cases NDJSON file."""
    slugs = set()
    cases_file = out_dir / "cases.ndjson"
    if cases_file.exists():
        with open(cases_file) as f:
            for line in f:
                try:
                    rec = json.loads(line)
                    slugs.add(rec.get("slug", ""))
                except json.JSONDecodeError:
                    continue
    return slugs


def append_ndjson(path: Path, record: dict):
    """Append a single JSON record as one line."""
    with open(path, "a") as f:
        f.write(json.dumps(record, default=str) + "\n")


def run_crawl(letters: list[str], test_limit: int = 0, resume: bool = False):
    """Main crawl loop."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Output files
    files = {
        "cases": OUTPUT_DIR / "cases.ndjson",
        "entities": OUTPUT_DIR / "entities.ndjson",
        "sources": OUTPUT_DIR / "sources.ndjson",
        "evidence": OUTPUT_DIR / "evidence.ndjson",
        "entity_evidence": OUTPUT_DIR / "entity_evidence.ndjson",
        "raw_staging": OUTPUT_DIR / "raw_staging.ndjson",
        "scrape_jobs": OUTPUT_DIR / "scrape_jobs.ndjson",
        "meta": OUTPUT_DIR / "scrape_meta.ndjson",
    }

    # Resume support
    scraped_slugs = set()
    if resume:
        scraped_slugs = load_scraped_slugs(OUTPUT_DIR)
        log.info(f"Resume mode: {len(scraped_slugs)} cases already scraped")
    else:
        # Wipe output files for fresh run
        for f in files.values():
            f.unlink(missing_ok=True)

    # Phase 1: Discover
    log.info("=" * 60)
    log.info("PHASE 1: Discovering case URLs")
    log.info("=" * 60)
    all_cases = discover_case_urls(letters)

    if test_limit > 0:
        all_cases = all_cases[:test_limit]
        log.info(f"TEST MODE: limiting to {test_limit} cases")

    # Phase 2: Scrape each case
    log.info("=" * 60)
    log.info(f"PHASE 2: Scraping {len(all_cases)} case pages")
    log.info("=" * 60)

    success = 0
    failed = 0
    skipped = 0

    for i, case_info in enumerate(all_cases, 1):
        slug = case_info["slug"]
        url = case_info["url"]

        if slug in scraped_slugs:
            skipped += 1
            continue

        log.info(f"[{i}/{len(all_cases)}] Scraping: {case_info['name']} ({slug})")

        html = fetch(url)
        if not html:
            failed += 1
            continue

        try:
            parsed = parse_case_page(html, url, slug)
            if not parsed:
                failed += 1
                continue

            # Write to NDJSON files
            append_ndjson(files["cases"], parsed["case"])
            append_ndjson(files["entities"], parsed["entity"])
            for src in parsed["sources"]:
                append_ndjson(files["sources"], src)
            append_ndjson(files["evidence"], parsed["evidence"])
            append_ndjson(files["entity_evidence"], parsed["entity_evidence"])
            append_ndjson(files["raw_staging"], parsed["raw_staging"])
            append_ndjson(files["scrape_jobs"], parsed["scrape_job"])
            append_ndjson(files["meta"], {
                "slug": slug,
                "url": url,
                **parsed["meta"],
            })

            success += 1

        except Exception as e:
            log.error(f"Error parsing {url}: {e}", exc_info=True)
            failed += 1

        # Progress checkpoint every 100 cases
        if i % 100 == 0:
            log.info(f"  Progress: {success} ok / {failed} failed / {skipped} skipped")

    log.info("=" * 60)
    log.info(f"DONE: {success} scraped, {failed} failed, {skipped} skipped")
    log.info(f"Output in: {OUTPUT_DIR.resolve()}")
    log.info("=" * 60)

    # Write summary
    summary = {
        "completed_at": datetime.utcnow().isoformat() + "Z",
        "total_discovered": len(all_cases),
        "success": success,
        "failed": failed,
        "skipped": skipped,
        "letters": letters,
    }
    with open(OUTPUT_DIR / "crawl_summary.json", "w") as f:
        json.dump(summary, f, indent=2)


# ── SQL Loader Generator ────────────────────────────────────────────────────

def generate_sql_loader():
    """
    Generate a SQL script that uses COPY to bulk-load the NDJSON files
    via a temp-table approach (JSON → relational).
    """
    sql = r"""-- ============================================================================
-- Charley Project → Cold Case Platform SQL Loader
-- Generated by charley_scraper.py
-- 
-- Usage:  psql -d coldcase -f load_charley_data.sql
-- Prereq: NDJSON files in same directory (or adjust paths)
-- ============================================================================

BEGIN;

-- ── Helper: load NDJSON into a temp table ───────────────────────────────────

CREATE TEMP TABLE _raw_json (doc JSONB);

-- ── 1. CASES ────────────────────────────────────────────────────────────────

\copy _raw_json(doc) FROM 'output/cases.ndjson'

INSERT INTO cases (
    id, title, slug, status, date_occurred,
    location_city, location_state, location_country,
    primary_agency, summary, crime_type, crime_subtypes,
    victim_name, victim_age_at_time, victim_dob
)
SELECT
    (doc->>'id')::UUID,
    doc->>'title',
    doc->>'slug',
    (doc->>'status')::case_status,
    (doc->>'date_occurred')::DATE,
    doc->>'location_city',
    doc->>'location_state',
    COALESCE(doc->>'location_country', 'US'),
    doc->>'primary_agency',
    doc->>'summary',
    doc->>'crime_type',
    ARRAY(SELECT jsonb_array_elements_text(doc->'crime_subtypes')),
    doc->>'victim_name',
    (doc->>'victim_age_at_time')::INTEGER,
    (doc->>'victim_dob')::DATE
FROM _raw_json
ON CONFLICT (slug) DO UPDATE SET
    summary = EXCLUDED.summary,
    primary_agency = COALESCE(EXCLUDED.primary_agency, cases.primary_agency),
    updated_at = NOW();

TRUNCATE _raw_json;

-- ── 2. SOURCES ──────────────────────────────────────────────────────────────

\copy _raw_json(doc) FROM 'output/sources.ndjson'

INSERT INTO sources (
    id, url, domain, title, source_type, reliability_rating,
    cached_text, content_hash
)
SELECT
    (doc->>'id')::UUID,
    doc->>'url',
    doc->>'domain',
    doc->>'title',
    (COALESCE(doc->>'source_type', 'website'))::source_type,
    (doc->>'reliability_rating')::INTEGER,
    doc->>'cached_text',
    doc->>'content_hash'
FROM _raw_json
ON CONFLICT DO NOTHING;

TRUNCATE _raw_json;

-- ── 3. ENTITIES ─────────────────────────────────────────────────────────────

\copy _raw_json(doc) FROM 'output/entities.ndjson'

INSERT INTO entities (
    id, entity_type, canonical_name, aliases, summary,
    attributes, first_seen_date, last_seen_date,
    is_identified, is_alive
)
SELECT
    (doc->>'id')::UUID,
    (doc->>'entity_type')::entity_type,
    doc->>'canonical_name',
    ARRAY(SELECT jsonb_array_elements_text(doc->'aliases')),
    doc->>'summary',
    (doc->'attributes')::JSONB,
    (doc->>'first_seen_date')::DATE,
    (doc->>'last_seen_date')::DATE,
    (doc->>'is_identified')::BOOLEAN,
    (doc->>'is_alive')::BOOLEAN
FROM _raw_json
ON CONFLICT DO NOTHING;

TRUNCATE _raw_json;

-- ── 4. EVIDENCE ─────────────────────────────────────────────────────────────

\copy _raw_json(doc) FROM 'output/evidence.ndjson'

INSERT INTO evidence (
    id, case_id, evidence_code, title, summary, full_text,
    category, confidence, evidence_date,
    source_id, source_detail, ingestion_method,
    raw_source_id, tags
)
SELECT
    (doc->>'id')::UUID,
    (doc->>'case_id')::UUID,
    doc->>'evidence_code',
    doc->>'title',
    doc->>'summary',
    doc->>'full_text',
    (doc->>'category')::evidence_category,
    (doc->>'confidence')::confidence_level,
    (doc->>'evidence_date')::DATE,
    (doc->>'source_id')::UUID,
    doc->>'source_detail',
    (doc->>'ingestion_method')::ingestion_method,
    (doc->>'raw_source_id')::UUID,
    ARRAY(SELECT jsonb_array_elements_text(doc->'tags'))
FROM _raw_json
ON CONFLICT DO NOTHING;

TRUNCATE _raw_json;

-- ── 5. ENTITY_EVIDENCE ─────────────────────────────────────────────────────

\copy _raw_json(doc) FROM 'output/entity_evidence.ndjson'

INSERT INTO entity_evidence (
    id, entity_id, evidence_id, role, first_mentioned
)
SELECT
    (doc->>'id')::UUID,
    (doc->>'entity_id')::UUID,
    (doc->>'evidence_id')::UUID,
    (doc->>'role')::entity_role,
    (doc->>'first_mentioned')::BOOLEAN
FROM _raw_json
ON CONFLICT DO NOTHING;

TRUNCATE _raw_json;

-- ── 6. RAW_STAGING ──────────────────────────────────────────────────────────

\copy _raw_json(doc) FROM 'output/raw_staging.ndjson'

INSERT INTO raw_staging (
    id, source_url, source_domain, content_type,
    content_hash, scrape_status, scraped_at
)
SELECT
    (doc->>'id')::UUID,
    doc->>'source_url',
    doc->>'source_domain',
    doc->>'content_type',
    doc->>'content_hash',
    (doc->>'scrape_status')::scrape_status,
    (doc->>'scraped_at')::TIMESTAMPTZ
FROM _raw_json
ON CONFLICT DO NOTHING;

TRUNCATE _raw_json;

-- ── 7. SCRAPE_JOBS ──────────────────────────────────────────────────────────

\copy _raw_json(doc) FROM 'output/scrape_jobs.ndjson'

INSERT INTO scrape_jobs (
    id, target_url, target_domain, target_type, case_id,
    status, started_at, completed_at, pages_scraped,
    raw_staging_id, is_recurring, recurrence_interval
)
SELECT
    (doc->>'id')::UUID,
    doc->>'target_url',
    doc->>'target_domain',
    (doc->>'target_type')::source_type,
    (doc->>'case_id')::UUID,
    (doc->>'status')::scrape_status,
    (doc->>'started_at')::TIMESTAMPTZ,
    (doc->>'completed_at')::TIMESTAMPTZ,
    (doc->>'pages_scraped')::INTEGER,
    (doc->>'raw_staging_id')::UUID,
    (doc->>'is_recurring')::BOOLEAN,
    (doc->>'recurrence_interval')::INTERVAL
FROM _raw_json
ON CONFLICT DO NOTHING;

DROP TABLE _raw_json;

COMMIT;

-- Verify counts
SELECT 'cases' AS tbl, COUNT(*) FROM cases
UNION ALL SELECT 'entities', COUNT(*) FROM entities
UNION ALL SELECT 'sources', COUNT(*) FROM sources
UNION ALL SELECT 'evidence', COUNT(*) FROM evidence;
"""
    out_path = OUTPUT_DIR / "load_charley_data.sql"
    with open(out_path, "w") as f:
        f.write(sql)
    log.info(f"SQL loader written to {out_path}")


# ── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Charley Project Scraper")
    parser.add_argument("--letter", type=str, help="Scrape single letter (A-Z)")
    parser.add_argument("--test", type=int, default=0, help="Limit to N cases (test mode)")
    parser.add_argument("--resume", action="store_true", help="Skip already-scraped slugs")
    parser.add_argument("--sql-only", action="store_true", help="Only generate SQL loader")
    args = parser.parse_args()

    if args.sql_only:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        generate_sql_loader()
        return

    letters = [args.letter.upper()] if args.letter else LETTERS
    run_crawl(letters, test_limit=args.test, resume=args.resume)
    generate_sql_loader()


if __name__ == "__main__":
    main()
