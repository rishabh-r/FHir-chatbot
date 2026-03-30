import React from 'react'
import ReactDOM from 'react-dom/client'
import { Chart, registerables } from 'chart.js'
import App from './App'
import './styles.css'

Chart.register(...registerables)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
