module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { word } = req.body || {};
  if (!word || typeof word !== 'string') return res.status(400).json({ error: 'No word provided' });

  const cleanWord = word.trim();
  if (!cleanWord) return res.status(400).json({ error: 'Empty word' });

  const prompt = `You are a B1/B2 English vocabulary helper. For the word "${cleanWord}", produce JSON exactly like:
{"example":"<one natural English sentence 10-18 words using the word exactly once>","definition":"<one short English definition, max 12 words, no Arabic>"}
Output ONLY the JSON. No markdown fences. No commentary.`;

  const wordRegex = new RegExp(`\\b${cleanWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');

  const callGroq = async () => {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 200,
      }),
    });
    if (!groqRes.ok) {
      const errText = await groqRes.text();
      throw new Error(`Groq error: ${errText}`);
    }
    const data = await groqRes.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object in Groq output');
    const parsed = JSON.parse(jsonMatch[0]);
    const example = String(parsed.example || '').trim();
    const definition = String(parsed.definition || '').trim();
    if (!example || !definition) throw new Error('Missing example or definition');
    if (!wordRegex.test(example)) throw new Error('Example does not contain the word');
    return { example, definition };
  };

  try {
    let result;
    try {
      result = await callGroq();
    } catch (firstErr) {
      console.warn('[/api/word-info] retry after:', firstErr.message);
      result = await callGroq();
    }
    res.json(result);
  } catch (err) {
    console.error('[/api/word-info]', err);
    res.status(502).json({ error: err.message });
  }
};
