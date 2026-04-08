import { useState, useMemo } from "react";

// ============================================================================
// MOCK DATA — Simulates what the backend would serve
// ============================================================================

const SKILL_LABELS = {
  geolocation: "Geolocation",
  vehicle_identification: "Vehicle ID",
  facial_comparison: "Facial Comparison",
  local_knowledge: "Local Knowledge",
  document_analysis: "Document Analysis",
  osint: "OSINT Research",
  forensic_accounting: "Forensic Accounting",
  language_translation: "Translation",
  handwriting_analysis: "Handwriting",
  audio_analysis: "Audio Analysis",
  medical_knowledge: "Medical",
  legal_knowledge: "Legal",
  law_enforcement: "Law Enforcement",
  digital_forensics: "Digital Forensics",
  genealogy: "Genealogy",
  general: "General Research",
};

const PROFESSIONS = [
  "Law Enforcement", "Military", "Legal / Attorney", "Medical / Nursing",
  "Pharmacy", "Accounting / Finance", "IT / Software", "Journalism",
  "Education", "Social Work", "Construction / Trades", "Automotive / Mechanic",
  "Real Estate", "Retail / Service", "Government", "Transportation / Logistics",
  "Agriculture", "Other",
];

const MOCK_USER = {
  id: "u-001",
  displayName: "",
  skills: [],
  geoHistory: [],
  professions: [],
  hobbies: "",
  languages: ["English"],
  reputationScore: 0,
  contributionsTotal: 0,
  contributionsAccepted: 0,
};

const MOCK_TASKS = [
  {
    id: "Q001",
    caseTitle: "Disappearance of Johnny Gosch",
    caseSlug: "johnny-gosch",
    evidenceCode: "E003",
    question: "Can the blue two-toned car described by witness 'Mike' be matched to a specific make, model, and year based on cars available in the Iowa market in 1982?",
    priority: "critical",
    requiredSkills: ["vehicle_identification"],
    relevantLocation: "West Des Moines, Iowa",
    relevantDateStart: "1982-09-05",
    relevantDateEnd: "1982-09-05",
    matchReason: "vehicle_identification",
    assignedCount: 3,
    contributionCount: 1,
  },
  {
    id: "Q002",
    caseTitle: "Disappearance of Johnny Gosch",
    caseSlug: "johnny-gosch",
    evidenceCode: "E002",
    question: "Can anyone who lived in West Des Moines in 1982 identify the exact newspaper drop location used by Des Moines Register carriers on Marcourt Lane / the surrounding area?",
    priority: "high",
    requiredSkills: ["local_knowledge"],
    relevantLocation: "West Des Moines, Iowa",
    relevantDateStart: "1980-01-01",
    relevantDateEnd: "1985-12-31",
    matchReason: "geographic_match",
    assignedCount: 0,
    contributionCount: 0,
  },
  {
    id: "Q003",
    caseTitle: "Disappearance of Johnny Gosch",
    caseSlug: "johnny-gosch",
    evidenceCode: "E005",
    question: "Map Johnny Gosch's exact paper route as of September 1982. Which streets, in what order? Identify every residence and business along the route.",
    priority: "high",
    requiredSkills: ["local_knowledge", "osint"],
    relevantLocation: "West Des Moines, Iowa",
    relevantDateStart: "1980-01-01",
    relevantDateEnd: "1985-12-31",
    matchReason: "geographic_match",
    assignedCount: 2,
    contributionCount: 1,
  },
  {
    id: "Q004",
    caseTitle: "Disappearance of Johnny Gosch",
    caseSlug: "johnny-gosch",
    evidenceCode: "E018",
    question: "Has modern facial recognition or age-regression technology been applied to the unidentified boy in the 2006 photographs found on Noreen Gosch's doorstep?",
    priority: "high",
    requiredSkills: ["facial_comparison", "digital_forensics"],
    relevantLocation: null,
    matchReason: "skill_match",
    assignedCount: 1,
    contributionCount: 0,
  },
  {
    id: "Q005",
    caseTitle: "Disappearance of Johnny Gosch",
    caseSlug: "johnny-gosch",
    evidenceCode: "E012",
    question: "Locate and compile the full court transcripts from Paul Bonacci's testimony regarding the Gosch case. Cross-reference every factual claim he made against verifiable records.",
    priority: "critical",
    requiredSkills: ["document_analysis", "legal_knowledge"],
    relevantLocation: null,
    matchReason: "skill_match",
    assignedCount: 1,
    contributionCount: 0,
  },
  {
    id: "Q006",
    caseTitle: "Disappearance of Johnny Gosch",
    caseSlug: "johnny-gosch",
    evidenceCode: "E019",
    question: "Access the Hillsborough County, Florida sheriff's office records from the late 1970s photo investigation. Identify the three boys who were identified and determine if interviews can be located.",
    priority: "high",
    requiredSkills: ["osint", "document_analysis"],
    relevantLocation: "Hillsborough County, Florida",
    matchReason: "skill_match",
    assignedCount: 0,
    contributionCount: 0,
  },
  {
    id: "Q007",
    caseTitle: "Disappearance of Johnny Gosch",
    caseSlug: "johnny-gosch",
    evidenceCode: "E010",
    question: "Compile a geographic profile across the Gosch, Martin, and Allen disappearances. Map exact locations and overlay with sex offender registry data from that era if obtainable.",
    priority: "critical",
    requiredSkills: ["osint", "geolocation"],
    relevantLocation: "Des Moines, Iowa",
    matchReason: "skill_match",
    assignedCount: 2,
    contributionCount: 0,
  },
  {
    id: "Q008",
    caseTitle: "Disappearance of Johnny Gosch",
    caseSlug: "johnny-gosch",
    evidenceCode: "E020",
    question: "Research John David Norman's full criminal record and known whereabouts in 1982. Was he in Iowa or connected to anyone in the Des Moines area?",
    priority: "high",
    requiredSkills: ["osint", "document_analysis"],
    relevantLocation: null,
    matchReason: "skill_match",
    assignedCount: 0,
    contributionCount: 0,
  },
  {
    id: "Q009",
    caseTitle: "Disappearance of Johnny Gosch",
    caseSlug: "johnny-gosch",
    evidenceCode: "E009",
    question: "The Oklahoma sighting (~6 months post-disappearance): identify the city, locate any police report filed, and determine if the anonymous witness was ever formally interviewed by law enforcement.",
    priority: "high",
    requiredSkills: ["osint", "local_knowledge"],
    relevantLocation: "Oklahoma",
    matchReason: "skill_match",
    assignedCount: 0,
    contributionCount: 0,
  },
  {
    id: "Q010",
    caseTitle: "Disappearance of Johnny Gosch",
    caseSlug: "johnny-gosch",
    evidenceCode: "E007",
    question: "Identify the WDMPD officers who responded to the initial call on September 5, 1982. Have any given interviews or public statements in the decades since?",
    priority: "medium",
    requiredSkills: ["osint", "law_enforcement"],
    relevantLocation: "West Des Moines, Iowa",
    matchReason: "skill_match",
    assignedCount: 0,
    contributionCount: 0,
  },
];

// ============================================================================
// COMPONENTS
// ============================================================================

const VIEWS = ["profile", "tasks", "contribute", "reputation"];

function priorityColor(p) {
  return { critical: "#ef4444", high: "#f59e0b", medium: "#3b82f6", low: "#6b7280" }[p] || "#6b7280";
}

function matchReasonLabel(r) {
  return {
    geographic_match: "You lived in this area",
    skill_match: "Matches your skills",
    vehicle_identification: "Matches your skills",
    temporal_match: "You were there during this period",
    profession_match: "Matches your professional background",
  }[r] || "General match";
}

function Pill({ children, active, onClick, color }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 11, padding: "5px 12px", borderRadius: 4,
      border: `1px solid ${active ? (color || "#3b82f6") + "55" : "#1e2028"}`,
      background: active ? (color || "#3b82f6") + "18" : "#12141a",
      color: active ? (color || "#60a5fa") : "#6b7280",
      cursor: "pointer", fontFamily: "inherit", fontWeight: active ? 600 : 400,
      transition: "all 0.1s ease",
    }}>
      {children}
    </button>
  );
}

function Input({ label, value, onChange, placeholder, type = "text", area }) {
  const shared = {
    width: "100%", padding: "8px 10px", fontSize: 12,
    background: "#12141a", border: "1px solid #1e2028",
    borderRadius: 4, color: "#d1d5db", outline: "none",
    fontFamily: "inherit", boxSizing: "border-box",
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#4b5563", textTransform: "uppercase", marginBottom: 6 }}>{label}</label>
      {area ? (
        <textarea value={value} onChange={onChange} placeholder={placeholder} rows={3} style={{ ...shared, resize: "vertical" }} />
      ) : (
        <input type={type} value={value} onChange={onChange} placeholder={placeholder} style={shared} />
      )}
    </div>
  );
}

function SectionHeader({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#4b5563", textTransform: "uppercase", marginBottom: 10, marginTop: 20 }}>
      {children}
    </div>
  );
}

// ============================================================================
// PROFILE VIEW — Onboarding & skill collection
// ============================================================================

function ProfileView({ user, setUser }) {
  const toggleSkill = (s) => {
    setUser(u => ({
      ...u,
      skills: u.skills.includes(s) ? u.skills.filter(x => x !== s) : [...u.skills, s],
    }));
  };
  const toggleProfession = (p) => {
    setUser(u => ({
      ...u,
      professions: u.professions.includes(p) ? u.professions.filter(x => x !== p) : [...u.professions, p],
    }));
  };
  const addGeo = () => {
    setUser(u => ({
      ...u,
      geoHistory: [...u.geoHistory, { city: "", state: "", from: "", to: "" }],
    }));
  };
  const updateGeo = (idx, field, val) => {
    setUser(u => {
      const g = [...u.geoHistory];
      g[idx] = { ...g[idx], [field]: val };
      return { ...u, geoHistory: g };
    });
  };
  const removeGeo = (idx) => {
    setUser(u => ({ ...u, geoHistory: u.geoHistory.filter((_, i) => i !== idx) }));
  };

  const completeness = useMemo(() => {
    let score = 0;
    if (user.displayName) score += 20;
    if (user.skills.length > 0) score += 25;
    if (user.geoHistory.length > 0 && user.geoHistory.some(g => g.city)) score += 30;
    if (user.professions.length > 0) score += 15;
    if (user.languages.length > 1) score += 10;
    return Math.min(score, 100);
  }, [user]);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#f3f4f6", margin: 0 }}>Investigator Profile</h2>
        <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4, lineHeight: 1.5 }}>
          The more you share, the better we can match you to cases and evidence where your knowledge matters most. Everything here is used solely for case matching — never displayed publicly.
        </p>
      </div>

      {/* Completeness bar */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#4b5563", textTransform: "uppercase" }}>Profile Strength</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: completeness === 100 ? "#22c55e" : "#f59e0b", fontFamily: "'JetBrains Mono', monospace" }}>{completeness}%</span>
        </div>
        <div style={{ height: 4, background: "#1e2028", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${completeness}%`, background: completeness === 100 ? "#22c55e" : "#3b82f6", borderRadius: 2, transition: "width 0.3s ease" }} />
        </div>
        {completeness < 50 && (
          <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 6, background: "#f59e0b08", border: "1px solid #f59e0b22", borderRadius: 4, padding: "6px 10px" }}>
            Your geographic history is the most valuable thing you can add. Even partial info helps.
          </div>
        )}
      </div>

      <Input label="Display Name" value={user.displayName} onChange={e => setUser(u => ({ ...u, displayName: e.target.value }))} placeholder="How you'll appear to other investigators" />

      {/* Geographic History — THE MOST IMPORTANT SECTION */}
      <SectionHeader>Geographic History — Where have you lived?</SectionHeader>
      <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 12, marginTop: -4, lineHeight: 1.5 }}>
        This is the single most valuable data you can provide. If you lived near a case location during the relevant time period, you may have knowledge that no one else on this platform has.
      </p>

      {user.geoHistory.map((g, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
          <input placeholder="City" value={g.city} onChange={e => updateGeo(i, "city", e.target.value)} style={{ flex: 2, padding: "7px 10px", fontSize: 12, background: "#12141a", border: "1px solid #1e2028", borderRadius: 4, color: "#d1d5db", outline: "none", fontFamily: "inherit" }} />
          <input placeholder="State" value={g.state} onChange={e => updateGeo(i, "state", e.target.value)} style={{ flex: 1, padding: "7px 10px", fontSize: 12, background: "#12141a", border: "1px solid #1e2028", borderRadius: 4, color: "#d1d5db", outline: "none", fontFamily: "inherit" }} />
          <input placeholder="From" value={g.from} onChange={e => updateGeo(i, "from", e.target.value)} style={{ width: 60, padding: "7px 10px", fontSize: 12, background: "#12141a", border: "1px solid #1e2028", borderRadius: 4, color: "#d1d5db", outline: "none", fontFamily: "inherit", textAlign: "center" }} />
          <span style={{ color: "#374151", fontSize: 12 }}>–</span>
          <input placeholder="To" value={g.to} onChange={e => updateGeo(i, "to", e.target.value)} style={{ width: 60, padding: "7px 10px", fontSize: 12, background: "#12141a", border: "1px solid #1e2028", borderRadius: 4, color: "#d1d5db", outline: "none", fontFamily: "inherit", textAlign: "center" }} />
          <button onClick={() => removeGeo(i)} style={{ background: "none", border: "none", color: "#4b5563", cursor: "pointer", fontSize: 16, padding: "0 4px" }}>×</button>
        </div>
      ))}
      <button onClick={addGeo} style={{
        fontSize: 12, padding: "8px 16px", background: "#12141a",
        border: "1px dashed #1e2028", borderRadius: 4, color: "#6b7280",
        cursor: "pointer", fontFamily: "inherit", width: "100%", marginBottom: 4,
      }}>
        + Add location
      </button>

      {/* Skills */}
      <SectionHeader>Investigative Skills</SectionHeader>
      <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 10, marginTop: -4 }}>
        Select everything that applies. We'll also learn your strengths from your contributions over time.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 4 }}>
        {Object.entries(SKILL_LABELS).map(([key, label]) => (
          <Pill key={key} active={user.skills.includes(key)} onClick={() => toggleSkill(key)}>{label}</Pill>
        ))}
      </div>

      {/* Professional Background */}
      <SectionHeader>Professional Background</SectionHeader>
      <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 10, marginTop: -4 }}>
        Your profession trains your eye. A nurse catches medical details. A mechanic identifies vehicles. Select all that apply across your career.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 4 }}>
        {PROFESSIONS.map(p => (
          <Pill key={p} active={user.professions.includes(p)} onClick={() => toggleProfession(p)}>{p}</Pill>
        ))}
      </div>

      {/* Languages */}
      <SectionHeader>Languages</SectionHeader>
      <Input label="" value={user.languages.join(", ")} onChange={e => setUser(u => ({ ...u, languages: e.target.value.split(",").map(s => s.trim()) }))} placeholder="English, Spanish, Vietnamese..." />

      {/* Hobbies / Niche Knowledge */}
      <SectionHeader>Niche Knowledge & Interests</SectionHeader>
      <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 10, marginTop: -4 }}>
        Anything that gives you specialized pattern recognition: ham radio, tattoo culture, hiking trails, firearms, boating, specific music scenes, local history...
      </p>
      <Input label="" value={user.hobbies} onChange={e => setUser(u => ({ ...u, hobbies: e.target.value }))} placeholder="Describe any niche knowledge areas..." area />
    </div>
  );
}

// ============================================================================
// TASK QUEUE — Matched questions routed to this user
// ============================================================================

function TasksView({ user, onAcceptTask, selectedTaskId, setSelectedTaskId }) {
  const matchedTasks = useMemo(() => {
    return MOCK_TASKS.map(t => {
      let score = 0;
      let reasons = [];

      // Skill match
      const skillOverlap = t.requiredSkills.filter(s => user.skills.includes(s));
      if (skillOverlap.length > 0) {
        score += skillOverlap.length * 30;
        reasons.push(`Skill: ${skillOverlap.map(s => SKILL_LABELS[s]).join(", ")}`);
      }

      // Geographic match
      if (t.relevantLocation) {
        const locParts = t.relevantLocation.toLowerCase().split(",").map(s => s.trim());
        user.geoHistory.forEach(g => {
          const cityMatch = locParts.some(p => g.city.toLowerCase().includes(p) || p.includes(g.city.toLowerCase()));
          const stateMatch = locParts.some(p => g.state.toLowerCase().includes(p) || p.includes(g.state.toLowerCase()));
          if (cityMatch || stateMatch) {
            score += 50;
            reasons.push(`Location: You lived in ${g.city}, ${g.state}`);
            // Temporal overlap
            if (t.relevantDateStart && g.from && g.to) {
              const tStart = parseInt(t.relevantDateStart.substring(0, 4));
              const tEnd = parseInt((t.relevantDateEnd || t.relevantDateStart).substring(0, 4));
              const gFrom = parseInt(g.from);
              const gTo = parseInt(g.to) || 2026;
              if (gFrom <= tEnd && gTo >= tStart) {
                score += 40;
                reasons.push(`Time overlap: ${Math.max(gFrom, tStart)}–${Math.min(gTo, tEnd)}`);
              }
            }
          }
        });
      }

      // Profession match
      if (t.requiredSkills.includes("law_enforcement") && user.professions.includes("Law Enforcement")) {
        score += 20;
        reasons.push("Professional: Law Enforcement background");
      }
      if (t.requiredSkills.includes("legal_knowledge") && user.professions.includes("Legal / Attorney")) {
        score += 20;
        reasons.push("Professional: Legal background");
      }
      if (t.requiredSkills.includes("medical_knowledge") && user.professions.includes("Medical / Nursing")) {
        score += 20;
        reasons.push("Professional: Medical background");
      }

      // Baseline: everyone gets general tasks
      if (score === 0) {
        score = 5;
        reasons.push("Open to all investigators");
      }

      return { ...t, matchScore: score, matchReasons: reasons };
    }).sort((a, b) => b.matchScore - a.matchScore);
  }, [user]);

  const selectedTask = matchedTasks.find(t => t.id === selectedTaskId);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Task list */}
      <div style={{ width: 420, borderRight: "1px solid #1e2028", overflowY: "auto", padding: "12px" }}>
        <div style={{ padding: "8px 4px", marginBottom: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f3f4f6", margin: 0 }}>Your Task Queue</h2>
          <p style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
            {matchedTasks.filter(t => t.matchScore > 5).length} tasks matched to your profile · {matchedTasks.length} total available
          </p>
        </div>

        {matchedTasks.map(t => (
          <div key={t.id} onClick={() => setSelectedTaskId(t.id)} style={{
            background: selectedTaskId === t.id ? "#1a1d23" : "#12141a",
            border: `1px solid ${selectedTaskId === t.id ? "#3b82f655" : "#1e2028"}`,
            borderRadius: 6, padding: "12px 14px", marginBottom: 6, cursor: "pointer",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "#4b5563", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{t.evidenceCode}</span>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                  color: priorityColor(t.priority), border: `1px solid ${priorityColor(t.priority)}33`,
                  background: `${priorityColor(t.priority)}11`, borderRadius: 3, padding: "1px 6px",
                }}>{t.priority}</span>
              </div>
              {t.matchScore > 5 && (
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                  color: "#22c55e", background: "#22c55e11", border: "1px solid #22c55e33",
                  borderRadius: 3, padding: "1px 6px",
                }}>
                  {t.matchScore}% MATCH
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: "#d1d5db", lineHeight: 1.45, marginBottom: 8 }}>
              {t.question.length > 120 ? t.question.substring(0, 120) + "..." : t.question}
            </div>
            {t.matchReasons.length > 0 && t.matchScore > 5 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {t.matchReasons.map((r, i) => (
                  <span key={i} style={{
                    fontSize: 9, color: "#22c55e", background: "#22c55e08",
                    border: "1px solid #22c55e22", borderRadius: 3, padding: "2px 6px",
                  }}>{r}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Task detail */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {!selectedTask ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#374151", fontSize: 14, fontStyle: "italic" }}>
            Select a task to view details and submit findings
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: "#6b7280" }}>{selectedTask.caseTitle}</span>
                <span style={{ color: "#1e2028" }}>·</span>
                <span style={{ fontSize: 10, color: "#4b5563", fontFamily: "'JetBrains Mono', monospace" }}>{selectedTask.evidenceCode}</span>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#f3f4f6", margin: 0, lineHeight: 1.4 }}>
                {selectedTask.question}
              </h3>
            </div>

            <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
              <Stat label="Priority" value={selectedTask.priority} color={priorityColor(selectedTask.priority)} />
              <Stat label="Investigators" value={selectedTask.assignedCount} />
              <Stat label="Submissions" value={selectedTask.contributionCount} />
            </div>

            {selectedTask.matchReasons.length > 0 && selectedTask.matchScore > 5 && (
              <div style={{
                background: "#22c55e08", border: "1px solid #22c55e22",
                borderRadius: 6, padding: "12px 14px", marginBottom: 20,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#22c55e", textTransform: "uppercase", marginBottom: 6 }}>Why You Were Matched</div>
                {selectedTask.matchReasons.map((r, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#86efac", marginBottom: 2 }}>• {r}</div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#4b5563", textTransform: "uppercase" }}>Skills needed:</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {selectedTask.requiredSkills.map(s => (
                  <span key={s} style={{
                    fontSize: 10, padding: "2px 8px", borderRadius: 3,
                    border: `1px solid ${user.skills.includes(s) ? "#3b82f644" : "#1e2028"}`,
                    background: user.skills.includes(s) ? "#3b82f618" : "#12141a",
                    color: user.skills.includes(s) ? "#60a5fa" : "#6b7280",
                  }}>{SKILL_LABELS[s]}</span>
                ))}
              </div>
            </div>

            {selectedTask.relevantLocation && (
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 20 }}>
                <span style={{ color: "#4b5563" }}>Relevant area:</span> {selectedTask.relevantLocation}
                {selectedTask.relevantDateStart && (
                  <span> · <span style={{ color: "#4b5563" }}>Time period:</span> {selectedTask.relevantDateStart.substring(0, 4)}–{(selectedTask.relevantDateEnd || "").substring(0, 4) || "present"}</span>
                )}
              </div>
            )}

            <button onClick={() => onAcceptTask(selectedTask.id)} style={{
              fontSize: 13, fontWeight: 700, padding: "12px 28px",
              background: "#3b82f6", color: "#fff", border: "none",
              borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
              letterSpacing: "0.02em",
            }}>
              Accept Task & Submit Findings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || "#f3f4f6", fontFamily: "'JetBrains Mono', monospace", textTransform: "capitalize" }}>{value}</div>
      <div style={{ fontSize: 9, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
    </div>
  );
}

// ============================================================================
// CONTRIBUTION VIEW — Submit findings
// ============================================================================

function ContributeView({ user, activeTaskId }) {
  const task = MOCK_TASKS.find(t => t.id === activeTaskId);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sources, setSources] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (!task) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#374151", padding: 40, textAlign: "center" }}>
      <div>
        <div style={{ fontSize: 14, fontStyle: "italic", marginBottom: 8 }}>Accept a task first to submit findings.</div>
        <div style={{ fontSize: 12, color: "#4b5563" }}>Go to Tasks → select a question → Accept Task</div>
      </div>
    </div>
  );

  if (submitted) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: 40, textAlign: "center" }}>
      <div>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#22c55e", marginBottom: 8 }}>Contribution Submitted</div>
        <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.6, maxWidth: 400 }}>
          Your findings are now in the review queue. A moderator or peer reviewer will evaluate your submission. If accepted, it will be added to the evidence repository and you'll earn reputation.
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 20px" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f3f4f6", margin: 0 }}>Submit Findings</h2>
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
          Task {task.id} · {task.evidenceCode} · {task.caseTitle}
        </div>
      </div>

      <div style={{
        background: "#12141a", border: "1px solid #1e2028", borderRadius: 6,
        padding: "12px 14px", marginBottom: 20, fontSize: 12, color: "#d1d5db", lineHeight: 1.5,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#4b5563", textTransform: "uppercase", marginBottom: 6 }}>Question Being Answered</div>
        {task.question}
      </div>

      <div style={{
        background: "#f59e0b08", border: "1px solid #f59e0b22", borderRadius: 6,
        padding: "12px 14px", marginBottom: 20, fontSize: 11, color: "#fbbf24", lineHeight: 1.5,
      }}>
        <strong>Submission guidelines:</strong> Cite every source. State what you verified vs. what you inferred. If you're uncertain about something, say so explicitly. Speculation without evidence will be rejected.
      </div>

      <Input label="Finding Title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Clear, specific summary of what you found" />

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#4b5563", textTransform: "uppercase", marginBottom: 6 }}>Detailed Findings</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder={"Describe what you found, how you found it, and what it means for the case.\n\nInclude:\n• What evidence you examined\n• Your methodology\n• What you concluded\n• What remains uncertain\n• How this connects to other evidence"}
          rows={12}
          style={{
            width: "100%", padding: "10px 12px", fontSize: 12,
            background: "#12141a", border: "1px solid #1e2028",
            borderRadius: 4, color: "#d1d5db", outline: "none",
            fontFamily: "inherit", boxSizing: "border-box",
            resize: "vertical", lineHeight: 1.6,
          }}
        />
      </div>

      <Input label="Sources (one URL per line)" value={sources} onChange={e => setSources(e.target.value)} placeholder={"https://...\nhttps://..."} area />

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#4b5563", textTransform: "uppercase", marginBottom: 6 }}>Attach Files</label>
        <div style={{
          border: "1px dashed #1e2028", borderRadius: 6, padding: "20px",
          textAlign: "center", color: "#374151", fontSize: 12, cursor: "pointer",
          background: "#0d0e12",
        }}>
          Drop files here or click to upload — screenshots, documents, records
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
        <button onClick={() => setSubmitted(true)} disabled={!title || !body} style={{
          fontSize: 13, fontWeight: 700, padding: "12px 28px",
          background: title && body ? "#22c55e" : "#1e2028",
          color: title && body ? "#fff" : "#374151",
          border: "none", borderRadius: 6,
          cursor: title && body ? "pointer" : "default",
          fontFamily: "inherit",
        }}>
          Submit for Review
        </button>
        <button style={{
          fontSize: 13, padding: "12px 28px",
          background: "none", border: "1px solid #1e2028",
          borderRadius: 6, color: "#6b7280", cursor: "pointer", fontFamily: "inherit",
        }}>
          Save Draft
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// REPUTATION VIEW
// ============================================================================

function ReputationView({ user }) {
  const levels = [
    { name: "Observer", min: 0, desc: "Browse cases and evidence" },
    { name: "Contributor", min: 1, desc: "Submit findings to open questions" },
    { name: "Investigator", min: 50, desc: "Peer review others' contributions" },
    { name: "Senior Investigator", min: 200, desc: "Create and prioritize questions" },
    { name: "Case Lead", min: 500, desc: "Manage case evidence and coordinate teams" },
    { name: "Verified Expert", min: 1000, desc: "Compile law enforcement dossiers" },
  ];
  const current = [...levels].reverse().find(l => user.reputationScore >= l.min) || levels[0];
  const next = levels[levels.indexOf(current) + 1];

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 20px" }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#f3f4f6", margin: "0 0 4px 0" }}>Reputation & Access</h2>
      <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 24, lineHeight: 1.5 }}>
        Reputation is earned through verified contributions. Higher reputation unlocks greater platform capabilities and signals to law enforcement that your work is credible.
      </p>

      <div style={{
        background: "#12141a", border: "1px solid #1e2028", borderRadius: 8,
        padding: "20px", marginBottom: 24, textAlign: "center",
      }}>
        <div style={{ fontSize: 36, fontWeight: 700, color: "#f3f4f6", fontFamily: "'JetBrains Mono', monospace" }}>{user.reputationScore}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#3b82f6", marginTop: 4 }}>{current.name}</div>
        {next && (
          <div style={{ fontSize: 11, color: "#4b5563", marginTop: 8 }}>
            {next.min - user.reputationScore} points to <span style={{ color: "#6b7280" }}>{next.name}</span>
          </div>
        )}
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24,
      }}>
        {[
          { label: "Submitted", value: user.contributionsTotal },
          { label: "Accepted", value: user.contributionsAccepted },
          { label: "Verified", value: user.contributionsVerified },
        ].map((s, i) => (
          <div key={i} style={{ background: "#12141a", border: "1px solid #1e2028", borderRadius: 6, padding: "14px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#f3f4f6", fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</div>
            <div style={{ fontSize: 10, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <SectionHeader>Access Levels</SectionHeader>
      {levels.map((l, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
          background: current.name === l.name ? "#3b82f608" : "transparent",
          border: current.name === l.name ? "1px solid #3b82f622" : "1px solid transparent",
          borderRadius: 6, marginBottom: 4,
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: user.reputationScore >= l.min ? "#22c55e" : "#1e2028",
            border: current.name === l.name ? "2px solid #3b82f6" : "2px solid transparent",
            flexShrink: 0,
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: user.reputationScore >= l.min ? "#e5e7eb" : "#374151" }}>{l.name}</div>
            <div style={{ fontSize: 11, color: user.reputationScore >= l.min ? "#6b7280" : "#1e2028" }}>{l.desc}</div>
          </div>
          <div style={{ fontSize: 10, color: "#4b5563", fontFamily: "'JetBrains Mono', monospace" }}>{l.min}+</div>
        </div>
      ))}

      <SectionHeader>How Reputation Is Earned</SectionHeader>
      <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.7 }}>
        {[
          ["Contribution accepted by moderator", "+10"],
          ["Contribution independently verified", "+25"],
          ["Finding leads to new evidence entry", "+50"],
          ["Cross-case connection confirmed", "+100"],
          ["Finding referenced in LE dossier", "+200"],
          ["Contribution rejected", "−0 (no penalty for good-faith attempts)"],
        ].map(([desc, pts], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #1e202811" }}>
            <span>{desc}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: pts.startsWith("+") ? "#22c55e" : "#6b7280" }}>{pts}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN APP
// ============================================================================

export default function Layer2() {
  const [user, setUser] = useState(MOCK_USER);
  const [activeView, setActiveView] = useState("profile");
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [acceptedTaskId, setAcceptedTaskId] = useState(null);

  const handleAcceptTask = (id) => {
    setAcceptedTaskId(id);
    setActiveView("contribute");
  };

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
        padding: "12px 20px",
        borderBottom: "1px solid #1e2028",
        background: "#0d0e12",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexShrink: 0,
      }}>
        <div>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "#3b82f6", textTransform: "uppercase" }}>LAYER 2</span>
          <span style={{ fontSize: 10, color: "#1e2028", margin: "0 8px" }}>│</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#f3f4f6" }}>Investigator Portal</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: "#6b7280" }}>{user.displayName || "New Investigator"}</span>
          <div style={{
            width: 28, height: 28, borderRadius: "50%", background: "#1a1d23",
            border: "1px solid #1e2028", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 11, color: "#6b7280", fontWeight: 700,
          }}>
            {user.displayName ? user.displayName.charAt(0).toUpperCase() : "?"}
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{
        display: "flex", borderBottom: "1px solid #1e2028",
        background: "#0d0e12", flexShrink: 0,
      }}>
        {VIEWS.map(v => (
          <button key={v} onClick={() => setActiveView(v)} style={{
            padding: "10px 20px", fontSize: 11, fontWeight: 600,
            letterSpacing: "0.06em", textTransform: "uppercase",
            background: "none", border: "none", cursor: "pointer",
            color: activeView === v ? "#f3f4f6" : "#4b5563",
            borderBottom: activeView === v ? "2px solid #3b82f6" : "2px solid transparent",
            fontFamily: "inherit",
          }}>
            {v === "tasks" ? `Tasks (${MOCK_TASKS.length})` : v}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {activeView === "profile" && <ProfileView user={user} setUser={setUser} />}
        {activeView === "tasks" && <TasksView user={user} onAcceptTask={handleAcceptTask} selectedTaskId={selectedTaskId} setSelectedTaskId={setSelectedTaskId} />}
        {activeView === "contribute" && <ContributeView user={user} activeTaskId={acceptedTaskId} />}
        {activeView === "reputation" && <ReputationView user={user} />}
      </div>
    </div>
  );
}
