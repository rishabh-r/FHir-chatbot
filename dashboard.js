/* =====================================================
   Patient 360 Portal – CareCord AI Dashboard
   FHIR R4 + GPT-4.1-mini (Azure OpenAI)
   ===================================================== */

// ── Config ──────────────────────────────────────────
const FHIR_BASE = "https://fhirassist.rsystems.com:481";
const AUTH_TOKEN = localStorage.getItem("cb_token");

// ── Read patient ID from URL ────────────────────────
const urlParams = new URLSearchParams(window.location.search);
const PATIENT_ID = urlParams.get("patient");

// ── Auth guard ──────────────────────────────────────
if (!AUTH_TOKEN) {
  window.location.href = "index.html";
}
if (!PATIENT_ID) {
  showError("No patient ID provided. Please launch this dashboard from the CareBridge chatbot.");
}

// ── FHIR Helpers ────────────────────────────────────
function getAuthHeader() {
  return {
    "Authorization": "Bearer " + AUTH_TOKEN,
    "Content-Type": "application/json"
  };
}

function buildUrl(path, params) {
  const url = new URL(FHIR_BASE + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.append(k, v);
  });
  return url.toString();
}

async function callFhirApi(url) {
  const res = await fetch(url, { headers: getAuthHeader() });
  if (res.status === 401) {
    localStorage.removeItem("cb_token");
    localStorage.removeItem("cb_user");
    window.location.href = "index.html";
    throw new Error("Session expired. Please log in again.");
  }
  if (!res.ok) throw new Error("FHIR API error: " + res.status);
  return res.json();
}

// ── Fetch All Patient Data ───────────────────────────
async function fetchAllPatientData(patientId) {
  const loincCodes = [
    "718-7",   // Hemoglobin
    "2345-7",  // Glucose
    "2951-2",  // Sodium
    "2823-3",  // Potassium
    "2160-0",  // Creatinine
    "8480-6",  // Systolic BP
    "8462-4",  // Diastolic BP
    "8867-4",  // Heart Rate
    "4548-4",  // HbA1c
    "2090-9"   // LDL Cholesterol
  ];

  const [patientData, conditions, medications, encounters, ...obsResults] = await Promise.all([
    callFhirApi(buildUrl("/baseR4/Patient", { _id: patientId })),
    callFhirApi(buildUrl("/baseR4/Condition", { subject: patientId })),
    callFhirApi(buildUrl("/baseR4/MedicationRequest", { subject: patientId })),
    callFhirApi(buildUrl("/baseR4/Encounter", { subject: patientId })),
    ...loincCodes.map(code =>
      callFhirApi(buildUrl("/baseR4/Observations", { subject: patientId, code, page: 0 }))
    )
  ]);

  const observations = obsResults.flatMap(bundle =>
    (bundle.entry || []).map(e => e.resource)
  );

  return { patientData, conditions, medications, encounters, observations };
}

// ── Strip FHIR metadata ──────────────────────────────
function stripFhirMeta(bundle) {
  if (!bundle || !bundle.entry) return [];
  return bundle.entry.map(e => {
    const r = { ...e.resource };
    delete r.meta;
    delete r.text;
    delete r.id;
    return r;
  }).slice(0, 30);
}

// ── GPT Analysis ────────────────────────────────────
async function analyzeWithGPT(fhirData) {
  const today = new Date().toISOString().split("T")[0];

  const systemPrompt = [
    "You are a clinical data analyst for a care coordination platform.",
    "Analyze the provided FHIR patient data and return a JSON object with the exact structure specified.",
    "Use clinical evidence from the data. Do not fabricate values not supported by the data.",
    "Derive age from birthDate. Extract phone and email from Patient telecom array.",
    "For programs: identify care management programs based on conditions (e.g. Diabetes Management, Hypertension Program, CKD Program, Heart Failure Program).",
    "For risk score: compute a 0-100 score based on number and severity of conditions, abnormal observations, medication gaps, and missed encounters.",
    "For alert triggers: identify 2-4 key issues from abnormal observations (worsening trends), on-hold/stopped medications, cancelled/no-show encounters.",
    "For deteriorating trends: focus on BP, HbA1c, LDL, Creatinine and compare latest values to clinical targets.",
    "For AI actions: generate 4-6 actionable clinical recommendations with rationale.",
    "For care team: infer a realistic 3-4 member care team (PCP + relevant specialists) based on the patient's active conditions. Mark the primary care provider with isPrimary: true.",
    "For clinical notes: generate 2-3 realistic, brief clinical notes based on the encounter and observation data. Type values: Clinical, Coordination, Admin.",
    "Today's date: " + today
  ].join(" ");

  const userPrompt = [
    "Analyze this patient's FHIR data and return ONLY a valid JSON object with this exact structure:",
    "",
    '{',
    '  "patient": {',
    '    "name": "Full Name",',
    '    "initials": "FN",',
    '    "age": 65,',
    '    "mrn": "patient ID",',
    '    "programs": ["Program 1", "Program 2"],',
    '    "riskScore": "32% ASCVD",',
    '    "riskLevel": "High",',
    '    "phone": "(555) 123-4567",',
    '    "email": "patient@email.com",',
    '    "tags": ["High Risk", "Care Gap"]',
    '  },',
    '  "careTeam": [',
    '    { "initials": "MC", "name": "Dr. Michael Chen", "role": "Primary Care Physician", "specialty": "Internal Medicine", "isPrimary": true }',
    '  ],',
    '  "clinicalNotes": [',
    '    { "authorInitials": "MC", "authorName": "Dr. Michael Chen", "authorRole": "Primary Care Physician", "type": "Clinical", "content": "Brief clinical note...", "dateStr": "Jan 28, 2026 - 2:15 PM" }',
    '  ],',
    '  "alertTriggers": [',
    '    { "title": "Issue Title", "description": "Latest: value", "priority": "Critical", "icon": "heart" }',
    '  ],',
    '  "deterioratingTrends": [',
    '    { "label": "BP Trend", "value": "+17 mmHg systolic (6 weeks)", "target": "< 130/80", "status": "above" }',
    '  ],',
    '  "aiActions": [',
    '    { "title": "Action Title", "priority": "High Priority", "timeframe": "Within 24 hours", "description": "What to do", "rationale": "Clinical reasoning" }',
    '  ]',
    '}',
    "",
    "Priority values for alertTriggers: Critical, High Priority, Medium Priority",
    "Priority values for aiActions: High Priority, Medium Priority, Low Priority",
    "Icon values: heart, pill, calendar, chart, alert, lab",
    "Status values for trends: above, normal, below",
    "Tags should include 'High Risk' / 'Medium Risk' / 'Low Risk' based on riskLevel, and 'Care Gap' if care gaps are detected.",
    "",
    "=== PATIENT DATA ===",
    JSON.stringify(stripFhirMeta(fhirData.patientData), null, 0),
    "",
    "=== CONDITIONS ===",
    JSON.stringify(stripFhirMeta(fhirData.conditions), null, 0),
    "",
    "=== MEDICATIONS ===",
    JSON.stringify(stripFhirMeta(fhirData.medications), null, 0),
    "",
    "=== ENCOUNTERS ===",
    JSON.stringify(stripFhirMeta(fhirData.encounters), null, 0),
    "",
    "=== OBSERVATIONS ===",
    JSON.stringify(fhirData.observations.slice(0, 50).map(o => {
      const r = { ...o };
      delete r.meta; delete r.text; delete r.id;
      return r;
    }), null, 0)
  ].join("\n");

  const res = await fetch("/api/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3
    })
  });

  if (res.status === 429) throw new Error("AI analysis rate limited. Please wait a moment and try again.");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || "GPT analysis failed (" + res.status + ")");
  }

  const data = await res.json();
  const content = data.choices[0].message.content;
  try {
    return JSON.parse(content);
  } catch (e) {
    throw new Error("AI analysis returned invalid data. Please retry.");
  }
}

// ── Icon map ────────────────────────────────────────
const ICONS = {
  heart:    "\u2764\uFE0F",
  pill:     "\uD83D\uDC8A",
  calendar: "\uD83D\uDCC5",
  chart:    "\uD83D\uDCC8",
  alert:    "\u26A0\uFE0F",
  lab:      "\uD83E\uDDEA"
};

// ── Utility: escape HTML ─────────────────────────────
function escHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── Utility: format date ─────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return "";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const parts = dateStr.split("-");
  if (parts.length < 2) return dateStr;
  return months[parseInt(parts[1]) - 1] + " " + parseInt(parts[2] || 1) + ", " + parts[0];
}

function formatTime(isoStr) {
  if (!isoStr) return "";
  try {
    return new Date(isoStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch(e) { return ""; }
}

function formatDateTime(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    const today = new Date();
    const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    if (d.toDateString() === today.toDateString()) return "Today, " + timeStr;
    return formatDate(isoStr.split("T")[0]) + " \u2022 " + timeStr;
  } catch(e) { return ""; }
}

// ── Render: Patient Card ─────────────────────────────
function renderPatientCard(patient, ptResource) {
  // Update breadcrumb
  const breadcrumb = document.getElementById("breadcrumb-patient-name");
  if (breadcrumb) breadcrumb.textContent = patient.name || "Patient";

  // Avatar
  document.getElementById("patient-avatar").textContent = patient.initials || "??";

  // Name
  document.getElementById("patient-name").textContent = patient.name || "Unknown";

  // Badges
  const badgesEl = document.getElementById("patient-badges");
  badgesEl.innerHTML = "";
  const riskColors = {
    high:     { text: "#b91c1c", border: "#fde8e8" },
    critical: { text: "#b91c1c", border: "#fde8e8" },
    medium:   { text: "#b45309", border: "#fef3cd" },
    low:      { text: "#15803d", border: "#d5f5e3" }
  };
  const riskKey = (patient.riskLevel || "high").toLowerCase();
  const colors = riskColors[riskKey] || riskColors.high;

  (patient.tags || []).forEach(tag => {
    const span = document.createElement("span");
    const tl = tag.toLowerCase();
    if (tl.includes("high risk") || tl.includes("critical")) {
      span.className = "badge badge-high-risk";
    } else if (tl.includes("medium risk")) {
      span.className = "badge badge-medium-risk";
    } else if (tl.includes("low risk")) {
      span.className = "badge badge-low-risk";
    } else {
      span.className = "badge badge-care-gap";
      span.style.color = colors.text;
      span.style.borderColor = colors.text;
    }
    span.textContent = tag;
    badgesEl.appendChild(span);
  });

  // Extract gender and DOB from FHIR resource
  const gender = ptResource && ptResource.gender
    ? ptResource.gender.charAt(0).toUpperCase() + ptResource.gender.slice(1)
    : "";
  const dob = ptResource && ptResource.birthDate
    ? formatDate(ptResource.birthDate)
    : "";

  // Details row: age • gender • MRN: xxx • Programs: xxx • Score: xxx
  const detailsRow = document.getElementById("patient-details-row");
  detailsRow.innerHTML = "";
  const parts = [];
  if (patient.age) parts.push({ text: patient.age + " yrs" });
  if (gender) parts.push({ text: gender });
  if (patient.mrn || PATIENT_ID) parts.push({ label: "MRN:", value: patient.mrn || PATIENT_ID });
  if (patient.programs && patient.programs.length) parts.push({ label: "Programs:", value: patient.programs.join(", ") });
  if (patient.riskScore) parts.push({ label: "Score:", value: patient.riskScore, isRisk: true });

  parts.forEach((p, i) => {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.className = "detail-sep";
      sep.textContent = "\u2022";
      detailsRow.appendChild(sep);
    }
    const item = document.createElement("span");
    if (p.label) {
      item.innerHTML = '<span class="detail-label">' + p.label + '</span>' +
        '<span class="detail-value' + (p.isRisk && riskKey !== "low" ? " risk-high" : "") + '">' + escHtml(p.value) + '</span>';
    } else {
      item.className = "detail-value";
      item.textContent = p.text;
    }
    detailsRow.appendChild(item);
  });

  // Contact row: DOB, phone, email
  const contactRow = document.getElementById("patient-contact-row");
  contactRow.innerHTML = "";
  if (dob) {
    const el = document.createElement("div");
    el.className = "contact-item";
    el.innerHTML = '<span>&#128197;</span> DOB: ' + escHtml(dob);
    contactRow.appendChild(el);
  }
  if (patient.phone) {
    const el = document.createElement("div");
    el.className = "contact-item";
    el.innerHTML = '<span>&#128222;</span> ' + escHtml(patient.phone);
    contactRow.appendChild(el);
  }
  if (patient.email) {
    const el = document.createElement("div");
    el.className = "contact-item";
    el.innerHTML = '<span>&#9993;</span> ' + escHtml(patient.email);
    contactRow.appendChild(el);
  }

  // Risk-based card styling
  const card = document.getElementById("patient-card");
  if (riskKey === "high" || riskKey === "critical") {
    card.style.borderColor = "var(--red-border)";
    card.style.borderLeftColor = "var(--red)";
    card.style.background = "var(--red-light)";
  } else if (riskKey === "medium") {
    card.style.borderColor = "var(--yellow-border)";
    card.style.borderLeftColor = "var(--yellow)";
    card.style.background = "var(--yellow-light)";
  } else {
    card.style.borderColor = "var(--green-border)";
    card.style.borderLeftColor = "var(--green)";
    card.style.background = "var(--green-light)";
  }
}

// ── Render: Alert Triggers ───────────────────────────
function renderAlertTriggers(alerts) {
  const container = document.getElementById("alert-cards-container");
  container.innerHTML = "";

  if (!alerts || alerts.length === 0) {
    container.innerHTML = '<p style="color:var(--text-mid)">No alert triggers detected.</p>';
    return;
  }

  alerts.forEach(alert => {
    const pc = alert.priority.toLowerCase().includes("critical") ? "critical" :
               alert.priority.toLowerCase().includes("high") ? "high" : "medium";
    const card = document.createElement("div");
    card.className = "alert-card " + pc;
    card.innerHTML =
      '<div class="alert-card-header">' +
        '<span class="alert-card-icon">' + (ICONS[alert.icon] || ICONS.alert) + '</span>' +
        '<span class="alert-card-title">' + escHtml(alert.title) + '</span>' +
      '</div>' +
      '<p class="alert-card-desc">' + escHtml(alert.description) + '</p>' +
      '<span class="priority-badge ' + pc + '">' + escHtml(alert.priority) + '</span>';
    container.appendChild(card);
  });
}

// ── Render: Deteriorating Trends ────────────────────
function renderDeterioratingTrends(trends) {
  const container = document.getElementById("trends-container");
  container.innerHTML = "";

  if (!trends || trends.length === 0) {
    container.innerHTML = '<p style="color:var(--text-mid)">No deteriorating trends detected.</p>';
    return;
  }

  trends.forEach(trend => {
    const item = document.createElement("div");
    item.className = "trend-item";
    item.innerHTML =
      '<div class="trend-label">' + escHtml(trend.label) + '</div>' +
      '<div class="trend-value ' + (trend.status === "above" ? "above" : trend.status === "normal" ? "normal" : "") + '">' +
        escHtml(trend.value) +
      '</div>' +
      '<div class="trend-target">Target: ' + escHtml(trend.target) + '</div>';
    container.appendChild(item);
  });
}

// ── Render: AI Actions ───────────────────────────────
function renderAIActions(actions) {
  const container = document.getElementById("actions-list");
  container.innerHTML = "";

  if (!actions || actions.length === 0) {
    container.innerHTML = '<p style="color:var(--text-mid)">No AI-recommended actions at this time.</p>';
    return;
  }

  actions.forEach((action, idx) => {
    const pc = action.priority.toLowerCase().includes("high") ? "high" :
               action.priority.toLowerCase().includes("critical") ? "critical" :
               action.priority.toLowerCase().includes("medium") ? "medium" : "low";

    const card = document.createElement("div");
    card.className = "action-card";
    card.innerHTML =
      '<div class="action-card-top">' +
        '<input type="checkbox" class="action-checkbox" data-idx="' + idx + '" />' +
        '<div class="action-content">' +
          '<div class="action-title-row">' +
            '<span class="action-title">' + escHtml(action.title) + '</span>' +
            '<span class="priority-badge ' + pc + '">' + escHtml(action.priority) + '</span>' +
            '<span class="timeframe-pill">' + escHtml(action.timeframe) + '</span>' +
          '</div>' +
          '<p class="action-desc">' + escHtml(action.description) + '</p>' +
          '<div class="action-rationale">' +
            '<div class="rationale-label">AI RATIONALE:</div>' +
            '<div class="rationale-text">' + escHtml(action.rationale) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    card.addEventListener("click", (e) => {
      const cb = card.querySelector(".action-checkbox");
      if (e.target !== cb) cb.checked = !cb.checked;
      card.classList.toggle("selected", cb.checked);
      updateSelectedCount();
    });

    container.appendChild(card);
  });

  container.addEventListener("change", updateSelectedCount);
}

function updateSelectedCount() {
  const checked = document.querySelectorAll(".action-checkbox:checked").length;
  document.getElementById("selected-count").textContent = checked;
  document.getElementById("approve-count").textContent = checked;
}

// ── Render: Vitals ───────────────────────────────────
function renderVitals(observations) {
  const vitalsEl = document.getElementById("vitals-grid");

  function getLatestObs(code) {
    const matching = observations.filter(o =>
      o.code?.coding?.some(c => c.code === code)
    );
    if (!matching.length) return null;
    return matching.sort((a, b) =>
      new Date(b.effectiveDateTime || 0) - new Date(a.effectiveDateTime || 0)
    )[0];
  }

  const syObs      = getLatestObs("8480-6");
  const diaObs     = getLatestObs("8462-4");
  const hrObs      = getLatestObs("8867-4");
  const glucoseObs = getLatestObs("2345-7");
  const hba1cObs   = getLatestObs("4548-4");

  // Last updated
  const allObs = [syObs, diaObs, hrObs, glucoseObs, hba1cObs].filter(Boolean);
  if (allObs.length > 0) {
    const latest = allObs.sort((a, b) =>
      new Date(b.effectiveDateTime || 0) - new Date(a.effectiveDateTime || 0)
    )[0];
    const el = document.getElementById("vitals-updated");
    if (el && latest.effectiveDateTime) el.textContent = "Last updated: " + formatDateTime(latest.effectiveDateTime);
  }

  const vitals = [];

  if (syObs && diaObs) {
    const sy = syObs.valueQuantity?.value;
    const dia = diaObs.valueQuantity?.value;
    if (sy !== undefined && dia !== undefined) {
      const isAbnormal = sy > 130 || sy < 90;
      vitals.push({ label: "BLOOD PRESSURE", value: Math.round(sy) + "/" + Math.round(dia), unit: "mmHg", normalText: "Normal 120/80", isAbnormal, pct: Math.min(100, (sy / 200) * 100), icon: "\u26A1" });
    }
  }

  if (hrObs) {
    const val = hrObs.valueQuantity?.value;
    if (val !== undefined) {
      vitals.push({ label: "HEART RATE", value: Math.round(val), unit: "bpm", normalText: "Normal 60-100", isAbnormal: val < 60 || val > 100, pct: Math.min(100, (val / 150) * 100), icon: "\u2665" });
    }
  }

  if (glucoseObs) {
    const val = glucoseObs.valueQuantity?.value;
    if (val !== undefined) {
      vitals.push({ label: "BLOOD GLUCOSE", value: Math.round(val), unit: "mg/dL", normalText: "Normal 70-130", isAbnormal: val < 70 || val > 130, pct: Math.min(100, (val / 250) * 100), icon: "\uD83D\uDCA7" });
    }
  }

  if (hba1cObs) {
    const val = hba1cObs.valueQuantity?.value;
    if (val !== undefined) {
      vitals.push({ label: "HBA1C", value: parseFloat(val).toFixed(1), unit: "%", normalText: "Target < 7%", isAbnormal: val > 7, pct: Math.min(100, (val / 15) * 100), icon: "\uD83E\uDDEA" });
    }
  }

  vitalsEl.innerHTML = "";

  if (vitals.length === 0) {
    vitalsEl.innerHTML = '<p style="color:var(--text-mid)">No vital signs data available.</p>';
    return;
  }

  vitals.forEach(v => {
    const card = document.createElement("div");
    card.className = "vital-card";
    card.innerHTML =
      '<div class="vital-card-top">' +
        '<div class="vital-left">' +
          '<span class="vital-icon">' + v.icon + '</span>' +
          '<div>' +
            '<div class="vital-label">' + v.label + '</div>' +
            '<div class="vital-value ' + (v.isAbnormal ? "vital-abnormal" : "vital-normal-val") + '">' +
              v.value + ' <span class="vital-unit">' + v.unit + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="vital-normal-label">' + escHtml(v.normalText) + '</div>' +
      '</div>' +
      '<div class="vital-bar">' +
        '<div class="vital-bar-fill ' + (v.isAbnormal ? "vital-bar-red" : "vital-bar-green") + '" style="width:' + v.pct.toFixed(0) + '%"></div>' +
      '</div>';
    vitalsEl.appendChild(card);
  });
}

// ── Render: Medications ──────────────────────────────
function renderMedications(medications) {
  const container = document.getElementById("medications-list");
  const countEl = document.getElementById("meds-count");

  if (!medications || !medications.entry) {
    container.innerHTML = '<p style="color:var(--text-mid)">No medication data available.</p>';
    return;
  }

  const meds = medications.entry
    .map(e => e.resource)
    .filter(r => r && (r.status === "active" || r.status === "on-hold"))
    .slice(0, 8);

  if (countEl) countEl.textContent = meds.length + " active prescription" + (meds.length !== 1 ? "s" : "");

  if (meds.length === 0) {
    container.innerHTML = '<p style="color:var(--text-mid)">No active medications found.</p>';
    return;
  }

  container.innerHTML = "";
  meds.forEach(med => {
    const name = med.medicationCodeableConcept?.text ||
                 med.medicationCodeableConcept?.coding?.[0]?.display ||
                 med.medicationReference?.display || "Unknown Medication";
    const status = med.status || "unknown";
    const dosage = med.dosageInstruction?.[0]?.text || "";
    const prescriber = med.requester?.display || "";
    const startRaw = med.authoredOn ? med.authoredOn.split("T")[0] : "";
    const startDate = startRaw ? formatDate(startRaw) : "";
    const statusClass = status === "active" ? "med-active" : status === "on-hold" ? "med-onhold" : "med-other";
    const statusLabel = status === "on-hold" ? "On Hold" : status.charAt(0).toUpperCase() + status.slice(1);

    const item = document.createElement("div");
    item.className = "med-item";
    item.innerHTML =
      '<div class="med-icon">&#128138;</div>' +
      '<div class="med-info">' +
        '<div class="med-name-row">' +
          '<span class="med-name">' + escHtml(name) + '</span>' +
          '<span class="med-status-badge ' + statusClass + '">' + statusLabel + '</span>' +
        '</div>' +
        (dosage ? '<div class="med-dosage">' + escHtml(dosage) + '</div>' : '') +
        ((prescriber || startDate) ? '<div class="med-prescriber">' +
          escHtml(prescriber) + (prescriber && startDate ? " \u2022 " : "") +
          (startDate ? "Started " + escHtml(startDate) : "") +
        '</div>' : '') +
      '</div>';
    container.appendChild(item);
  });
}

// ── Render: Appointments ─────────────────────────────
function renderAppointments(encounters) {
  const container = document.getElementById("appointments-list");

  if (!encounters || !encounters.entry) {
    container.innerHTML = '<p style="color:var(--text-mid)">No appointment data available.</p>';
    return;
  }

  const appts = encounters.entry
    .map(e => e.resource)
    .filter(r => r)
    .sort((a, b) => new Date(b.period?.start || 0) - new Date(a.period?.start || 0))
    .slice(0, 5);

  if (appts.length === 0) {
    container.innerHTML = '<p style="color:var(--text-mid)">No appointments found.</p>';
    return;
  }

  container.innerHTML = "";
  appts.forEach(enc => {
    const title = enc.type?.[0]?.coding?.[0]?.display ||
                  enc.type?.[0]?.text ||
                  (enc.class?.code === "IMP" ? "Inpatient Admission" : "Outpatient Visit");
    const status = enc.status || "unknown";
    const doctorName = enc.participant?.[0]?.individual?.display || "";
    const dateRaw = enc.period?.start ? enc.period.start.split("T")[0] : "";
    const dateStr = dateRaw ? formatDate(dateRaw) : "";
    const timeStr = enc.period?.start ? formatTime(enc.period.start) : "";
    const location = enc.location?.[0]?.location?.display || "";
    const isTelehealth = title.toLowerCase().includes("telehealth") ||
                         location.toLowerCase().includes("telehealth");

    // Determine status based on actual date vs today
    const today = new Date(); today.setHours(0,0,0,0);
    const apptDate = enc.period?.start ? new Date(enc.period.start) : null;
    const isPast = apptDate && apptDate < today;

    let statusClass, statusLabel;
    if (!isPast && apptDate) {
      // Future date → Upcoming regardless of FHIR status
      statusClass = "appt-upcoming"; statusLabel = "Upcoming";
    } else if (status === "noshow" || (isPast && ["planned","arrived","triaged"].includes(status))) {
      // Explicitly no-show, OR past date but never marked finished = missed
      statusClass = "appt-cancelled"; statusLabel = "Missed";
    } else if (status === "cancelled") {
      statusClass = "appt-cancelled"; statusLabel = "Cancelled";
    } else {
      statusClass = "appt-completed"; statusLabel = "Completed";
    }

    const item = document.createElement("div");
    item.className = "appt-item";
    item.innerHTML =
      '<div class="appt-title-row">' +
        '<span class="appt-title">' + escHtml(title) + '</span>' +
        '<span class="appt-status-badge ' + statusClass + '">' + statusLabel + '</span>' +
        (isTelehealth ? '<span class="appt-telehealth-badge">&#128249; Telehealth</span>' : '') +
      '</div>' +
      (doctorName ? '<div class="appt-doctor">with ' + escHtml(doctorName) + '</div>' : '') +
      '<div class="appt-meta">' +
        (dateStr ? '<span class="appt-meta-item">&#128197; ' + escHtml(dateStr) + '</span>' : '') +
        (timeStr ? '<span class="appt-meta-item">&#128336; ' + escHtml(timeStr) + '</span>' : '') +
        (location ? '<span class="appt-meta-item">&#128205; ' + escHtml(location) + '</span>' : '') +
      '</div>';
    container.appendChild(item);
  });
}

// ── Render: Care Team ────────────────────────────────
function renderCareTeam(careTeam) {
  const container = document.getElementById("care-team-list");
  const countEl = document.getElementById("care-team-count");

  if (!careTeam || careTeam.length === 0) {
    container.innerHTML = '<p style="color:var(--text-mid)">Care team information not available.</p>';
    return;
  }

  if (countEl) countEl.textContent = careTeam.length + " MEMBERS INVOLVED";

  container.innerHTML = "";
  careTeam.forEach(member => {
    const item = document.createElement("div");
    item.className = "care-member";
    item.innerHTML =
      '<div class="care-avatar">' + escHtml(member.initials || "??") + '</div>' +
      '<div class="care-info">' +
        '<div class="care-name-row">' +
          '<span class="care-name">' + escHtml(member.name || "Unknown") + '</span>' +
          (member.isPrimary ? '<span class="primary-badge">Primary</span>' : '') +
        '</div>' +
        '<div class="care-role">' + escHtml(member.role || "") + '</div>' +
        (member.specialty ? '<div class="care-specialty">' + escHtml(member.specialty) + '</div>' : '') +
      '</div>' +
      '<div class="care-actions">' +
        '<button class="care-action-btn" title="Call">&#128222;</button>' +
        '<button class="care-action-btn" title="Email">&#9993;</button>' +
      '</div>';
    container.appendChild(item);
  });
}

// ── Render: Clinical Notes ───────────────────────────
function renderClinicalNotes(clinicalNotes) {
  const container = document.getElementById("clinical-notes-list");
  const countEl = document.getElementById("notes-count");
  const filterBar = document.getElementById("notes-filter-bar");

  if (!clinicalNotes || clinicalNotes.length === 0) {
    if (countEl) countEl.textContent = "0 TOTAL ENTRIES";
    container.innerHTML = '<p style="color:var(--text-mid)">No clinical notes available.</p>';
    return;
  }

  if (countEl) countEl.textContent = clinicalNotes.length + " TOTAL ENTRIES";

  const typeCounts = { Clinical: 0, Coordination: 0, Admin: 0 };
  clinicalNotes.forEach(n => {
    const t = n.type || "Clinical";
    if (typeCounts[t] !== undefined) typeCounts[t]++;
  });

  if (filterBar) {
    const tabs = [
      { label: "All", count: clinicalNotes.length },
      { label: "Clinic", count: typeCounts.Clinical },
      { label: "Care", count: typeCounts.Coordination },
      { label: "Admin", count: typeCounts.Admin }
    ];
    filterBar.innerHTML = "";
    tabs.forEach((tab, i) => {
      const btn = document.createElement("button");
      btn.className = "notes-filter-tab" + (i === 0 ? " active" : "");
      btn.textContent = tab.label + " (" + tab.count + ")";
      btn.addEventListener("click", () => {
        filterBar.querySelectorAll(".notes-filter-tab").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      });
      filterBar.appendChild(btn);
    });
  }

  container.innerHTML = "";
  clinicalNotes.forEach(note => {
    const typeClass = note.type === "Coordination" ? "note-type-coord" :
                      note.type === "Admin" ? "note-type-admin" : "note-type-clinical";
    const item = document.createElement("div");
    item.className = "note-item";
    item.innerHTML =
      '<div class="note-header">' +
        '<div class="note-left">' +
          '<div class="note-icon">&#128196;</div>' +
          '<div class="note-author-info">' +
            '<div class="note-author-top">' +
              '<span class="note-author-name">' + escHtml(note.authorName || "Unknown") + '</span>' +
              (note.authorRole ? '<span class="note-author-role">' + escHtml(note.authorRole) + '</span>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="note-right">' +
          '<span class="note-type-badge ' + typeClass + '">' + escHtml(note.type || "Clinical") + '</span>' +
          '<button class="note-view-btn">View</button>' +
        '</div>' +
      '</div>' +
      (note.content ? '<p class="note-content">' + escHtml(note.content) + '</p>' : '') +
      (note.dateStr ? '<div class="note-time">&#128336; ' + escHtml(note.dateStr) + '</div>' : '');
    container.appendChild(item);
  });
}

// ── UI State ─────────────────────────────────────────
function showLoading() {
  document.getElementById("loading-overlay").classList.remove("hidden");
  document.getElementById("dashboard").classList.add("hidden");
  document.getElementById("error-state").classList.add("hidden");
}

function hideLoading() {
  document.getElementById("loading-overlay").classList.add("hidden");
}

function showDashboard() {
  document.getElementById("dashboard").classList.remove("hidden");
  // Set header user name
  const storedUser = localStorage.getItem("cb_user") || "Admin";
  const headerName = document.getElementById("header-user-name");
  const headerAvatar = document.getElementById("header-user-avatar");
  if (headerName) headerName.textContent = storedUser;
  if (headerAvatar) headerAvatar.textContent = storedUser.substring(0, 2).toUpperCase();
}

function showError(message) {
  hideLoading();
  document.getElementById("error-state").classList.remove("hidden");
  document.getElementById("dashboard").classList.add("hidden");
  const msgEl = document.getElementById("error-message");
  if (msgEl) msgEl.textContent = message;
}

// ── Main ─────────────────────────────────────────────
async function init() {
  try {
    showLoading();

    const fhirData = await fetchAllPatientData(PATIENT_ID);

    if (!fhirData.patientData.entry || fhirData.patientData.entry.length === 0) {
      showError("Patient not found (ID: " + PATIENT_ID + "). Please verify the patient ID.");
      return;
    }

    document.querySelector(".loading-text").textContent = "Generating AI insights...";
    document.querySelector(".loading-subtext").textContent = "Analyzing clinical patterns and care gaps";

    const analysis = await analyzeWithGPT(fhirData);

    // FHIR fallbacks for phone/email
    const ptResource = fhirData.patientData.entry[0].resource;
    const telecoms = ptResource.telecom || [];
    const fhirPhone = telecoms.find(t => t.system === "phone");
    const fhirEmail = telecoms.find(t => t.system === "email");
    const patientInfo = analysis.patient || {};
    if (!patientInfo.phone && fhirPhone) patientInfo.phone = fhirPhone.value;
    if (!patientInfo.email && fhirEmail) patientInfo.email = fhirEmail.value;

    // Render all sections
    renderPatientCard(patientInfo, ptResource);
    renderAlertTriggers(analysis.alertTriggers || []);
    renderDeterioratingTrends(analysis.deterioratingTrends || []);
    renderAIActions(analysis.aiActions || []);
    renderVitals(fhirData.observations);
    renderMedications(fhirData.medications);
    renderAppointments(fhirData.encounters);
    renderCareTeam(analysis.careTeam || []);
    renderClinicalNotes(analysis.clinicalNotes || []);

    setupApproveModal(analysis.aiActions || []);
    hideLoading();
    showDashboard();
    setupMarkReviewed();

  } catch (err) {
    console.error("Dashboard error:", err);
    showError(err.message || "An unexpected error occurred. Please try again.");
  }
}

// ── Approve Modal ─────────────────────────────────────
function setupApproveModal(actions) {
  const approveBtn = document.getElementById("approve-btn");
  const overlay = document.getElementById("approve-modal-overlay");
  const closeX = document.getElementById("modal-close-x");
  const cancelBtn = document.getElementById("modal-cancel-btn");
  const confirmBtn = document.getElementById("modal-confirm-btn");
  let pendingCount = 0;

  function openModal() {
    const checked = document.querySelectorAll(".action-checkbox:checked");
    if (checked.length === 0) {
      showTaskToast("Please select at least one action first", "warn");
      return;
    }
    pendingCount = checked.length;
    const selected = Array.from(checked).map(cb => actions[parseInt(cb.dataset.idx)]);
    document.getElementById("modal-action-count").textContent = selected.length;

    const list = document.getElementById("modal-actions-list");
    list.innerHTML = "";
    selected.forEach(action => {
      const pc = action.priority.toLowerCase().includes("high") ? "high" :
                 action.priority.toLowerCase().includes("medium") ? "medium" : "low";
      const priorityShort = action.priority.replace(" Priority", "").replace(" priority", "");
      const item = document.createElement("div");
      item.className = "modal-action-item";
      item.innerHTML =
        '<span class="modal-action-check">&#10003;</span>' +
        '<div class="modal-action-content">' +
          '<div class="modal-action-title-row">' +
            '<span class="modal-action-name">' + escHtml(action.title) + '</span>' +
            '<span class="modal-priority-pill ' + pc + '">' + escHtml(priorityShort) + '</span>' +
          '</div>' +
          '<p class="modal-action-desc">' + escHtml(action.description) + '</p>' +
        '</div>';
      list.appendChild(item);
    });

    document.getElementById("coordinator-notes").value = "";
    overlay.classList.remove("hidden");
  }

  function closeModal() { overlay.classList.add("hidden"); }

  approveBtn.addEventListener("click", openModal);
  closeX.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

  confirmBtn.addEventListener("click", () => {
    const count = pendingCount;
    closeModal();
    document.querySelectorAll(".action-checkbox").forEach(cb => {
      cb.checked = false;
      cb.closest(".action-card").classList.remove("selected");
    });
    updateSelectedCount();
    const msg = count === 1 ? "Task created successfully" : count + " tasks created successfully";
    showTaskToast(msg);
  });
}

// ── Task Toast ───────────────────────────────────────
function showTaskToast(message, type) {
  const isWarn = type === "warn";
  const wrapper = document.createElement("div");
  wrapper.className = "task-toast-wrapper";
  const icon = isWarn ? "&#9888;" : "&#10003;";
  const cls = isWarn ? "review-toast warn-toast" : "review-toast task-toast";
  wrapper.innerHTML = '<div class="' + cls + '"><span>' + icon + '</span> ' + escHtml(message) + '</div>';
  const actionsHeader = document.querySelector(".actions-header");
  actionsHeader.insertAdjacentElement("afterend", wrapper);
  setTimeout(() => {
    wrapper.style.opacity = "0";
    setTimeout(() => wrapper.remove(), 300);
  }, 2000);
}

// ── Mark as Reviewed ─────────────────────────────────
function setupMarkReviewed() {
  const btn = document.getElementById("mark-reviewed-btn");
  let isReviewed = false;

  btn.addEventListener("click", () => {
    const badgesEl = document.getElementById("patient-badges");

    if (!isReviewed) {
      const reviewedBadge = document.createElement("span");
      reviewedBadge.className = "badge badge-reviewed";
      reviewedBadge.innerHTML = "&#10004; Reviewed";
      badgesEl.appendChild(reviewedBadge);

      btn.innerHTML = '<span>&#10004;</span> Reviewed';
      btn.classList.add("reviewed-state");

      // Toast near patient card
      const wrapper = document.createElement("div");
      wrapper.className = "review-toast-wrapper";
      wrapper.innerHTML = '<div class="review-toast"><span>&#10004;</span> Alert marked as reviewed</div>';
      const card = document.getElementById("patient-card");
      card.parentNode.insertBefore(wrapper, card);

      setTimeout(() => {
        wrapper.style.opacity = "0";
        setTimeout(() => wrapper.remove(), 300);
      }, 1000);

      isReviewed = true;
    } else {
      const reviewedBadge = badgesEl.querySelector(".badge-reviewed");
      if (reviewedBadge) reviewedBadge.remove();
      btn.innerHTML = '&#10003; Mark as Reviewed';
      btn.classList.remove("reviewed-state");
      isReviewed = false;
    }
  });
}

// ── Start ─────────────────────────────────────────────
if (PATIENT_ID) init();
