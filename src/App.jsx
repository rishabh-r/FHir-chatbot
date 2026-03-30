import { useState, useEffect } from 'react'
import LoginScreen from './components/LoginScreen'
import HomeScreen from './components/HomeScreen'
import ChatWidget from './components/ChatWidget'
import { formatDisplayName } from './utils'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userName, setUserName] = useState('')
  const [userInitial, setUserInitial] = useState('U')

  useEffect(() => {
    const savedToken = localStorage.getItem('cb_token')
    const savedUser = localStorage.getItem('cb_user')
    if (savedToken && savedUser) {
      const displayName = formatDisplayName(savedUser)
      setUserName(displayName)
      setUserInitial(displayName.charAt(0).toUpperCase())
      setIsLoggedIn(true)
    }
  }, [])

  const handleLoginSuccess = (name) => {
    const displayName = formatDisplayName(name)
    setUserName(displayName)
    setUserInitial(displayName.charAt(0).toUpperCase())
    setIsLoggedIn(true)
  }

  const handleLogout = () => {
    localStorage.removeItem('cb_token')
    localStorage.removeItem('cb_user')
    setIsLoggedIn(false)
    setUserName('')
    setUserInitial('U')
  }

  if (!isLoggedIn) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />
  }

  return (
    <>
      <HomeScreen onLogout={handleLogout} />
      <ChatWidget userName={userName} userInitial={userInitial} />
    </>
  )
}

export default App
