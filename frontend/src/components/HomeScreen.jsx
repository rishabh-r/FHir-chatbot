import './HomeScreen.css'

/**
 * The main home screen shown after login.
 * Displays a navbar with the RSI logo and a logout button.
 * The main content is a placeholder — the chat widget floats above it.
 */
export default function HomeScreen({ userName, onLogout }) {
  return (
    <div className="home-page">
      {/* ── Navbar ── */}
      <nav className="navbar">
        <div className="navbar-left">
          <img src="/images/LogoRsi.png" alt="R Systems" className="nav-logo" />
          <span className="nav-product">CareBridge</span>
        </div>
        <div className="navbar-right">
          <span className="nav-user">👤 {userName}</span>
          <button className="logout-btn" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      </nav>

      {/* ── Hero section ── */}
      <main className="home-main">
        <div className="home-hero">
          <div className="home-hero-icon">
            <img src="/chatbot_image/chatbot.png" alt="CareBridge" />
          </div>
          <h1>Welcome, {userName}</h1>
          <p>
            Your clinical AI assistant is ready. Use the chat bubble in the
            bottom-right corner to search patient records, retrieve lab results,
            medications, encounters, conditions, and procedures.
          </p>
          <div className="home-features">
            <div className="feature-chip">🔬 Lab Results</div>
            <div className="feature-chip">💊 Medications</div>
            <div className="feature-chip">🏥 Encounters</div>
            <div className="feature-chip">🩺 Conditions</div>
            <div className="feature-chip">⚕ Procedures</div>
            <div className="feature-chip">👤 Patient Search</div>
          </div>
        </div>
      </main>
    </div>
  )
}
