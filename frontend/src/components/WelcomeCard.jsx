import './WelcomeCard.css'

const CHIPS = [
  { label: 'Search patient',  query: 'Search for patient David Stan' },
  { label: 'View conditions', query: 'Show conditions for patient 10035' },
  { label: 'Lab results',     query: 'What is the hemoglobin count for patient 10035?' },
  { label: 'Medications',     query: 'List medications for patient 10035' },
  { label: 'Encounters',      query: 'Show encounters for patient 10035' },
]

/**
 * Welcome card displayed before the first message.
 * Chip clicks prefill and send a starter query.
 */
export default function WelcomeCard({ userName, onChipClick }) {
  return (
    <div className="welcome-card">
      <img src="/chatbot_image/chatbot.png" alt="CareBridge" className="wc-avatar" />
      <h3>Hey {userName}, how can I assist you today?</h3>
      <p>
        Search patient records, retrieve lab results, conditions, medications,
        encounters, and procedures.
      </p>
      <div className="welcome-chips">
        {CHIPS.map(chip => (
          <button
            key={chip.label}
            className="chip"
            onClick={() => onChipClick(chip.query)}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  )
}
