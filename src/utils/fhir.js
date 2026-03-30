const FHIR_BASE = 'https://fhirassist.rsystems.com:481'
const LOGIN_URL = `${FHIR_BASE}/auth/login`

export function getAuthHeader() {
  const token = localStorage.getItem('cb_token')
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

export function buildUrl(path, params) {
  const url = new URL(FHIR_BASE + path)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.append(k, v)
  })
  return url.toString()
}

export async function callFhirApi(url) {
  const res = await fetch(url, { headers: getAuthHeader() })
  if (res.status === 401) {
    localStorage.removeItem('cb_token')
    localStorage.removeItem('cb_user')
    window.location.href = '/'
    throw new Error('Session expired. Please log in again.')
  }
  if (!res.ok) throw new Error('FHIR API error: ' + res.status)
  return res.json()
}

export async function doLogin(email, password) {
  const res = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  if (!res.ok) {
    if (res.status === 401 || res.status === 400) throw new Error('Invalid credentials. Please try again.')
    throw new Error(`Login failed (${res.status}). Please try again.`)
  }
  const data = await res.json()
  const token = data.idToken || data.token || data.access_token
  if (!token) throw new Error('Login failed: no token received.')
  const name = data.displayName || data.name || email.split('@')[0]
  localStorage.setItem('cb_token', token)
  localStorage.setItem('cb_user', name)
  return name
}

export async function executeTool(name, args, setLastPatientId) {
  if (args.SUBJECT && setLastPatientId) setLastPatientId(args.SUBJECT)
  if (args.PATIENT_ID && setLastPatientId) setLastPatientId(args.PATIENT_ID)
  try {
    switch (name) {
      case 'search_fhir_patient': {
        const params = {}
        if (args.FAMILY)     params.family    = args.FAMILY
        if (args.GIVEN)      params.given     = args.GIVEN
        if (args.EMAIL)      params.email     = args.EMAIL
        if (args.PHONE)      params.phone     = args.PHONE
        if (args.BIRTHDATE)  params.birthdate = args.BIRTHDATE
        if (args.PATIENT_ID) params._id       = args.PATIENT_ID
        return await callFhirApi(buildUrl('/baseR4/Patient', params))
      }
      case 'search_patient_condition': {
        const params = { _count: 100 }
        if (args.SUBJECT)   params.subject   = args.SUBJECT
        if (args.CODE)      params.code      = args.CODE
        if (args.ENCOUNTER) params.encounter = args.ENCOUNTER
        if (args.PAGE != null && args.PAGE !== '') params.page = Number(args.PAGE)
        return await callFhirApi(buildUrl('/baseR4/Condition', params))
      }
      case 'search_patient_procedure': {
        const params = { _count: 100 }
        if (args.SUBJECT)   params.subject   = args.SUBJECT
        if (args.CODE)      params.code      = args.CODE
        if (args.ENCOUNTER) params.encounter = args.ENCOUNTER
        if (args.PAGE != null && args.PAGE !== '') params.page = Number(args.PAGE)
        return await callFhirApi(buildUrl('/baseR4/Procedure', params))
      }
      case 'search_patient_medications': {
        const params = { _count: 100 }
        if (args.SUBJECT)        params.subject        = args.SUBJECT
        if (args.CODE)           params.code           = args.CODE
        if (args.PRESCRIPTIONID) params.prescriptionId = args.PRESCRIPTIONID
        if (args.PAGE != null && args.PAGE !== '') params.page = Number(args.PAGE)
        return await callFhirApi(buildUrl('/baseR4/MedicationRequest', params))
      }
      case 'search_patient_encounter': {
        const base = `${FHIR_BASE}/baseR4/Encounter`
        const url  = new URL(base)
        if (args.SUBJECT) url.searchParams.append('subject', args.SUBJECT)
        if (args.DATE)    url.searchParams.append('date', args.DATE)
        if (args.DATE2)   url.searchParams.append('date', args.DATE2)
        if (args.PAGE != null && args.PAGE !== '') url.searchParams.append('page', String(Number(args.PAGE)))
        url.searchParams.append('_count', '100')
        return await callFhirApi(url.toString())
      }
      case 'search_patient_observations': {
        const params = {}
        if (args.SUBJECT)        params.subject        = args.SUBJECT
        if (args.CODE)           params.code           = args.CODE
        if (args.value_quantity) params.value_quantity = args.value_quantity
        if (args.DATE)           params.date           = args.DATE
        if (args.DATE2)          params.date2          = args.DATE2
        params.page = (args.PAGE != null && args.PAGE !== '') ? Number(args.PAGE) : 0
        return await callFhirApi(buildUrl('/baseR4/Observations', params))
      }
      case 'end_chat':
        return { status: 'conversation_ended' }
      default:
        return { error: `Unknown function: ${name}` }
    }
  } catch (err) {
    return { error: err.message }
  }
}

// ── Fetch All Patient Data (for Dashboard) ───────────────
export async function fetchAllPatientData(patientId) {
  const loincCodes = [
    '718-7',   // Hemoglobin
    '2345-7',  // Glucose
    '2951-2',  // Sodium
    '2823-3',  // Potassium
    '2160-0',  // Creatinine
    '8480-6',  // Systolic BP
    '8462-4',  // Diastolic BP
    '8867-4',  // Heart Rate
    '4548-4',  // HbA1c
    '2090-9'   // LDL Cholesterol
  ]

  const [patientData, conditions, medications, encounters, ...obsResults] = await Promise.all([
    callFhirApi(buildUrl('/baseR4/Patient', { _id: patientId })),
    callFhirApi(buildUrl('/baseR4/Condition', { subject: patientId, _count: 100 })),
    callFhirApi(buildUrl('/baseR4/MedicationRequest', { subject: patientId, _count: 100 })),
    callFhirApi(buildUrl('/baseR4/Encounter', { subject: patientId, _count: 100 })),
    ...loincCodes.map(code =>
      callFhirApi(buildUrl('/baseR4/Observations', { subject: patientId, code, page: 0 }))
    )
  ])

  const observations = obsResults.flatMap(bundle =>
    (bundle.entry || []).map(e => e.resource)
  )

  return { patientData, conditions, medications, encounters, observations }
}

export function stripFhirMeta(bundle) {
  if (!bundle || !bundle.entry) return []
  return bundle.entry.map(e => {
    const r = { ...e.resource }
    delete r.meta
    delete r.text
    delete r.id
    return r
  }).slice(0, 30)
}
