import ReactMarkdown from 'react-markdown'
import remarkGfm     from 'remark-gfm'
import './MessageBubble.css'

/**
 * Renders a single chat message bubble.
 * Bot messages are rendered with react-markdown (supports tables, lists, bold, etc.).
 * User messages are plain text.
 */
export default function MessageBubble({ role, content, time, isStreaming }) {
  const isBot = role === 'assistant' || role === 'bot'

  return (
    <div className={`msg-row ${isBot ? 'bot' : 'user'}`}>
      {isBot && (
        <div className="msg-avatar-wrap">
          <img src="/chatbot_image/chatbot.png" alt="CareBridge" className="msg-avatar" />
        </div>
      )}

      <div className="msg-wrapper">
        <div className={`msg-bubble ${isBot ? 'bot-bubble' : 'user-bubble'} ${isStreaming ? 'streaming' : ''}`}>
          {isBot ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || ''}
            </ReactMarkdown>
          ) : (
            <span>{content}</span>
          )}
          {isStreaming && <span className="cursor-blink">▌</span>}
        </div>
        {time && <span className="msg-time">{time}</span>}
      </div>

      {!isBot && (
        <div className="msg-avatar-wrap user-av-wrap">
          <div className="user-avatar">
            {content ? content.charAt(0).toUpperCase() : 'U'}
          </div>
        </div>
      )}
    </div>
  )
}

/** Typing indicator (three animated dots) */
export function TypingIndicator() {
  return (
    <div className="msg-row bot">
      <div className="msg-avatar-wrap">
        <img src="/chatbot_image/chatbot.png" alt="CareBridge" className="msg-avatar" />
      </div>
      <div className="msg-wrapper">
        <div className="msg-bubble bot-bubble typing-bubble">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
      </div>
    </div>
  )
}
