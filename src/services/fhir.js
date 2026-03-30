import { FHIR_BASE } from '../config'

export function getAuthHeader() {
  const token = localStorage.getItem('cb_token')
  if (!token) {
    window.location.reload()
    throw new Error('No auth token')
  }
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

export async function callFhirApi(url) {
  const res = await fetch(url, { headers: getAuthHeader() })
  if (res.status === 401) {
    localStorage.removeItem('cb_token')
    localStorage.removeItem('cb_user')
    window.location.reload()
    throw new Error('Unauthorized')
  }
  return res.json()
}

export function buildUrl(path, params) {
  const url = new URL(`${FHIR_BASE}${path}`)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.append(k, v)
    }
  })
  return url.toString()
}

export async function executeTool(name, args, onPatientFound) {
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
        const patientResult = await callFhirApi(buildUrl('/baseR4/Patient', params))
        try {
          const entries = patientResult?.entry || []
          const resource = entries[0]?.resource || null
          const id = resource?.id || args.PATIENT_ID || ''
          const rGiven  = resource?.name?.[0]?.given?.join(' ') || args.GIVEN || ''
          const rFamily = resource?.name?.[0]?.family || args.FAMILY || ''
          const fullName = [rGiven, rFamily].filter(Boolean).join(' ')
          if (fullName && onPatientFound) onPatientFound({ name: fullName, id, resource })
        } catch (e) { /* ignore */ }
        return patientResult
      }
      case 'search_patient_condition': {
        const params = {}
        if (args.SUBJECT)   params.subject   = args.SUBJECT
        if (args.CODE)      params.code      = args.CODE
        if (args.ENCOUNTER) params.encounter = args.ENCOUNTER
        params.page = (args.page !== undefined && args.page !== null && args.page !== '') ? Number(args.page) : 0
        return await callFhirApi(buildUrl('/baseR4/Condition', params))
      }
      case 'search_patient_procedure': {
        const params = {}
        if (args.SUBJECT)   params.subject   = args.SUBJECT
        if (args.CODE)      params.code      = args.CODE
        if (args.ENCOUNTER) params.encounter = args.ENCOUNTER
        params.page = (args.page !== undefined && args.page !== null && args.page !== '') ? Number(args.page) : 0
        return await callFhirApi(buildUrl('/baseR4/Procedure', params))
      }
      case 'search_patient_medications': {
        const params = {}
        if (args.SUBJECT)        params.subject        = args.SUBJECT
        if (args.CODE)           params.code           = args.CODE
        if (args.PRESCRIPTIONID) params.prescriptionId = args.PRESCRIPTIONID
        params.page = (args.page !== undefined && args.page !== null && args.page !== '') ? Number(args.page) : 0
        return await callFhirApi(buildUrl('/baseR4/MedicationRequest', params))
      }
      case 'search_patient_encounter': {
        const base = `${FHIR_BASE}/baseR4/Encounter`
        const url  = new URL(base)
        if (args.SUBJECT) url.searchParams.append('subject', args.SUBJECT)
        if (args.DATE)    url.searchParams.append('date',    args.DATE)
        if (args.DATE2)   url.searchParams.append('date',    args.DATE2)
        const page = (args.page !== undefined && args.page !== null && args.page !== '') ? Number(args.page) : 0
        url.searchParams.append('page', page)
        return await callFhirApi(url.toString())
      }
      case 'search_patient_observations': {
        const params = {}
        if (args.SUBJECT)        params.subject        = args.SUBJECT
        if (args.CODE)           params.code           = args.CODE
        if (args.value_quantity) params.value_quantity = args.value_quantity
        if (args.DATE)           params.date           = args.DATE
        params.page = (args.page !== undefined && args.page !== null && args.page !== '') ? Number(args.page) : 0
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
