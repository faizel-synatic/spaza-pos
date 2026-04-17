import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { parseSale } from './parser.js'
import { sendWhatsApp } from './whatsapp.js'

const app = new Hono()
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

app.get('/health', (c) => c.text('ok'))

// Twilio sends POST to this route
app.post('/whatsapp', async (c) => {
  try {
    const body = await c.req.parseBody()
    const from = body.From?.replace('whatsapp:', '')
    const text = body.Body?.trim()

    if (!from || !text) return c.text('ok')

    console.log(`[${from}] ${text}`)

    // Handle /start or "hi" type greetings
    if (['hi','hello','start','/start','hey'].includes(text.toLowerCase())) {
      await sendWhatsApp(from,
        'Welcome to Spaza POS!\n\n' +
        'Send your sales like this:\n' +
        '  2 breads 28\n' +
        '  milk 3x22 coke 10\n' +
        '  airtime 50\n\n' +
        'Commands:\n*stock* — see your inventory\n*sales* — see today\'s sales'
      )
      return c.text('ok')
    }

    // Stock command
    if (text.toLowerCase() === 'stock') {
      const { data, error } = await sb
        .from('products')
        .select('name, stock, last_price')
        .eq('shop_id', from)
        .order('name')

      if (error || !data || data.length === 0) {
        await sendWhatsApp(from, 'No stock recorded yet. Start logging sales!')
        return c.text('ok')
      }

      const lines = data.map(p =>
        `${p.name}: ${p.stock} left (last price: R${p.last_price})`
      )
      await sendWhatsApp(from, 'Current stock:\n' + lines.join('\n'))
      return c.text('ok')
    }

    // Sales command
    if (text.toLowerCase() === 'sales') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const { data, error } = await sb
        .from('sales')
        .select('product_name, quantity, unit_price, total')
        .eq('shop_id', from)
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: false })

      if (error || !data || data.length === 0) {
        await sendWhatsApp(from, 'No sales recorded today yet.')
        return c.text('ok')
      }

      const totalRevenue = data.reduce((sum, s) => sum + (s.total || 0), 0)
      const lines = data.map(s =>
        `${s.product_name} x${s.quantity} @ R${s.unit_price} = R${s.total}`
      )
      await sendWhatsApp(from,
        `Today's sales (${data.length} transactions):\n` +
        lines.join('\n') +
        `\n\nTotal: R${totalRevenue.toFixed(2)}`
      )
      return c.text('ok')
    }

    // Parse as sale
    const parsed = await parseSale(text)

    if (parsed.fail || !parsed.items || parsed.items.length === 0) {
      await sendWhatsApp(from,
        "I couldn't understand that.\n\n" +
        'Try: "2 breads 28" or "milk 22 coke 10"\n\n' +
        'Send *stock* to see inventory\nSend *sales* to see today\'s sales'
      )
      return c.text('ok')
    }

    const replies = []

    for (const item of parsed.items) {
      await sb.from('sales').insert({
        shop_id: from,
        product_name: item.name,
        quantity: item.qty,
        unit_price: item.price,
        total: item.qty * item.price,
        raw_message: text
      })

      const { data: product } = await sb
        .from('products')
        .select('stock')
        .eq('shop_id', from)
        .eq('name', item.name)
        .single()

      const newStock = (product?.stock ?? 0) - item.qty

      await sb.from('products').upsert(
        { shop_id: from, name: item.name, stock: newStock, last_price: item.price },
        { onConflict: 'shop_id,name' }
      )

      replies.push(`${item.name}: ${newStock} left`)
    }

    await sendWhatsApp(from, 'Logged. ' + replies.join(', '))

  } catch (err) {
    console.error('Webhook error:', err)
  }

  return c.text('ok')
})

serve({ fetch: app.fetch, port: process.env.PORT || 3000 })
console.log('Spaza AI.. running...')