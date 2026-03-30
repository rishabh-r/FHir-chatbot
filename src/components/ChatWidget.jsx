import { useState, useRef, useEffect, useCallback } from 'react'
import { Chart } from 'chart.js'
import { sendToOpenAI } from '../services/openai'
import { executeTool } from '../services/fhir'
import { getSystemPrompt } from '../config'
import { formatTime, simpleMarkdown, extractChartData } from '../utils'

function ChartRenderer({ chartData }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current || !chartData) return
    const chart = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: chartData.labels,
        datasets: [{
          label: chartData.title || 'Data',
          data: chartData.values,
          backgroundColor: 'rgba(13,148,136,0.1)',
          borderColor: '#0d9488',
          borderWidth: 2,
          pointBackgroundColor: '#0f766e',
          pointRadius: 4,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          title: { display: !!chartData.title, text: chartData.title || '', font: { size: 13 } }
        },
        scales: {
          y: { beginAtZero: false, grid: { color: '#f0f0f0' } },
          x: { grid: { display: false } }
        }
      }
    })
    return () => chart.destroy()
  }, [chartData])

  return (
    <div style={{ marginTop: '14px', maxWidth: '440px', background: '#f8fafc', borderRadius: '10px', padding: '12px' }}>
      <canvas ref={canvasRef} />
    </div>
  )
}

function CareCordButton({ patientId }) {
  const [isHovered, setIsHovered] = useState(false)
  const dashboardUrl = patientId
    ? `${window.location.origin}/dashboard?patient=${patientId}`
    : `${window.location.origin}/dashboard`
  return (
    <>
      <br />
      <button
        onClick={() => window.open(dashboardUrl, '_blank')}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: 'inline-block',
          marginTop: '10px',
          padding: '6px 14px',
          background: isHovered ? '#0d9488' : 'transparent',
          color: isHovered ? '#fff' : '#0d9488',
          border: '1px solid #0d9488',
          borderRadius: '4px',
          fontSize: '0.85rem',
          cursor: 'pointer'
        }}
      >
        Launch CareCord AI
      </button>
    </>
  )
}

function MessageRow({ role, content, time, userInitial, showCareCordBtn, patientId }) {
  const isBot = role === 'bot'
  const { cleanText, chartData } = isBot ? extractChartData(content || '') : { cleanText: content, chartData: null }

  return (
    <div className={`msg-row ${role}`}>
      {isBot ? (
        <>
          <div>
            <img src="/chatbot_image/chatbot.png" alt="CareBridge" className="msg-avatar" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '80%' }}>
            <div className="msg-bubble" dangerouslySetInnerHTML={{ __html: simpleMarkdown(cleanText) }} />
            {chartData && <ChartRenderer chartData={chartData} />}
            {showCareCordBtn && <CareCordButton patientId={patientId} />}
            <span className="msg-time">{time}</span>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '80%' }}>
            <div className="msg-bubble">{content}</div>
            <span className="msg-time">{time}</span>
          </div>
          <div className="msg-avatar user-av">{userInitial}</div>
        </>
      )}
    </div>
  )
}

function StreamingBubble({ content, time }) {
  const { cleanText } = extractChartData(content || '')
  return (
    <div className="msg-row bot">
      <div>
        <img src="/chatbot_image/chatbot.png" alt="CareBridge" className="msg-avatar" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '80%' }}>
        <div className="msg-bubble" dangerouslySetInnerHTML={{ __html: simpleMarkdown(cleanText) }} />
        <span className="msg-time">{time}</span>
      </div>
    </div>
  )
}

function WelcomeCard({ name, onChipClick }) {
  return (
    <div className="welcome-card">
      <img src="/chatbot_image/chatbot.png" alt="CareBridge" />
      <h3>Hey {name}, how can I assist you today?</h3>
      <p>Search patient records, retrieve lab results, conditions, medications, encounters, and procedures.</p>
    </div>
  )
}

const PREDEFINED_ITEMS = [
  { label: 'Search Patient' },
  { label: 'View Active Conditions' },
  { label: 'View Latest Observations' },
  { label: 'View Active Medications' },
  { label: 'View Last 12 months encounters' },
  { label: 'View Care Gaps' }
]

const ACTION_MAP = {
  'View Active Conditions': 'conditions',
  'View Latest Observations': 'lab',
  'View Active Medications': 'medications',
  'View Last 12 months encounters': 'encounters',
  'View Care Gaps': 'caregaps'
}

function ChatWidget({ userName, userInitial }) {
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [isTyping, setIsTyping] = useState(false)
  const [typingText, setTypingText] = useState(null)
  const [isBotResponding, setIsBotResponding] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [messages, setMessages] = useState([])
  const [streamingContent, setStreamingContent] = useState(null)
  const [streamingTime, setStreamingTime] = useState('')

  const conversationHistoryRef = useRef([])
  const currentPatientRef = useRef(null)
  const pendingChipActionRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)
  const bulbBtnRef = useRef(null)
  const msgIdCounter = useRef(0)

  const nextId = () => ++msgIdCounter.current

  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingContent, isTyping, scrollToBottom])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        bulbBtnRef.current && !bulbBtnRef.current.contains(e.target)
      ) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const onPatientFound = useCallback((patient) => {
    currentPatientRef.current = patient
    if (patient.resource) {
      try { sessionStorage.setItem('dashboard_patient_' + patient.id, JSON.stringify(patient.resource)) } catch (_) {}
    }
  }, [])

  const agentLoop = useCallback(async (userMessage) => {
    conversationHistoryRef.current.push({ role: 'user', content: userMessage })

    const sliced = conversationHistoryRef.current.slice(-20)
    const firstUserIdx = sliced.findIndex(m => m.role === 'user')
    const trimmedHistory = firstUserIdx > 0 ? sliced.slice(firstUserIdx) : sliced

    const apiMessages = [
      { role: 'system', content: getSystemPrompt() },
      ...trimmedHistory
    ]

    setIsTyping(true)

    try {
      while (true) {
        let chunkAccum = ''
        let streamTimeStamp = ''

        const result = await sendToOpenAI(apiMessages, {
          onTextChunk: (chunk) => {
            if (!chunkAccum) {
              setIsTyping(false)
              streamTimeStamp = formatTime()
              setStreamingTime(streamTimeStamp)
            }
            chunkAccum += chunk
            setStreamingContent(chunkAccum)
          },
          onRateLimitWait: (msg) => setTypingText(msg)
        })

        const isToolCall = result.finish_reason === 'tool_calls' ||
                           (result.tool_calls && result.tool_calls.length > 0)

        if (isToolCall) {
          if (chunkAccum) {
            setMessages(prev => [...prev, {
              id: nextId(), role: 'bot', content: chunkAccum, time: streamTimeStamp
            }])
            setStreamingContent(null)
          }

          const assistantMsg = {
            role: 'assistant',
            content: result.content || null,
            tool_calls: result.tool_calls
          }
          apiMessages.push(assistantMsg)
          conversationHistoryRef.current.push(assistantMsg)

          const endCall = result.tool_calls.find(tc => tc.function.name === 'end_chat')
          if (endCall) {
            const args = JSON.parse(endCall.function.arguments || '{}')
            setIsTyping(false)
            setStreamingContent(null)
            setMessages(prev => [...prev, {
              id: nextId(), role: 'bot',
              content: args.farewell_message || 'Thank you for using CareBridge. Have a great day!',
              time: formatTime()
            }])
            return
          }

          const toolResults = await Promise.all(
            result.tool_calls.map(async (tc) => {
              const args = JSON.parse(tc.function.arguments || '{}')
              const res = await executeTool(tc.function.name, args, onPatientFound)
              return {
                role: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify(res)
              }
            })
          )

          apiMessages.push(...toolResults)
          conversationHistoryRef.current.push(...toolResults)
          setIsTyping(true)

        } else {
          const finalText = result.content || ''
          conversationHistoryRef.current.push({ role: 'assistant', content: finalText })

          setStreamingContent(null)
          const isCareGap = userMessage.toLowerCase().includes('care gap')
          setMessages(prev => [...prev, {
            id: nextId(), role: 'bot', content: finalText,
            time: chunkAccum ? streamTimeStamp : formatTime(),
            showCareCordBtn: isCareGap,
            patientId: isCareGap ? currentPatientRef.current?.id : null
          }])
          break
        }
      }
    } catch (err) {
      setIsTyping(false)
      setStreamingContent(null)
      setMessages(prev => [...prev, {
        id: nextId(), role: 'bot',
        content: `Sorry, I encountered an error: ${err.message}. Please try again.`,
        time: formatTime()
      }])
      console.error('Agent error:', err)
    }
  }, [onPatientFound])

  const handleSend = useCallback(async () => {
    const text = inputValue.trim()
    if (!text) return

    setInputValue('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    setIsBotResponding(true)
    setShowWelcome(false)

    setMessages(prev => [...prev, { id: nextId(), role: 'user', content: text, time: formatTime() }])

    let internalQuery = text
    if (pendingChipActionRef.current) {
      const action = pendingChipActionRef.current
      pendingChipActionRef.current = null

      let patientRef = text
      if (currentPatientRef.current) {
        const typedLower = text.toLowerCase()
        const nameLower = currentPatientRef.current.name.toLowerCase()
        const firstName = nameLower.split(' ')[0]
        if (typedLower.includes(firstName) || typedLower === 'yes' || typedLower === 'yeah' || typedLower === 'same') {
          patientRef = currentPatientRef.current.id || currentPatientRef.current.name
        }
      }

      const queries = {
        conditions:  `Show active conditions for patient ${patientRef}`,
        lab:         `Latest observations for the patient ${patientRef}`,
        medications: `List medications for patient ${patientRef}`,
        encounters:  `Show encounters for patient ${patientRef}`,
        caregaps:    `Show care gaps for patient ${patientRef}`
      }
      internalQuery = queries[action] || text
    }

    await agentLoop(internalQuery)
    setIsBotResponding(false)
    inputRef.current?.focus()
  }, [inputValue, agentLoop])

  const handlePredefinedClick = useCallback(async (label) => {
    if (isBotResponding) return

    setShowDropdown(false)
    setShowWelcome(false)

    setMessages(prev => [...prev, { id: nextId(), role: 'user', content: label, time: formatTime() }])

    if (ACTION_MAP[label]) pendingChipActionRef.current = ACTION_MAP[label]

    setIsBotResponding(true)
    await agentLoop(label)
    setIsBotResponding(false)
    inputRef.current?.focus()
  }, [isBotResponding, agentLoop])

  const handleClearChat = useCallback(() => {
    conversationHistoryRef.current = []
    setMessages([])
    setStreamingContent(null)
    setShowWelcome(true)
  }, [])

  const handleToggle = useCallback(() => {
    setIsPanelOpen(prev => !prev)
  }, [])

  const handleClose = useCallback(() => {
    setIsPanelOpen(false)
  }, [])

  const handleInputChange = useCallback((e) => {
    setInputValue(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'
  }, [])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isBotResponding && inputValue.trim()) handleSend()
    }
  }, [isBotResponding, inputValue, handleSend])

  const sendDisabled = isBotResponding || !inputValue.trim()

  return (
    <div id="chat-widget">
      <div id="chat-panel" className={`chat-panel ${isPanelOpen ? '' : 'hidden'}`}>
        <div className="chat-panel-header">
          <div className="chat-panel-info">
            <img src="/chatbot_image/chatbot.png" alt="CareBridge" className="panel-avatar" />
            <div>
              <span className="panel-name">RSICareBridge</span>
              <span className="panel-status"><span className="online-dot"></span>Online</span>
            </div>
          </div>
          <div className="panel-header-actions">
            <button className="panel-action-btn" title="Clear chat" onClick={handleClearChat}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" /><path d="M14 11v6" />
              </svg>
            </button>
            <button className="panel-action-btn" title="Close" onClick={handleClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div id="messages" className="messages-area" ref={messagesContainerRef}>
          {showWelcome && messages.length === 0 && (
            <WelcomeCard name={userName} />
          )}
          {messages.map(msg => (
            <MessageRow
              key={msg.id}
              role={msg.role}
              content={msg.content}
              time={msg.time}
              userInitial={userInitial}
              showCareCordBtn={msg.showCareCordBtn}
              patientId={msg.patientId}
            />
          ))}
          {streamingContent !== null && (
            <StreamingBubble content={streamingContent} time={streamingTime} />
          )}
        </div>

        <div className={`typing-indicator ${isTyping ? '' : 'hidden'}`}>
          <img src="/chatbot_image/chatbot.png" alt="" className="typing-avatar" />
          <div className="typing-bubble">
            {typingText ? (
              <span style={{ fontSize: '11px', color: '#4a5568' }}>{typingText}</span>
            ) : (
              <>
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </>
            )}
          </div>
        </div>

        <div className="chat-input-bar">
          <div className="input-container">
            <textarea
              ref={inputRef}
              id="user-input"
              placeholder={isBotResponding ? 'CareBridge is responding...' : 'Ask about patient records, labs...'}
              rows="1"
              maxLength="2000"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
            />
            <div ref={dropdownRef} className={`predefined-dropdown ${showDropdown ? '' : 'hidden'}`}>
              {PREDEFINED_ITEMS.map(item => (
                <div
                  key={item.label}
                  className="predefined-dropdown-item"
                  onClick={() => handlePredefinedClick(item.label)}
                >
                  {item.label}
                </div>
              ))}
            </div>
            <button
              ref={bulbBtnRef}
              className={`bulb-btn ${showDropdown ? 'active' : ''}`}
              title="Predefined questions"
              onClick={(e) => {
                e.stopPropagation()
                setShowDropdown(prev => !prev)
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="9" y1="18" x2="15" y2="18" />
                <line x1="10" y1="22" x2="14" y2="22" />
                <path d="M12 2a7 7 0 0 1 7 7c0 3-1.8 5.4-4.5 6.5V17H9.5v-1.5C6.8 14.4 5 12 5 9a7 7 0 0 1 7-7z" />
              </svg>
            </button>
            <button
              className="send-btn"
              disabled={sendDisabled}
              title="Send"
              onClick={handleSend}
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
          <p className="input-hint">CareBridge retrieves FHIR R4 data. Never provides treatment recommendations.</p>
        </div>
      </div>

      <button className="chat-toggle-btn" onClick={handleToggle} title="Open CareBridge">
        <img
          src="/chatbot_image/chatbot.png"
          alt="CareBridge"
          className={`toggle-icon-open ${isPanelOpen ? 'hidden' : ''}`}
        />
        <svg
          className={`toggle-icon-close ${isPanelOpen ? '' : 'hidden'}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}

export default ChatWidget
