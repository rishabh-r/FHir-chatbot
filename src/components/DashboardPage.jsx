import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { callFhirApi, buildUrl } from '../services/fhir'
import { FHIR_BASE } from '../config'
import { formatDisplayName } from '../utils'
import '../dashboard.css'

const ALERT_ICONS = { 'Clinical Deterioration': '⚠', 'Medication Non-Adherence': '💊', 'Missed Follow-Up Appointments': '📅' }

function summarizeFhirData(observations, encounters, medications) {
  const obs = (observations?.entry || []).slice(0, 60).map(e => {
    const r = e.resource
    return {
      code: r.code?.coding?.[0]?.display || r.code?.text || '',
      value: r.valueQuantity ? `${r.valueQuantity.value} ${r.valueQuantity.unit || ''}` : r.valueString || '',
      date: r.effectiveDateTime || r.issued || '',
      ref: r.referenceRange?.[0]?.text || ''
    }
  }).filter(o => o.code && o.value)

  const enc = (encounters?.entry || []).slice(0, 40).map(e => {
    const r = e.resource
    return {
      type: r.type?.[0]?.coding?.[0]?.display || r.type?.[0]?.text || '',
      status: r.status || '',
      class: r.class?.display || r.class?.code || '',
      date: r.period?.start || '',
      location: r.location?.[0]?.location?.display || '',
      locationStatus: r.location?.[0]?.status || ''
    }
  })

  const med = (medications?.entry || []).slice(0, 40).map(e => {
    const r = e.resource
    return {
      name: r.medicationCodeableConcept?.coding?.[0]?.display || r.medicationCodeableConcept?.text || '',
      status: r.status || '',
      authored: r.authoredOn || '',
      note: r.note?.[0]?.text || ''
    }
  }).filter(m => m.name)

  return { observations: obs, encounters: enc, medications: med }
}

async function callAIForAnalysis(patientName, fhirSummary) {
  const systemPrompt = `You are a clinical AI analyst. Analyze the patient's FHIR data and return ONLY valid JSON (no markdown fences, no explanation). Use this exact structure:
{
  "alerts": [
    { "title": "Clinical Deterioration", "detail": "one-line summary of most concerning abnormal reading with value", "severity": "CRITICAL" },
    { "title": "Medication Non-Adherence", "detail": "one-line summary of worst medication gap with duration in days", "severity": "HIGH" },
    { "title": "Missed Follow-Up Appointments", "detail": "one-line summary of latest missed appointment", "severity": "MEDIUM" }
  ],
  "trends": [
    { "label": "SHORT_NAME", "value": "current value or trend e.g. 7.2% → 11.8%", "status": "critical|high|medium" }
  ]
}
Rules:
- alerts: ALWAYS return exactly 3 alerts in this order: Clinical Deterioration, Medication Non-Adherence, Missed Follow-Up Appointments
- For severity: use CRITICAL if life-threatening or far from normal, HIGH if significant concern, MEDIUM if moderate concern. Analyze the actual data.
- For detail: be specific with values, dates, medication names. Keep under 80 chars.
- trends: include ALL observations with abnormal/worsening values. Show trend arrow "→" if multiple readings. Label should be uppercase short name (HBA1C, GLUCOSE, LDL, CREATININE, etc). Status reflects severity.
- If data is insufficient for an alert, still include it with detail "No data available" and severity "MEDIUM".`

  const userContent = `Patient: ${patientName}\n\nFHIR Data:\n${JSON.stringify(fhirSummary)}`

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      stream: true,
      temperature: 0.2,
      max_tokens: 2000
    })
  })

  if (!res.ok) throw new Error(`AI API error: ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let text = '', buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]' || !data) continue
      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) text += delta
      } catch (_) {}
    }
  }

  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }
  return JSON.parse(cleaned)
}

function parsePatientFromResource(resource, patientId) {
  if (!resource) return null
  console.log('[Dashboard] FHIR Patient resource:', JSON.stringify(resource, null, 2))

  let name = 'Unknown'
  if (resource.name?.length) {
    const n = resource.name[0]
    if (n.text) {
      name = n.text
    } else {
      const given = n.given?.join(' ') || ''
      const family = n.family || ''
      name = [given, family].filter(Boolean).join(' ') || name
    }
  }
  const initials = name !== 'Unknown'
    ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3)
    : 'U'

  const gender = resource.gender
    ? resource.gender.charAt(0).toUpperCase() + resource.gender.slice(1)
    : '—'

  let phone = '—', email = '—'
  const telecoms = resource.telecom || []
  for (const t of telecoms) {
    if (t.system === 'phone' && phone === '—') phone = t.value
    if (t.system === 'email' && email === '—') email = t.value
  }

  let age = '—', dob = '—'
  const birthDate = resource.birthDate || ''
  if (birthDate) {
    const parts = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (parts) {
      const bDate = new Date(+parts[1], +parts[2] - 1, +parts[3])
      const now = new Date()
      age = now.getFullYear() - bDate.getFullYear()
      if (now.getMonth() < bDate.getMonth() ||
          (now.getMonth() === bDate.getMonth() && now.getDate() < bDate.getDate())) {
        age--
      }
      dob = bDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    }
  }

  return { name, initials, age, gender, dob, phone, email, mrn: patientId }
}

const MOCK_DATA = {
  patient: {
    name: 'Sarah Johnson', initials: 'SJ', age: 67, gender: 'Female',
    mrn: 'MRN-789456123', programs: ['Diabetes', 'Hypertension'],
    ascvdScore: '32%', priority: 'High Priority', hasCareGap: true,
    dob: 'May 15, 1957', phone: '(555) 123-4567', email: 'sarahjohnson@email.com'
  },
  alerts: [
    { title: 'Uncontrolled Hypertension', detail: 'Latest: 165/105 mmHg', severity: 'critical', icon: '⚠' },
    { title: 'Medication Non-Adherence', detail: '45 day gap in Lisinopril', severity: 'high', icon: '💊' },
    { title: 'Missed Appointments', detail: 'Cardiology (Feb 10)', severity: 'medium', icon: '📅' }
  ],
  trends: { bp: '+17 mmHg (6w)', hba1c: '8.6% (Target <7)', ldl: '172 mg/dL' },
  riskInsights: [
    { name: 'HYPERTENSION', value: '32.6%', level: 'mod' },
    { name: 'DIABETES', value: '2.5%', level: 'low' },
    { name: 'CANCER', value: '5.2%', level: 'low' }
  ],
  careTeam: [
    { name: 'Dr. Michael Chen', initials: 'DMC', role: 'Primary Care Physician', dept: 'Internal Medicine', primary: true },
    { name: 'Emily Davis', initials: 'ED', role: 'Nurse Practitioner', dept: 'Family Medicine' },
    { name: 'Jane Smith', initials: 'JS', role: 'Care Coordinator', dept: '' },
    { name: 'Dr. Robert Williams', initials: 'DRW', role: 'Endocrinologist', dept: 'Diabetes Management' }
  ],
  aiActions: [
    { title: 'Urgent Patient Outreach - Phone Call', priority: 'High Priority', priorityClass: 'high', timeframe: 'Within 24 hours',
      description: 'Contact patient within 24 hours to discuss medication adherence and appointment no-shows',
      rationale: 'Multiple care gaps detected including 45-day medication gap and missed cardiology appointment' },
    { title: 'Medication Reconciliation', priority: 'High Priority', priorityClass: 'high', timeframe: 'Within 48 hours',
      description: 'Review current medications, identify barriers to adherence, discuss pharmacy access',
      rationale: 'Lisinopril and Metformin gaps exceed 30 days, contributing to deteriorating vitals' },
    { title: 'Reschedule Cardiology Appointment', priority: 'Medium Priority', priorityClass: 'medium', timeframe: 'Within 1 week',
      description: 'Schedule follow-up cardiology appointment and address barriers to attendance',
      rationale: 'Missed appointment on Feb 10, 2026. Critical for managing uncontrolled hypertension.' },
    { title: 'Send Educational Materials', priority: 'Medium Priority', priorityClass: 'medium', timeframe: 'Within 48 hours',
      description: 'Share diabetes and hypertension management resources via patient portal',
      rationale: 'Patient education may improve understanding of medication importance and self management' },
    { title: 'Provider Alert', priority: 'High Priority', priorityClass: 'high', timeframe: 'Within 24 hours',
      description: 'Notify PCP of deteriorating BP trends and medication non-adherence via secure message',
      rationale: 'Provider may need to adjust treatment plan given worsening clinical indicators' },
    { title: 'Social Determinants Screening', priority: 'Low Priority', priorityClass: 'low', timeframe: 'During next contact',
      description: 'Assess financial, transportation, and social barriers affecting care engagement',
      rationale: 'Multiple missed appointments and medication gaps suggest potential social barriers' }
  ],
  clinicalNotes: [
    { author: 'Dr. Michael Chen', initials: 'DMC', role: 'Primary Care Physician', type: 'Clinical',
      text: 'Patient reports improved energy levels since starting new medication regimen. Blood pressure slightly elevated, will monitor closely. Discussed importance of dietary modifications and regular exercise.',
      date: 'Jan 28, 2026 · 2:15 PM' },
    { author: 'Jane Smith, RN', initials: 'JS', role: 'Care Coordinator', type: 'Coordination',
      text: 'Coordinated with patient\'s pharmacy to set up automatic prescription refills. Scheduled follow-up appointment for February. Patient expressed concerns about transportation to appointments - referred to community transport services.',
      date: 'Jan 27, 2026 · 11:30 AM' },
    { author: 'Emily Davis, NP', initials: 'ED', role: 'Nurse Practitioner', type: 'Clinical',
      text: 'Completed telehealth check-in. Patient demonstrates good understanding of medication schedule. Blood glucose logs show improvement over past two weeks. Encouraged to continue current care plan.',
      date: 'Jan 25, 2026 · 9:45 AM' }
  ],
  vitals: [
    { name: 'BLOOD PRESSURE', value: '142/88', unit: 'mmHg', normal: '120/80', status: 'elevated', pct: 78 },
    { name: 'HEART RATE', value: '78', unit: 'bpm', normal: '60-100', status: 'normal', pct: 45 },
    { name: 'BLOOD GLUCOSE', value: '145', unit: 'mg/dl', normal: '70-130', status: 'elevated', pct: 82 },
    { name: 'TEMPERATURE', value: '98.6', unit: '°F', normal: '97-99', status: 'normal', pct: 50 }
  ],
  medications: [
    { name: 'Metformin', dose: '500mg', frequency: 'Twice daily with meals', doctor: 'Dr. Michael Chen', started: 'Jan 15, 2024' },
    { name: 'Lisinopril', dose: '10mg', frequency: 'Once daily in the morning', doctor: 'Dr. Michael Chen', started: 'Dec 1, 2023' },
    { name: 'Atorvastatin', dose: '20mg', frequency: 'Once daily at bedtime', doctor: 'Dr. Michael Chen', started: 'Nov 10, 2023' }
  ],
  appointments: [
    { title: 'Follow-up Consultation', status: 'upcoming', with: 'Dr. Michael Chen', date: 'Feb 5, 2026', time: '10:00 AM', location: 'Main Clinic - Room 203' },
    { title: 'Telehealth Check-in', status: 'upcoming', telehealth: true, with: 'Nurse Practitioner Emily Davis', date: 'Feb 12, 2026', time: '2:30 PM', location: '' },
    { title: 'Lab Work', status: 'completed', with: 'Quest Diagnostics', date: 'Jan 25, 2026', time: '9:00 AM', location: 'Lab Center - Building B' }
  ]
}

const VITAL_ICONS = {
  'BLOOD PRESSURE': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  'HEART RATE': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  'BLOOD GLUCOSE': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>,
  'TEMPERATURE': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>
}

function LoadingScreen({ stepRef }) {
  const [step, setStep] = useState(0)
  const steps = ['Fetching Patient Data...', 'Analyzing Clinical Trends...', 'Generating AI Insights...']

  useEffect(() => {
    if (stepRef) stepRef.current = setStep
    const t1 = setTimeout(() => setStep(s => Math.max(s, 1)), 1200)
    const t2 = setTimeout(() => setStep(s => Math.max(s, 2)), 2200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [stepRef])

  return (
    <div className="dash-loading">
      <div className="dash-loading-box">
        <img src="/images/LogoRsi.png" alt="R Systems" className="dash-loading-logo" />
        <div className="dash-loading-spinner-ring"><div></div><div></div><div></div></div>
        <h2>Generating AI Insights...</h2>
        <p className="dash-loading-sub">Analyzing patient data and identifying care gaps</p>
        <div className="dash-loading-steps">
          {steps.map((s, i) => (
            <div key={i} className={`dash-loading-step ${i <= step ? 'active' : ''}`}>
              <span className="dash-step-dot">{i <= step ? '✓' : (i === step + 1 ? '●' : '○')}</span>
              {s}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DashboardPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const patientId = searchParams.get('patient')
  const [isLoading, setIsLoading] = useState(true)
  const [patient, setPatient] = useState(null)
  const [alertsData, setAlertsData] = useState(null)
  const [trendsData, setTrendsData] = useState(null)
  const [isReviewed, setIsReviewed] = useState(false)
  const [selectedActions, setSelectedActions] = useState([])
  const [noteFilter, setNoteFilter] = useState('all')
  const loadStepRef = useRef(null)

  const rawUser = localStorage.getItem('cb_user') || 'User'
  const userName = formatDisplayName(rawUser)

  useEffect(() => {
    if (!localStorage.getItem('cb_token')) { navigate('/'); return }

    const minLoadTime = new Promise(r => setTimeout(r, 2800))

    async function loadDashboard() {
      let patientName = 'Patient'

      const cached = sessionStorage.getItem('dashboard_patient_' + patientId)
      if (cached) {
        try {
          const resource = JSON.parse(cached)
          const parsed = parsePatientFromResource(resource, patientId)
          if (parsed) { setPatient(parsed); patientName = parsed.name }
        } catch (_) {}
      }
      if (!patient) {
        try {
          const directUrl = `${FHIR_BASE}/baseR4/Patient/${patientId}`
          const result = await callFhirApi(directUrl)
          let parsed = null
          if (result?.resourceType === 'Patient') parsed = parsePatientFromResource(result, patientId)
          else if (result?.entry?.length) parsed = parsePatientFromResource(result.entry[0].resource, patientId)
          if (parsed) { setPatient(parsed); patientName = parsed.name }
        } catch (_) {}
      }

      if (loadStepRef.current) loadStepRef.current(1)

      try {
        const [obsResult, encResult, medResult] = await Promise.all([
          callFhirApi(buildUrl('/baseR4/Observations', { subject: patientId })).catch(() => null),
          callFhirApi(buildUrl('/baseR4/Encounter', { subject: patientId })).catch(() => null),
          callFhirApi(buildUrl('/baseR4/MedicationRequest', { subject: patientId })).catch(() => null)
        ])

        if (loadStepRef.current) loadStepRef.current(2)

        const summary = summarizeFhirData(obsResult, encResult, medResult)
        const aiResult = await callAIForAnalysis(patientName, summary)

        if (aiResult?.alerts) setAlertsData(aiResult.alerts)
        if (aiResult?.trends) setTrendsData(aiResult.trends)
      } catch (e) {
        console.error('[Dashboard] AI analysis failed:', e)
      }
    }

    Promise.all([loadDashboard(), minLoadTime]).then(() => setIsLoading(false))
  }, [navigate, patientId])

  const d = MOCK_DATA
  const pt = patient || d.patient
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

  const toggleAction = (i) => {
    setSelectedActions(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])
  }

  const filteredNotes = noteFilter === 'all' ? d.clinicalNotes
    : d.clinicalNotes.filter(n => n.type.toLowerCase() === noteFilter)

  const dynAlerts = alertsData || d.alerts.map(a => ({ title: a.title, detail: a.detail, severity: a.severity.toUpperCase() }))
  const dynTrends = trendsData || [
    { label: 'BP TREND', value: d.trends.bp, status: 'critical' },
    { label: 'HBA1C', value: d.trends.hba1c, status: 'high' },
    { label: 'LDL', value: d.trends.ldl, status: 'medium' }
  ]

  if (isLoading) return <LoadingScreen stepRef={loadStepRef} />

  return (
    <div className="dash-page">
      {/* ── Navbar ── */}
      <nav className="dash-nav">
        <div className="dash-nav-left">
          <img src="/images/LogoRsi.png" alt="R Systems" className="dash-nav-logo" />
          <span className="dash-nav-title">Patient 360 Portal</span>
        </div>
        <div className="dash-nav-links">
          <span className="dash-nav-link active">CARE MANAGER</span>
          <span className="dash-nav-link">PROVIDER</span>
          <span className="dash-nav-link">PATIENTS</span>
        </div>
        <div className="dash-nav-right">
          <button className="dash-nav-bell" title="Notifications">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </button>
          <div className="dash-nav-user-info">
            <span className="dash-nav-username">{userName}</span>
            <span className="dash-nav-userrole">ADMIN</span>
          </div>
          <div className="dash-nav-avatar">{userName.charAt(0)}</div>
        </div>
      </nav>

      {/* ── Sub-header ── */}
      <div className="dash-subheader">
        <div className="dash-breadcrumb">
          <button className="dash-back-btn" onClick={() => navigate('/')} title="Back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <span className="dash-bc-text">Care Manager Dashboard</span>
          <span className="dash-bc-sep">›</span>
          <span className="dash-bc-name">{pt.name}</span>
        </div>
        <p className="dash-bc-sub">Patient Profile &amp; Care Management</p>
        <div className="dash-quick-pills">
          <button onClick={() => scrollTo('vitals-section')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            Vitals
          </button>
          <button onClick={() => scrollTo('meds-section')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>
            Medications
          </button>
          <button onClick={() => scrollTo('appts-section')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            Appointments
          </button>
        </div>
      </div>

      {/* ── Patient Banner ── */}
      <div className="dash-banner">
        <div className="dash-banner-left">
          <div className="dash-banner-avatar">{pt.initials}</div>
          <div className="dash-banner-info">
            <div className="dash-banner-name-row">
              <h2>{pt.name}</h2>
              <span className="dash-pill pill-red">High Priority</span>
              <span className="dash-pill pill-red-outline">⚠ Care Gap</span>
            </div>
            <p className="dash-banner-meta">
              {pt.age} yrs · {pt.gender} · MRN: {pt.mrn} · Programs: Diabetes, Hypertension
            </p>
            <div className="dash-banner-contact">
              <span>📅 DOB: {pt.dob}</span>
              <span>📞 {pt.phone}</span>
              <span>✉ {pt.email}</span>
            </div>
          </div>
        </div>
        <button
          className={`dash-review-btn ${isReviewed ? 'reviewed' : ''}`}
          onClick={() => setIsReviewed(prev => !prev)}
        >
          {isReviewed ? '✓ Reviewed' : '✓ Mark as Reviewed'}
        </button>
      </div>

      {/* ── Main Content ── */}
      <div className="dash-grid">
        {/* ─ Left / Main Column ─ */}
        <div className="dash-col-main">
          {/* Alerts + Risk row */}
          <div className="dash-alerts-row">
            <div className="dash-card dash-alerts-card">
              <div className="dash-card-head">
                <h3>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Alert Triggers &amp; Risk Drivers
                </h3>
                <p>AI-detected issues requiring immediate attention</p>
              </div>
              <div className="dash-alert-list">
                {dynAlerts.map((a, i) => (
                  <div key={i} className="dash-alert-item">
                    <span className="dash-alert-icon">{ALERT_ICONS[a.title] || '⚠'}</span>
                    <div className="dash-alert-body">
                      <strong>{a.title}</strong>
                      <p>{a.detail}</p>
                    </div>
                    <span className={`dash-pill pill-${a.severity.toLowerCase()}`}>{a.severity}</span>
                  </div>
                ))}
              </div>
              <div className="dash-trends-bar">
                <div className="dash-trends-label">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" width="16" height="16"><path d="M23 6l-9.5 9.5-5-5L1 18"/></svg>
                  DETERIORATING CLINICAL TRENDS
                </div>
                <div className="dash-trends-scroll">
                  {dynTrends.map((t, i) => (
                    <div key={i} className={`dash-trend-chip ${t.status}`}>
                      <span className="dash-trend-lbl">{t.label}</span>
                      <b>{t.value}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="dash-card dash-risk-card">
              <div className="dash-card-head">
                <h3>Risk Insights</h3>
                <span className="dash-pill pill-ai">✦ AI Powered</span>
              </div>
              {d.riskInsights.map((r, i) => (
                <div key={i} className="dash-risk-row">
                  <span className="dash-risk-name">{r.name}</span>
                  <span className="dash-risk-val">{r.value}</span>
                  <span className={`dash-pill pill-${r.level}`}>{r.level.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div className="dash-tabs">
            <button className="dash-tab active">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              AI Actions
            </button>
            <button className="dash-tab" disabled>📈 Clinical Trends</button>
            <button className="dash-tab" disabled>📋 Task Queue</button>
            <button className="dash-tab" disabled>📤 Patient Outreach</button>
          </div>

          {/* AI Actions */}
          <div className="dash-card dash-actions-section">
            <div className="dash-actions-head">
              <div>
                <h3>AI-Recommended Actions</h3>
                <p>Select actions to approve and create tasks ({selectedActions.length} selected)</p>
              </div>
              <button className="dash-approve-btn">✓ Approve Selected ({selectedActions.length})</button>
            </div>
            {d.aiActions.map((a, i) => (
              <div key={i} className={`dash-action-row ${selectedActions.includes(i) ? 'selected' : ''}`}>
                <input type="checkbox" checked={selectedActions.includes(i)} onChange={() => toggleAction(i)} />
                <div className="dash-action-body">
                  <div className="dash-action-title-row">
                    <strong>{a.title}</strong>
                    <span className={`dash-pill pill-${a.priorityClass}`}>{a.priority}</span>
                    <span className="dash-action-time">⏱ {a.timeframe}</span>
                  </div>
                  <p>{a.description}</p>
                  <div className="dash-rationale">
                    <span className="dash-rationale-tag">AI RATIONALE:</span>
                    <em>{a.rationale}</em>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Vitals */}
          <div id="vitals-section" className="dash-card">
            <div className="dash-card-head">
              <h3>Vitals</h3>
              <p>Last updated: Today, 9:30 AM</p>
            </div>
            <div className="dash-vitals-grid">
              {d.vitals.map((v, i) => (
                <div key={i} className={`dash-vital ${v.status}`}>
                  <div className="dash-vital-icon">{VITAL_ICONS[v.name]}</div>
                  <div className="dash-vital-data">
                    <span className="dash-vital-label">{v.name}</span>
                    <span className={`dash-vital-value ${v.status}`}>{v.value} <small>{v.unit}</small></span>
                    <div className={`dash-vital-bar ${v.status}`}><div style={{ width: `${v.pct}%` }}></div></div>
                  </div>
                  <div className="dash-vital-normal">Normal<br /><b>{v.normal}</b></div>
                </div>
              ))}
            </div>
          </div>

          {/* Medications */}
          <div id="meds-section" className="dash-card">
            <div className="dash-card-head">
              <h3>Current Medications</h3>
              <p>{d.medications.length} active prescriptions</p>
            </div>
            {d.medications.map((m, i) => (
              <div key={i} className="dash-med-row">
                <div className="dash-med-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" width="18" height="18"><path d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-6 18h6"/></svg>
                </div>
                <div className="dash-med-info">
                  <div className="dash-med-name">{m.name} <span className="dash-pill pill-active">Active</span></div>
                  <p>{m.dose} · {m.frequency}</p>
                  <p className="dash-med-doc">{m.doctor} · Started {m.started}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Appointments */}
          <div id="appts-section" className="dash-card">
            <div className="dash-card-head">
              <h3>Appointments</h3>
              <p>Upcoming and recent visits</p>
            </div>
            {d.appointments.map((a, i) => (
              <div key={i} className="dash-appt-row">
                <div className="dash-appt-info">
                  <div className="dash-appt-title">
                    <strong>{a.title}</strong>
                    <span className={`dash-pill pill-${a.status}`}>{a.status === 'upcoming' ? 'Upcoming' : 'Completed'}</span>
                    {a.telehealth && <span className="dash-pill pill-telehealth">📹 Telehealth</span>}
                  </div>
                  <p>with {a.with}</p>
                  <p className="dash-appt-meta">
                    📅 {a.date} &nbsp; ⏰ {a.time} {a.location && <>&nbsp; 📍 {a.location}</>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ─ Right Sidebar ─ */}
        <div className="dash-col-side">
          {/* Care Team */}
          <div className="dash-card">
            <div className="dash-card-head">
              <h3>👥 Care Team</h3>
              <p>{d.careTeam.length} MEMBERS INVOLVED</p>
            </div>
            {d.careTeam.map((c, i) => (
              <div key={i} className="dash-team-row">
                <div className={`dash-team-avatar ${c.primary ? 'primary' : ''}`}>{c.initials}</div>
                <div className="dash-team-info">
                  <div className="dash-team-name">
                    {c.name} {c.primary && <span className="dash-pill pill-primary">Primary</span>}
                  </div>
                  <p>{c.role}</p>
                  {c.dept && <p className="dash-team-dept">{c.dept}</p>}
                </div>
                <div className="dash-team-actions">
                  <button title="Call">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  </button>
                  <button title="Email">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Clinical Notes */}
          <div className="dash-card">
            <div className="dash-card-head">
              <div>
                <h3>Clinical Notes</h3>
                <p>{d.clinicalNotes.length} TOTAL ENTRIES</p>
              </div>
              <button className="dash-add-note-btn">+ Add Note</button>
            </div>
            <div className="dash-note-filters">
              {['all', 'clinical', 'coordination'].map(f => (
                <button key={f} className={`dash-note-filter ${noteFilter === f ? 'active' : ''}`} onClick={() => setNoteFilter(f)}>
                  {f === 'all' ? `All (${d.clinicalNotes.length})` : f === 'clinical' ? `Clinic (${d.clinicalNotes.filter(n => n.type === 'Clinical').length})` : `Care (${d.clinicalNotes.filter(n => n.type === 'Coordination').length})`}
                </button>
              ))}
            </div>
            {filteredNotes.map((n, i) => (
              <div key={i} className="dash-note-row">
                <div className="dash-note-header">
                  <div className="dash-note-avatar">{n.initials}</div>
                  <div className="dash-note-author">
                    <strong>{n.author}</strong>
                    <p>{n.role}</p>
                  </div>
                  <div className="dash-note-tags">
                    <span className={`dash-pill pill-note-${n.type.toLowerCase()}`}>{n.type}</span>
                    <span className="dash-note-view">View</span>
                  </div>
                </div>
                <p className="dash-note-text">{n.text}</p>
                <p className="dash-note-date">⏰ {n.date}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
