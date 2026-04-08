import { useState, useMemo } from "react";

// ============================================================================
// DATA
// ============================================================================

const THREADS = [
  {
    id: "T001",
    title: "The Abduction Morning — Minute-by-Minute Reconstruction",
    status: "active",
    priority: "critical",
    caseSlug: "johnny-gosch",
    description: "Reconstruct every known event between 5:45 AM and 7:00 AM on September 5, 1982. Identify all witnesses, vehicles, and locations. Map gaps in the timeline where critical events are unaccounted for.",
    lead: "Unassigned",
    evidenceIds: ["E001", "E002", "E003", "E004", "E005", "E006"],
    openQuestions: 8,
    resolvedQuestions: 2,
    contributions: 4,
    theories: 2,
    lastActivity: "2 hours ago",
    progressPct: 22,
    tags: ["timeline", "witnesses", "vehicle", "primary"],
  },
  {
    id: "T002",
    title: "Blue Two-Toned Vehicle Identification",
    status: "active",
    priority: "critical",
    caseSlug: "johnny-gosch",
    description: "Multiple witnesses described a blue two-toned car near the paper drop. Identify the exact make, model, and year. Cross-reference against Iowa vehicle registrations from 1980-1983 if obtainable.",
    lead: "Unassigned",
    evidenceIds: ["E003"],
    openQuestions: 3,
    resolvedQuestions: 0,
    contributions: 1,
    theories: 0,
    lastActivity: "1 day ago",
    progressPct: 8,
    tags: ["vehicle", "witnesses", "identification"],
  },
  {
    id: "T003",
    title: "The Bonacci Thread — Credibility Assessment",
    status: "active",
    priority: "critical",
    caseSlug: "johnny-gosch",
    description: "Paul Bonacci's claims are the most detailed account of what happened to Johnny — and the most contested. This thread systematically evaluates every claim he made against independently verifiable evidence. No prejudging. Lay out what's confirmed, what's contradicted, and what's untestable.",
    lead: "Unassigned",
    evidenceIds: ["E012", "E013", "E014", "E015", "E017"],
    openQuestions: 12,
    resolvedQuestions: 3,
    contributions: 7,
    theories: 3,
    lastActivity: "4 hours ago",
    progressPct: 18,
    tags: ["bonacci", "credibility", "franklin", "testimony"],
  },
  {
    id: "T004",
    title: "Cross-Case Analysis: Gosch / Martin / Allen",
    status: "active",
    priority: "critical",
    caseSlug: "johnny-gosch",
    description: "Three boys disappeared in the Des Moines metro area between 1982-1986. Law enforcement never officially connected the cases. This thread maps every similarity and difference: geography, timing, victim profile, MO, witness descriptions, and vehicle sightings.",
    lead: "Unassigned",
    evidenceIds: ["E010", "E011", "E022"],
    openQuestions: 9,
    resolvedQuestions: 1,
    contributions: 3,
    theories: 2,
    lastActivity: "6 hours ago",
    progressPct: 12,
    tags: ["cross-case", "martin", "allen", "geographic-profile", "serial"],
  },
  {
    id: "T005",
    title: "The 2006 Photographs — Origin and Identification",
    status: "active",
    priority: "high",
    caseSlug: "johnny-gosch",
    description: "Photographs left on Noreen's doorstep in 2006 allegedly showing boys in captivity. Three boys were identified from a Florida case. One was not. Trace the chain of custody, identify the unidentified boy, and determine who delivered them and why.",
    lead: "Unassigned",
    evidenceIds: ["E018", "E019"],
    openQuestions: 6,
    resolvedQuestions: 1,
    contributions: 2,
    theories: 1,
    lastActivity: "3 days ago",
    progressPct: 14,
    tags: ["photographs", "florida", "identification", "chain-of-custody"],
  },
  {
    id: "T006",
    title: "The 1997 Visit — Verification Attempt",
    status: "active",
    priority: "high",
    caseSlug: "johnny-gosch",
    description: "Noreen claims Johnny visited her in 1997. John Sr. is unsure. This thread attempts to verify or disprove the visit through any available means: neighbor interviews, security systems, phone records, or corroborating witnesses.",
    lead: "Unassigned",
    evidenceIds: ["E016", "E017"],
    openQuestions: 5,
    resolvedQuestions: 0,
    contributions: 1,
    theories: 2,
    lastActivity: "1 week ago",
    progressPct: 6,
    tags: ["1997-visit", "verification", "noreen"],
  },
  {
    id: "T007",
    title: "Law Enforcement Response Failure Analysis",
    status: "active",
    priority: "medium",
    caseSlug: "johnny-gosch",
    description: "Document every failure in the initial law enforcement response. 45-minute delay, runaway assumption, FBI refusal. Identify which investigative steps should have been taken but weren't, and determine which of those can still be taken today.",
    lead: "Unassigned",
    evidenceIds: ["E007", "E008", "E021"],
    openQuestions: 4,
    resolvedQuestions: 1,
    contributions: 2,
    theories: 0,
    lastActivity: "5 days ago",
    progressPct: 20,
    tags: ["law-enforcement", "response", "WDMPD", "procedural"],
  },
  {
    id: "T008",
    title: "Norman & Paske — Suspect Viability Assessment",
    status: "new",
    priority: "high",
    caseSlug: "johnny-gosch",
    description: "In 2024, Noreen named John David Norman and Phillip Paske as the persons she believes responsible. This thread investigates their criminal histories, whereabouts in September 1982, connections to Iowa, and any overlap with the other missing boys' cases.",
    lead: "Unassigned",
    evidenceIds: ["E020"],
    openQuestions: 5,
    resolvedQuestions: 0,
    contributions: 0,
    theories: 0,
    lastActivity: "New",
    progressPct: 0,
    tags: ["suspects", "norman", "paske", "criminal-history"],
  },
];

const THEORIES = [
  {
    id: "TH001",
    threadId: "T003",
    title: "Bonacci was present at the abduction and his core claims are truthful",
    status: "under_review",
    author: "investigator_42",
    supportingEvidence: ["E012", "E014"],
    contradictingEvidence: ["E015"],
    unaccountedEvidence: ["E013"],
    summary: "Bonacci knew details about Johnny's physical markings that were never made public (scars on tongue and leg, birthmark). State Senator Schmit affirmed under oath that Bonacci told the truth to the Franklin committee. The dismissal of perjury charges 'in the interests of justice' suggests prosecutors had doubts about the fraud characterization.",
    counterArguments: [
      "Siblings provided alibi placing Bonacci at home during the abduction",
      "Grand jury labeled broader Franklin allegations a 'hoax'",
      "FBI considers Bonacci not credible",
      "Colorado investigation of Bonacci's captivity house claims found no substantiation",
    ],
    supportVotes: 14,
    challengeVotes: 9,
    confidence: 0.42,
    createdAt: "2025-11-14",
  },
  {
    id: "TH002",
    threadId: "T003",
    title: "Bonacci acquired insider knowledge secondhand, not through direct participation",
    status: "under_review",
    author: "coldcase_analyst",
    supportingEvidence: ["E015"],
    contradictingEvidence: ["E012"],
    unaccountedEvidence: ["E014", "E013"],
    summary: "Bonacci was a convicted sex offender embedded in networks where information about victims circulated. He could have learned about Johnny's physical characteristics from others in those networks without being present. The sibling alibi is the strongest evidence against direct participation. His detailed knowledge indicates proximity to the perpetrators, not necessarily participation.",
    counterArguments: [
      "Doesn't explain how unpublicized scar details would circulate",
      "Senator Schmit's affidavit specifically endorsed Bonacci's truthfulness",
      "If secondhand, who was the primary source?",
    ],
    supportVotes: 8,
    challengeVotes: 6,
    confidence: 0.31,
    createdAt: "2025-12-02",
  },
  {
    id: "TH003",
    threadId: "T004",
    title: "Single perpetrator or organized group targeted paperboys in Des Moines metro",
    status: "under_review",
    author: "geo_profiler",
    supportingEvidence: ["E010", "E011", "E022"],
    contradictingEvidence: [],
    unaccountedEvidence: [],
    summary: "Three boys, same metro area, 1982-1986. Two were paperboys on early morning routes. John Walsh stated publicly he 'always believed there was a serial pedophile kidnapper in that area.' The consistent victim profile (young male, alone, early morning), geographic clustering, and 2-year interval suggest a single actor or coordinated group with a specific MO targeting vulnerable children on predictable routes.",
    counterArguments: [
      "Marc Allen was not a paperboy — MO inconsistency",
      "No physical evidence links the cases",
      "Police investigated and did not connect them",
      "Confirmation bias — disappearances in a metro area may be coincidental",
    ],
    supportVotes: 22,
    challengeVotes: 4,
    confidence: 0.61,
    createdAt: "2025-10-28",
  },
  {
    id: "TH004",
    threadId: "T001",
    title: "Johnny was surveilled prior to September 5 and the abduction was premeditated",
    status: "under_review",
    author: "pattern_watch",
    supportingEvidence: ["E003", "E004"],
    contradictingEvidence: [],
    unaccountedEvidence: ["E001"],
    summary: "Multiple witnesses saw different men interacting with Johnny that morning. Noreen stated 'They were organized.' The speed of the abduction — seconds — and the use of a vehicle positioned near the drop point suggests advance knowledge of Johnny's route, schedule, and the fact that he would be alone that morning. The critical question: how did they know Johnny's father would not accompany him?",
    counterArguments: [
      "Paperboy routes and schedules were semi-public knowledge",
      "Could have been opportunistic by someone who regularly observed the route",
      "No evidence of prior surveillance has been documented",
    ],
    supportVotes: 18,
    challengeVotes: 3,
    confidence: 0.55,
    createdAt: "2025-11-06",
  },
  {
    id: "TH005",
    threadId: "T006",
    title: "The 1997 visit occurred but the visitor may not have been Johnny",
    status: "under_review",
    author: "skeptic_prime",
    supportingEvidence: ["E016"],
    contradictingEvidence: [],
    unaccountedEvidence: ["E017"],
    summary: "John Gosch Sr. has publicly expressed doubt. After 15 years of desperate searching, Noreen's desire to believe could have been exploited by someone impersonating Johnny. A middle-of-the-night visit with an unidentified male companion, no physical evidence, and no follow-up contact is consistent with manipulation by someone who knew enough about the case to be convincing.",
    counterArguments: [
      "A mother would likely recognize her own son",
      "Noreen is an experienced investigator of this case — not easily fooled",
      "Bonacci independently claims knowledge of the visit",
      "What would be the motive for impersonation?",
    ],
    supportVotes: 11,
    challengeVotes: 13,
    confidence: 0.28,
    createdAt: "2026-01-15",
  },
];

const CROSS_CASE_ALERTS = [
  {
    id: "CC001",
    status: "pending",
    matchType: "geographic_proximity",
    confidence: 0.87,
    caseA: "Disappearance of Johnny Gosch",
    caseB: "Disappearance of Eugene Martin",
    entityA: "Newspaper drop point, West Des Moines",
    entityB: "Eugene Martin last seen location",
    detail: "Both disappearance locations within 8.2 miles. Both victims were Des Moines Register paperboys on early morning routes. Temporal gap: 23 months.",
    suggestedAction: "Overlay both routes on map. Compare witness descriptions of vehicles and suspects.",
  },
  {
    id: "CC002",
    status: "pending",
    matchType: "mo_similarity",
    confidence: 0.79,
    caseA: "Disappearance of Johnny Gosch",
    caseB: "Disappearance of Marc Allen",
    entityA: "Abduction MO — Gosch",
    entityB: "Disappearance circumstances — Allen",
    detail: "Young male, alone, disappeared in daylight in Des Moines metro. 3.5-year gap. Allen was not a paperboy but was walking alone to a friend's house. Age profile consistent (12-13).",
    suggestedAction: "Compare geographic profiles. Check if Allen's route intersected with known Gosch or Martin evidence locations.",
  },
  {
    id: "CC003",
    status: "pending",
    matchType: "same_name",
    confidence: 0.63,
    caseA: "Disappearance of Johnny Gosch",
    caseB: "Franklin Credit Union Scandal",
    entityA: "Paul Bonacci (witness/claimant)",
    entityB: "Paul Bonacci (defendant/witness)",
    detail: "Same individual appears in both cases. In Gosch: claims direct knowledge of abduction. In Franklin: central witness to abuse allegations. Grand jury called Franklin allegations a hoax; senator's affidavit says Bonacci was truthful. Perjury charges filed then dismissed.",
    suggestedAction: "Build complete Bonacci timeline across both cases. Identify every verifiable claim and test each independently.",
  },
];

const SOLVE_METRICS = {
  totalEvidence: 22,
  totalQuestions: 38,
  questionsResolved: 8,
  questionsInProgress: 12,
  activeThreads: 7,
  theories: 5,
  crossCaseAlerts: 3,
  contributors: 34,
  contributionsThisWeek: 11,
  daysActive: 147,
};

// ============================================================================
// COMPONENTS
// ============================================================================

const TABS = ["dashboard", "threads", "theories", "crosscase", "dossier"];

function priorityColor(p) {
  return { critical: "#ef4444", high: "#f59e0b", medium: "#3b82f6", low: "#6b7280" }[p] || "#6b7280";
}

function ProgressBar({ pct, color, height = 4 }) {
  return (
    <div style={{ height, background: "#1e2028", borderRadius: height / 2, overflow: "hidden", width: "100%" }}>
      <div style={{ height: "100%", width: `${Math.max(pct, 1)}%`, background: color || "#3b82f6", borderRadius: height / 2, transition: "width 0.3s ease" }} />
    </div>
  );
}

function Badge({ children, color }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
      color: color, border: `1px solid ${color}33`, background: `${color}11`,
      borderRadius: 3, padding: "2px 7px",
    }}>{children}</span>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#4b5563", textTransform: "uppercase", marginBottom: 10, marginTop: 20 }}>{children}</div>
  );
}

// ============================================================================
// DASHBOARD — The nerve center
// ============================================================================

function DashboardView() {
  const m = SOLVE_METRICS;
  const resolvePct = Math.round((m.questionsResolved / m.totalQuestions) * 100);

  return (
    <div style={{ padding: "24px 28px", overflowY: "auto", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#f3f4f6", margin: 0 }}>Disappearance of Johnny Gosch</h2>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Case Status: Open / Cold · Investigation active for {m.daysActive} days on this platform</div>
      </div>

      {/* Solve progress */}
      <div style={{ background: "#12141a", border: "1px solid #1e2028", borderRadius: 8, padding: "20px 24px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#4b5563", textTransform: "uppercase" }}>Investigation Progress</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Questions answered / total open investigative questions</div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#f3f4f6", fontFamily: "'JetBrains Mono', monospace" }}>
            {resolvePct}<span style={{ fontSize: 14, color: "#4b5563" }}>%</span>
          </div>
        </div>
        <ProgressBar pct={resolvePct} color="#3b82f6" height={6} />
        <div style={{ display: "flex", gap: 24, marginTop: 14 }}>
          {[
            { label: "Resolved", value: m.questionsResolved, color: "#22c55e" },
            { label: "In Progress", value: m.questionsInProgress, color: "#f59e0b" },
            { label: "Open", value: m.totalQuestions - m.questionsResolved - m.questionsInProgress, color: "#ef4444" },
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
              <span style={{ fontSize: 11, color: "#9ca3af" }}>{s.value} {s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Key metrics grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Evidence Entries", value: m.totalEvidence, icon: "📄" },
          { label: "Active Threads", value: m.activeThreads, icon: "🔍" },
          { label: "Theories", value: m.theories, icon: "💡" },
          { label: "Cross-Case Alerts", value: m.crossCaseAlerts, icon: "🔗", color: "#ef4444" },
          { label: "Contributors", value: m.contributors, icon: "👤" },
          { label: "This Week", value: m.contributionsThisWeek, icon: "📥" },
          { label: "Open Questions", value: m.totalQuestions - m.questionsResolved, icon: "❓" },
          { label: "Days Active", value: m.daysActive, icon: "📅" },
        ].map((s, i) => (
          <div key={i} style={{
            background: "#12141a", border: "1px solid #1e2028", borderRadius: 6,
            padding: "14px 16px",
          }}>
            <div style={{ fontSize: 11, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color || "#f3f4f6", fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</div>
            <div style={{ fontSize: 10, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Thread status */}
      <SectionLabel>Investigation Threads — Priority Order</SectionLabel>
      {THREADS.filter(t => t.priority === "critical").concat(THREADS.filter(t => t.priority !== "critical")).slice(0, 5).map(t => (
        <div key={t.id} style={{
          background: "#12141a", border: "1px solid #1e2028", borderRadius: 6,
          padding: "12px 16px", marginBottom: 6,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: "#4b5563", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{t.id}</span>
              <Badge color={priorityColor(t.priority)}>{t.priority}</Badge>
            </div>
            <span style={{ fontSize: 11, color: "#4b5563" }}>{t.progressPct}%</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb", marginBottom: 8 }}>{t.title}</div>
          <ProgressBar pct={t.progressPct} color={priorityColor(t.priority)} />
          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            <span style={{ fontSize: 10, color: "#6b7280" }}>{t.resolvedQuestions}/{t.openQuestions + t.resolvedQuestions} questions</span>
            <span style={{ fontSize: 10, color: "#6b7280" }}>{t.contributions} contributions</span>
            <span style={{ fontSize: 10, color: "#6b7280" }}>{t.theories} theories</span>
            <span style={{ fontSize: 10, color: "#4b5563" }}>{t.lastActivity}</span>
          </div>
        </div>
      ))}

      {/* Cross-case alerts */}
      {CROSS_CASE_ALERTS.length > 0 && (
        <>
          <SectionLabel>Cross-Case Alerts — Requiring Review</SectionLabel>
          {CROSS_CASE_ALERTS.map(a => (
            <div key={a.id} style={{
              background: "#ef444408", border: "1px solid #ef444422", borderRadius: 6,
              padding: "12px 16px", marginBottom: 6,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <Badge color="#ef4444">{a.matchType.replace(/_/g, " ")}</Badge>
                <span style={{ fontSize: 11, color: "#ef4444", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{Math.round(a.confidence * 100)}% match</span>
              </div>
              <div style={{ fontSize: 12, color: "#fca5a5", lineHeight: 1.5, marginBottom: 4 }}>
                <strong>{a.caseA}</strong> ↔ <strong>{a.caseB}</strong>
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>{a.detail}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ============================================================================
// THREADS VIEW
// ============================================================================

function ThreadsView({ selectedThreadId, setSelectedThreadId }) {
  const selected = THREADS.find(t => t.id === selectedThreadId);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ width: 400, borderRight: "1px solid #1e2028", overflowY: "auto", padding: "12px" }}>
        <div style={{ padding: "8px 4px", marginBottom: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f3f4f6", margin: 0 }}>Investigation Threads</h2>
          <p style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>Each thread is a focused line of investigation. Multiple threads run in parallel.</p>
        </div>
        {THREADS.map(t => (
          <div key={t.id} onClick={() => setSelectedThreadId(t.id)} style={{
            background: selectedThreadId === t.id ? "#1a1d23" : "#12141a",
            border: `1px solid ${selectedThreadId === t.id ? "#3b82f655" : "#1e2028"}`,
            borderRadius: 6, padding: "12px 14px", marginBottom: 6, cursor: "pointer",
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: "#4b5563", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{t.id}</span>
              <Badge color={priorityColor(t.priority)}>{t.priority}</Badge>
              {t.status === "new" && <Badge color="#a78bfa">NEW</Badge>}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb", lineHeight: 1.35, marginBottom: 8 }}>{t.title}</div>
            <ProgressBar pct={t.progressPct} color={priorityColor(t.priority)} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <span style={{ fontSize: 10, color: "#6b7280" }}>{t.openQuestions} open / {t.resolvedQuestions} resolved</span>
              <span style={{ fontSize: 10, color: "#4b5563" }}>{t.lastActivity}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {!selected ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#374151", fontSize: 14, fontStyle: "italic" }}>
            Select an investigation thread to view details
          </div>
        ) : (
          <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "#4b5563", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{selected.id}</span>
              <Badge color={priorityColor(selected.priority)}>{selected.priority}</Badge>
              <Badge color={selected.status === "active" ? "#22c55e" : "#f59e0b"}>{selected.status}</Badge>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#f3f4f6", margin: "0 0 6px 0", lineHeight: 1.3 }}>{selected.title}</h2>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>Lead: {selected.lead}</div>

            <div style={{ fontSize: 13, color: "#d1d5db", lineHeight: 1.65, borderLeft: "2px solid #1e2028", paddingLeft: 14, marginBottom: 20 }}>
              {selected.description}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
              {[
                { label: "Open Questions", value: selected.openQuestions, color: "#f59e0b" },
                { label: "Resolved", value: selected.resolvedQuestions, color: "#22c55e" },
                { label: "Contributions", value: selected.contributions, color: "#3b82f6" },
                { label: "Theories", value: selected.theories, color: "#a78bfa" },
              ].map((s, i) => (
                <div key={i} style={{ background: "#12141a", border: "1px solid #1e2028", borderRadius: 6, padding: "12px", textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <SectionLabel>Progress</SectionLabel>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "#6b7280" }}>Thread completion</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#f3f4f6", fontFamily: "'JetBrains Mono', monospace" }}>{selected.progressPct}%</span>
              </div>
              <ProgressBar pct={selected.progressPct} color={priorityColor(selected.priority)} height={6} />
            </div>

            <SectionLabel>Linked Evidence</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 20 }}>
              {selected.evidenceIds.map(id => (
                <span key={id} style={{
                  fontSize: 11, background: "#3b82f611", border: "1px solid #3b82f633",
                  borderRadius: 3, padding: "4px 10px", color: "#60a5fa",
                  fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                }}>{id}</span>
              ))}
            </div>

            <SectionLabel>Tags</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 20 }}>
              {selected.tags.map(tag => (
                <span key={tag} style={{
                  fontSize: 10, background: "#1a1d23", border: "1px solid #1e2028",
                  borderRadius: 3, padding: "3px 9px", color: "#9ca3af",
                }}>{tag}</span>
              ))}
            </div>

            {/* Related theories */}
            {THEORIES.filter(th => th.threadId === selected.id).length > 0 && (
              <>
                <SectionLabel>Theories in this thread</SectionLabel>
                {THEORIES.filter(th => th.threadId === selected.id).map(th => (
                  <div key={th.id} style={{
                    background: "#12141a", border: "1px solid #1e2028", borderRadius: 6,
                    padding: "12px 14px", marginBottom: 6,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: "#4b5563", fontFamily: "'JetBrains Mono', monospace" }}>{th.id}</span>
                      <span style={{ fontSize: 11, color: th.confidence > 0.5 ? "#22c55e" : th.confidence > 0.3 ? "#f59e0b" : "#ef4444", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                        {Math.round(th.confidence * 100)}% confidence
                      </span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb", lineHeight: 1.35, marginBottom: 6 }}>{th.title}</div>
                    <div style={{ display: "flex", gap: 12 }}>
                      <span style={{ fontSize: 10, color: "#22c55e" }}>▲ {th.supportVotes}</span>
                      <span style={{ fontSize: 10, color: "#ef4444" }}>▼ {th.challengeVotes}</span>
                      <span style={{ fontSize: 10, color: "#6b7280" }}>by {th.author}</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// THEORIES VIEW — Adversarial review system
// ============================================================================

function TheoriesView({ selectedTheoryId, setSelectedTheoryId }) {
  const selected = THEORIES.find(t => t.id === selectedTheoryId);
  const sorted = [...THEORIES].sort((a, b) => b.confidence - a.confidence);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ width: 400, borderRight: "1px solid #1e2028", overflowY: "auto", padding: "12px" }}>
        <div style={{ padding: "8px 4px", marginBottom: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f3f4f6", margin: 0 }}>Theories Under Review</h2>
          <p style={{ fontSize: 11, color: "#6b7280", marginTop: 4, lineHeight: 1.5 }}>
            Every theory is challenged. Supporting and contradicting evidence is tracked. Confidence scores reflect community-weighted consensus.
          </p>
        </div>
        {sorted.map(th => (
          <div key={th.id} onClick={() => setSelectedTheoryId(th.id)} style={{
            background: selectedTheoryId === th.id ? "#1a1d23" : "#12141a",
            border: `1px solid ${selectedTheoryId === th.id ? "#3b82f655" : "#1e2028"}`,
            borderRadius: 6, padding: "12px 14px", marginBottom: 6, cursor: "pointer",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: "#4b5563", fontFamily: "'JetBrains Mono', monospace" }}>{th.id}</span>
              <div style={{
                fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                color: th.confidence > 0.5 ? "#22c55e" : th.confidence > 0.3 ? "#f59e0b" : "#ef4444",
              }}>
                {Math.round(th.confidence * 100)}%
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#e5e7eb", lineHeight: 1.35, marginBottom: 6 }}>{th.title}</div>
            <ProgressBar pct={th.confidence * 100} color={th.confidence > 0.5 ? "#22c55e" : th.confidence > 0.3 ? "#f59e0b" : "#ef4444"} />
            <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
              <span style={{ fontSize: 10, color: "#22c55e" }}>▲ {th.supportVotes}</span>
              <span style={{ fontSize: 10, color: "#ef4444" }}>▼ {th.challengeVotes}</span>
              <span style={{ fontSize: 10, color: "#6b7280" }}>{th.supportingEvidence.length} supporting</span>
              <span style={{ fontSize: 10, color: "#6b7280" }}>{th.contradictingEvidence.length} contradicting</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {!selected ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#374151", fontSize: 14, fontStyle: "italic" }}>
            Select a theory to review evidence for and against
          </div>
        ) : (
          <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "#4b5563", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{selected.id}</span>
              <Badge color="#a78bfa">{selected.status.replace(/_/g, " ")}</Badge>
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: "#f3f4f6", margin: "0 0 4px 0", lineHeight: 1.35 }}>{selected.title}</h2>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 16 }}>
              Proposed by <span style={{ color: "#9ca3af" }}>{selected.author}</span> on {selected.createdAt}
              <span style={{ margin: "0 8px", color: "#1e2028" }}>·</span>
              Thread: {THREADS.find(t => t.id === selected.threadId)?.title}
            </div>

            {/* Confidence meter */}
            <div style={{
              background: "#12141a", border: "1px solid #1e2028", borderRadius: 8,
              padding: "16px 20px", marginBottom: 20, textAlign: "center",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#4b5563", textTransform: "uppercase", marginBottom: 8 }}>Community Confidence</div>
              <div style={{
                fontSize: 36, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                color: selected.confidence > 0.5 ? "#22c55e" : selected.confidence > 0.3 ? "#f59e0b" : "#ef4444",
              }}>
                {Math.round(selected.confidence * 100)}%
              </div>
              <ProgressBar pct={selected.confidence * 100} color={selected.confidence > 0.5 ? "#22c55e" : selected.confidence > 0.3 ? "#f59e0b" : "#ef4444"} height={6} />
              <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 10 }}>
                <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>▲ {selected.supportVotes} support</span>
                <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 600 }}>▼ {selected.challengeVotes} challenge</span>
              </div>
            </div>

            {/* Theory summary */}
            <SectionLabel>Theory Statement</SectionLabel>
            <div style={{ fontSize: 13, color: "#d1d5db", lineHeight: 1.65, borderLeft: "2px solid #3b82f633", paddingLeft: 14, marginBottom: 20 }}>
              {selected.summary}
            </div>

            {/* Evidence balance */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#22c55e", textTransform: "uppercase", marginBottom: 8 }}>Supporting Evidence</div>
                {selected.supportingEvidence.map(id => (
                  <div key={id} style={{
                    fontSize: 11, background: "#22c55e08", border: "1px solid #22c55e22",
                    borderRadius: 4, padding: "6px 10px", marginBottom: 4, color: "#86efac",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>{id}</div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#ef4444", textTransform: "uppercase", marginBottom: 8 }}>Contradicting Evidence</div>
                {selected.contradictingEvidence.length === 0 ? (
                  <div style={{ fontSize: 11, color: "#374151", fontStyle: "italic" }}>None yet</div>
                ) : selected.contradictingEvidence.map(id => (
                  <div key={id} style={{
                    fontSize: 11, background: "#ef444408", border: "1px solid #ef444422",
                    borderRadius: 4, padding: "6px 10px", marginBottom: 4, color: "#fca5a5",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>{id}</div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#f59e0b", textTransform: "uppercase", marginBottom: 8 }}>Unaccounted Evidence</div>
                {selected.unaccountedEvidence.length === 0 ? (
                  <div style={{ fontSize: 11, color: "#374151", fontStyle: "italic" }}>None</div>
                ) : selected.unaccountedEvidence.map(id => (
                  <div key={id} style={{
                    fontSize: 11, background: "#f59e0b08", border: "1px solid #f59e0b22",
                    borderRadius: 4, padding: "6px 10px", marginBottom: 4, color: "#fbbf24",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>{id}</div>
                ))}
              </div>
            </div>

            {/* Counter-arguments — THE ADVERSARIAL LAYER */}
            <SectionLabel>Counter-Arguments (Devil's Advocate)</SectionLabel>
            <div style={{
              background: "#ef444406", border: "1px solid #ef444418", borderRadius: 6,
              padding: "14px 16px", marginBottom: 20,
            }}>
              <div style={{ fontSize: 11, color: "#fca5a5", marginBottom: 10, lineHeight: 1.5 }}>
                Every theory is actively challenged. The following counter-arguments have been raised:
              </div>
              {selected.counterArguments.map((arg, i) => (
                <div key={i} style={{
                  fontSize: 12, color: "#d1d5db", lineHeight: 1.55,
                  padding: "8px 0", borderTop: i > 0 ? "1px solid #ef444412" : "none",
                }}>
                  <span style={{ color: "#ef4444", fontWeight: 700, marginRight: 8 }}>#{i + 1}</span>
                  {arg}
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{
                fontSize: 12, fontWeight: 600, padding: "10px 20px",
                background: "#22c55e18", border: "1px solid #22c55e33",
                borderRadius: 6, color: "#22c55e", cursor: "pointer", fontFamily: "inherit",
              }}>▲ Support with Evidence</button>
              <button style={{
                fontSize: 12, fontWeight: 600, padding: "10px 20px",
                background: "#ef444418", border: "1px solid #ef444433",
                borderRadius: 6, color: "#ef4444", cursor: "pointer", fontFamily: "inherit",
              }}>▼ Challenge with Evidence</button>
              <button style={{
                fontSize: 12, fontWeight: 600, padding: "10px 20px",
                background: "#1a1d23", border: "1px solid #1e2028",
                borderRadius: 6, color: "#9ca3af", cursor: "pointer", fontFamily: "inherit",
              }}>Fork Theory</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// CROSS-CASE VIEW
// ============================================================================

function CrossCaseView() {
  return (
    <div style={{ padding: "24px 28px", overflowY: "auto", maxWidth: 800, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#f3f4f6", margin: 0 }}>Cross-Case Detection Engine</h2>
        <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4, lineHeight: 1.6 }}>
          When entities from one case match entities in another — same person, same vehicle, same location, similar MO — the system flags it here. These connections are how cases get solved. Every match below needs human review to confirm or dismiss.
        </p>
      </div>

      {CROSS_CASE_ALERTS.map(a => (
        <div key={a.id} style={{
          background: "#12141a", border: "1px solid #ef444422", borderRadius: 8,
          padding: "16px 20px", marginBottom: 12,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "#4b5563", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{a.id}</span>
              <Badge color="#ef4444">{a.matchType.replace(/_/g, " ")}</Badge>
              <Badge color={a.status === "pending" ? "#f59e0b" : "#22c55e"}>{a.status}</Badge>
            </div>
            <div style={{
              fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
              color: a.confidence > 0.8 ? "#ef4444" : a.confidence > 0.6 ? "#f59e0b" : "#6b7280",
            }}>
              {Math.round(a.confidence * 100)}%
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}>
            <div style={{ flex: 1, background: "#0a0b0e", border: "1px solid #1e2028", borderRadius: 6, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Case A</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#e5e7eb", marginBottom: 2 }}>{a.caseA}</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>{a.entityA}</div>
            </div>
            <div style={{ fontSize: 18, color: "#ef4444", fontWeight: 700, flexShrink: 0 }}>↔</div>
            <div style={{ flex: 1, background: "#0a0b0e", border: "1px solid #1e2028", borderRadius: 6, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Case B</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#e5e7eb", marginBottom: 2 }}>{a.caseB}</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>{a.entityB}</div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: "#d1d5db", lineHeight: 1.55, marginBottom: 12, borderLeft: "2px solid #ef444433", paddingLeft: 12 }}>
            {a.detail}
          </div>

          <div style={{
            background: "#f59e0b08", border: "1px solid #f59e0b22", borderRadius: 4,
            padding: "8px 12px", marginBottom: 12,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Suggested Action</div>
            <div style={{ fontSize: 12, color: "#fbbf24", lineHeight: 1.5 }}>{a.suggestedAction}</div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button style={{
              fontSize: 12, fontWeight: 600, padding: "8px 18px",
              background: "#22c55e18", border: "1px solid #22c55e33",
              borderRadius: 5, color: "#22c55e", cursor: "pointer", fontFamily: "inherit",
            }}>Confirm Match</button>
            <button style={{
              fontSize: 12, fontWeight: 600, padding: "8px 18px",
              background: "#ef444418", border: "1px solid #ef444433",
              borderRadius: 5, color: "#ef4444", cursor: "pointer", fontFamily: "inherit",
            }}>False Positive</button>
            <button style={{
              fontSize: 12, fontWeight: 600, padding: "8px 18px",
              background: "#1a1d23", border: "1px solid #1e2028",
              borderRadius: 5, color: "#9ca3af", cursor: "pointer", fontFamily: "inherit",
            }}>Investigate Further</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// DOSSIER VIEW — Law enforcement output
// ============================================================================

function DossierView() {
  const sections = [
    {
      title: "Executive Summary",
      status: "draft",
      completeness: 35,
      desc: "One-page overview of the case, platform findings, and recommended next steps for law enforcement.",
    },
    {
      title: "New Witness Leads",
      status: "in_progress",
      completeness: 20,
      desc: "Witnesses identified or re-identified through the platform who may not have been interviewed or whose statements warrant re-examination.",
    },
    {
      title: "Vehicle Analysis",
      status: "not_started",
      completeness: 0,
      desc: "Compiled analysis of the blue two-toned car: candidate makes/models, registration cross-references if available.",
    },
    {
      title: "Cross-Case Connection Report",
      status: "in_progress",
      completeness: 45,
      desc: "Documented connections between Gosch, Martin, and Allen cases with supporting evidence and geographic analysis.",
    },
    {
      title: "Bonacci Claims — Evidence Scorecard",
      status: "in_progress",
      completeness: 30,
      desc: "Every verifiable claim by Paul Bonacci, rated confirmed/contradicted/untested, with source citations for each.",
    },
    {
      title: "Recommended Investigative Actions",
      status: "draft",
      completeness: 15,
      desc: "Specific, actionable steps that law enforcement could take today based on platform findings. FOIA requests, re-interviews, record searches.",
    },
    {
      title: "Evidence Index with Source Chain",
      status: "in_progress",
      completeness: 60,
      desc: "Complete index of every piece of evidence in the platform's repository with full source attribution and confidence ratings.",
    },
    {
      title: "Timeline Reconstruction",
      status: "in_progress",
      completeness: 40,
      desc: "Minute-by-minute reconstruction of September 5, 1982, and chronological case history through 2026.",
    },
  ];

  const overall = Math.round(sections.reduce((sum, s) => sum + s.completeness, 0) / sections.length);

  return (
    <div style={{ padding: "24px 28px", overflowY: "auto", maxWidth: 800, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#f3f4f6", margin: 0 }}>Law Enforcement Dossier</h2>
        <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4, lineHeight: 1.6 }}>
          This is the output that matters. Everything the platform produces is compiled into a structured, cite-every-source dossier that a detective can pick up and act on. This document is the bridge between citizen investigation and official action.
        </p>
      </div>

      <div style={{
        background: "#12141a", border: "1px solid #1e2028", borderRadius: 8,
        padding: "16px 20px", marginBottom: 24,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f3f4f6" }}>Dossier: Disappearance of Johnny Gosch</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Target recipient: West Des Moines PD / Iowa DCI / FBI</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#f3f4f6", fontFamily: "'JetBrains Mono', monospace" }}>{overall}%</div>
            <div style={{ fontSize: 9, color: "#4b5563", textTransform: "uppercase" }}>Complete</div>
          </div>
        </div>
        <ProgressBar pct={overall} color="#3b82f6" height={6} />
      </div>

      <div style={{
        background: "#f59e0b08", border: "1px solid #f59e0b22", borderRadius: 6,
        padding: "12px 16px", marginBottom: 24, fontSize: 12, color: "#fbbf24", lineHeight: 1.6,
      }}>
        <strong>Quality standard:</strong> Every claim in this dossier must cite its source. Every source must be independently retrievable. Speculation is excluded. Confidence levels are stated explicitly. The goal is a document a detective trusts enough to act on.
      </div>

      {sections.map((s, i) => (
        <div key={i} style={{
          background: "#12141a", border: "1px solid #1e2028", borderRadius: 6,
          padding: "14px 18px", marginBottom: 8,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
            <div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>{i + 1}. {s.title}</span>
                <Badge color={
                  s.status === "not_started" ? "#6b7280" :
                  s.status === "draft" ? "#f59e0b" :
                  s.status === "in_progress" ? "#3b82f6" : "#22c55e"
                }>
                  {s.status.replace(/_/g, " ")}
                </Badge>
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.5 }}>{s.desc}</div>
            </div>
            <span style={{
              fontSize: 12, fontWeight: 700, color: "#f3f4f6",
              fontFamily: "'JetBrains Mono', monospace", flexShrink: 0, marginLeft: 12,
            }}>{s.completeness}%</span>
          </div>
          <ProgressBar pct={s.completeness} color={
            s.completeness === 0 ? "#374151" :
            s.completeness < 30 ? "#ef4444" :
            s.completeness < 60 ? "#f59e0b" : "#22c55e"
          } />
        </div>
      ))}

      <div style={{ marginTop: 24, display: "flex", gap: 8 }}>
        <button style={{
          fontSize: 13, fontWeight: 700, padding: "12px 24px",
          background: "#3b82f6", color: "#fff", border: "none",
          borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
        }}>Export Dossier (PDF)</button>
        <button style={{
          fontSize: 13, padding: "12px 24px",
          background: "none", border: "1px solid #1e2028",
          borderRadius: 6, color: "#6b7280", cursor: "pointer", fontFamily: "inherit",
        }}>Preview as LE would receive it</button>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN
// ============================================================================

export default function Layer3() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [selectedTheoryId, setSelectedTheoryId] = useState(null);

  return (
    <div style={{
      fontFamily: "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif",
      background: "#0a0b0e", color: "#d1d5db",
      height: "100vh", display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{
        padding: "12px 20px", borderBottom: "1px solid #1e2028",
        background: "#0d0e12", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0,
      }}>
        <div>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "#ef4444", textTransform: "uppercase" }}>LAYER 3</span>
          <span style={{ fontSize: 10, color: "#1e2028", margin: "0 8px" }}>│</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#f3f4f6" }}>Investigation Engine</span>
        </div>
        <div style={{ fontSize: 11, color: "#4b5563" }}>Case: Johnny Gosch · Active</div>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", borderBottom: "1px solid #1e2028",
        background: "#0d0e12", flexShrink: 0,
      }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: "10px 18px", fontSize: 11, fontWeight: 600,
            letterSpacing: "0.06em", textTransform: "uppercase",
            background: "none", border: "none", cursor: "pointer",
            color: activeTab === tab ? "#f3f4f6" : "#4b5563",
            borderBottom: activeTab === tab ? "2px solid #3b82f6" : "2px solid transparent",
            fontFamily: "inherit",
          }}>
            {tab === "crosscase" ? "Cross-Case" : tab === "dossier" ? "LE Dossier" : tab}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "hidden" }}>
        {activeTab === "dashboard" && <DashboardView />}
        {activeTab === "threads" && <ThreadsView selectedThreadId={selectedThreadId} setSelectedThreadId={setSelectedThreadId} />}
        {activeTab === "theories" && <TheoriesView selectedTheoryId={selectedTheoryId} setSelectedTheoryId={setSelectedTheoryId} />}
        {activeTab === "crosscase" && <CrossCaseView />}
        {activeTab === "dossier" && <DossierView />}
      </div>
    </div>
  );
}
