module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { story } = req.body || {};
  if (!story) return res.status(400).json({ error: 'No story provided' });

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{
          role: 'user',
          content: `Translate this English story to Arabic. Keep **word** bold markers. Output ONLY the Arabic translation:\n\n${story}`,
        }],
        temperature: 0.3,
        max_tokens: 600,
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      return res.status(502).json({ error: `Groq error: ${errText}` });
    }

    const data = await groqRes.json();
    const storyAr = data?.choices?.[0]?.message?.content?.trim() || '';
    if (!storyAr) return res.status(502).json({ error: 'Empty translation from Groq' });

    res.json({ storyAr });
  } catch (err) {
    console.error('[/api/translate]', err);
    res.status(500).json({ error: err.message });
  }
};
