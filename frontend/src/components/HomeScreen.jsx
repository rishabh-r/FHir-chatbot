import './HomeScreen.css'

export default function HomeScreen({ userName, onLogout }) {
  return (
    <div className="home-page">
      {/* ── Navbar ── */}
      <nav className="navbar">
        <img src="/images/LogoRsi.png" alt="R Systems" className="nav-logo" />
        <span className="nav-pill">For Care Coordinators &amp; Providers</span>
      </nav>

      {/* ── Hero section ── */}
      <main className="home-main">
        <div className="home-hero">
          <div className="hero-badge">AI-Powered FHIR Assistant</div>

          <h1>
            Streamline Your<br />
            <span className="teal">Care Coordination</span>
          </h1>

          <p>
            Access patient records, lab results, medications, and clinical history
            instantly — powered by AI and FHIR R4 integration.
          </p>

          <div className="home-cards">
            <div className="feature-card">
              <div className="card-icon blue">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                </svg>
              </div>
              <h3>Instant Record Retrieval</h3>
              <p>Access complete patient histories and medical records in seconds.</p>
            </div>

            <div className="feature-card">
              <div className="card-icon purple">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                </svg>
              </div>
              <h3>HIPAA Compliant &amp; Secure</h3>
              <p>Enterprise-grade security with encrypted data transmission.</p>
            </div>

            <div className="feature-card">
              <div className="card-icon lavender">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z" />
                </svg>
              </div>
              <h3>AI-Powered Insights</h3>
              <p>Intelligent analysis of clinical data for faster decision making.</p>
            </div>

            <div className="feature-card">
              <div className="card-icon green">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                </svg>
              </div>
              <h3>Comprehensive Reports</h3>
              <p>Detailed clinical summaries from FHIR R4 data sources.</p>
            </div>
          </div>
        </div>
      </main>

      {/* ── Fixed Log Out button (bottom-left) ── */}
      <button className="logout-fixed-btn" onClick={onLogout}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Log Out
      </button>
    </div>
  )
}
