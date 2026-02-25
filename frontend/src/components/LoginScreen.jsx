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
    <div className="login-screen">
      {/* ── Topbar ── */}
      <div className="login-topbar">
        <img src="/images/LogoRsi.png" alt="R Systems" className="rsi-logo" />
        <span className="login-topbar-badge">For Care Coordinators &amp; Providers</span>
      </div>

      {/* ── Two-column body ── */}
      <div className="login-body">
        {/* Left – Form */}
        <div className="login-left">
          <div className="login-content">
            <h1 className="login-heading">
              Instant <span className="teal">Patient Insights</span><br />for Care Teams
            </h1>
            <p className="login-desc">
              Give care coordination team instant, secure access to a complete patient view,
              labs, medications, patient history, and care gaps, <strong>Powered by AI</strong> and{' '}
              <strong>fully integrated with your existing EHR</strong>, to act faster, reduce risk,
              and keep patients on track.
            </p>

            {error && (
              <div className="error-banner">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} autoComplete="off">
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  autoComplete="username"
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <div className="pw-wrap">
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="pw-toggle"
                    onClick={() => setShowPw(v => !v)}
                    aria-label="Toggle password visibility"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                </div>
              </div>

              <button type="submit" className="launch-btn" disabled={loading}>
                {loading ? (
                  <span className="btn-spinner" />
                ) : (
                  <img src="/images/ChatBigIcon.png" alt="" className="btn-icon" />
                )}
                <span>{loading ? 'Signing in...' : 'Launch Provider Assistant'}</span>
              </button>
            </form>

            <p className="login-footer">Secure access for healthcare professionals</p>
          </div>
        </div>

        {/* Right – Floating icon */}
        <div className="login-right">
          <img src="/images/ChatBigIcon.png" alt="CareBridge" className="hero-icon" />
        </div>
      </div>

      {/* ── Signing-in overlay ── */}
      {loading && (
        <div className="signin-overlay">
          <div className="signin-box">
            <div className="spinner-dark" />
            <p>Signing you in...</p>
          </div>
        </div>
      )}
    </div>
  )
}
