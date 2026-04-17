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
- If a total price is given for multiple items, divide to get unit price
- Treat common SA shorthand: "bread"=bread, "cold drink"/"coke"/"cool drink"=cold drink
- qty defaults to 1 if not specified
- price is the unit price in Rands

Examples:
"2 breads 28" -> {"items":[{"name":"bread","qty":2,"price":14}]}
"milk 3x22 coke 10" -> {"items":[{"name":"milk","qty":3,"price":22},{"name":"coke","qty":1,"price":10}]}
"airtime 50" -> {"items":[{"name":"airtime","qty":1,"price":50}]}
"5 chips 25" -> {"items":[{"name":"chips","qty":5,"price":5}]}

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