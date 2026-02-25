import { useState, useRef, useEffect, useCallback } from 'react'
import { streamChat }          from '../services/api'
import MessageBubble, { TypingIndicator } from './MessageBubble'
import WelcomeCard             from './WelcomeCard'
import './ChatPanel.css'

export default function ChatPanel({ userName, fhirToken, onClose }) {
  const [uiMessages,   setUiMessages]   = useState([])
  const [history,      setHistory]      = useState([])
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

  const handleSend = useCallback(async (text) => {
    const trimmed = (text || inputText).trim()
    if (!trimmed || sendDisabled) return

    setInputText('')
    setSendDisabled(true)

    const userUiMsg = { id: Date.now(), role: 'user', content: trimmed, time: formatTime() }
    setUiMessages(prev => [...prev, userUiMsg])

    const newHistory = [...history, { role: 'user', content: trimmed }]
    setHistory(newHistory)

    setIsStreaming(true)
    setStreamText('')

    let accumulated = ''

    await streamChat(
      newHistory,
      fhirToken,
      (chunk) => {
        accumulated += chunk
        setStreamText(accumulated)
      },
      () => {
        const botMsg = { id: Date.now() + 1, role: 'assistant', content: accumulated, time: formatTime() }
        setUiMessages(prev => [...prev, botMsg])
        setHistory(prev => [...prev, { role: 'assistant', content: accumulated }])
        setStreamText('')
        setIsStreaming(false)
        setSendDisabled(false)
        inputRef.current?.focus()
      },
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
            <span className="chat-header-name">RSICareBridge</span>
            <div className="chat-header-status">
              <span className="online-dot" />
              Online
            </div>
          </div>
        </div>
        <div className="chat-header-right">
          <button className="header-btn" onClick={handleClearChat} title="Clear chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" /><path d="M14 11v6" />
            </svg>
          </button>
          <button className="header-btn" onClick={onClose} title="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Messages ── */}
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

        {isStreaming && streamText && (
          <MessageBubble role="assistant" content={streamText} isStreaming />
        )}

        {isStreaming && !streamText && <TypingIndicator />}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input bar ── */}
      <div className="chat-input-bar">
        <div className="input-container">
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
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
        <p className="input-hint">
          CareBridge retrieves FHIR R4 data. Never provides treatment recommendations.
        </p>
      </div>
    </div>
  )
}
