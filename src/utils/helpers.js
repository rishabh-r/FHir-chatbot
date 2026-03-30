// ── Format Helpers ────────────────────────────────────

export function formatDate(dateStr) {
  if (!dateStr) return ''
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const parts = dateStr.split('-')
  if (parts.length < 2) return dateStr
  return months[parseInt(parts[1]) - 1] + ' ' + parseInt(parts[2] || 1) + ', ' + parts[0]
}

export function formatTime(isoStr) {
  if (!isoStr) return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  try {
    return new Date(isoStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch(e) { return '' }
}

export function formatDateTime(isoStr) {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr)
    const today = new Date()
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    if (d.toDateString() === today.toDateString()) return 'Today, ' + timeStr
    return formatDate(isoStr.split('T')[0]) + ' \u2022 ' + timeStr
  } catch(e) { return '' }
}

export function formatDisplayName(raw) {
  let name = raw.includes('@') ? raw.split('@')[0] : raw
  name = name.split('.')[0]
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
}

export function escHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function extractChartData(text) {
  const match = text.match(/\[CHART:(\{[\s\S]*?\})\]/)
  if (!match) return { cleanText: text, chartData: null }
  try {
    return { cleanText: text.replace(match[0], '').trim(), chartData: JSON.parse(match[1]) }
  } catch(e) {
    return { cleanText: text.replace(match[0], '').trim(), chartData: null }
  }
}
