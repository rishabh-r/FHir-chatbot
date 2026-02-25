import { useState, useRef, useEffect, useCallback } from 'react'
import { streamChat }          from '../services/api'
import MessageBubble, { TypingIndicator } from './MessageBubble'
import WelcomeCard             from './WelcomeCard'
import './ChatPanel.css'

/**
 * The main chat panel — message list + input box.
 * Manages:
 * - Conversation history sent to the backend
 * - Streaming text state
 * - UI messages shown to the user
 */
export default function ChatPanel({ userName, fhirToken, onClose }) {
  // UI messages: { role, content, time, id }
  const [uiMessages,   setUiMessages]   = useState([])
  // Conversation history sent to backend: { role, content }
  const [history,      setHistory]      = useState([])
  // Current streaming text (live)
  const [streamText,   setStreamText]   = useState('')
  const [isStreaming,  setIsStreaming]   = useState(false)
  const [inputText,    setInputText]    = useState('')
  const [sendDisabled, setSendDisabled] = useState(false)

  const messagesEndRef = useRef(null)
  const inputRef       = useRef(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [uiMessages, streamText, scrollToBottom])

  const formatTime = () =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  // ── Send handler ────────────────────────────────────────────────────────────
  const handleSend = useCallback(async (text) => {
    const trimmed = (text || inputText).trim()
    if (!trimmed || sendDisabled) return

    setInputText('')
    setSendDisabled(true)

    // Add user message to UI
    const userUiMsg = { id: Date.now(), role: 'user', content: trimmed, time: formatTime() }
    setUiMessages(prev => [...prev, userUiMsg])

    // Add to history for backend
    const newHistory = [...history, { role: 'user', content: trimmed }]
    setHistory(newHistory)

    // Show streaming bubble
    setIsStreaming(true)
    setStreamText('')

    let accumulated = ''

    await streamChat(
      newHistory,
      fhirToken,
      // onChunk
      (chunk) => {
        accumulated += chunk
        setStreamText(accumulated)
      },
      // onDone
      () => {
        const botMsg = { id: Date.now() + 1, role: 'assistant', content: accumulated, time: formatTime() }
        setUiMessages(prev => [...prev, botMsg])
        setHistory(prev => [...prev, { role: 'assistant', content: accumulated }])
        setStreamText('')
        setIsStreaming(false)
        setSendDisabled(false)
        inputRef.current?.focus()
      },
      // onError
      (errMsg) => {
        const errBotMsg = {
          id: Date.now() + 1,
          role: 'assistant',
          content: `Sorry, I encountered an error: ${errMsg}. Please try again.`,
          time: formatTime()
        }
        setUiMessages(prev => [...prev, errBotMsg])
        setStreamText('')
        setIsStreaming(false)
        setSendDisabled(false)
        inputRef.current?.focus()
      }
    )
  }, [inputText, sendDisabled, history, fhirToken])

  const handleChipClick = (query) => handleSend(query)

  const handleClearChat = () => {
    setUiMessages([])
    setHistory([])
    setStreamText('')
    setIsStreaming(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInputChange = (e) => {
    setInputText(e.target.value)
    // Auto-resize textarea
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'
  }

  const showWelcome = uiMessages.length === 0 && !isStreaming

  return (
    <div className="chat-panel">
      {/* ── Header ── */}
      <div className="chat-header">
        <div className="chat-header-left">
          <img src="/chatbot_image/chatbot.png" alt="CareBridge" className="chat-header-avatar" />
          <div>
            <div className="chat-header-name">RSICareBridge</div>
            <div className="chat-header-status">
              <span className="online-dot" />
              Online
            </div>
          </div>
        </div>
        <div className="chat-header-right">
          <button className="header-btn" onClick={handleClearChat} title="Clear chat">
            🗑
          </button>
          <button className="header-btn close-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
      </div>

      {/* ── Message list ── */}
      <div className="chat-messages">
        {showWelcome && (
          <WelcomeCard userName={userName} onChipClick={handleChipClick} />
        )}

        {uiMessages.map(msg => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            time={msg.time}
          />
        ))}

        {/* Live streaming bubble */}
        {isStreaming && streamText && (
          <MessageBubble
            role="assistant"
            content={streamText}
            isStreaming
          />
        )}

        {/* Typing indicator (shown while waiting for first chunk) */}
        {isStreaming && !streamText && <TypingIndicator />}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Disclaimer ── */}
      <div className="chat-disclaimer">
        CareBridge retrieves FHIR R4 data. Never provides treatment recommendations.
      </div>

      {/* ── Input area ── */}
      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder="Ask about patient records, labs..."
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={sendDisabled}
        />
        <button
          className="send-btn"
          onClick={() => handleSend()}
          disabled={sendDisabled || !inputText.trim()}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
