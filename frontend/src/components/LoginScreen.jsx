import { useState } from 'react'
import { login }    from '../services/api'
import './LoginScreen.css'

/**
 * Login page — mirrors the original HTML login screen.
 * Calls the backend /api/auth/login endpoint (which proxies to FHIR).
 */
export default function LoginScreen({ onLogin }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token, displayName } = await login(email.trim(), password)
      onLogin(token, displayName)
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      {/* ── Left hero panel ── */}
      <div className="login-hero">
        <div className="hero-content">
          <img src="/images/LogoRsi.png" alt="R Systems" className="hero-logo" />
          <div className="hero-icon-wrap">
            <img src="/images/ChatBigIcon.png" alt="" className="hero-icon" />
          </div>
          <h1 className="hero-title">CareBridge</h1>
          <p className="hero-sub">Clinical AI Assistant – Powered by FHIR R4</p>
          <p className="hero-desc">
            Instant access to patient records, lab results, medications,
            encounters, and clinical insights — all in one conversation.
          </p>
        </div>
      </div>

      {/* ── Right login panel ── */}
      <div className="login-panel">
        <div className="login-card">
          <img src="/chatbot_image/chatbot.png" alt="CareBridge" className="login-avatar" />
          <h2 className="login-title">Provider Sign In</h2>
          <p className="login-subtitle">Access your clinical workspace</p>

          {error && (
            <div className="login-error">
              <span>⚠</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            <div className="field-group">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@hospital.org"
                required
                autoComplete="email"
              />
            </div>

            <div className="field-group">
              <label htmlFor="password">Password</label>
              <div className="pw-wrapper">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="toggle-pw"
                  onClick={() => setShowPw(v => !v)}
                  aria-label="Toggle password visibility"
                >
                  {showPw ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? (
                <><span className="spinner" /> Signing in...</>
              ) : (
                'Launch Provider Assistant'
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Overlay during login */}
      {loading && <div className="signin-overlay" />}
    </div>
  )
}
