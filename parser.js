import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export async function parseSale(text) {
  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      max_tokens: 300,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: `You parse South African spaza shop sale messages into JSON.
Return ONLY valid JSON. No explanation. No markdown. No code blocks.
Format: {"items":[{"name":"string","qty":number,"price":number}]}

Rules:
- The price is ALWAYS the unit price (price per single item), never the total
- qty defaults to 1 if not specified
- "2 breads 14" means 2 breads at R14 each = R28 total
- "3 milk 33" means 3 milk at R33 each = R99 total
- "milk 22" means 1 milk at R22
- Strip size descriptors from names: "1l milk" -> "milk", "2l coke" -> "coke"
- Camelcase all product names
- If a total price is given for multiple items, divide to get unit price
- Treat common SA shorthand: "bread"=bread, "cold drink"/"coke"/"cool drink"=cold drink
- qty defaults to 1 if not specified
- price is the unit price in Rands


Examples:
"2 breads 14" -> {"items":[{"name":"bread","qty":2,"unit_price":14}]}
"3 milk 33" -> {"items":[{"name":"milk","qty":3,"unit_price":33}]}
"milk 3x22 coke 10" -> {"items":[{"name":"milk","qty":3,"unit_price":22},{"name":"coke","qty":1,"unit_price":10}]}
"airtime 50" -> {"items":[{"name":"airtime","qty":1,"unit_price":50}]}
"5 chips 5" -> {"items":[{"name":"chips","qty":5,"unit_price":5}]}
"1l milk 22" -> {"items":[{"name":"milk","qty":1,"unit_price":22}]}

If you cannot parse it return: {"items":[],"fail":true}`
        },
        {
          role: 'user',
          content: text
        }
      ]
    })

    const content = res.choices[0].message.content.trim()
    return JSON.parse(content)
  } catch (err) {
    console.error('Parser error:', err.message)
    return { items: [], fail: true }
  }
}