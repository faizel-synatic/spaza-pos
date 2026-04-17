const BASE = () => `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}`

export async function sendMessage(chatId, text) {
  try {
    await fetch(`${BASE()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    })
  } catch (err) {
    console.error('Telegram send error:', err.message)
  }
}

export async function registerWebhook(host) {
  const url = `https://${host}/telegram`
  const res = await fetch(`${BASE()}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, drop_pending_updates: true })
  })
  return res.json()
}

export async function getWebhookInfo() {
  const res = await fetch(`${BASE()}/getWebhookInfo`)
  return res.json()
}