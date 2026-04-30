module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { words } = req.body || {};
  if (!Array.isArray(words) || !words.length) {
    return res.status(400).json({ error: 'No words provided' });
  }

  const wordList = words.join(', ');
  const prompt = `You are a friendly English teacher. Write a short, engaging story (120–160 words) for an Arabic-speaking learner that naturally uses ALL of these vocabulary words: ${wordList}.

STRICT RULES:
- Write ONLY the story in English. No Arabic, no translations, no parentheses with meanings.
- Do NOT put any translation, definition, or hint next to the vocabulary words.
- Wrap each vocabulary word in **double asterisks** (e.g., **word**) — nothing else inside the asterisks.
- Keep sentences simple and clear (B1–B2 level).
- End with ONE open comprehension question on a new line, prefixed exactly with: "Q: "`;

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.85,
        max_tokens: 600,
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      return res.status(502).json({ error: `Groq error: ${errText}` });
    }

    const data = await groqRes.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() || '';
    if (!raw) return res.status(502).json({ error: 'Empty response from Groq' });

    const qMatch = raw.match(/Q:\s*(.+)$/m);
    const question = qMatch ? qMatch[1].trim() : '';
    let story = raw.replace(/Q:\s*.+$/m, '').trim();
    story = story.replace(/\s*\(([^)]*[؀-ۿ][^)]*)\)/g, '');

    res.json({ story, question });
  } catch (err) {
    console.error('[/api/generate]', err);
    res.status(500).json({ error: err.message });
  }
};
