import React, { useState, useEffect, useRef, useCallback } from 'react'
import { fetchAllPatientData, stripFhirMeta } from '../utils/fhir'
import { formatDate, formatTime, formatDateTime } from '../utils/helpers'
import { ICONS } from '../utils/constants'
import logoRsi from '@images/LogoRsi.png'
import chatbotPng from '@chatbot_image/chatbot.png'
import '../styles/dashboard.css'

// ── GPT Analysis ──────────────────────────────────────
async function analyzeWithGPT(fhirData) {
  const today = new Date().toISOString().split('T')[0]
  const systemPrompt = [
    'You are a clinical data analyst for a care coordination platform.',
    'Analyze the provided FHIR patient data and return a JSON object with the exact structure specified.',
    'Use clinical evidence from the data. Do not fabricate values not supported by the data.',
    'Derive age from birthDate. Extract phone and email from Patient telecom array.',
    'For programs: identify care management programs based on conditions (e.g. Diabetes Management, Hypertension Program, CKD Program, Heart Failure Program).',
    'For risk score: compute a 0-100 score based on number and severity of conditions, abnormal observations, medication gaps, and missed encounters.',
    'For alert triggers: identify 2-4 key issues from abnormal observations (worsening trends), on-hold/stopped medications, cancelled/no-show encounters.',
    'For deteriorating trends: focus on BP, HbA1c, LDL, Creatinine and compare latest values to clinical targets.',
    'For AI actions: generate 4-6 actionable clinical recommendations with rationale.',
    'For care team: infer a realistic 3-4 member care team (PCP + relevant specialists) based on the patient\'s active conditions. Mark the primary care provider with isPrimary: true.',
    'For clinical notes: generate 2-3 realistic, brief clinical notes based on the encounter and observation data. Type values: Clinical, Coordination, Admin.',
    'Today\'s date: ' + today
  ].join(' ')

  const userPrompt = [
    'Analyze this patient\'s FHIR data and return ONLY a valid JSON object with this exact structure:',
    '',
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
    '',
    'Priority values for alertTriggers: Critical, High Priority, Medium Priority',
    'Priority values for aiActions: High Priority, Medium Priority, Low Priority',
    'Icon values: heart, pill, calendar, chart, alert, lab',
    'Status values for trends: above, normal, below',
    'Tags should include High Risk / Medium Risk / Low Risk based on riskLevel, and Care Gap if care gaps are detected.',
    '',
    '=== PATIENT DATA ===',
    JSON.stringify(stripFhirMeta(fhirData.patientData), null, 0),
    '',
    '=== CONDITIONS ===',
    JSON.stringify(stripFhirMeta(fhirData.conditions), null, 0),
    '',
    '=== MEDICATIONS ===',
    JSON.stringify(stripFhirMeta(fhirData.medications), null, 0),
    '',
    '=== ENCOUNTERS ===',
    JSON.stringify(stripFhirMeta(fhirData.encounters), null, 0),
    '',
    '=== OBSERVATIONS ===',
    JSON.stringify(fhirData.observations.slice(0, 50).map(o => {
      const r = { ...o }; delete r.meta; delete r.text; delete r.id; return r
    }), null, 0)
  ].join('\n')

  const res = await fetch('/api/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    })
  })

  if (res.status === 429) throw new Error('AI analysis rate limited. Please wait a moment and try again.')
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || 'GPT analysis failed (' + res.status + ')')
  }
  const data = await res.json()
  const content = data.choices[0].message.content
  try { return JSON.parse(content) } catch(e) { throw new Error('AI analysis returned invalid data. Please retry.') }
}

// ── Helpers ───────────────────────────────────────────
function esc(str) {
  return str ? String(str) : ''
}

function getLatestObs(observations, code) {
  const matching = observations.filter(o => o.code?.coding?.some(c => c.code === code))
  if (!matching.length) return null
  return matching.sort((a, b) => new Date(b.effectiveDateTime || 0) - new Date(a.effectiveDateTime || 0))[0]
}

// ── Sub-components ────────────────────────────────────

function PatientCard({ patient, ptResource, onMarkReviewed }) {
  const [reviewed, setReviewed] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const toastTimer = useRef(null)

  const gender = ptResource?.gender
    ? ptResource.gender.charAt(0).toUpperCase() + ptResource.gender.slice(1) : ''
  const dobRaw = ptResource?.birthDate || ''
  const dobYear = dobRaw ? parseInt(dobRaw.split('-')[0]) : 0
  const dob = dobRaw && dobYear <= new Date().getFullYear() ? formatDate(dobRaw) : ''

  const riskColors = {
    high:     { text: '#b91c1c', borderLeft: '#ef4444', bg: '#fff9f9', border: '#fde8e8' },
    critical: { text: '#b91c1c', borderLeft: '#ef4444', bg: '#fff9f9', border: '#fde8e8' },
    medium:   { text: '#b45309', borderLeft: '#f59e0b', bg: '#fffef8', border: '#fef3cd' },
    low:      { text: '#15803d', borderLeft: '#22c55e', bg: '#f9fefb', border: '#d5f5e3' }
  }
  const riskKey = (patient.riskLevel || 'high').toLowerCase()
  const colors = riskColors[riskKey] || riskColors.high

  function handleReviewToggle() {
    const next = !reviewed
    setReviewed(next)
    clearTimeout(toastTimer.current)
    if (next) {
      setShowToast(true)
      toastTimer.current = setTimeout(() => setShowToast(false), 2000)
    } else {
      setShowToast(false)
    }
  }

  function getBadgeClass(tag) {
    const tl = tag.toLowerCase()
    if (tl.includes('high risk') || tl.includes('critical')) return 'badge badge-high-risk'
    if (tl.includes('medium risk')) return 'badge badge-medium-risk'
    if (tl.includes('low risk')) return 'badge badge-low-risk'
    return 'badge badge-care-gap'
  }

  return (
    <section id="patient-card" style={{
      borderColor: colors.border,
      borderLeftColor: colors.borderLeft,
      background: colors.bg
    }}>
      <div className="patient-card-left">
        <div className="patient-avatar">{patient.initials || '??'}</div>
        <div className="patient-info">
          <div className="patient-name-row">
            <h2>{patient.name || 'Unknown'}</h2>
            <div id="patient-badges">
              {(patient.tags || []).map(tag => (
                <span key={tag} className={getBadgeClass(tag)}
                  style={tag.toLowerCase().includes('risk') ? {} : { color: colors.text, borderColor: colors.text }}>
                  {reviewed && tag.toLowerCase().includes('risk')
                    ? <><span style={{ marginRight: 4 }}>✓</span>Reviewed</>
                    : tag}
                </span>
              ))}
            </div>
          </div>
          <div className="patient-details-row">
            {patient.age && <span className="detail-value">{patient.age} yrs</span>}
            {gender && <><span className="detail-sep">•</span><span className="detail-value">{gender}</span></>}
            {(patient.mrn) && <><span className="detail-sep">•</span><span><span className="detail-label">MRN:</span><span className="detail-value">{patient.mrn}</span></span></>}
            {patient.programs?.length > 0 && <><span className="detail-sep">•</span><span><span className="detail-label">Programs:</span><span className="detail-value">{patient.programs.join(', ')}</span></span></>}
            {patient.riskScore && <><span className="detail-sep">•</span><span><span className="detail-label">Score:</span><span className={`detail-value${riskKey !== 'low' ? ' risk-high' : ''}`}>{patient.riskScore}</span></span></>}
          </div>
          <div className="patient-contact-row">
            {dob && <div className="contact-item"><span>📅</span> DOB: {dob}</div>}
            {patient.phone && patient.phone !== 'N/A' && <div className="contact-item"><span>📞</span> {patient.phone}</div>}
            {patient.email && patient.email !== 'N/A' && <div className="contact-item"><span>✉</span> {patient.email}</div>}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        <button id="mark-reviewed-btn" onClick={handleReviewToggle}
          className={reviewed ? 'reviewed' : ''}>
          {reviewed ? '✓ Reviewed' : '✓ Mark as Reviewed'}
        </button>
        {showToast && (
          <div className="review-toast-wrapper">
            <div className={`review-toast${reviewed ? '' : ' unreviewed'}`}>
              <span>✓</span> {reviewed ? 'Marked as Reviewed' : 'Marked as Unreviewed'}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function AlertSection({ alerts, trends }) {
  const getPc = (priority) => {
    const p = (priority || '').toLowerCase()
    if (p.includes('critical')) return 'critical'
    if (p.includes('high')) return 'high'
    return 'medium'
  }

  return (
    <section id="alert-section">
      <div className="section-header">
        <span className="alert-circle-icon">⚠</span>
        <div>
          <h3>Alert Triggers &amp; Risk Drivers</h3>
          <p className="section-subtitle">AI-detected issues requiring immediate attention</p>
        </div>
      </div>
      <div id="alert-cards-container" className="alert-cards-grid">
        {alerts.length === 0
          ? <p style={{ color: 'var(--text-mid)' }}>No alert triggers detected.</p>
          : alerts.map((alert, i) => (
            <div key={i} className={`alert-card ${getPc(alert.priority)}`}>
              <div className="alert-card-header">
                <span className="alert-card-icon">{ICONS[alert.icon] || ICONS.alert}</span>
                <span className="alert-card-title">{esc(alert.title)}</span>
              </div>
              <p className="alert-card-desc">{esc(alert.description)}</p>
              <span className={`priority-badge ${getPc(alert.priority)}`}>{esc(alert.priority)}</span>
            </div>
          ))
        }
      </div>
      <div id="trends-section">
        <div className="trends-title-row">
          <span className="trend-arrow-icon">↗</span>
          <span className="trends-title-text">Deteriorating Clinical Trends</span>
        </div>
        <div id="trends-container" className="trends-row">
          {trends.length === 0
            ? <p style={{ color: 'var(--text-mid)' }}>No deteriorating trends detected.</p>
            : trends.map((t, i) => (
              <div key={i} className="trend-item">
                <div className="trend-label">{esc(t.label)}</div>
                <div className={`trend-value ${t.status === 'above' ? 'above' : t.status === 'normal' ? 'normal' : ''}`}>{esc(t.value)}</div>
                <div className="trend-target">Target: {esc(t.target)}</div>
              </div>
            ))
          }
        </div>
      </div>
    </section>
  )
}

function AIActionsTab({ actions }) {
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [modalOpen, setModalOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [toastMsg, setToastMsg] = useState('')
  const toastRef = useRef(null)

  function toggleSelect(idx) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  function handleApproveClick() {
    if (selectedIds.size === 0) {
      setToastMsg('Please select at least one action')
      clearTimeout(toastRef.current)
      toastRef.current = setTimeout(() => setToastMsg(''), 2000)
      return
    }
    setModalOpen(true)
  }

  function handleConfirm() {
    const count = selectedIds.size
    setModalOpen(false)
    setSelectedIds(new Set())
    setNotes('')
    const msg = count === 1 ? 'Task created successfully' : `${count} tasks created successfully`
    setToastMsg(msg)
    clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToastMsg(''), 2000)
  }

  const getPc = (priority) => {
    const p = (priority || '').toLowerCase()
    if (p.includes('high') || p.includes('critical')) return 'high'
    if (p.includes('medium')) return 'medium'
    return 'low'
  }

  const selectedActions = actions.filter((_, i) => selectedIds.has(i))

  return (
    <section id="ai-actions-tab">
      <div className="actions-header">
        <div>
          <h3>AI-Recommended Actions</h3>
          <p className="section-subtitle">Select actions to approve and create tasks ({selectedIds.size} selected)</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <button id="approve-btn" className="approve-btn" onClick={handleApproveClick}>
            ✔ Approve Selected ({selectedIds.size})
          </button>
          {toastMsg && (
            <div className="task-toast-wrapper">
              <div className="review-toast task-toast"><span>✓</span> {toastMsg}</div>
            </div>
          )}
        </div>
      </div>
      <div id="actions-list">
        {actions.length === 0
          ? <p style={{ color: 'var(--text-mid)' }}>No AI-recommended actions at this time.</p>
          : actions.map((action, idx) => {
            const pc = getPc(action.priority)
            const selected = selectedIds.has(idx)
            return (
              <div key={idx}
                className={`action-card${selected ? ' selected' : ''}`}
                onClick={() => toggleSelect(idx)}>
                <div className="action-card-top">
                  <input type="checkbox" className="action-checkbox"
                    checked={selected} onChange={() => toggleSelect(idx)}
                    onClick={e => e.stopPropagation()} />
                  <div className="action-content">
                    <div className="action-title-row">
                      <span className="action-title">{esc(action.title)}</span>
                      <span className={`priority-badge ${pc}`}>{esc(action.priority)}</span>
                      <span className="timeframe-pill">⏱ {esc(action.timeframe)}</span>
                    </div>
                    <p className="action-desc">{esc(action.description)}</p>
                    <div className="action-rationale">
                      <div className="rationale-label">AI RATIONALE:</div>
                      <div className="rationale-text">{esc(action.rationale)}</div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        }
      </div>

      {/* Approve Modal */}
      {modalOpen && (
        <div id="approve-modal-overlay" className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}>
          <div className="modal">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Approve &amp; Create Tasks</h2>
                <p className="modal-subtitle">Review selected actions and add coordinator notes before creating tasks</p>
              </div>
              <button className="modal-close" onClick={() => setModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p className="modal-section-label">Selected Actions ({selectedActions.length}):</p>
              <div id="modal-actions-list" className="modal-actions-list">
                {selectedActions.map((a, i) => (
                  <div key={i} className="modal-action-item">
                    <span className={`priority-badge ${getPc(a.priority)}`}>{a.priority}</span>
                    <span className="modal-action-title">{a.title}</span>
                  </div>
                ))}
              </div>
              <p className="modal-section-label" style={{ marginTop: 20 }}>Coordinator Notes (Optional)</p>
              <textarea
                id="coordinator-notes"
                className="coordinator-notes"
                placeholder="Add any additional context or special instructions for task execution..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
              <div className="assignment-box">
                <p className="assignment-title">Assignment:</p>
                <p className="assignment-text">Tasks will be created and assigned to <strong>your task queue</strong> for immediate action</p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-cancel" onClick={() => setModalOpen(false)}>
                <span className="cancel-x">&times;</span> Cancel
              </button>
              <button className="modal-confirm" onClick={handleConfirm}>✓ Confirm &amp; Create Tasks</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function Vitals({ observations }) {
  const syObs      = getLatestObs(observations, '8480-6')
  const diaObs     = getLatestObs(observations, '8462-4')
  const hrObs      = getLatestObs(observations, '8867-4')
  const glucoseObs = getLatestObs(observations, '2345-7')
  const hba1cObs   = getLatestObs(observations, '4548-4')

  const allObs = [syObs, diaObs, hrObs, glucoseObs, hba1cObs].filter(Boolean)
  const latestDate = allObs.length > 0
    ? allObs.sort((a, b) => new Date(b.effectiveDateTime || 0) - new Date(a.effectiveDateTime || 0))[0]?.effectiveDateTime
    : null

  const vitals = []
  if (syObs && diaObs) {
    const sy = syObs.valueQuantity?.value, dia = diaObs.valueQuantity?.value
    if (sy !== undefined && dia !== undefined) {
      const isAbnormal = sy > 130 || sy < 90
      vitals.push({ label: 'BLOOD PRESSURE', value: Math.round(sy) + '/' + Math.round(dia), unit: 'mmHg', normalText: 'Normal 120/80', isAbnormal, pct: Math.min(100, (sy / 200) * 100), icon: '⚡' })
    }
  }
  if (hrObs) {
    const val = hrObs.valueQuantity?.value
    if (val !== undefined) vitals.push({ label: 'HEART RATE', value: Math.round(val), unit: 'bpm', normalText: 'Normal 60-100', isAbnormal: val < 60 || val > 100, pct: Math.min(100, (val / 150) * 100), icon: '♥' })
  }
  if (glucoseObs) {
    const val = glucoseObs.valueQuantity?.value
    if (val !== undefined) vitals.push({ label: 'BLOOD GLUCOSE', value: Math.round(val), unit: 'mg/dL', normalText: 'Normal 70-130', isAbnormal: val < 70 || val > 130, pct: Math.min(100, (val / 250) * 100), icon: '💧' })
  }
  if (hba1cObs) {
    const val = hba1cObs.valueQuantity?.value
    if (val !== undefined) vitals.push({ label: 'HBA1C', value: parseFloat(val).toFixed(1), unit: '%', normalText: 'Target < 7%', isAbnormal: val > 7, pct: Math.min(100, (val / 15) * 100), icon: '🧪' })
  }

  return (
    <section id="vitals-section" className="info-section">
      <div className="info-section-header">
        <h3>Vitals</h3>
        <p className="section-subtitle">{latestDate ? 'Last updated: ' + formatDateTime(latestDate) : '—'}</p>
      </div>
      <div id="vitals-grid" className="vitals-grid">
        {vitals.length === 0
          ? <p style={{ color: 'var(--text-mid)' }}>No vital signs data available.</p>
          : vitals.map((v, i) => (
            <div key={i} className="vital-card">
              <div className="vital-card-top">
                <div className="vital-left">
                  <span className="vital-icon">{v.icon}</span>
                  <div>
                    <div className="vital-label">{v.label}</div>
                    <div className={`vital-value ${v.isAbnormal ? 'vital-abnormal' : 'vital-normal-val'}`}>
                      {v.value} <span className="vital-unit">{v.unit}</span>
                    </div>
                  </div>
                </div>
                <div className="vital-normal-label">{v.normalText}</div>
              </div>
              <div className="vital-bar">
                <div className={`vital-bar-fill ${v.isAbnormal ? 'vital-bar-red' : 'vital-bar-green'}`} style={{ width: v.pct.toFixed(0) + '%' }} />
              </div>
            </div>
          ))
        }
      </div>
    </section>
  )
}

function Medications({ medications }) {
  const meds = (medications?.entry || [])
    .map(e => e.resource)
    .filter(r => r && (r.status === 'active' || r.status === 'on-hold'))
    .slice(0, 8)

  return (
    <section id="medications-section" className="info-section">
      <div className="info-section-header">
        <h3>Current Medications</h3>
        <p className="section-subtitle">{meds.length} active prescription{meds.length !== 1 ? 's' : ''}</p>
      </div>
      <div id="medications-list">
        {meds.length === 0
          ? <p style={{ color: 'var(--text-mid)' }}>No active medications found.</p>
          : meds.map((med, i) => {
            const name = med.medicationCodeableConcept?.text ||
              med.medicationCodeableConcept?.coding?.[0]?.display ||
              med.medicationReference?.display || 'Unknown Medication'
            const status = med.status || 'unknown'
            const dosage = med.dosageInstruction?.[0]?.text || ''
            const prescriber = med.requester?.display || ''
            const startDate = med.authoredOn ? formatDate(med.authoredOn.split('T')[0]) : ''
            const statusClass = status === 'active' ? 'med-active' : status === 'on-hold' ? 'med-onhold' : 'med-other'
            const statusLabel = status === 'on-hold' ? 'On Hold' : status.charAt(0).toUpperCase() + status.slice(1)
            return (
              <div key={i} className="med-item">
                <div className="med-icon">💊</div>
                <div className="med-info">
                  <div className="med-name-row">
                    <span className="med-name">{name}</span>
                    <span className={`med-status-badge ${statusClass}`}>{statusLabel}</span>
                  </div>
                  {dosage && <div className="med-dosage">{dosage}</div>}
                  {(prescriber || startDate) && (
                    <div className="med-prescriber">
                      {prescriber}{prescriber && startDate ? ' • ' : ''}{startDate ? 'Started ' + startDate : ''}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        }
      </div>
    </section>
  )
}

function Appointments({ encounters }) {
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const appts = (encounters?.entry || [])
    .map(e => e.resource)
    .filter(r => r)
    .sort((a, b) => new Date(b.period?.start || 0) - new Date(a.period?.start || 0))
    .slice(0, 5)

  return (
    <section id="appointments-section" className="info-section">
      <div className="info-section-header">
        <h3>Appointments</h3>
        <p className="section-subtitle">Upcoming and recent visits</p>
      </div>
      <div id="appointments-list">
        {appts.length === 0
          ? <p style={{ color: 'var(--text-mid)' }}>No appointments found.</p>
          : appts.map((enc, i) => {
            const title = enc.type?.[0]?.coding?.[0]?.display || enc.type?.[0]?.text ||
              (enc.class?.code === 'IMP' ? 'Inpatient Admission' : 'Outpatient Visit')
            const status = enc.status || 'unknown'
            const doctorName = enc.participant?.[0]?.individual?.display || ''
            const dateRaw = enc.period?.start ? enc.period.start.split('T')[0] : ''
            const dateStr = dateRaw ? formatDate(dateRaw) : ''
            const timeStr = enc.period?.start ? formatTime(enc.period.start) : ''
            const location = enc.location?.[0]?.location?.display || ''
            const isTelehealth = title.toLowerCase().includes('telehealth') || location.toLowerCase().includes('telehealth')

            const apptDate = enc.period?.start ? new Date(enc.period.start) : null
            const isPast = apptDate && apptDate < today

            let statusClass, statusLabel
            if (!isPast && apptDate) {
              statusClass = 'appt-upcoming'; statusLabel = 'Upcoming'
            } else if (status === 'noshow' || (isPast && ['planned', 'arrived', 'triaged'].includes(status))) {
              statusClass = 'appt-cancelled'; statusLabel = 'Missed'
            } else if (status === 'cancelled') {
              statusClass = 'appt-cancelled'; statusLabel = 'Cancelled'
            } else {
              statusClass = 'appt-completed'; statusLabel = 'Completed'
            }

            return (
              <div key={i} className="appt-item">
                <div className="appt-title-row">
                  <span className="appt-title">{title}</span>
                  <span className={`appt-status-badge ${statusClass}`}>{statusLabel}</span>
                  {isTelehealth && <span className="appt-telehealth-badge">📹 Telehealth</span>}
                </div>
                {doctorName && <div className="appt-doctor">with {doctorName}</div>}
                <div className="appt-meta">
                  {dateStr && <span className="appt-meta-item">📅 {dateStr}</span>}
                  {timeStr && <span className="appt-meta-item">🕐 {timeStr}</span>}
                  {location && <span className="appt-meta-item">📍 {location}</span>}
                </div>
              </div>
            )
          })
        }
      </div>
    </section>
  )
}

function CareTeam({ careTeam }) {
  return (
    <section id="care-team-section" className="info-section">
      <div className="care-team-header">
        <div className="section-title-row-sm">
          <span className="section-icon-sm">👤</span>
          <h3>Care Team</h3>
        </div>
        <p className="section-subtitle">{careTeam.length} MEMBERS INVOLVED</p>
      </div>
      <div id="care-team-list">
        {careTeam.length === 0
          ? <p style={{ color: 'var(--text-mid)' }}>Care team information not available.</p>
          : careTeam.map((member, i) => (
            <div key={i} className="care-member">
              <div className="care-avatar">{esc(member.initials || '??')}</div>
              <div className="care-info">
                <div className="care-name-row">
                  <span className="care-name">{esc(member.name || 'Unknown')}</span>
                  {member.isPrimary && <span className="primary-badge">Primary</span>}
                </div>
                <div className="care-role">{esc(member.role || '')}</div>
                {member.specialty && <div className="care-specialty">{esc(member.specialty)}</div>}
              </div>
              <div className="care-actions">
                <button className="care-action-btn" title="Call">📞</button>
                <button className="care-action-btn" title="Email">✉</button>
              </div>
            </div>
          ))
        }
      </div>
    </section>
  )
}

function ClinicalNotes({ clinicalNotes }) {
  const [activeFilter, setActiveFilter] = useState('All')

  const typeCounts = { Clinical: 0, Coordination: 0, Admin: 0 }
  clinicalNotes.forEach(n => {
    const t = n.type || 'Clinical'
    if (typeCounts[t] !== undefined) typeCounts[t]++
  })

  const tabs = [
    { label: 'All', count: clinicalNotes.length },
    { label: 'Clinic', count: typeCounts.Clinical },
    { label: 'Care', count: typeCounts.Coordination },
    { label: 'Admin', count: typeCounts.Admin }
  ]

  const filtered = activeFilter === 'All' ? clinicalNotes
    : activeFilter === 'Clinic' ? clinicalNotes.filter(n => n.type === 'Clinical')
    : activeFilter === 'Care' ? clinicalNotes.filter(n => n.type === 'Coordination')
    : clinicalNotes.filter(n => n.type === 'Admin')

  return (
    <section id="clinical-notes-section" className="info-section">
      <div className="clinical-notes-top">
        <div>
          <h3>Clinical Notes</h3>
          <p className="section-subtitle">{clinicalNotes.length} TOTAL ENTRIES</p>
        </div>
        <button className="add-note-btn">📄 Add Note</button>
      </div>
      <div id="notes-filter-bar" className="notes-filter-bar">
        {tabs.map(t => (
          <button key={t.label}
            className={`notes-filter-tab${activeFilter === t.label ? ' active' : ''}`}
            onClick={() => setActiveFilter(t.label)}>
            {t.label} ({t.count})
          </button>
        ))}
      </div>
      <div id="clinical-notes-list">
        {filtered.length === 0
          ? <p style={{ color: 'var(--text-mid)' }}>No clinical notes available.</p>
          : filtered.map((note, i) => {
            const typeClass = note.type === 'Coordination' ? 'note-type-coord'
              : note.type === 'Admin' ? 'note-type-admin' : 'note-type-clinical'
            return (
              <div key={i} className="note-item">
                <div className="note-header">
                  <div className="note-left">
                    <div className="note-icon">📄</div>
                    <div className="note-author-info">
                      <div className="note-author-top">
                        <span className="note-author-name">{esc(note.authorName || 'Unknown')}</span>
                        {note.authorRole && <span className="note-author-role">{esc(note.authorRole)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="note-right">
                    <span className={`note-type-badge ${typeClass}`}>{esc(note.type || 'Clinical')}</span>
                    <button className="note-view-btn">View</button>
                  </div>
                </div>
                {note.content && <p className="note-content">{esc(note.content)}</p>}
                {note.dateStr && <div className="note-time">🕐 {esc(note.dateStr)}</div>}
              </div>
            )
          })
        }
      </div>
    </section>
  )
}

// ── Main DashboardPage ────────────────────────────────
export default function DashboardPage() {
  const [state, setState] = useState('loading') // loading | error | ready
  const [errorMsg, setErrorMsg] = useState('')
  const [loadingText, setLoadingText] = useState('Analyzing patient data with AI...')
  const [loadingSubtext, setLoadingSubtext] = useState('Fetching clinical records and generating insights')
  const [analysis, setAnalysis] = useState(null)
  const [fhirData, setFhirData] = useState(null)
  const [activeTab, setActiveTab] = useState('ai-actions')

  const patientId = new URLSearchParams(window.location.search).get('patient')
  const authToken = localStorage.getItem('cb_token')
  const storedUser = localStorage.getItem('cb_user') || 'Admin'

  useEffect(() => {
    if (!authToken) { window.location.href = '/'; return }
    if (!patientId) { setErrorMsg('No patient ID provided. Please launch this dashboard from the CareBridge chatbot.'); setState('error'); return }
    init()
  }, [])

  async function init() {
    try {
      setState('loading')
      const data = await fetchAllPatientData(patientId)
      if (!data.patientData.entry || data.patientData.entry.length === 0) {
        setErrorMsg('Patient not found (ID: ' + patientId + '). Please verify the patient ID.')
        setState('error')
        return
      }
      setLoadingText('Generating AI insights...')
      setLoadingSubtext('Analyzing clinical patterns and care gaps')
      const result = await analyzeWithGPT(data)

      // FHIR fallbacks for phone/email
      const ptResource = data.patientData.entry[0].resource
      const telecoms = ptResource.telecom || []
      const fhirPhone = telecoms.find(t => t.system === 'phone')
      const fhirEmail = telecoms.find(t => t.system === 'email')
      const patientInfo = result.patient || {}
      if (!patientInfo.phone && fhirPhone) patientInfo.phone = fhirPhone.value
      if (!patientInfo.email && fhirEmail) patientInfo.email = fhirEmail.value

      setAnalysis(result)
      setFhirData(data)
      setState('ready')
    } catch(err) {
      setErrorMsg(err.message)
      setState('error')
    }
  }

  const tabs = [
    { id: 'ai-actions', label: '⚙ AI Actions' },
    { id: 'clinical-trends', label: '↺ Clinical Trends', disabled: true },
    { id: 'task-queue', label: '☰ Task Queue', disabled: true },
    { id: 'patient-outreach', label: '💬 Patient Outreach', disabled: true },
  ]

  if (state === 'loading') {
    return (
      <div id="loading-overlay">
        <div className="loader-spinner"></div>
        <p className="loading-text">{loadingText}</p>
        <p className="loading-subtext">{loadingSubtext}</p>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div id="error-state">
        <div className="error-card">
          <div className="error-icon">!</div>
          <h2>Something went wrong</h2>
          <p>{errorMsg}</p>
          <button className="retry-btn" onClick={init}>Retry</button>
        </div>
      </div>
    )
  }

  const patient = analysis.patient || {}
  const ptResource = fhirData.patientData.entry[0].resource

  return (
    <div id="dashboard">
      {/* Header */}
      <header id="dashboard-header">
        <div className="header-left">
          <img src={logoRsi} alt="RSI" className="header-logo" />
          <span className="header-brand">Patient 360 Portal</span>
        </div>
        <nav className="header-nav">
          <a className="nav-item nav-active">CARE MANAGER</a>
          <a className="nav-item">PROVIDER</a>
          <a className="nav-item">PATIENTS</a>
        </nav>
        <div className="header-right">
          <div className="notif-wrap">
            <span className="notif-icon">🔔</span>
            <span className="notif-dot">3</span>
          </div>
          <div className="user-info-wrap">
            <span className="user-name-text">{storedUser}</span>
            <span className="user-role-text">ADMIN</span>
          </div>
          <div className="user-avatar-header">{storedUser.substring(0, 2).toUpperCase()}</div>
        </div>
      </header>

      <div className="page-container">
        {/* Breadcrumb */}
        <div className="breadcrumb-row">
          <div className="breadcrumb-left">
            <button className="back-btn" onClick={() => window.history.length > 1 ? window.history.back() : window.close()}>←</button>
            <div>
              <div className="breadcrumb-path">Care Manager Dashboard › <span className="breadcrumb-patient">{patient.name || 'Loading...'}</span></div>
              <div className="breadcrumb-sub">Patient Profile &amp; Care Management</div>
            </div>
          </div>
          <div className="breadcrumb-actions">
            <a href="#vitals-section" className="quick-action-btn">⚕ Vitals</a>
            <a href="#medications-section" className="quick-action-btn">💊 Medications</a>
            <a href="#appointments-section" className="quick-action-btn">📅 Appointments</a>
          </div>
        </div>

        {/* Patient Card */}
        <PatientCard patient={patient} ptResource={ptResource} />

        {/* Two-column layout */}
        <div className="main-layout">
          {/* Left column */}
          <div className="left-col">
            <AlertSection
              alerts={analysis.alertTriggers || []}
              trends={analysis.deterioratingTrends || []}
            />

            {/* Tabs */}
            <div className="tabs-bar">
              {tabs.map(t => (
                <button key={t.id}
                  className={`tab${t.disabled ? ' disabled' : ''}${activeTab === t.id ? ' active' : ''}`}
                  onClick={() => !t.disabled && setActiveTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === 'ai-actions' && (
              <AIActionsTab actions={analysis.aiActions || []} />
            )}

            <Vitals observations={fhirData.observations} />
            <Medications medications={fhirData.medications} />
            <Appointments encounters={fhirData.encounters} />
          </div>

          {/* Right column */}
          <div className="right-col">
            <CareTeam careTeam={analysis.careTeam || []} />
            <ClinicalNotes clinicalNotes={analysis.clinicalNotes || []} />
          </div>
        </div>
      </div>
    </div>
  )
}
