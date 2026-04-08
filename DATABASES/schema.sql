-- ============================================================================
-- COLD CASE INVESTIGATION PLATFORM — DATABASE SCHEMA
-- PostgreSQL 15+
-- ============================================================================
-- 
-- ARCHITECTURE OVERVIEW:
-- This schema covers the relational layer (PostgreSQL). It works alongside:
--   • Neo4j graph database (entities + connections replicated there for traversal)
--   • S3 object storage (files referenced by key)
--   • Elasticsearch index (full-text search across all text fields)
--
-- PIPELINE: Raw Staging → Processing → Production (this schema)
--
-- ============================================================================


-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";         -- Fuzzy text matching
CREATE EXTENSION IF NOT EXISTS "btree_gist";      -- Range type indexing


-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE case_status AS ENUM (
    'open',
    'cold',
    'closed_solved',
    'closed_unsolved',
    'reopened'
);

CREATE TYPE evidence_category AS ENUM (
    'witness_account',
    'police_report',
    'court_record',
    'forensic_report',
    'photograph',
    'video',
    'audio',
    'physical_evidence',
    'document',
    'media_coverage',
    'tip',
    'claim_unverified',
    'public_record',
    'correspondence',
    'legislative',
    'other'
);

CREATE TYPE confidence_level AS ENUM (
    'verified',          -- confirmed by multiple independent sources or official record
    'corroborated',      -- supported by at least one independent source
    'unverified',        -- single source, not independently confirmed
    'disputed',          -- actively contradicted by other evidence
    'retracted',         -- source has withdrawn the claim
    'unknown'            -- confidence cannot be assessed
);

CREATE TYPE entity_type AS ENUM (
    'person',
    'vehicle',
    'location',
    'phone_number',
    'organization',
    'object',
    'alias_identity',
    'online_account'
);

CREATE TYPE entity_role AS ENUM (
    'victim',
    'suspect',
    'person_of_interest',
    'witness',
    'family_member',
    'investigator',
    'informant',
    'mentioned',
    'owner',
    'driver',
    'occupant',
    'employer',
    'associate',
    'other'
);

CREATE TYPE relationship_type AS ENUM (
    'knows',
    'related_to',
    'lives_at',
    'lived_at',
    'works_at',
    'worked_at',
    'owns',
    'owned',
    'drove',
    'seen_with',
    'seen_at',
    'called',
    'employed_by',
    'arrested_by',
    'investigated_by',
    'same_person_as',
    'possibly_same_as',
    'communicated_with',
    'traveled_to',
    'member_of',
    'reported_by',
    'other'
);

CREATE TYPE source_type AS ENUM (
    'police_report',
    'court_filing',
    'foia_release',
    'news_article',
    'news_broadcast',
    'documentary',
    'book',
    'podcast',
    'congressional_testimony',
    'sworn_affidavit',
    'public_record',
    'academic_paper',
    'website',
    'social_media',
    'user_upload',
    'interview_transcript',
    'other'
);

CREATE TYPE ingestion_method AS ENUM (
    'manual_entry',
    'web_scrape',
    'foia_import',
    'user_contribution',
    'bulk_import',
    'api_feed',
    'ocr_extraction'
);

CREATE TYPE question_status AS ENUM (
    'open',
    'assigned',
    'in_progress',
    'answered',
    'verified',
    'closed_unanswerable'
);

CREATE TYPE question_priority AS ENUM (
    'critical',     -- could directly lead to case resolution
    'high',         -- significant investigative value
    'medium',       -- useful but not urgent
    'low'           -- background / completeness
);

CREATE TYPE skill_type AS ENUM (
    'geolocation',
    'vehicle_identification',
    'facial_comparison',
    'local_knowledge',
    'document_analysis',
    'osint',
    'forensic_accounting',
    'language_translation',
    'handwriting_analysis',
    'audio_analysis',
    'medical_knowledge',
    'legal_knowledge',
    'law_enforcement',
    'digital_forensics',
    'genealogy',
    'general'
);

CREATE TYPE contribution_status AS ENUM (
    'pending_review',
    'accepted',
    'rejected',
    'merged',
    'superseded'
);

CREATE TYPE scrape_status AS ENUM (
    'queued',
    'in_progress',
    'completed',
    'failed',
    'needs_reprocessing'
);


-- ============================================================================
-- 1. CASES
-- ============================================================================

CREATE TABLE cases (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Identity
    title               TEXT NOT NULL,                          -- "Disappearance of Johnny Gosch"
    slug                TEXT UNIQUE NOT NULL,                   -- "johnny-gosch" (URL-friendly)
    case_number         TEXT,                                   -- official case number if known
    
    -- Status
    status              case_status NOT NULL DEFAULT 'cold',
    
    -- When & where
    date_occurred       DATE,
    date_reported       DATE,
    date_closed         DATE,                                   -- if applicable
    
    location_address    TEXT,
    location_city       TEXT,
    location_state      TEXT,
    location_country    TEXT DEFAULT 'US',
    location_lat        DECIMAL(10, 7),
    location_lng        DECIMAL(10, 7),
    
    -- Jurisdiction
    primary_agency      TEXT,                                   -- "West Des Moines Police Department"
    jurisdiction        TEXT,                                   -- "Polk County, Iowa"
    fbi_involved        BOOLEAN DEFAULT FALSE,
    
    -- Description
    summary             TEXT NOT NULL,
    failure_modes       TEXT[],                                 -- why it went cold: array of reasons
    
    -- Crime classification
    crime_type          TEXT,                                   -- "kidnapping", "homicide", etc.
    crime_subtypes      TEXT[],                                 -- ["child_abduction", "stranger_kidnapping"]
    
    -- Victim info (denormalized for quick access; full entity exists too)
    victim_name         TEXT,
    victim_age_at_time  INTEGER,
    victim_dob          DATE,
    
    -- Platform metadata
    evidence_count      INTEGER DEFAULT 0,                      -- denormalized counter
    open_questions      INTEGER DEFAULT 0,                      -- denormalized counter
    contributor_count   INTEGER DEFAULT 0,                      -- denormalized counter
    last_activity_at    TIMESTAMPTZ,
    featured            BOOLEAN DEFAULT FALSE,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cases_status ON cases (status);
CREATE INDEX idx_cases_location ON cases (location_state, location_city);
CREATE INDEX idx_cases_date ON cases (date_occurred);
CREATE INDEX idx_cases_slug ON cases (slug);
CREATE INDEX idx_cases_crime_type ON cases (crime_type);


-- ============================================================================
-- 2. SOURCES — Where evidence comes from
-- ============================================================================

CREATE TABLE sources (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Identity
    url                 TEXT,                                    -- original URL (may go dead)
    url_archive         TEXT,                                    -- Internet Archive / cached URL
    domain              TEXT,                                    -- "cnn.com", "iowacoldcases.org"
    title               TEXT NOT NULL,                           -- "An Iowa paperboy disappeared 41 years ago"
    author              TEXT,
    publication         TEXT,                                    -- "CNN", "Des Moines Register"
    published_date      DATE,
    
    -- Classification
    source_type         source_type NOT NULL,
    reliability_rating  INTEGER CHECK (reliability_rating BETWEEN 1 AND 5),  -- 5 = official record, 1 = unverified blog
    
    -- Health
    is_alive            BOOLEAN DEFAULT TRUE,                   -- link still works
    last_checked        TIMESTAMPTZ,
    
    -- Cached content (so we survive link rot)
    cached_text         TEXT,                                    -- extracted text snapshot
    cached_thumbnail    TEXT,                                    -- S3 key for thumbnail/preview
    content_hash        TEXT,                                    -- SHA256 for dedup
    
    -- Scraping metadata
    last_scraped_at     TIMESTAMPTZ,
    scrape_status       scrape_status,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sources_url ON sources (url);
CREATE INDEX idx_sources_domain ON sources (domain);
CREATE INDEX idx_sources_content_hash ON sources (content_hash);
CREATE INDEX idx_sources_type ON sources (source_type);


-- ============================================================================
-- 3. EVIDENCE — The core table. Every atomic piece of evidence.
-- ============================================================================

CREATE TABLE evidence (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id             UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    
    -- Identity
    evidence_code       TEXT NOT NULL,                           -- human-readable: "E001", "E002"
    title               TEXT NOT NULL,
    summary             TEXT NOT NULL,
    full_text           TEXT,                                    -- complete extracted text if applicable
    
    -- Classification
    category            evidence_category NOT NULL,
    confidence          confidence_level NOT NULL DEFAULT 'unknown',
    
    -- Temporal
    evidence_date       DATE,                                   -- when the evidenced event occurred
    evidence_date_end   DATE,                                   -- for ranges
    evidence_time       TEXT,                                    -- "~6:00 AM" (free text, often approximate)
    date_precision      TEXT DEFAULT 'day',                      -- 'exact', 'day', 'month', 'year', 'approximate'
    
    -- Spatial
    location_description TEXT,
    location_lat        DECIMAL(10, 7),
    location_lng        DECIMAL(10, 7),
    
    -- Source chain — every evidence entry traces back to a source
    source_id           UUID REFERENCES sources(id),
    source_detail       TEXT,                                    -- specific page, timestamp, paragraph
    
    -- Files
    file_keys           TEXT[],                                  -- S3 keys for associated files
    file_types          TEXT[],                                  -- ["pdf", "jpg"] parallel array
    has_thumbnail       BOOLEAN DEFAULT FALSE,
    thumbnail_key       TEXT,                                    -- S3 key for preview image
    
    -- Provenance
    ingestion_method    ingestion_method NOT NULL DEFAULT 'manual_entry',
    raw_source_id       UUID,                                   -- FK to raw_staging if scraped
    ingested_by         UUID,                                   -- user or system ID
    
    -- Flexible metadata (category-specific fields go here)
    metadata            JSONB DEFAULT '{}',
    -- Examples:
    -- witness: {"witness_name": "...", "interview_date": "...", "interviewer": "..."}
    -- vehicle: {"make": "...", "model": "...", "year": "...", "color": "...", "plate": "..."}
    -- photo: {"photographer": "...", "camera": "...", "dimensions": "...", "exif": {...}}
    
    -- Tags for flexible categorization beyond the enum
    tags                TEXT[],
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evidence_case ON evidence (case_id);
CREATE INDEX idx_evidence_category ON evidence (category);
CREATE INDEX idx_evidence_confidence ON evidence (confidence);
CREATE INDEX idx_evidence_date ON evidence (evidence_date);
CREATE INDEX idx_evidence_code ON evidence (evidence_code);
CREATE INDEX idx_evidence_tags ON evidence USING GIN (tags);
CREATE INDEX idx_evidence_metadata ON evidence USING GIN (metadata);
CREATE INDEX idx_evidence_fulltext ON evidence USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(full_text, '')));

-- Unique code per case
ALTER TABLE evidence ADD CONSTRAINT uq_evidence_code_per_case UNIQUE (case_id, evidence_code);


-- ============================================================================
-- 4. ENTITIES — People, vehicles, locations, phones, orgs
-- ============================================================================

CREATE TABLE entities (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Identity
    entity_type         entity_type NOT NULL,
    canonical_name      TEXT NOT NULL,                           -- resolved primary name
    aliases             TEXT[] DEFAULT '{}',                     -- alternate names, spellings, maiden names
    
    -- Description
    summary             TEXT,
    
    -- Type-specific attributes stored as flexible JSON
    attributes          JSONB DEFAULT '{}',
    -- Person:      {"dob": "...", "dod": "...", "height": "...", "weight": "...", 
    --               "hair": "...", "eyes": "...", "scars": "...", "tattoos": "...",
    --               "last_known_address": "...", "occupation": "...", "criminal_record": true}
    -- Vehicle:     {"make": "...", "model": "...", "year": "...", "color": "...", 
    --               "plate": "...", "vin": "...", "description": "blue two-toned"}
    -- Location:    {"address": "...", "lat": ..., "lng": ..., "type": "residence/business/intersection"}
    -- Phone:       {"number": "...", "carrier": "...", "registered_to": "..."}
    -- Organization:{"type": "...", "founded": "...", "dissolved": "...", "jurisdiction": "..."}
    
    -- Temporal range this entity is relevant
    first_seen_date     DATE,
    last_seen_date      DATE,
    
    -- Status
    is_identified       BOOLEAN DEFAULT TRUE,                    -- false for "unknown stocky man"
    is_alive            BOOLEAN,                                 -- null if unknown
    
    -- Dedup / resolution
    merged_into_id      UUID REFERENCES entities(id),            -- if this entity was merged into another
    resolution_confidence DECIMAL(3,2),                          -- 0.00-1.00 confidence in entity resolution
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_entities_type ON entities (entity_type);
CREATE INDEX idx_entities_name ON entities (canonical_name);
CREATE INDEX idx_entities_aliases ON entities USING GIN (aliases);
CREATE INDEX idx_entities_attributes ON entities USING GIN (attributes);
CREATE INDEX idx_entities_identified ON entities (is_identified);
CREATE INDEX idx_entities_name_trgm ON entities USING GIN (canonical_name gin_trgm_ops);


-- ============================================================================
-- 5. ENTITY ↔ EVIDENCE — Junction table with role
-- ============================================================================

CREATE TABLE entity_evidence (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id           UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    evidence_id         UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    
    role                entity_role NOT NULL DEFAULT 'mentioned',
    
    -- How this link was established
    extraction_method   ingestion_method NOT NULL DEFAULT 'manual_entry',
    confidence          confidence_level NOT NULL DEFAULT 'unknown',
    
    notes               TEXT,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ee_entity ON entity_evidence (entity_id);
CREATE INDEX idx_ee_evidence ON entity_evidence (evidence_id);
CREATE INDEX idx_ee_role ON entity_evidence (role);
ALTER TABLE entity_evidence ADD CONSTRAINT uq_entity_evidence_role UNIQUE (entity_id, evidence_id, role);


-- ============================================================================
-- 6. ENTITY ↔ CASE — Which entities appear in which cases
-- ============================================================================

CREATE TABLE entity_cases (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id           UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    case_id             UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    
    primary_role        entity_role NOT NULL DEFAULT 'mentioned',
    mention_count       INTEGER DEFAULT 1,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ec_entity ON entity_cases (entity_id);
CREATE INDEX idx_ec_case ON entity_cases (case_id);
ALTER TABLE entity_cases ADD CONSTRAINT uq_entity_case UNIQUE (entity_id, case_id);


-- ============================================================================
-- 7. CONNECTIONS — Relationships between entities (mirrored in Neo4j)
-- ============================================================================

CREATE TABLE connections (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    entity_a_id         UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    entity_b_id         UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    
    relationship        relationship_type NOT NULL,
    relationship_detail TEXT,                                    -- free text: "roommates in 1983"
    
    -- Which evidence established this connection
    evidence_id         UUID REFERENCES evidence(id),
    
    -- Temporal scope
    date_start          DATE,
    date_end            DATE,
    is_current          BOOLEAN,
    
    -- Confidence
    confidence          confidence_level NOT NULL DEFAULT 'unknown',
    
    -- Cross-case flag — THIS IS WHERE CASES GET SOLVED
    crosses_cases       BOOLEAN DEFAULT FALSE,
    case_a_id           UUID REFERENCES cases(id),
    case_b_id           UUID REFERENCES cases(id),
    
    notes               TEXT,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conn_entity_a ON connections (entity_a_id);
CREATE INDEX idx_conn_entity_b ON connections (entity_b_id);
CREATE INDEX idx_conn_relationship ON connections (relationship);
CREATE INDEX idx_conn_crosses ON connections (crosses_cases) WHERE crosses_cases = TRUE;
CREATE INDEX idx_conn_evidence ON connections (evidence_id);

-- Prevent exact duplicate connections
ALTER TABLE connections ADD CONSTRAINT uq_connection 
    UNIQUE (entity_a_id, entity_b_id, relationship, evidence_id);


-- ============================================================================
-- 8. EVIDENCE LINKS — Direct links between evidence entries
-- ============================================================================

CREATE TABLE evidence_links (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evidence_a_id       UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    evidence_b_id       UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    
    link_type           TEXT NOT NULL DEFAULT 'related',         -- "related", "contradicts", "corroborates", "supersedes", "timeline_adjacent"
    notes               TEXT,
    created_by          UUID,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_elink_a ON evidence_links (evidence_a_id);
CREATE INDEX idx_elink_b ON evidence_links (evidence_b_id);
ALTER TABLE evidence_links ADD CONSTRAINT uq_evidence_link UNIQUE (evidence_a_id, evidence_b_id, link_type);


-- ============================================================================
-- 9. OPEN QUESTIONS — The investigation task queue
-- ============================================================================

CREATE TABLE open_questions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id             UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    evidence_id         UUID REFERENCES evidence(id),            -- which evidence raised this question
    
    question_text       TEXT NOT NULL,
    context             TEXT,                                     -- why this question matters
    
    priority            question_priority NOT NULL DEFAULT 'medium',
    status              question_status NOT NULL DEFAULT 'open',
    
    -- What skill is needed to answer this
    required_skills     skill_type[] DEFAULT '{}',
    
    -- Geographic relevance (for matching to users with local knowledge)
    relevant_location   TEXT,
    relevant_lat        DECIMAL(10, 7),
    relevant_lng        DECIMAL(10, 7),
    relevant_radius_km  INTEGER,                                 -- how close does someone need to be
    
    -- Temporal relevance (for matching to users who were there at the time)
    relevant_date_start DATE,
    relevant_date_end   DATE,
    
    -- Resolution
    answered_by         UUID,                                    -- user ID
    answer_text         TEXT,
    answer_evidence_id  UUID REFERENCES evidence(id),            -- new evidence created by the answer
    resolved_at         TIMESTAMPTZ,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_questions_case ON open_questions (case_id);
CREATE INDEX idx_questions_status ON open_questions (status);
CREATE INDEX idx_questions_priority ON open_questions (priority);
CREATE INDEX idx_questions_skills ON open_questions USING GIN (required_skills);
CREATE INDEX idx_questions_evidence ON open_questions (evidence_id);


-- ============================================================================
-- 10. RAW STAGING — Everything scraped before processing
-- ============================================================================

CREATE TABLE raw_staging (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Source
    source_url          TEXT NOT NULL,
    source_domain       TEXT,
    
    -- Raw content
    raw_html            TEXT,
    raw_text            TEXT,
    content_hash        TEXT NOT NULL,                            -- SHA256 for dedup
    
    -- Files pulled
    file_keys           TEXT[],                                  -- S3 keys for downloaded files
    
    -- Processing state
    scrape_status       scrape_status NOT NULL DEFAULT 'queued',
    scraped_at          TIMESTAMPTZ,
    processed_at        TIMESTAMPTZ,
    processing_errors   TEXT[],
    
    -- What processing produced
    extracted_entities  JSONB,                                   -- NLP output: [{name, type, confidence}]
    extracted_dates     JSONB,                                   -- [{date, context}]
    extracted_locations JSONB,                                   -- [{location, lat, lng, context}]
    classified_as       evidence_category,                       -- what the classifier thinks this is
    
    -- Link to production records (once merged)
    promoted_evidence_id UUID REFERENCES evidence(id),
    promoted_source_id   UUID REFERENCES sources(id),
    
    -- Flags
    is_duplicate        BOOLEAN DEFAULT FALSE,
    duplicate_of        UUID REFERENCES raw_staging(id),
    needs_human_review  BOOLEAN DEFAULT FALSE,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_raw_content_hash ON raw_staging (content_hash);
CREATE INDEX idx_raw_status ON raw_staging (scrape_status);
CREATE INDEX idx_raw_domain ON raw_staging (source_domain);
CREATE INDEX idx_raw_needs_review ON raw_staging (needs_human_review) WHERE needs_human_review = TRUE;


-- ============================================================================
-- 11. TIMELINE EVENTS — Denormalized chronological view
-- ============================================================================
-- This duplicates some evidence data but gives us a clean timeline query path
-- without complex joins. Populated by triggers on evidence insert/update.

CREATE TABLE timeline_events (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id             UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    evidence_id         UUID REFERENCES evidence(id) ON DELETE CASCADE,
    
    event_date          DATE NOT NULL,
    event_time          TEXT,
    date_precision      TEXT DEFAULT 'day',
    
    title               TEXT NOT NULL,
    summary             TEXT,
    category            evidence_category,
    confidence          confidence_level,
    
    -- For sorting when dates are the same
    sort_order          INTEGER DEFAULT 0,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_timeline_case_date ON timeline_events (case_id, event_date);
CREATE INDEX idx_timeline_date ON timeline_events (event_date);


-- ============================================================================
-- 12. USERS (minimal — just enough for contributions)
-- ============================================================================

CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Auth handled externally (Auth0, Supabase, etc.)
    external_auth_id    TEXT UNIQUE,
    
    display_name        TEXT NOT NULL,
    email               TEXT UNIQUE,
    
    -- Profile for skill matching
    skills              skill_type[] DEFAULT '{}',
    
    -- Geographic history (for case matching)
    -- Stored as JSON array: [{"city": "...", "state": "...", "from": 1990, "to": 2000}]
    geographic_history  JSONB DEFAULT '[]',
    
    -- Professional background
    professional_background TEXT[],
    
    -- Reputation
    reputation_score    INTEGER DEFAULT 0,
    contributions_total INTEGER DEFAULT 0,
    contributions_accepted INTEGER DEFAULT 0,
    contributions_verified INTEGER DEFAULT 0,
    
    -- Preferences
    notification_prefs  JSONB DEFAULT '{}',
    
    is_admin            BOOLEAN DEFAULT FALSE,
    is_moderator        BOOLEAN DEFAULT FALSE,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_skills ON users USING GIN (skills);
CREATE INDEX idx_users_geo ON users USING GIN (geographic_history);
CREATE INDEX idx_users_reputation ON users (reputation_score DESC);


-- ============================================================================
-- 13. CONTRIBUTIONS — User-submitted findings
-- ============================================================================

CREATE TABLE contributions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    user_id             UUID NOT NULL REFERENCES users(id),
    case_id             UUID NOT NULL REFERENCES cases(id),
    evidence_id         UUID REFERENCES evidence(id),            -- which evidence this is attached to
    question_id         UUID REFERENCES open_questions(id),      -- if answering a specific question
    
    -- Content
    title               TEXT NOT NULL,
    body                TEXT NOT NULL,
    
    -- Supporting material
    file_keys           TEXT[],                                  -- S3 keys for uploaded files
    source_urls         TEXT[],                                  -- external sources cited
    
    -- Review
    status              contribution_status NOT NULL DEFAULT 'pending_review',
    reviewed_by         UUID REFERENCES users(id),
    reviewed_at         TIMESTAMPTZ,
    review_notes        TEXT,
    
    -- If accepted, what production records were created
    created_evidence_id UUID REFERENCES evidence(id),
    created_entity_ids  UUID[],
    created_connection_ids UUID[],
    
    -- Community signals
    upvotes             INTEGER DEFAULT 0,
    downvotes           INTEGER DEFAULT 0,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contributions_user ON contributions (user_id);
CREATE INDEX idx_contributions_case ON contributions (case_id);
CREATE INDEX idx_contributions_evidence ON contributions (evidence_id);
CREATE INDEX idx_contributions_status ON contributions (status);
CREATE INDEX idx_contributions_question ON contributions (question_id);


-- ============================================================================
-- 14. AUDIT LOG — Every change tracked
-- ============================================================================

CREATE TABLE audit_log (
    id                  BIGSERIAL PRIMARY KEY,
    
    table_name          TEXT NOT NULL,
    record_id           UUID NOT NULL,
    action              TEXT NOT NULL,                            -- 'INSERT', 'UPDATE', 'DELETE'
    
    old_data            JSONB,
    new_data            JSONB,
    changed_fields      TEXT[],
    
    performed_by        UUID,                                    -- user ID or null for system
    reason              TEXT,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_table ON audit_log (table_name, record_id);
CREATE INDEX idx_audit_time ON audit_log (created_at);


-- ============================================================================
-- 15. SCRAPE JOBS — Manages the scraping pipeline
-- ============================================================================

CREATE TABLE scrape_jobs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Target
    target_url          TEXT NOT NULL,
    target_domain       TEXT,
    target_type         source_type,
    
    -- Scope
    case_id             UUID REFERENCES cases(id),               -- null if discovery/exploratory scrape
    
    -- Scheduling
    priority            INTEGER DEFAULT 0,
    scheduled_for       TIMESTAMPTZ,
    
    -- Execution
    status              scrape_status NOT NULL DEFAULT 'queued',
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    error_message       TEXT,
    retry_count         INTEGER DEFAULT 0,
    max_retries         INTEGER DEFAULT 3,
    
    -- Results
    raw_staging_id      UUID REFERENCES raw_staging(id),
    pages_scraped       INTEGER DEFAULT 0,
    
    -- Recurring
    is_recurring        BOOLEAN DEFAULT FALSE,
    recurrence_interval INTERVAL,                                -- e.g., '7 days' to re-check weekly
    last_run_at         TIMESTAMPTZ,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scrape_status ON scrape_jobs (status);
CREATE INDEX idx_scrape_scheduled ON scrape_jobs (scheduled_for) WHERE status = 'queued';
CREATE INDEX idx_scrape_case ON scrape_jobs (case_id);


-- ============================================================================
-- 16. CROSS-CASE MATCHES — Auto-detected connections between cases
-- ============================================================================
-- This is the "case solver" table. When the system detects that an entity 
-- from one case matches an entity in another case, it logs here for review.

CREATE TABLE cross_case_matches (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    case_a_id           UUID NOT NULL REFERENCES cases(id),
    case_b_id           UUID NOT NULL REFERENCES cases(id),
    
    entity_a_id         UUID NOT NULL REFERENCES entities(id),
    entity_b_id         UUID NOT NULL REFERENCES entities(id),
    
    match_type          TEXT NOT NULL,                            -- "same_name", "same_address", "same_vehicle", "same_phone", "geographic_proximity", "temporal_overlap", "mo_similarity"
    match_confidence    DECIMAL(3,2) NOT NULL,                   -- 0.00-1.00
    match_details       JSONB,                                   -- specifics of what matched
    
    -- Review
    is_reviewed         BOOLEAN DEFAULT FALSE,
    is_confirmed        BOOLEAN,                                 -- null=unreviewed, true=real match, false=false positive
    reviewed_by         UUID REFERENCES users(id),
    reviewed_at         TIMESTAMPTZ,
    
    -- If confirmed, the connection that was created
    connection_id       UUID REFERENCES connections(id),
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ccm_cases ON cross_case_matches (case_a_id, case_b_id);
CREATE INDEX idx_ccm_unreviewed ON cross_case_matches (is_reviewed) WHERE is_reviewed = FALSE;
CREATE INDEX idx_ccm_confidence ON cross_case_matches (match_confidence DESC);


-- ============================================================================
-- VIEWS — Common query patterns
-- ============================================================================

-- Full evidence view with source info
CREATE VIEW v_evidence_full AS
SELECT 
    e.*,
    c.title AS case_title,
    c.slug AS case_slug,
    s.title AS source_title,
    s.url AS source_url,
    s.source_type AS source_category,
    s.reliability_rating
FROM evidence e
JOIN cases c ON e.case_id = c.id
LEFT JOIN sources s ON e.source_id = s.id;

-- Entity connection map (for feeding Neo4j sync)
CREATE VIEW v_entity_graph AS
SELECT
    conn.id AS connection_id,
    ea.canonical_name AS entity_a_name,
    ea.entity_type AS entity_a_type,
    eb.canonical_name AS entity_b_name,
    eb.entity_type AS entity_b_type,
    conn.relationship,
    conn.confidence,
    conn.crosses_cases,
    conn.date_start,
    conn.date_end
FROM connections conn
JOIN entities ea ON conn.entity_a_id = ea.id
JOIN entities eb ON conn.entity_b_id = eb.id
WHERE ea.merged_into_id IS NULL 
  AND eb.merged_into_id IS NULL;

-- Open questions ready for assignment
CREATE VIEW v_assignable_questions AS
SELECT
    q.*,
    c.title AS case_title,
    c.slug AS case_slug,
    e.title AS evidence_title,
    e.evidence_code
FROM open_questions q
JOIN cases c ON q.case_id = c.id
LEFT JOIN evidence e ON q.evidence_id = e.id
WHERE q.status = 'open';

-- Unreviewed cross-case matches ranked by confidence
CREATE VIEW v_pending_matches AS
SELECT
    m.*,
    ca.title AS case_a_title,
    cb.title AS case_b_title,
    ea.canonical_name AS entity_a_name,
    ea.entity_type AS entity_a_type,
    eb.canonical_name AS entity_b_name,
    eb.entity_type AS entity_b_type
FROM cross_case_matches m
JOIN cases ca ON m.case_a_id = ca.id
JOIN cases cb ON m.case_b_id = cb.id
JOIN entities ea ON m.entity_a_id = ea.id
JOIN entities eb ON m.entity_b_id = eb.id
WHERE m.is_reviewed = FALSE
ORDER BY m.match_confidence DESC;

-- Raw staging items needing human review
CREATE VIEW v_staging_review_queue AS
SELECT
    rs.*,
    sj.target_url,
    sj.case_id,
    c.title AS case_title
FROM raw_staging rs
LEFT JOIN scrape_jobs sj ON rs.id = sj.raw_staging_id
LEFT JOIN cases c ON sj.case_id = c.id
WHERE rs.needs_human_review = TRUE
  AND rs.promoted_evidence_id IS NULL
ORDER BY rs.created_at DESC;


-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cases_updated BEFORE UPDATE ON cases FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_evidence_updated BEFORE UPDATE ON evidence FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_entities_updated BEFORE UPDATE ON entities FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_connections_updated BEFORE UPDATE ON connections FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_sources_updated BEFORE UPDATE ON sources FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_questions_updated BEFORE UPDATE ON open_questions FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_contributions_updated BEFORE UPDATE ON contributions FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Auto-update evidence count on cases
CREATE OR REPLACE FUNCTION update_case_evidence_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE cases SET evidence_count = evidence_count + 1 WHERE id = NEW.case_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE cases SET evidence_count = evidence_count - 1 WHERE id = OLD.case_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_evidence_count 
AFTER INSERT OR DELETE ON evidence 
FOR EACH ROW EXECUTE FUNCTION update_case_evidence_count();

-- Auto-populate timeline_events when evidence is added
CREATE OR REPLACE FUNCTION sync_timeline_event()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.evidence_date IS NOT NULL THEN
        INSERT INTO timeline_events (case_id, evidence_id, event_date, event_time, date_precision, title, summary, category, confidence)
        VALUES (NEW.case_id, NEW.id, NEW.evidence_date, NEW.evidence_time, NEW.date_precision, NEW.title, NEW.summary, NEW.category, NEW.confidence)
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_timeline 
AFTER INSERT ON evidence 
FOR EACH ROW EXECUTE FUNCTION sync_timeline_event();


-- ============================================================================
-- COMMENTS — Table documentation
-- ============================================================================

COMMENT ON TABLE cases IS 'Top-level case records. Each unsolved crime is one case.';
COMMENT ON TABLE evidence IS 'Atomic evidence entries. Every document, witness statement, photo, claim gets its own row.';
COMMENT ON TABLE entities IS 'Resolved entities: people, vehicles, locations, phones, orgs. Feeds the Neo4j graph.';
COMMENT ON TABLE connections IS 'Relationships between entities. Mirrored in Neo4j for graph traversal.';
COMMENT ON TABLE entity_evidence IS 'Junction: which entities appear in which evidence, and in what role.';
COMMENT ON TABLE cross_case_matches IS 'Auto-detected entity matches across different cases. THE CASE SOLVER TABLE.';
COMMENT ON TABLE raw_staging IS 'Raw scraped content before processing. Never deleted, always reprocessable.';
COMMENT ON TABLE open_questions IS 'Investigation task queue. Questions matched to users by skill, location, and time.';
COMMENT ON TABLE contributions IS 'User-submitted findings. Review pipeline before promotion to production tables.';
COMMENT ON TABLE audit_log IS 'Complete change history for every production table.';
COMMENT ON COLUMN connections.crosses_cases IS 'Flag for connections spanning multiple cases. These are highest-value investigative leads.';
COMMENT ON COLUMN entities.merged_into_id IS 'Entity resolution: when two entities are determined to be the same, one merges into the other.';
COMMENT ON COLUMN raw_staging.content_hash IS 'SHA256 hash for deduplication. Same content from different URLs gets caught.';
