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
  if (!/^[a-zA-Z\-']+$/.test(cleanWord)) {
    return res.status(400).json({ error: 'Word must contain only English letters' });
  }

  const prompt = `You are an English vocabulary teacher.
First, decide if "${cleanWord}" is a real English word found in dictionaries.

If it is NOT a real English word, output ONLY:
{"valid":false,"error":"Not a valid English word"}

If it IS a real English word, output ONLY this JSON with 3 sentences, each in a different real-life event/context:
{"valid":true,"sentences":[
  {"event":"At work","sentence":"..."},
  {"event":"With friends","sentence":"..."},
  {"event":"Facing a problem","sentence":"..."}
]}

Rules:
- B1-B2 level English. Each sentence: 10-20 words.
- Each sentence uses "${cleanWord}" exactly once, wrapped in **double asterisks** (e.g., **${cleanWord}**).
- The 3 events MUST be different real-life situations (work / friends / family / travel / problem / hobby / etc.).
- event label: short, 2-4 English words, no punctuation.
- Output ONLY the JSON. No markdown fences. No commentary. No trailing text.`;

  const wordRegex = new RegExp(
    `\\b${cleanWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
    'i'
  );

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
        temperature: 0.7,
        max_tokens: 400,
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

    if (parsed.valid === false) {
      return { valid: false, error: parsed.error || 'Not a valid English word' };
    }

    if (!Array.isArray(parsed.sentences) || parsed.sentences.length < 3) {
      throw new Error('Expected 3 sentences');
    }

    const sentences = parsed.sentences.slice(0, 3).map(s => {
      const event = String(s.event || '').trim();
      const sentence = String(s.sentence || '').trim();
      if (!event || !sentence) throw new Error('Missing event or sentence');
      if (!wordRegex.test(sentence)) throw new Error('Sentence does not contain the word');
      return { event, sentence };
    });

    return { valid: true, sentences };
  };

  try {
    let result;
    try {
      result = await callGroq();
    } catch (firstErr) {
      console.warn('[/api/sentences] retry after:', firstErr.message);
      result = await callGroq();
    }
    res.json(result);
  } catch (err) {
    console.error('[/api/sentences]', err);
    res.status(502).json({ error: err.message });
  }
};
