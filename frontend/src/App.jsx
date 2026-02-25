import { useState, useEffect } from 'react'
import LoginScreen from './components/LoginScreen'
import HomeScreen  from './components/HomeScreen'
import ChatWidget  from './components/ChatWidget'

/**
 * Root application component.
 * Manages authentication state (token + username) persisted in localStorage.
 */
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userName,   setUserName]   = useState('')
  const [fhirToken,  setFhirToken]  = useState('')

  // Restore session on page load
  useEffect(() => {
    const token = localStorage.getItem('cb_token')
    const user  = localStorage.getItem('cb_user')
    if (token && user) {
      setFhirToken(token)
      setUserName(user)
      setIsLoggedIn(true)
    }
  }, [])

  const handleLogin = (token, name) => {
    const displayName = formatDisplayName(name)
    localStorage.setItem('cb_token', token)
    localStorage.setItem('cb_user',  displayName)
    setFhirToken(token)
    setUserName(displayName)
    setIsLoggedIn(true)
  }

  const handleLogout = () => {
    localStorage.removeItem('cb_token')
    localStorage.removeItem('cb_user')
    setFhirToken('')
    setUserName('')
    setIsLoggedIn(false)
  }

  if (!isLoggedIn) {
    return <LoginScreen onLogin={handleLogin} />
  }

  return (
    <>
      <HomeScreen userName={userName} onLogout={handleLogout} />
      <ChatWidget  userName={userName} fhirToken={fhirToken} />
    </>
  )
}

/** Strips email domain, takes first part before dot, capitalises. */
function formatDisplayName(raw) {
  let name = raw.includes('@') ? raw.split('@')[0] : raw
  name = name.split('.')[0]
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
}
