#!/usr/bin/env python3
"""
Murder Accountability Project → Cold Case Platform Importer
=============================================================
Reads the MAP Supplementary Homicide Report (SHR) CSV and UCR clearance CSV,
filters to unsolved homicides, and produces NDJSON + SQL ready for the
Cold Case Investigation Platform database.

Data source: https://www.murderdata.org/p/data-docs.html

SHR CSV columns (32):
  ID, CNTYFIPS, Ori, State, Agency, Agentype, Source, Solved, Year,
  StateName, Month, Incident, ActionType, Homicide, Situation, VicAge,
  VicSex, VicRace, VicEthnic, OffAge, OffSex, OffRace, OffEthnic,
  Weapon, Relationship, Circumstance, Subcircum, VicCount, OffCount,
  FileDate, fstate, MSA

UCR CSV columns (8):
  ORI, Name, YEAR, MRD (murders), CLR (clearances), State, County, Agency

Usage:
  # 1. Download CSVs from murderdata.org/p/data-docs.html
  # 2. Place them in ./input/
  python map_importer.py                          # import all unsolved
  python map_importer.py --all                    # import solved + unsolved
  python map_importer.py --state Iowa             # filter by state
  python map_importer.py --year-min 1980          # filter by year range
  python map_importer.py --year-max 2010
  python map_importer.py --test 100               # first 100 unsolved only
"""

import argparse
import csv
import hashlib
import json
import logging
import os
import re
import sys
import uuid
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Optional

# ── Config ───────────────────────────────────────────────────────────────────

INPUT_DIR = Path("input")
OUTPUT_DIR = Path("output")
LOG_FILE = "map_importer.log"

SHR_FILENAME = "SHR76_24a.csv"      # MAP's SHR with FOIA records
UCR_FILENAME = "UCR65_24a.csv"       # UCR clearance summaries

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_FILE, mode="a"),
    ],
)
log = logging.getLogger("map_importer")

# ── Deterministic UUID from MAP ID ───────────────────────────────────────────

MAP_NAMESPACE = uuid.UUID("d4e8f1a2-3b5c-4d6e-8f9a-0b1c2d3e4f5a")


def map_uuid(seed: str) -> str:
    """Generate a deterministic UUID from a MAP record identifier."""
    return str(uuid.uuid5(MAP_NAMESPACE, seed))


# ── Value Mappings ───────────────────────────────────────────────────────────

MONTH_TO_NUM = {
    "January": 1, "February": 2, "March": 3, "April": 4,
    "May": 5, "June": 6, "July": 7, "August": 8,
    "September": 9, "October": 10, "November": 11, "December": 12,
}

# MAP State abbreviations → full names (SHR uses mixed formats)
# The 'State' column has full names; 'StateName' has abbreviations
# We normalize to full state names for our schema

WEAPON_TO_CATEGORY = {
    "Firearm, type not stated": "firearm",
    "Handgun - Loss of": "firearm",
    "Handgun - pistol, revolver, etc": "firearm",
    "Rifle": "firearm",
    "Shotgun": "firearm",
    "Other gun": "firearm",
    "Knife or cutting instrument": "edged_weapon",
    "Blunt object - Loss of": "blunt_object",
    "Blunt object - hammer, club, etc": "blunt_object",
    "Personal weapons, includes beating": "personal_weapons",
    "Pushed or thrown out window": "personal_weapons",
    "Poison - Loss of": "poison",
    "Poison - not including gas": "poison",
    "Explosives": "explosive",
    "Fire": "fire",
    "Narcotics or drugs": "narcotics",
    "Drowning": "drowning",
    "Strangulation - Loss of": "strangulation",
    "Strangulation - hanging": "strangulation",
    "Asphyxiation": "asphyxiation",
    "Other or type unknown": "unknown",
}

CIRCUMSTANCE_TO_CRIME_SUBTYPE = {
    "Argument over money or property": "argument",
    "Other arguments": "argument",
    "Brawl due to influence of alcohol": "argument",
    "Brawl due to influence of narcotics": "argument",
    "Lovers triangle": "domestic",
    "Child killed by babysitter": "child_abuse",
    "Child killed by acquaintance": "child_abuse",
    "Gangland killings": "gang_related",
    "Juvenile gang killings": "gang_related",
    "Institutional killings": "institutional",
    "Sniper attack": "mass_violence",
    "Rape": "sexual_assault",
    "Robbery": "robbery",
    "Burglary": "burglary",
    "Larceny": "larceny",
    "Motor vehicle theft": "vehicle_theft",
    "Arson": "arson",
    "Prostitution and commercialized vice": "prostitution_related",
    "Narcotic drug laws": "drug_related",
    "Gambling": "gambling_related",
    "Other sex offenses": "sexual_assault",
    "Other - Loss of": "other",
    "Other felony type - Loss of": "other_felony",
    "Felon killed by private citizen": "justified",
    "Felon killed by police": "justified_police",
    "Undetermined": "undetermined",
    "Circumstances undetermined": "undetermined",
    "All other manslaughter by negligence": "manslaughter_negligence",
    "Other negligent handling of gun which resulted in death of another": "manslaughter_negligence",
}

RACE_NORMALIZE = {
    "White": "White",
    "Black": "Black",
    "American Indian or Alaskan Native": "Native American",
    "Asian or Pacific Islander": "Asian/Pacific Islander",
    "Unknown": "Unknown",
}


# ── Helper Functions ─────────────────────────────────────────────────────────

def safe_int(val: str) -> Optional[int]:
    """Parse an integer, returning None for blanks/unknowns."""
    if not val or val.strip() in ("", "Unknown", "998", "999"):
        return None
    try:
        v = int(val)
        return v if 0 <= v < 998 else None
    except (ValueError, TypeError):
        return None


def build_date(year: int, month_str: str) -> Optional[str]:
    """Build a YYYY-MM-15 date (mid-month estimate since SHR has no day)."""
    month_num = MONTH_TO_NUM.get(month_str)
    if not month_num:
        return None
    return f"{year:04d}-{month_num:02d}-15"


def build_slug(row: dict) -> str:
    """Build a URL-friendly slug from a SHR record."""
    parts = [
        str(row.get("Year", "")),
        row.get("Month", "")[:3].lower(),
        row.get("State", "").lower().replace(" ", "-"),
        row.get("Agency", "").lower().replace(" ", "-")[:30],
        row.get("ID", "")[-6:],
    ]
    slug = "-".join(p for p in parts if p)
    slug = re.sub(r"[^a-z0-9\-]", "", slug)
    return f"shr-{slug}"


def build_title(row: dict) -> str:
    """Build a human-readable case title."""
    vic_sex = row.get("VicSex", "Person")
    vic_race = row.get("VicRace", "")
    vic_age = safe_int(row.get("VicAge", ""))
    weapon = row.get("Weapon", "")
    city = row.get("Agency", "Unknown Location")
    state = row.get("State", "")
    year = row.get("Year", "")

    age_str = f", age {vic_age}" if vic_age else ""
    return f"Unsolved Homicide of {vic_race} {vic_sex}{age_str} — {city}, {state} ({year})"


# ── Core Record Builders ────────────────────────────────────────────────────

def build_case(row: dict) -> dict:
    """Map a SHR row → cases table record."""
    map_id = row["ID"]
    case_id = map_uuid(f"case:{map_id}")
    year = int(row.get("Year", 0))
    solved = row.get("Solved", "").strip()
    is_unsolved = solved.lower() == "no"

    # Parse location from CNTYFIPS ("Jefferson, AL") and Agency
    county_fips = row.get("CNTYFIPS", "")
    county = ""
    state_abbr = ""
    if "," in county_fips:
        parts = county_fips.rsplit(",", 1)
        county = parts[0].strip()
        state_abbr = parts[1].strip()

    # Determine status
    if is_unsolved:
        status = "cold"
    else:
        status = "closed_solved"

    # Crime subtypes from circumstance
    circumstance = row.get("Circumstance", "")
    subtypes = []
    mapped_sub = CIRCUMSTANCE_TO_CRIME_SUBTYPE.get(circumstance)
    if mapped_sub:
        subtypes.append(mapped_sub)
    weapon = row.get("Weapon", "")
    weapon_cat = WEAPON_TO_CATEGORY.get(weapon, "unknown")
    if weapon_cat not in subtypes:
        subtypes.append(weapon_cat)

    vic_age = safe_int(row.get("VicAge", ""))

    return {
        "id": case_id,
        "title": build_title(row),
        "slug": build_slug(row),
        "status": status,
        "date_occurred": build_date(year, row.get("Month", "")),
        "location_city": row.get("Agency", ""),
        "location_state": row.get("State", ""),
        "location_country": "US",
        "primary_agency": row.get("Agency", ""),
        "jurisdiction": f"{county}, {row.get('State', '')}".strip(", "),
        "summary": (
            f"Homicide reported by {row.get('Agency', 'Unknown')} ({row.get('Agentype', '')}) "
            f"in {row.get('Month', '')} {year}. "
            f"Victim: {row.get('VicRace', 'Unknown')} {row.get('VicSex', 'Unknown')}"
            f"{f', age {vic_age}' if vic_age else ''}. "
            f"Weapon: {weapon}. "
            f"Circumstance: {circumstance}. "
            f"Situation: {row.get('Situation', '')}. "
            f"{'UNSOLVED' if is_unsolved else 'Solved'}."
        ),
        "crime_type": "homicide",
        "crime_subtypes": subtypes,
        "victim_name": None,  # SHR does not include victim names
        "victim_age_at_time": vic_age,
        "victim_dob": None,
        # Extended metadata
        "metadata": {
            "map_id": map_id,
            "ori": row.get("Ori", ""),
            "msa": row.get("MSA", ""),
            "county_fips": county_fips,
            "data_source": row.get("Source", "FBI"),
            "weapon": weapon,
            "weapon_category": weapon_cat,
            "circumstance": circumstance,
            "subcircumstance": row.get("Subcircum", ""),
            "situation": row.get("Situation", ""),
            "homicide_type": row.get("Homicide", ""),
            "relationship": row.get("Relationship", ""),
            "vic_count": safe_int(row.get("VicCount", "")),
            "off_count": safe_int(row.get("OffCount", "")),
            "offender_age": safe_int(row.get("OffAge", "")),
            "offender_sex": row.get("OffSex", ""),
            "offender_race": row.get("OffRace", ""),
            "offender_ethnicity": row.get("OffEthnic", ""),
        },
    }


def build_victim_entity(row: dict) -> dict:
    """Map a SHR row → entities table record for the victim."""
    map_id = row["ID"]
    entity_id = map_uuid(f"victim:{map_id}")
    vic_age = safe_int(row.get("VicAge", ""))
    year = int(row.get("Year", 0))

    race = RACE_NORMALIZE.get(row.get("VicRace", ""), row.get("VicRace", "Unknown"))
    sex = row.get("VicSex", "Unknown")

    # Build a descriptive canonical name since SHR has no victim names
    age_str = f" age {vic_age}" if vic_age else ""
    canonical = f"Unknown {race} {sex}{age_str} — {row.get('Agency', '')}, {row.get('State', '')} ({year})"

    return {
        "id": entity_id,
        "entity_type": "person",
        "canonical_name": canonical,
        "aliases": [],
        "summary": (
            f"Unidentified homicide victim. {race} {sex}{f', {vic_age} years old' if vic_age else ''}. "
            f"Killed in {row.get('Agency', '')}, {row.get('State', '')} in {row.get('Month', '')} {year}."
        ),
        "attributes": {
            "sex": sex,
            "race": race,
            "ethnicity": row.get("VicEthnic", ""),
            "age_at_death": vic_age,
            "year_of_death": year,
        },
        "first_seen_date": None,
        "last_seen_date": build_date(year, row.get("Month", "")),
        "is_identified": False,  # SHR doesn't give names
        "is_alive": False,       # homicide victim
    }


def build_offender_entity(row: dict) -> Optional[dict]:
    """If offender info exists (even partial), build an entity. Returns None if no info."""
    off_age = safe_int(row.get("OffAge", ""))
    off_sex = row.get("OffSex", "").strip()
    off_race = row.get("OffRace", "").strip()

    # Skip if all offender fields are unknown/empty
    if (off_age is None and
        off_sex in ("", "Unknown") and
        off_race in ("", "Unknown")):
        return None

    map_id = row["ID"]
    entity_id = map_uuid(f"offender:{map_id}")
    year = int(row.get("Year", 0))
    race = RACE_NORMALIZE.get(off_race, off_race) if off_race else "Unknown"

    age_str = f" age {off_age}" if off_age else ""
    canonical = f"Unknown Suspect — {race} {off_sex}{age_str}"

    return {
        "id": entity_id,
        "entity_type": "person",
        "canonical_name": canonical,
        "aliases": [],
        "summary": f"Unidentified suspect in {row.get('Agency', '')}, {row.get('State', '')} ({year}) homicide.",
        "attributes": {
            "sex": off_sex,
            "race": race,
            "ethnicity": row.get("OffEthnic", ""),
            "age_at_time": off_age,
        },
        "is_identified": False,
        "is_alive": None,
    }


def build_source(row: dict) -> dict:
    """Build a source record for the MAP/FBI data."""
    map_id = row["ID"]
    source_id = map_uuid(f"source:{map_id}")
    data_source = row.get("Source", "FBI")

    return {
        "id": source_id,
        "url": "https://www.murderdata.org/p/data-docs.html",
        "domain": "murderdata.org",
        "title": f"MAP Supplementary Homicide Report — Record {map_id}",
        "source_type": "public_record",
        "reliability_rating": 5,  # Official FBI data
        "content_hash": hashlib.sha256(map_id.encode()).hexdigest(),
    }


def build_evidence(row: dict, case_id: str, source_id: str) -> dict:
    """Build an evidence record from the SHR data."""
    map_id = row["ID"]
    evidence_id = map_uuid(f"evidence:{map_id}")
    year = int(row.get("Year", 0))
    vic_age = safe_int(row.get("VicAge", ""))

    return {
        "id": evidence_id,
        "case_id": case_id,
        "evidence_code": "E001",
        "title": f"FBI Supplementary Homicide Report — {row.get('Agency', '')}, {row.get('State', '')} ({year})",
        "summary": (
            f"Official FBI/MAP homicide record. "
            f"Victim: {row.get('VicRace', '')} {row.get('VicSex', '')}"
            f"{f', age {vic_age}' if vic_age else ''}. "
            f"Weapon: {row.get('Weapon', '')}. "
            f"Circumstance: {row.get('Circumstance', '')}."
        ),
        "category": "public_record",
        "confidence": "verified",
        "evidence_date": build_date(year, row.get("Month", "")),
        "source_id": source_id,
        "source_detail": f"MAP SHR record {map_id}",
        "ingestion_method": "bulk_import",
        "tags": ["map", "shr", "fbi", "homicide", row.get("Source", "FBI").lower()],
        "metadata": {
            "map_id": map_id,
            "weapon": row.get("Weapon", ""),
            "circumstance": row.get("Circumstance", ""),
            "relationship": row.get("Relationship", ""),
        },
    }


def build_entity_evidence(entity_id: str, evidence_id: str, role: str, map_id: str) -> dict:
    """Build an entity_evidence junction record."""
    return {
        "id": map_uuid(f"ee:{entity_id}:{evidence_id}"),
        "entity_id": entity_id,
        "evidence_id": evidence_id,
        "role": role,
        "first_mentioned": True,
    }


# ── UCR Clearance Rate Processor ────────────────────────────────────────────

def process_ucr(ucr_path: Path) -> dict:
    """
    Process the UCR clearance rate CSV into a lookup table.
    Returns: {ori: {year: {murders: N, clearances: N, rate: float}}}
    """
    log.info(f"Processing UCR clearance data: {ucr_path}")
    lookup = defaultdict(dict)
    count = 0

    with open(ucr_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ori = row.get("ORI", "").strip()
            year = row.get("YEAR", "").strip()
            murders = row.get("MRD", "0").strip()
            clearances = row.get("CLR", "0").strip()

            if not ori or not year:
                continue

            try:
                yr = int(year)
                mrd = int(murders) if murders else 0
                clr = int(clearances) if clearances else 0
                rate = (clr / mrd * 100) if mrd > 0 else None
                lookup[ori][yr] = {
                    "murders": mrd,
                    "clearances": clr,
                    "clearance_rate": round(rate, 1) if rate else None,
                    "agency": row.get("Agency", row.get("Name", "")),
                    "state": row.get("State", ""),
                    "county": row.get("County", ""),
                }
                count += 1
            except (ValueError, TypeError):
                continue

    log.info(f"  Loaded {count} UCR agency-year records across {len(lookup)} agencies")
    return lookup


# ── File Output Helpers ──────────────────────────────────────────────────────

class NdjsonWriter:
    """Manages multiple NDJSON output files."""

    def __init__(self, output_dir: Path):
        self.output_dir = output_dir
        output_dir.mkdir(parents=True, exist_ok=True)
        self._files = {}
        self._counts = Counter()

    def write(self, table: str, record: dict):
        if table not in self._files:
            path = self.output_dir / f"map_{table}.ndjson"
            self._files[table] = open(path, "w")
        self._files[table].write(json.dumps(record, default=str) + "\n")
        self._counts[table] += 1

    def close(self):
        for f in self._files.values():
            f.close()

    def summary(self) -> dict:
        return dict(self._counts)


# ── Main Import Logic ────────────────────────────────────────────────────────

def run_import(
    shr_path: Path,
    ucr_path: Optional[Path],
    unsolved_only: bool = True,
    state_filter: Optional[str] = None,
    year_min: Optional[int] = None,
    year_max: Optional[int] = None,
    test_limit: int = 0,
):
    """Main import: read SHR CSV → produce NDJSON for all schema tables."""

    # Load UCR clearance lookup if available
    ucr_lookup = {}
    if ucr_path and ucr_path.exists():
        ucr_lookup = process_ucr(ucr_path)

    # Open SHR
    log.info(f"Reading SHR data: {shr_path}")
    writer = NdjsonWriter(OUTPUT_DIR)

    total = 0
    imported = 0
    skipped_solved = 0
    skipped_filter = 0
    errors = 0

    with open(shr_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)

        # Validate columns
        expected = {"ID", "Solved", "Year", "State", "Agency", "VicAge", "VicSex", "VicRace", "Weapon"}
        if not expected.issubset(set(reader.fieldnames or [])):
            missing = expected - set(reader.fieldnames or [])
            log.error(f"CSV missing expected columns: {missing}")
            log.error(f"Found columns: {reader.fieldnames}")
            sys.exit(1)

        log.info(f"CSV columns: {reader.fieldnames}")

        for row in reader:
            total += 1

            # ── Filters ──────────────────────────────────────────────
            solved = row.get("Solved", "").strip()
            if unsolved_only and solved.lower() != "no":
                skipped_solved += 1
                continue

            year_str = row.get("Year", "")
            try:
                year = int(year_str)
            except (ValueError, TypeError):
                errors += 1
                continue

            if year_min and year < year_min:
                skipped_filter += 1
                continue
            if year_max and year > year_max:
                skipped_filter += 1
                continue

            state = row.get("State", "").strip()
            if state_filter and state.lower() != state_filter.lower():
                skipped_filter += 1
                continue

            if test_limit and imported >= test_limit:
                break

            # ── Build records ────────────────────────────────────────
            try:
                case_rec = build_case(row)
                victim_rec = build_victim_entity(row)
                source_rec = build_source(row)
                evidence_rec = build_evidence(row, case_rec["id"], source_rec["id"])
                ee_victim = build_entity_evidence(victim_rec["id"], evidence_rec["id"], "victim", row["ID"])

                # Enrich case with UCR clearance data if available
                ori = row.get("Ori", "")
                if ori in ucr_lookup and year in ucr_lookup[ori]:
                    ucr_info = ucr_lookup[ori][year]
                    case_rec["metadata"]["agency_murders_that_year"] = ucr_info["murders"]
                    case_rec["metadata"]["agency_clearance_rate"] = ucr_info["clearance_rate"]

                # Write case, victim entity, source, evidence, junction
                writer.write("cases", case_rec)
                writer.write("entities", victim_rec)
                writer.write("sources", source_rec)
                writer.write("evidence", evidence_rec)
                writer.write("entity_evidence", ee_victim)

                # Offender entity (if any info available)
                offender_rec = build_offender_entity(row)
                if offender_rec:
                    writer.write("entities", offender_rec)
                    ee_offender = build_entity_evidence(
                        offender_rec["id"], evidence_rec["id"],
                        "suspect" if solved.lower() == "no" else "suspect",
                        row["ID"],
                    )
                    writer.write("entity_evidence", ee_offender)

                    # Connection between victim and offender
                    relationship = row.get("Relationship", "")
                    if relationship and relationship not in ("Unknown", "Relationship not determined"):
                        conn_rec = {
                            "id": map_uuid(f"conn:{row['ID']}"),
                            "entity_a_id": victim_rec["id"],
                            "entity_b_id": offender_rec["id"],
                            "relationship": "knows",  # closest enum match
                            "confidence": "unverified",
                            "description": f"Victim-offender relationship: {relationship}",
                            "metadata": {"shr_relationship": relationship},
                        }
                        writer.write("connections", conn_rec)

                imported += 1

                if imported % 25000 == 0:
                    log.info(f"  Progress: {imported:,} imported / {total:,} processed")

            except Exception as e:
                errors += 1
                if errors <= 10:
                    log.warning(f"Error on row {total}: {e}")
                continue

    writer.close()

    # ── Summary ──────────────────────────────────────────────────────────
    summary = {
        "completed_at": datetime.utcnow().isoformat() + "Z",
        "shr_file": str(shr_path),
        "total_rows": total,
        "imported": imported,
        "skipped_solved": skipped_solved,
        "skipped_filter": skipped_filter,
        "errors": errors,
        "filters": {
            "unsolved_only": unsolved_only,
            "state": state_filter,
            "year_min": year_min,
            "year_max": year_max,
        },
        "output_counts": writer.summary(),
    }

    with open(OUTPUT_DIR / "map_import_summary.json", "w") as f:
        json.dump(summary, f, indent=2)

    log.info("=" * 60)
    log.info(f"IMPORT COMPLETE")
    log.info(f"  Total SHR rows:      {total:,}")
    log.info(f"  Imported:            {imported:,}")
    log.info(f"  Skipped (solved):    {skipped_solved:,}")
    log.info(f"  Skipped (filtered):  {skipped_filter:,}")
    log.info(f"  Errors:              {errors:,}")
    log.info(f"  Output counts:       {writer.summary()}")
    log.info(f"  Output dir:          {OUTPUT_DIR.resolve()}")
    log.info("=" * 60)

    return summary


# ── SQL Loader Generator ────────────────────────────────────────────────────

def generate_sql_loader():
    """Generate SQL bulk loader for MAP data."""
    sql = r"""-- ============================================================================
-- MAP SHR Data → Cold Case Platform SQL Loader
-- Generated by map_importer.py
--
-- Usage:  psql -d coldcase -f load_map_data.sql
-- Prereq: NDJSON files in same directory
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _raw_json (doc JSONB);

-- ── 1. CASES ────────────────────────────────────────────────────────────────

\copy _raw_json(doc) FROM 'output/map_cases.ndjson'

INSERT INTO cases (
    id, title, slug, status, date_occurred,
    location_city, location_state, location_country,
    primary_agency, jurisdiction, summary,
    crime_type, crime_subtypes,
    victim_name, victim_age_at_time
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
    doc->>'jurisdiction',
    doc->>'summary',
    doc->>'crime_type',
    ARRAY(SELECT jsonb_array_elements_text(doc->'crime_subtypes')),
    doc->>'victim_name',
    (doc->>'victim_age_at_time')::INTEGER
FROM _raw_json
ON CONFLICT (slug) DO NOTHING;

TRUNCATE _raw_json;

-- ── 2. SOURCES ──────────────────────────────────────────────────────────────

\copy _raw_json(doc) FROM 'output/map_sources.ndjson'

INSERT INTO sources (
    id, url, domain, title, source_type,
    reliability_rating, content_hash
)
SELECT
    (doc->>'id')::UUID,
    doc->>'url',
    doc->>'domain',
    doc->>'title',
    (doc->>'source_type')::source_type,
    (doc->>'reliability_rating')::INTEGER,
    doc->>'content_hash'
FROM _raw_json
ON CONFLICT DO NOTHING;

TRUNCATE _raw_json;

-- ── 3. ENTITIES ─────────────────────────────────────────────────────────────

\copy _raw_json(doc) FROM 'output/map_entities.ndjson'

INSERT INTO entities (
    id, entity_type, canonical_name, aliases, summary,
    attributes, first_seen_date, last_seen_date,
    is_identified, is_alive
)
SELECT
    (doc->>'id')::UUID,
    (doc->>'entity_type')::entity_type,
    doc->>'canonical_name',
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(doc->'aliases')), '{}'),
    doc->>'summary',
    COALESCE((doc->'attributes')::JSONB, '{}'::JSONB),
    (doc->>'first_seen_date')::DATE,
    (doc->>'last_seen_date')::DATE,
    (doc->>'is_identified')::BOOLEAN,
    (doc->>'is_alive')::BOOLEAN
FROM _raw_json
ON CONFLICT DO NOTHING;

TRUNCATE _raw_json;

-- ── 4. EVIDENCE ─────────────────────────────────────────────────────────────

\copy _raw_json(doc) FROM 'output/map_evidence.ndjson'

INSERT INTO evidence (
    id, case_id, evidence_code, title, summary,
    category, confidence, evidence_date,
    source_id, source_detail, ingestion_method, tags, metadata
)
SELECT
    (doc->>'id')::UUID,
    (doc->>'case_id')::UUID,
    doc->>'evidence_code',
    doc->>'title',
    doc->>'summary',
    (doc->>'category')::evidence_category,
    (doc->>'confidence')::confidence_level,
    (doc->>'evidence_date')::DATE,
    (doc->>'source_id')::UUID,
    doc->>'source_detail',
    (doc->>'ingestion_method')::ingestion_method,
    ARRAY(SELECT jsonb_array_elements_text(doc->'tags')),
    COALESCE((doc->'metadata')::JSONB, '{}'::JSONB)
FROM _raw_json
ON CONFLICT DO NOTHING;

TRUNCATE _raw_json;

-- ── 5. ENTITY_EVIDENCE ─────────────────────────────────────────────────────

\copy _raw_json(doc) FROM 'output/map_entity_evidence.ndjson'

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

-- ── 6. CONNECTIONS (victim-offender relationships) ──────────────────────────

\copy _raw_json(doc) FROM 'output/map_connections.ndjson'

INSERT INTO connections (
    id, entity_a_id, entity_b_id, relationship,
    confidence, description
)
SELECT
    (doc->>'id')::UUID,
    (doc->>'entity_a_id')::UUID,
    (doc->>'entity_b_id')::UUID,
    (doc->>'relationship')::relationship_type,
    (doc->>'confidence')::confidence_level,
    doc->>'description'
FROM _raw_json
ON CONFLICT DO NOTHING;

DROP TABLE _raw_json;

COMMIT;

-- Verify counts
SELECT 'cases' AS tbl, COUNT(*) FROM cases WHERE crime_type = 'homicide'
UNION ALL SELECT 'entities', COUNT(*) FROM entities
UNION ALL SELECT 'sources', COUNT(*) FROM sources WHERE domain = 'murderdata.org'
UNION ALL SELECT 'evidence', COUNT(*) FROM evidence WHERE 'map' = ANY(tags);
"""

    out_path = OUTPUT_DIR / "load_map_data.sql"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        f.write(sql)
    log.info(f"SQL loader written to {out_path}")


# ── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Import Murder Accountability Project SHR data into Cold Case Platform"
    )
    parser.add_argument("--shr", type=str, default=str(INPUT_DIR / SHR_FILENAME),
                        help=f"Path to SHR CSV (default: {INPUT_DIR / SHR_FILENAME})")
    parser.add_argument("--ucr", type=str, default=str(INPUT_DIR / UCR_FILENAME),
                        help=f"Path to UCR CSV (default: {INPUT_DIR / UCR_FILENAME})")
    parser.add_argument("--all", action="store_true",
                        help="Import all records (not just unsolved)")
    parser.add_argument("--state", type=str, default=None,
                        help="Filter to a single state (e.g., 'Iowa')")
    parser.add_argument("--year-min", type=int, default=None,
                        help="Minimum year filter")
    parser.add_argument("--year-max", type=int, default=None,
                        help="Maximum year filter")
    parser.add_argument("--test", type=int, default=0,
                        help="Import only N records (test mode)")
    parser.add_argument("--sql-only", action="store_true",
                        help="Only generate SQL loader script")
    args = parser.parse_args()

    if args.sql_only:
        generate_sql_loader()
        return

    shr_path = Path(args.shr)
    ucr_path = Path(args.ucr)

    if not shr_path.exists():
        log.error(f"SHR file not found: {shr_path}")
        log.error(f"Download from: https://www.murderdata.org/p/data-docs.html")
        log.error(f"Place in: {INPUT_DIR.resolve()}/")
        sys.exit(1)

    run_import(
        shr_path=shr_path,
        ucr_path=ucr_path if ucr_path.exists() else None,
        unsolved_only=not args.all,
        state_filter=args.state,
        year_min=args.year_min,
        year_max=args.year_max,
        test_limit=args.test,
    )

    generate_sql_loader()


if __name__ == "__main__":
    main()
