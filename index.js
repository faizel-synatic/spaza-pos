import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { parseSale } from './parser.js'
import { sendMessage, registerWebhook, getWebhookInfo } from './telegram.js'

const app = new Hono()
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

// Health check
app.get('/health', (c) => c.text('ok'))

// Register webhook — visit this URL once after deploying
app.get('/setup', async (c) => {
  const host = c.req.header('host')
  const result = await registerWebhook(host)
  return c.json(result)
})

// Check webhook status
app.get('/status', async (c) => {
  const result = await getWebhookInfo()
  return c.json(result)
})

// Telegram sends all messages here
app.post('/telegram', async (c) => {
  try {
    const body = await c.req.json()
    const msg = body?.message
    if (!msg || !msg.text) return c.json({ ok: true })

    const chatId = msg.chat.id
    const shopId = String(chatId)
    const text = msg.text.trim()

    console.log(`[${shopId}] ${text}`)

    // Handle /start command
    if (text === '/start') {
      await sendMessage(chatId,
        'Welcome to Spaza POS!\n\n' +
        'Send your sales like this:\n' +
        '  2 breads 28\n' +
        '  milk 3x22 coke 10\n' +
        '  airtime 50\n\n' +
        'I will log the sale and track your stock automatically.'
      )
      return c.json({ ok: true })
    }

    // Handle /stock command — show current inventory
    if (text === '/stock') {
      const { data, error } = await sb
        .from('products')
        .select('name, stock, last_price')
        .eq('shop_id', shopId)
        .order('name')

      if (error || !data || data.length === 0) {
        await sendMessage(chatId, 'No stock recorded yet. Start logging sales!')
        return c.json({ ok: true })
      }

      const lines = data.map(p =>
        `${p.name}: ${p.stock} left (last price: R${p.last_price})`
      )
      await sendMessage(chatId, 'Current stock:\n' + lines.join('\n'))
      return c.json({ ok: true })
    }

    // Handle /sales command — show today's sales
    if (text === '/sales') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const { data, error } = await sb
        .from('sales')
        .select('product_name, quantity, unit_price, total, created_at')
        .eq('shop_id', shopId)
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: false })

      if (error || !data || data.length === 0) {
        await sendMessage(chatId, 'No sales recorded today yet.')
        return c.json({ ok: true })
      }

      const totalRevenue = data.reduce((sum, s) => sum + (s.total || 0), 0)
      const lines = data.map(s =>
        `${s.product_name} x${s.quantity} @ R${s.unit_price} = R${s.total}`
      )
      await sendMessage(chatId,
        `Today's sales (${data.length} transactions):\n` +
        lines.join('\n') +
        `\n\nTotal: R${totalRevenue.toFixed(2)}`
      )
      return c.json({ ok: true })
    }

    // Parse as a sale message
    const parsed = await parseSale(text)

    if (parsed.fail || !parsed.items || parsed.items.length === 0) {
      await sendMessage(chatId,
        "I couldn't understand that.\n\n" +
        'Try: "2 breads 28" or "milk 22 coke 10"\n\n' +
        'Commands:\n/stock — see your inventory\n/sales — see today\'s sales'
      )
      return c.json({ ok: true })
    }

    const replies = []

    for (const item of parsed.items) {
      // Save the sale
      const { error: saleError } = await sb.from('sales').insert({
        shop_id: shopId,
        product_name: item.name,
        quantity: item.qty,
        unit_price: item.price,
        total: item.qty * item.price,
        raw_message: text
      })

      if (saleError) {
        console.error('Sale insert error:', saleError.message)
        continue
      }

      // Get current stock
      const { data: product } = await sb
        .from('products')
        .select('stock')
        .eq('shop_id', shopId)
        .eq('name', item.name)
        .single()

      const currentStock = product?.stock ?? 0
      const newStock = currentStock - item.qty

      // Update or create product
      const { error: stockError } = await sb.from('products').upsert(
        {
          shop_id: shopId,
          name: item.name,
          stock: newStock,
          last_price: item.price
        },
        { onConflict: 'shop_id,name' }
      )

      if (stockError) {
        console.error('Stock upsert error:', stockError.message)
      }

      replies.push(`${item.name}: ${newStock} left`)
    }

    if (replies.length > 0) {
      await sendMessage(chatId, 'Logged. ' + replies.join(', '))
    }

  } catch (err) {
    console.error('Webhook error:', err)
  }

  return c.json({ ok: true })
})

serve({ fetch: app.fetch, port: process.env.PORT || 3000 })
console.log('Spaza AI running...')