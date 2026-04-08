# Cold Case Platform — Master Scraping Source List

Every known public source of substantive data on unsolved violent crimes, missing persons, and unidentified remains in the United States (and select international sources). Each entry includes what data it holds, how to access it, approximate volume, and scraping feasibility.

---

## TIER 1 — High-Volume Structured Databases (Build Scrapers First)

These are the backbone. Each contains thousands of structured case records with consistent field layouts ideal for automated extraction.

### 1. The Charley Project
- **URL:** charleyproject.org
- **What:** 16,000+ missing person profiles with physical descriptors, circumstances, investigating agency, source links, photos, age progressions
- **Access:** Public HTML pages, alphabetical/chronological/geographic indexes
- **License:** Creative Commons BY-NC 2.0
- **Volume:** ~16,000 active cases
- **Scraping:** ✅ Straightforward HTML scraping. Alphabetical index → case pages. **Scraper built.**
- **Schema fit:** cases, entities, sources, evidence

### 2. NamUs (National Missing and Unidentified Persons System)
- **URL:** namus.nij.ojp.gov
- **What:** The only federal database for missing, unidentified, and unclaimed persons. Contains biometric data, dental records, DNA references, physical descriptors, circumstance narratives, and investigating agency info. Three case types: Missing Persons, Unidentified Persons, Unclaimed Persons.
- **Access:** Public search interface with case detail pages. Registered users get expanded access. No public API, but search returns structured JSON payloads internally.
- **License:** Government data, but has a research use disclaimer — check terms before bulk scraping
- **Volume:** ~23,000 missing + ~15,000 unidentified + ~3,000 unclaimed
- **Scraping:** ⚠️ Requires Selenium or similar (JavaScript-rendered). Internal API endpoints return JSON if reverse-engineered. Prior projects (jcmack/missingpersons on GitHub) have done this successfully.
- **Schema fit:** cases, entities (victim + unidentified), sources, cross_case_matches (MP↔UP matching)

### 3. The Doe Network
- **URL:** doenetwork.org
- **What:** International volunteer database of missing persons and unidentified remains with detailed case files, forensic reconstructions, photos, circumstance narratives. Covers US, Canada, Europe, Australia.
- **Access:** Static HTML pages organized by geography and gender. Index pages link to individual case files.
- **License:** Non-profit volunteer site. No explicit license, but designed for public awareness.
- **Volume:** ~5,000+ unidentified persons + ~3,000+ missing persons
- **Scraping:** ✅ Classic HTML scraping. Index pages (uid-geo-us-males.php, etc.) → case pages. Prior Scrapy projects exist.
- **Schema fit:** cases, entities, sources, cross_case_matches

### 4. NCMEC (National Center for Missing & Exploited Children)
- **URL:** missingkids.org/search
- **What:** Missing children posters, age progressions, case details, AMBER alerts, unidentified child remains. Interactive poster map with GIS data.
- **Access:** Public search interface. Internal JSON API behind the search. Poster Map uses ArcGIS.
- **License:** Government-funded nonprofit. Content intended for public dissemination.
- **Volume:** ~30,000+ current missing child cases
- **Scraping:** ⚠️ JSON API behind search interface can be reverse-engineered. Poster Map provides geo-enriched data. Requires careful rate-limiting.
- **Schema fit:** cases, entities (child victims), sources

### 5. Murder Accountability Project (MAP)
- **URL:** murderdata.org
- **What:** The most complete collection of US homicide data. Assembles FBI Uniform Crime Report (1965–present) and Supplementary Homicide Report (1976–present) data. Includes ~22,000+ homicides not reported to FBI, obtained via FOIA.
- **Access:** **Direct CSV/SPSS downloads available** on the Data & Docs page. No scraping needed.
- **License:** Public data, explicitly made available for download
- **Volume:** ~900,000+ individual homicide records spanning 1976–2024. ~352,000+ estimated unsolved.
- **Scraping:** ✅ Direct download. CSV and SPSS formats. Also has interactive Tableau dashboards with exportable underlying data.
- **Schema fit:** cases (bulk import of unsolved homicides with victim demographics, weapon, circumstances, reporting agency)

### 6. FBI Crime Data Explorer
- **URL:** cde.ucr.cjis.gov
- **What:** Official FBI crime statistics portal. NIBRS data, UCR summary data, hate crime, law enforcement officer data. Includes downloadable bulk datasets.
- **Access:** Public API + bulk CSV downloads
- **License:** US Government public data
- **Volume:** Millions of incident records
- **Scraping:** ✅ API available. Bulk downloads. Complements MAP data with broader crime context.
- **Schema fit:** cases (supplementary context), sources

### 7. Project: Cold Case
- **URL:** projectcoldcase.org / database.projectcoldcase.org
- **What:** Unsolved homicide database covering 46 US states, 50 Florida counties, 3 international countries. Cases submitted by families and law enforcement. Partnered with Washington Post murder data.
- **Access:** Public web database with search/filter by state, city, year, name
- **License:** Non-profit, public awareness purpose
- **Volume:** ~10,000+ unsolved homicide cases
- **Scraping:** ✅ HTML pages with filterable listings
- **Schema fit:** cases, entities, sources

---

## TIER 2 — Federal / Law Enforcement Public Portals

These provide authoritative case data but may have smaller public-facing volumes or restricted access methods.

### 8. FBI ViCAP (Violent Criminal Apprehension Program)
- **URL:** fbi.gov/wanted/vicap
- **What:** Public-facing subset of the largest federal repository of major violent crime cases. Lists unsolved homicides, sexual assaults, missing persons, and unidentified remains that the FBI has published for public tips.
- **Access:** Public HTML pages with case cards
- **Volume:** ~200–500 publicly listed cases (the full ViCAP database is law enforcement only)
- **Scraping:** ✅ Small volume, static HTML
- **Schema fit:** cases, entities, evidence

### 9. FBI Wanted — Kidnappings/Missing Persons
- **URL:** fbi.gov/wanted/kidnap
- **What:** Active FBI kidnapping and missing persons cases with photos, descriptions, reward info
- **Access:** Public HTML
- **Volume:** ~100–200 active cases
- **Scraping:** ✅ Small, straightforward
- **Schema fit:** cases, entities

### 10. FBI Seeking Information
- **URL:** fbi.gov/wanted/seeking-information
- **What:** Cases where FBI seeks public help — includes unsolved homicides, bombings, kidnappings
- **Access:** Public HTML with paginated listings
- **Volume:** ~200+ cases
- **Scraping:** ✅ Straightforward
- **Schema fit:** cases, entities, evidence

### 11. INTERPOL Yellow Notices (Missing Persons)
- **URL:** interpol.int/How-we-work/Notices/Yellow-Notices/View-Yellow-Notices
- **What:** Global police alerts for missing persons — parental abductions, criminal abductions, unexplained disappearances
- **Access:** Public search interface
- **Volume:** ~2,600 issued per year; public subset available
- **Scraping:** ⚠️ JavaScript-rendered search. International scope provides cross-border cases.
- **Schema fit:** cases, entities

### 12. INTERPOL Identify Me (Black Notices)
- **URL:** interpol.int/en/What-you-can-do/Identify-Me
- **What:** First-ever public extracts from Black Notices — unidentified women found in European countries believed to be murder victims. Includes facial reconstructions, dental data, clothing, location details.
- **Access:** Public case pages
- **Volume:** ~45 cases (small but high-value international cold cases)
- **Scraping:** ✅ Small, structured HTML
- **Schema fit:** cases, entities (unidentified), evidence

### 13. National Park Service — Missing Persons
- **URL:** nps.gov (missing persons section)
- **What:** People who have gone missing in US National Parks
- **Access:** Scattered across park-specific pages
- **Volume:** ~1,600+ documented cases
- **Scraping:** ⚠️ Distributed across many park subdomains
- **Schema fit:** cases, entities

### 14. Civil Rights Cold Case Records Portal
- **URL:** crcca.archives.gov
- **What:** Digitized government records related to civil rights cold cases, per the 2018 Civil Rights Cold Case Records Collection Act. Includes FBI files, DOJ files, grand jury records.
- **Access:** Public digital archive with document search
- **Volume:** Hundreds of records across ~150+ cases
- **Scraping:** ⚠️ Document archive — better suited for bulk download + OCR pipeline
- **Schema fit:** cases, evidence, sources

---

## TIER 3 — State & Regional Cold Case Databases

Many states maintain their own public-facing unsolved case databases. These are high-value because they often contain cases not in federal databases.

### 15. Texas DPS Cold Cases
- **URL:** dps.texas.gov/apps/coldcase/home/ViewCases
- **What:** Unsolved homicides in Texas with victim photos, case details, investigating agency
- **Access:** Public web app
- **Scraping:** ⚠️ JavaScript app, may need Selenium

### 16. Virginia State Police Cold Case Database
- **URL:** coldcase.vsp.virginia.gov
- **What:** Unsolved homicides, missing persons, unidentified remains across Virginia
- **Access:** Public web database
- **Scraping:** ✅ HTML pages

### 17. Georgia Bureau of Investigation (GBI)
- **URL:** gbi.georgia.gov (cold cases section)
- **What:** Georgia unsolved homicides and missing persons
- **Access:** Public case pages
- **Scraping:** ✅ HTML

### 18. California DOJ Missing Persons
- **URL:** oag.ca.gov/missing
- **What:** California missing and unidentified persons
- **Access:** Public search
- **Scraping:** ⚠️ Dynamic web app

### 19. Iowa DCI Missing Persons
- **URL:** iowadci.gov
- **What:** Iowa missing persons and unsolved homicides
- **Access:** Public pages
- **Scraping:** ✅ HTML

### 20. Florida FDLE Missing Persons
- **URL:** fdle.state.fl.us
- **What:** Florida missing and endangered persons clearinghouse
- **Access:** Public
- **Scraping:** ⚠️ Varies by section

### 21. Wisconsin DOJ Missing Persons Clearinghouse
- **URL:** missingpersons.doj.wi.gov
- **What:** Wisconsin missing persons and unsolved cases
- **Access:** Public
- **Scraping:** ✅ HTML

### 22. Other State Databases (Partial List)
Nearly every state has some form of missing persons clearinghouse. Key ones:
- **New York:** criminaljustice.ny.gov/missing
- **Illinois:** isp.state.il.us/crime/missingpersons.cfm
- **Ohio:** ohioattorneygeneral.gov/missingpersons
- **Michigan:** michigan.gov/msp (missing persons section)
- **Oregon:** oregon.gov/osp/missing
- **New Jersey:** njsp.org/missing-persons
- **Pennsylvania:** psp.pa.gov (missing persons)
- **Washington:** wsp.wa.gov (missing/unidentified)
- **Colorado:** cbi.state.co.us
- **North Carolina:** ncdoj.gov (SBI missing persons)
- **Utah:** bci.utah.gov
- **Vermont:** vsp.vermont.gov
- **West Virginia:** wvsp.gov
- **Wyoming:** wyomingdci.wyo.gov

---

## TIER 4 — Community / Volunteer / Crowdsource Databases

These sites aggregate case data from public sources and often contain detailed narrative write-ups, community research, and cross-referencing not found elsewhere.

### 23. Unidentified Wiki (Fandom)
- **URL:** unidentified-awareness.fandom.com
- **What:** Community wiki with detailed profiles of unidentified and missing persons, including case narratives, photos, forensic details, external links
- **Access:** Public wiki pages (MediaWiki)
- **Volume:** ~10,000+ articles
- **Scraping:** ✅ MediaWiki API available for structured extraction
- **Schema fit:** cases, entities, evidence, sources (rich cross-referencing)

### 24. r/UnresolvedMysteries (Reddit)
- **URL:** reddit.com/r/UnresolvedMysteries
- **What:** 2.5M+ member community posting detailed write-ups on unsolved cases — homicides, disappearances, unidentified persons. Posts often contain original research, source links, and case analysis.
- **Access:** Reddit API (rate-limited) or Pushshift archive
- **Volume:** Tens of thousands of posts
- **Scraping:** ⚠️ Reddit API requires app registration. Historical data via Pushshift/Arctic Shift archives.
- **Schema fit:** evidence (user research), sources, open_questions

### 25. r/gratefuldoe (Reddit)
- **URL:** reddit.com/r/gratefuldoe
- **What:** Focused on matching unidentified remains with missing persons
- **Access:** Reddit API
- **Volume:** Thousands of posts
- **Scraping:** ⚠️ Same as above

### 26. Websleuths
- **URL:** websleuths.com
- **What:** Largest true crime discussion forum. Case-specific threads with extensive community research, document sharing, timeline construction.
- **Access:** Public forum threads
- **Volume:** 100,000+ threads
- **Scraping:** ⚠️ Forum structure, requires crawling thread indexes. Some sections require registration.
- **Schema fit:** evidence, sources, open_questions

### 27. Defrosting Cold Cases
- **URL:** defrostingcoldcases.com
- **What:** Blog/database covering unsolved homicides, missing persons, unidentified persons, wrongful convictions. Detailed narrative write-ups with source citations.
- **Access:** Public blog posts
- **Volume:** Hundreds of detailed case write-ups
- **Scraping:** ✅ WordPress blog — standard HTML
- **Schema fit:** evidence, sources

### 28. Solve the Case
- **URL:** solvethecase.com
- **What:** Nonprofit database created by a North Texas detective featuring cold cases with organized points of interest, timelines, and public information.
- **Access:** Public web
- **Volume:** Hundreds of cases
- **Scraping:** ✅ HTML
- **Schema fit:** cases, entities, evidence

### 29. The Cold Cases (TheColdCases.com)
- **URL:** thecoldcases.com
- **What:** Aggregated cold case information and analysis, state-by-state breakdowns
- **Access:** Public
- **Scraping:** ✅ HTML/blog

---

## TIER 5 — Downloadable Bulk Datasets (No Scraping Needed)

### 30. Murder Accountability Project — CSV Downloads
- **URL:** murderdata.org/p/data-docs.html
- **What:** Complete UCR data (1965–present), SHR case-level data (1976–present), FOIA-obtained records
- **Format:** CSV, SPSS
- **Volume:** 900,000+ homicide records

### 31. Jacob Kaplan's Concatenated UCR Files
- **URL:** openicpsr.org/openicpsr/project/100699
- **What:** Cleaned, concatenated SHR data 1976–2022 in R/CSV format. Academic quality.
- **Format:** CSV, RDS
- **Volume:** Complete SHR dataset

### 32. FBI Crime Data Explorer Bulk Downloads
- **URL:** cde.ucr.cjis.gov (Downloads & Documentation)
- **What:** NIBRS incident data, UCR summary data, arrest data
- **Format:** CSV
- **Volume:** Millions of records

### 33. Bureau of Justice Statistics (BJS)
- **URL:** bjs.ojp.gov
- **What:** National Crime Victimization Survey, justice system statistics, corrections data
- **Format:** CSV, PDF reports
- **Volume:** Decades of data

### 34. CDC WONDER Mortality Data
- **URL:** wonder.cdc.gov
- **What:** Death certificate data including homicide deaths by geography, demographics, cause. Useful for identifying homicide clusters and verifying case counts.
- **Format:** Query interface with CSV export
- **Volume:** All US deaths 1999–present

### 35. Washington Post Unsolved Homicides Data
- **URL:** washingtonpost.com/graphics/2018/investigations/where-murders-go-unsolved
- **What:** Investigation of unsolved murders in 50+ major US cities. Underlying data shared with Project: Cold Case.
- **Format:** Interactive map + underlying data
- **Volume:** ~52,000 homicides across 50 cities

---

## TIER 6 — FOIA / Public Records Sources

Not scrapable in the traditional sense, but essential data sources that feed the raw_staging pipeline.

### 36. FOIA Requests to State/Local Agencies
- Police department cold case files
- Medical examiner reports on unidentified remains
- 911 call logs and dispatch records
- Arrest and booking records

### 37. Court Records (PACER + State Systems)
- **URL:** pacer.uscourts.gov (federal), state-specific portals
- **What:** Federal and state court filings, indictments, trial records
- **Access:** PACER charges per page; many state systems are free
- **Schema fit:** evidence (court_record), sources

### 38. State Sex Offender Registries
- **URL:** nsopw.gov (national search)
- **What:** Registered sex offenders — useful for cross-referencing against missing person cases
- **Access:** Public search
- **Note:** Use responsibly and only for legitimate investigative cross-referencing

### 39. Newspapers.com / Library of Congress Chronicling America
- **URL:** chroniclingamerica.loc.gov (free), newspapers.com (paid)
- **What:** Historical newspaper archives — original press coverage of crimes, disappearances
- **Access:** Chronicling America is free with API. Newspapers.com requires subscription.
- **Volume:** Millions of pages
- **Schema fit:** sources, evidence (media_coverage)

### 40. Internet Archive Wayback Machine
- **URL:** web.archive.org
- **What:** Archived snapshots of websites — critical for recovering dead links from law enforcement pages, old news articles, defunct missing persons sites
- **Access:** Public API (CDX API for searching)
- **Schema fit:** sources (url_archive field)

---

## TIER 7 — Niche / Specialized Sources

### 41. Missing and Murdered Indigenous Women (MMIW) Databases
- **Bureau of Indian Affairs:** bia.gov/service/mmu
- **Sovereign Bodies Institute:** sovereign-bodies.org
- **Urban Indian Health Institute:** uihi.org
- **What:** Focused databases on MMIP cases, which are systematically underreported in federal databases
- **Volume:** Thousands of cases
- **Schema fit:** cases, entities

### 42. National Park Service Missing Persons
- Missing persons in National Parks — often wilderness disappearances
- Scattered across park-specific pages and NPS law enforcement reports

### 43. Human Trafficking Hotline Data
- **URL:** humantraffickinghotline.org
- **What:** Polaris Project data on trafficking cases — overlap with missing persons
- **Access:** Annual reports with statistics; individual case data not public

### 44. ICRC Missing Persons
- **URL:** missingpersons.icrc.org
- **What:** International Committee of Red Cross missing persons directory — aggregates resources from multiple national databases
- **Access:** Directory of resources and links

### 45. DNA Doe Project
- **URL:** dnadoeproject.org
- **What:** Uses genetic genealogy to identify John/Jane Does. Case pages describe identified and active cases.
- **Access:** Public case pages
- **Volume:** 100+ cases (small but detailed)

### 46. NAMUS Research Data
- **URL:** namus.nij.ojp.gov (research section)
- **What:** Published research reports with aggregate statistics on missing and unidentified persons
- **Access:** PDF reports

---

## Priority Scraping Order

Based on volume, data quality, scraping feasibility, and schema fit:

| Priority | Source | Est. Records | Effort |
|----------|--------|-------------|--------|
| ✅ Done | Charley Project | 16,000 | Low |
| **Next** | Murder Accountability Project (CSV) | 900,000 | Minimal (download) |
| **Next** | Doe Network | 8,000 | Low |
| **Next** | Project: Cold Case | 10,000 | Low |
| 4 | NamUs (Selenium) | 41,000 | Medium |
| 5 | NCMEC (JSON API) | 30,000 | Medium |
| 6 | FBI ViCAP / Wanted / Seeking Info | 500 | Low |
| 7 | Unidentified Wiki (MediaWiki API) | 10,000 | Low |
| 8 | FBI Crime Data Explorer (API) | Millions | Medium |
| 9 | State databases (15–20 states) | Varies | Medium-High |
| 10 | WaPo Unsolved Homicides | 52,000 | Medium |
| 11 | Reddit archives | Tens of thousands | Medium |
| 12 | INTERPOL Yellow/Black Notices | 3,000 | Medium |
| 13 | Civil Rights Cold Case Portal | 150+ cases | Medium |
| 14 | CDC WONDER + BJS | Statistical context | Low |

---

*Last updated: April 8, 2026*
*Total estimated unique cases across all sources: 350,000+ (with significant overlap between databases)*
