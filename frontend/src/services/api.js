/**
 * CareBridge API Service
 * Handles all communication with the Spring Boot backend.
 */

// In production: set VITE_API_BASE=https://your-backend-server.com in Vercel env vars
// In development: leave unset — Vite proxies /api → localhost:8080 automatically
const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '') + '/api'

// ── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Logs in via the backend (which proxies to FHIR auth server).
 * Returns { token, displayName } on success, throws on error.
 */
export async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || `Login failed (${res.status})`)
  }

  const token = data.idToken || data.token || data.access_token
  if (!token) throw new Error('Login failed: no token received.')

  const displayName = data.displayName || data.name || email.split('@')[0]
  return { token, displayName }
}

// ── Chat (SSE Streaming) ──────────────────────────────────────────────────────

/**
 * Sends the conversation to the backend and streams back text chunks.
 *
 * @param {Array}    messages   - Conversation history [{role, content}, ...]
 * @param {string}   fhirToken  - FHIR Bearer token
 * @param {Function} onChunk    - Called with each text chunk string
 * @param {Function} onDone     - Called when the stream is complete
 * @param {Function} onError    - Called with an error message string
 */
export async function streamChat(messages, fhirToken, onChunk, onDone, onError) {
  let response
  try {
    response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, fhirToken }),
    })
  } catch (err) {
    onError(err.message || 'Network error — could not reach the server.')
    return
  }

  if (!response.ok) {
    try {
      const data = await response.json()
      onError(data.message || `Server error (${response.status})`)
    } catch {
      onError(`Server error (${response.status})`)
    }
    return
  }

  // Parse the SSE stream
  const reader  = response.body.getReader()
  const decoder = new TextDecoder()
  let   buffer  = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) { onDone(); break }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() // keep incomplete line for next iteration

      for (const line of lines) {
        if (!line.trim()) continue

        // Parse event name
        if (line.startsWith('event:')) continue // handled via data below

        if (line.startsWith('data:')) {
          const raw = line.slice(5).trim()
          if (!raw || raw === '{}') continue

          try {
            const parsed = JSON.parse(raw)
            if (parsed.text !== undefined) {
              onChunk(parsed.text)
            }
            if (parsed.message) {
              onError(parsed.message)
              return
            }
          } catch {
            // ignore malformed JSON
          }
        }

        // Handle "event: done" which Spring SSE sends as "event:done\ndata:{}"
        if (line === 'event:done' || line === 'event: done') {
          onDone()
          return
        }
        if (line === 'event:error' || line === 'event: error') {
          // error data will follow on next line
        }
      }
    }
  } catch (err) {
    onError(err.message || 'Stream reading error')
  }
}
