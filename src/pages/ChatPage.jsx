import React, { useState, useRef, useEffect, useCallback } from 'react'
import { marked } from 'marked'
import Chart from 'chart.js/auto'
import { doLogin, executeTool } from '../utils/fhir'
import { formatDisplayName, formatTime, extractChartData } from '../utils/helpers'
import { TOOLS, OPENAI_MODEL } from '../utils/constants'
import { buildSystemPrompt } from '../utils/systemPrompt'
import logoRsi from '@images/LogoRsi.png'
import chatbotPng from '@chatbot_image/chatbot.png'
import chatBigIcon from '@images/ChatBigIcon.png'
import '../styles/chatbot.css'

// ── Marked setup ─────────────────────────────────────
marked.setOptions({ breaks: true })

function simpleMarkdown(text) {
  const parsed = marked.parse(text || '')
  return parsed.replace(/<table>/g, '<div class="table-wrapper"><table>').replace(/<\/table>/g, '</table></div>')
}

// ── System prompt cache ───────────────────────────────
let _promptCache = null
let _promptDate  = null
function getCachedSystemPrompt() {
  const today = new Date().toISOString().split('T')[0]
  if (!_promptCache || _promptDate !== today) {
    _promptCache = buildSystemPrompt()
    _promptDate  = today
  }
  return _promptCache
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ── OpenAI Streaming ──────────────────────────────────
async function sendToOpenAI(messages, onTextChunk = null, onRateLimit = null, retryCount = 0) {
  const res = await fetch('/api/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OPENAI_MODEL, messages, tools: TOOLS, tool_choice: 'auto', stream: true })
  })

  if (res.status === 429 && retryCount < 3) {
    const errText = await res.text()
    let waitMs = 12000
    try {
      const errJson = JSON.parse(errText)
      const msg = errJson.error?.message || ''
      const match = msg.match(/try again in (\d+\.?\d*)s/i)
      if (match) waitMs = Math.ceil(parseFloat(match[1]) * 1000) + 500
    } catch(e) {}
    if (onRateLimit) onRateLimit(Math.ceil(waitMs / 1000))
    await sleep(waitMs)
    if (onRateLimit) onRateLimit(null)
    return sendToOpenAI(messages, onTextChunk, onRateLimit, retryCount + 1)
  }

  if (!res.ok) {
    const errJson = await res.json()
    throw new Error(errJson.error?.message || 'OpenAI API error')
  }

  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let fullContent = ''
  const toolCallsMap = {}
  let finishReason  = null
  let buffer        = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') { finishReason = finishReason || 'stop'; continue }
      if (!data) continue
      try {
        const parsed = JSON.parse(data)
        const choice = parsed.choices?.[0]
        if (!choice) continue
        if (choice.finish_reason) finishReason = choice.finish_reason
        const delta = choice.delta
        if (delta?.content) {
          fullContent += delta.content
          if (onTextChunk) onTextChunk(delta.content)
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index
            if (!toolCallsMap[idx]) {
              toolCallsMap[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } }
            }
            if (tc.id)                  toolCallsMap[idx].id                  += tc.id
            if (tc.function?.name)      toolCallsMap[idx].function.name       += tc.function.name
            if (tc.function?.arguments) toolCallsMap[idx].function.arguments  += tc.function.arguments
          }
        }
      } catch(e) {}
    }
  }

  const toolCallsList = Object.values(toolCallsMap)
  return {
    content:       fullContent || null,
    tool_calls:    toolCallsList.length ? toolCallsList : null,
    finish_reason: finishReason || (toolCallsList.length ? 'tool_calls' : 'stop')
  }
}

// ── Message Component ─────────────────────────────────
function Message({ msg, userInitial, lastPatientIdRef }) {
  const bubbleRef = useRef(null)
  const chartRendered = useRef(false)

  useEffect(() => {
    if (!bubbleRef.current || msg.role !== 'bot' || chartRendered.current) return
    const { cleanText, chartData } = extractChartData(msg.text || '')
    bubbleRef.current.innerHTML = simpleMarkdown(cleanText)
    if (chartData) {
      chartRendered.current = true
      renderChartInBubble(bubbleRef.current, chartData)
    }
    // Append "Launch CareCord AI" button if message is about care gap
    if (msg.showCareGapBtn) {
      const btn = document.createElement('button')
      btn.textContent = 'Launch CareCord AI'
      btn.style.cssText = 'display:inline-block;margin-top:10px;padding:6px 14px;background:transparent;color:#0d9488;border:1px solid #0d9488;border-radius:4px;font-size:0.85rem;cursor:pointer;'
      btn.onmouseenter = () => { btn.style.background = '#0d9488'; btn.style.color = '#fff' }
      btn.onmouseleave = () => { btn.style.background = 'transparent'; btn.style.color = '#0d9488' }
      btn.onclick = () => window.open('/dashboard?patient=' + encodeURIComponent(lastPatientIdRef.current || ''), '_blank')
      bubbleRef.current.appendChild(document.createElement('br'))
      bubbleRef.current.appendChild(btn)
    }
  }, [msg])

  if (msg.role === 'streaming') {
    return (
      <div className="msg-row bot">
        <div><img src={chatbotPng} alt="CareBridge" className="msg-avatar" /></div>
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '80%' }}>
          <div className="msg-bubble"><span>{msg.text}</span></div>
          <span className="msg-time">{formatTime()}</span>
        </div>
      </div>
    )
  }

  if (msg.role === 'user') {
    return (
      <div className="msg-row user">
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '80%' }}>
          <div className="msg-bubble">{msg.text}</div>
          <span className="msg-time">{msg.time}</span>
        </div>
        <div className="msg-avatar user-av">{userInitial}</div>
      </div>
    )
  }

  return (
    <div className="msg-row bot">
      <div><img src={chatbotPng} alt="CareBridge" className="msg-avatar" /></div>
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '80%' }}>
        <div className="msg-bubble" ref={bubbleRef} />
        <span className="msg-time">{msg.time}</span>
      </div>
    </div>
  )
}

function renderChartInBubble(bubble, chartData) {
  const colors = ['#0d9488','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#10b981','#f97316','#06b6d4','#ec4899','#84cc16']
  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'margin-top:14px;max-width:440px;background:#f8fafc;border-radius:10px;padding:12px;'
  const canvas = document.createElement('canvas')
  wrapper.appendChild(canvas)
  bubble.appendChild(wrapper)
  const isBar = chartData.type !== 'pie'
  new Chart(canvas, {
    type: isBar ? 'bar' : 'pie',
    data: {
      labels: chartData.labels,
      datasets: [{
        label: chartData.title || 'Data',
        data: chartData.values,
        backgroundColor: isBar ? '#0d9488' : colors.slice(0, chartData.labels.length),
        borderColor: isBar ? '#0f766e' : colors.slice(0, chartData.labels.length),
        borderWidth: 1,
        borderRadius: isBar ? 6 : 0
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: !isBar },
        title: { display: !!chartData.title, text: chartData.title || '', font: { size: 13 } }
      },
      scales: isBar ? { y: { beginAtZero: true, grid: { color: '#f0f0f0' } }, x: { grid: { display: false } } } : {}
    }
  })
}

// ── Welcome Card ──────────────────────────────────────
function WelcomeCard({ userName, onChipClick }) {
  const chips = [
    { label: 'Search patient', q: 'Search for patient Charlotte Bennett' },
    { label: 'View conditions', q: 'Show conditions for patient 44230' },
    { label: 'Lab results', q: 'What is the hemoglobin count for patient 44230?' },
    { label: 'Medications', q: 'List medications for patient 44230' },
    { label: 'Encounters', q: 'Show encounters for patient 44230' },
  ]
  return (
    <div className="welcome-card">
      <img src={chatbotPng} alt="CareBridge" />
      <h3>Hey {userName}, how can I assist you today?</h3>
      <p>Search patient records, retrieve lab results, conditions, medications, encounters, and procedures.</p>
      <div className="welcome-chips">
        {chips.map(c => (
          <span key={c.label} className="chip" onClick={() => onChipClick(c.q)}>{c.label}</span>
        ))}
      </div>
    </div>
  )
}

// ── Main ChatPage ─────────────────────────────────────
export default function ChatPage() {
  const [screen, setScreen] = useState(() => {
    const token = localStorage.getItem('cb_token')
    const user  = localStorage.getItem('cb_user')
    return token && user ? 'home' : 'login'
  })
  const [userName, setUserName] = useState(() => {
    const u = localStorage.getItem('cb_user') || ''
    return formatDisplayName(u)
  })
  const [userInitial, setUserInitial] = useState(() => {
    const u = localStorage.getItem('cb_user') || 'U'
    return formatDisplayName(u).charAt(0).toUpperCase()
  })

  // Login form state
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError]     = useState('')

  // Chat state
  const [chatOpen, setChatOpen]           = useState(false)
  const [messages, setMessages]           = useState([{ role: 'welcome' }])
  const [inputText, setInputText]         = useState('')
  const [isResponding, setIsResponding]   = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming]     = useState(false)
  const [rateLimitSec, setRateLimitSec]   = useState(null)

  const conversationHistory = useRef([])
  const lastPatientIdRef    = useRef('')
  const messagesEndRef      = useRef(null)
  const inputRef            = useRef(null)
  const textareaRef         = useRef(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, streamingText, scrollToBottom])

  // ── Login ──────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)
    try {
      const name = await doLogin(email, password)
      const display = formatDisplayName(name)
      setUserName(display)
      setUserInitial(display.charAt(0).toUpperCase())
      setMessages([{ role: 'welcome' }])
      conversationHistory.current = []
      setScreen('home')
    } catch (err) {
      setLoginError(err.message)
    } finally {
      setLoginLoading(false)
    }
  }

  // ── Logout ─────────────────────────────────────────
  function handleLogout() {
    localStorage.removeItem('cb_token')
    localStorage.removeItem('cb_user')
    conversationHistory.current = []
    setChatOpen(false)
    setMessages([{ role: 'welcome' }])
    setInputText('')
    setEmail('')
    setPassword('')
    setLoginError('')
    setScreen('login')
  }

  // ── Send Message ───────────────────────────────────
  async function handleSend(textOverride) {
    const text = (textOverride || inputText).trim()
    if (!text || isResponding) return
    setInputText('')
    setIsResponding(true)

    const time = formatTime()
    setMessages(prev => [...prev.filter(m => m.role !== 'welcome'), { role: 'user', text, time }])

    conversationHistory.current.push({ role: 'user', content: text })
    const sliced = conversationHistory.current.slice(-20)
    const firstUserIdx = sliced.findIndex(m => m.role === 'user')
    const trimmed = firstUserIdx > 0 ? sliced.slice(firstUserIdx) : sliced

    const msgList = [{ role: 'system', content: getCachedSystemPrompt() }, ...trimmed]

    let streamBubbleText = ''
    let streamBubbleActive = false

    try {
      while (true) {
        let chunkAccum = ''

        const result = await sendToOpenAI(
          msgList,
          (chunk) => {
            if (!streamBubbleActive) {
              streamBubbleActive = true
              setIsStreaming(true)
            }
            chunkAccum += chunk
            streamBubbleText = chunkAccum
            setStreamingText(chunkAccum)
          },
          (sec) => setRateLimitSec(sec)
        )

        const isToolCall = result.finish_reason === 'tool_calls' || (result.tool_calls && result.tool_calls.length > 0)

        if (isToolCall) {
          // Finalize streaming bubble if any text was streamed
          if (streamBubbleActive && streamBubbleText) {
            setIsStreaming(false)
            setStreamingText('')
            setMessages(prev => [...prev, {
              role: 'bot',
              text: streamBubbleText,
              time: formatTime(),
              showCareGapBtn: false
            }])
            streamBubbleActive = false
            streamBubbleText = ''
          }

          const assistantMsg = {
            role: 'assistant',
            content: result.content || null,
            tool_calls: result.tool_calls
          }
          msgList.push(assistantMsg)
          conversationHistory.current.push(assistantMsg)

          // Handle end_chat
          const endCall = result.tool_calls.find(tc => tc.function.name === 'end_chat')
          if (endCall) {
            const args = JSON.parse(endCall.function.arguments || '{}')
            setIsStreaming(false)
            setStreamingText('')
            setMessages(prev => [...prev, {
              role: 'bot',
              text: args.farewell_message || 'Thank you for using CareBridge. Have a great day!',
              time: formatTime(),
              showCareGapBtn: false
            }])
            break
          }

          // Execute tools in parallel
          const toolResults = await Promise.all(
            result.tool_calls.map(async (tc) => {
              const args = JSON.parse(tc.function.arguments || '{}')
              if (args.SUBJECT) lastPatientIdRef.current = args.SUBJECT
              if (args.PATIENT_ID) lastPatientIdRef.current = args.PATIENT_ID
              const res = await executeTool(tc.function.name, args)
              return { role: 'tool', tool_call_id: tc.id, content: JSON.stringify(res) }
            })
          )
          msgList.push(...toolResults)
          conversationHistory.current.push(...toolResults)

        } else {
          // Final response
          const finalText = result.content || ''
          conversationHistory.current.push({ role: 'assistant', content: finalText })

          if (streamBubbleActive) {
            setIsStreaming(false)
            setStreamingText('')
          }

          const showCareGapBtn = text.toLowerCase().includes('care gap')
          setMessages(prev => [...prev, {
            role: 'bot',
            text: finalText,
            time: formatTime(),
            showCareGapBtn
          }])
          break
        }
      }
    } catch(err) {
      setIsStreaming(false)
      setStreamingText('')
      setMessages(prev => [...prev, {
        role: 'bot',
        text: `Sorry, I encountered an error: ${err.message}. Please try again.`,
        time: formatTime(),
        showCareGapBtn: false
      }])
    } finally {
      setIsResponding(false)
      setRateLimitSec(null)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isResponding && inputText.trim()) handleSend()
    }
  }

  function handleInputChange(e) {
    setInputText(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 100) + 'px'
  }

  function handleClearChat() {
    conversationHistory.current = []
    setMessages([{ role: 'welcome' }])
  }

  // ── LOGIN SCREEN ───────────────────────────────────
  if (screen === 'login') {
    return (
      <div id="login-screen">
        <div className="login-topbar">
          <img src={logoRsi} alt="R Systems" className="rsi-logo" />
          <span className="login-topbar-badge">For Care Coordinators &amp; Providers</span>
        </div>
        <div className="login-body">
          <div className="login-left">
            <div className="login-content">
              <h1 className="login-heading">
                Instant <span className="teal">Patient Insights</span><br />for Care Teams
              </h1>
              <p className="login-desc">
                Give care coordination team instant, secure access to a complete patient view, labs, medications, patient history, and care gaps, <b>Powered by AI</b> and <b>fully integrated with your existing EHR</b>, to act faster, reduce risk, and keep patients on track.
              </p>
              <form onSubmit={handleLogin} autoComplete="off">
                <div className="form-group">
                  <label htmlFor="email">Email Address</label>
                  <input
                    type="email" id="email" placeholder="Enter your email" required
                    autoComplete="username"
                    value={email} onChange={e => setEmail(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="password">Password</label>
                  <div className="pw-wrap">
                    <input
                      type={showPw ? 'text' : 'password'} id="password"
                      placeholder="Enter your password" required autoComplete="current-password"
                      value={password} onChange={e => setPassword(e.target.value)}
                    />
                    <button type="button" className="pw-toggle" onClick={() => setShowPw(p => !p)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    </button>
                  </div>
                </div>
                {loginError && (
                  <div id="login-error" className="error-banner">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span>{loginError}</span>
                  </div>
                )}
                <button type="submit" id="login-btn" className="launch-btn" disabled={loginLoading}>
                  <img src={chatBigIcon} alt="" id="btn-icon" className="btn-icon" />
                  <span>{loginLoading ? 'Signing in...' : 'Launch Provider Assistant'}</span>
                  {loginLoading && <span className="spinner" />}
                </button>
              </form>
              <p className="login-footer">Secure access for healthcare professionals</p>
            </div>
          </div>
          <div className="login-right">
            <img src={chatBigIcon} alt="CareBridge" className="hero-icon" />
          </div>
        </div>
        {loginLoading && (
          <div className="signin-overlay">
            <div className="signin-box">
              <div className="spinner-dark"></div>
              <p>Signing you in...</p>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── HOME + CHAT SCREEN ─────────────────────────────
  return (
    <>
      {/* Home Screen */}
      <div id="home-screen">
        <nav className="navbar">
          <img src={logoRsi} alt="R Systems" className="nav-logo" />
          <span className="nav-tagline">For Care Coordinators &amp; Providers</span>
        </nav>
        <main className="home-main">
          <section className="hero">
            <div className="hero-badge">AI-Powered FHIR Assistant</div>
            <h1 className="hero-heading">Streamline Your<br /><span className="teal">Care Coordination</span></h1>
            <p className="hero-sub">Access patient records, lab results, medications, and clinical history instantly — powered by AI and FHIR R4 integration.</p>
          </section>
          <section className="features">
            {[
              { cls: 'teal-bg', title: 'Instant Record Retrieval', desc: 'Search patient records, diagnoses, and procedures in seconds using natural language.', path: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
              { cls: 'blue-bg', title: 'HIPAA Compliant & Secure', desc: 'Bearer token authentication with secure FHIR R4 APIs. No patient data stored on servers.', path: 'M3 11h18v11H3zM7 11V7a5 5 0 0 1 10 0v4' },
              { cls: 'purple-bg', title: 'AI-Powered Insights', desc: 'GPT-powered analysis of lab results and vitals with normal range flags and clinical context.', path: 'M22 12h-4l-3 9L9 3l-3 9H2' },
              { cls: 'green-bg', title: 'Comprehensive Reports', desc: 'Generate discharge summaries, medication lists, and encounter histories on demand.', path: 'M9 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8' }
            ].map(f => (
              <div key={f.title} className="feat-card">
                <div className={`feat-icon ${f.cls}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {f.path.split('M').filter(Boolean).map((p, i) => <path key={i} d={'M' + p} />)}
                  </svg>
                </div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </section>
        </main>
        <button className="logout-btn-fixed" onClick={handleLogout}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Log Out
        </button>
      </div>

      {/* Chat Widget */}
      <div id="chat-widget">
        {chatOpen && (
          <div id="chat-panel" className="chat-panel">
            <div className="chat-panel-header">
              <div className="chat-panel-info">
                <img src={chatbotPng} alt="CareBridge" className="panel-avatar" />
                <div>
                  <span className="panel-name">RSICareBridge</span>
                  <span className="panel-status"><span className="online-dot"></span>Online</span>
                </div>
              </div>
              <div className="panel-header-actions">
                <button className="panel-action-btn" title="Clear chat" onClick={handleClearChat}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6"/><path d="M14 11v6"/>
                  </svg>
                </button>
                <button className="panel-action-btn" title="Close" onClick={() => setChatOpen(false)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>

            <div id="messages" className="messages-area">
              {messages.map((msg, i) => {
                if (msg.role === 'welcome') return (
                  <WelcomeCard key="welcome" userName={userName} onChipClick={q => handleSend(q)} />
                )
                return (
                  <Message
                    key={i}
                    msg={msg}
                    userInitial={userInitial}
                    lastPatientIdRef={lastPatientIdRef}
                  />
                )
              })}
              {isStreaming && (
                <div className="msg-row bot">
                  <div><img src={chatbotPng} alt="CareBridge" className="msg-avatar" /></div>
                  <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '80%' }}>
                    <div className="msg-bubble" dangerouslySetInnerHTML={{ __html: simpleMarkdown(streamingText) }} />
                    <span className="msg-time">{formatTime()}</span>
                  </div>
                </div>
              )}
              {isResponding && !isStreaming && (
                <div id="typing-indicator" className="typing-indicator">
                  <img src={chatbotPng} alt="" className="typing-avatar" />
                  <div className="typing-bubble">
                    {rateLimitSec
                      ? <span style={{ fontSize: '11px', color: '#4a5568' }}>Rate limit reached. Retrying in {rateLimitSec}s...</span>
                      : <><span className="dot"/><span className="dot"/><span className="dot"/></>
                    }
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-bar">
              <div className="input-container">
                <textarea
                  ref={textareaRef}
                  id="user-input"
                  placeholder={isResponding ? 'CareBridge is responding...' : 'Ask about patient records, labs...'}
                  rows="1"
                  maxLength="2000"
                  value={inputText}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  disabled={isResponding}
                />
                <button
                  id="send-btn"
                  className="send-btn"
                  disabled={isResponding || !inputText.trim()}
                  onClick={() => handleSend()}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                  </svg>
                </button>
              </div>
              <p className="input-hint">CareBridge retrieves FHIR R4 data. Never provides treatment recommendations.</p>
            </div>
          </div>
        )}

        <button
          id="chat-toggle-btn"
          className="chat-toggle-btn"
          title={chatOpen ? 'Close CareBridge' : 'Open CareBridge'}
          onClick={() => setChatOpen(o => !o)}
        >
          {chatOpen
            ? <svg className="toggle-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            : <img src={chatbotPng} alt="CareBridge" className="toggle-icon-open" />
          }
        </button>
      </div>
    </>
  )
}
