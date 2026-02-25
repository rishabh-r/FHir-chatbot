import { useState } from 'react'
import ChatPanel    from './ChatPanel'
import './ChatWidget.css'

/**
 * The floating chat launcher button + panel container.
 * Toggles the ChatPanel open/closed.
 */
export default function ChatWidget({ userName, fhirToken }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="chat-widget">
      {/* ── Floating panel ── */}
      {isOpen && (
        <div className="chat-window">
          <ChatPanel
            userName={userName}
            fhirToken={fhirToken}
            onClose={() => setIsOpen(false)}
          />
        </div>
      )}

      {/* ── Launch button ── */}
      <button
        className={`chat-toggle-btn ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(v => !v)}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        title="CareBridge Assistant"
      >
        {isOpen ? (
          /* Close icon */
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6"  y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          /* Chat icon */
          <img src="/chatbot_image/chatbot.png" alt="Chat" className="toggle-chat-icon" />
        )}
      </button>
    </div>
  )
}
