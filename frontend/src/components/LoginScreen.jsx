import { useState } from 'react'
import { login }    from '../services/api'
import './LoginScreen.css'

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
      {/* ── Navbar ── */}
      <nav className="login-nav">
        <img src="/images/LogoRsi.png" alt="R Systems" className="login-nav-logo" />
        <span className="login-nav-pill">For Care Coordinators &amp; Providers</span>
      </nav>

      {/* ── Content ── */}
      <div className="login-content">
        {/* Left – Form */}
        <div className="login-form-side">
          <h1 className="login-heading">
            Instant <span className="teal">Patient Insights</span><br />for Care Teams
          </h1>
          <p className="login-desc">
            Access patient records, lab results, medications, encounters,
            and clinical insights — all in one secure conversation.
          </p>

          {error && (
            <div className="login-error">
              <span>⚠</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            <div className="field-group">
              <label htmlFor="email">Email Address</label>
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
                <><img src="/images/ChatBigIcon.png" className="btn-icon" alt="" /> Launch Provider Assistant</>
              )}
            </button>
            <p className="login-secure-text">Secure access for healthcare professionals</p>
          </form>
        </div>

        {/* Right – Chatbot image */}
        <div className="login-image-side">
          <img src="/images/ChatBot.png" alt="CareBridge" className="login-hero-img" />
        </div>
      </div>

      {/* ── Loading overlay ── */}
      {loading && (
        <div className="signin-overlay">
          <div className="signin-loading-card">
            <div className="signin-spinner" />
            <p>Signing you in...</p>
          </div>
        </div>
      )}
    </div>
  )
}
