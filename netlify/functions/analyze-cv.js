const GROQ_API_KEY = process.env.GROQ_API_KEY;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'POST only' }) };

  let cvText;
  try {
    ({ cvText } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  if (!cvText?.trim()) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'cvText is required' }) };
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0.1,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Extract structured profile information from the CV text. Return ONLY valid JSON with this exact structure:
{
  "name": "Full name from CV",
  "current_role": "Most recent job title",
  "years_experience": 3,
  "skills": ["skill1", "skill2"],
  "education": "Highest degree, University, Year",
  "key_achievements": ["Measurable achievement 1", "Measurable achievement 2"],
  "industries": ["Tech", "Finance"],
  "languages": ["English", "Vietnamese"],
  "location": "City, Country"
}
Rules:
- skills: top 12 most relevant technical and professional skills only
- key_achievements: top 3 most impressive, quantified achievements (numbers, %, impact)
- years_experience: integer, estimate from work history
- If a field cannot be determined from the CV, use null
- Do not add commentary, only return the JSON object`
          },
          {
            role: 'user',
            content: cvText.slice(0, 6000)
          }
        ]
      })
    });

    if (!res.ok) throw new Error(`Groq API error ${res.status}`);
    const data    = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '{}';
    return { statusCode: 200, headers: CORS, body: content };

  } catch (err) {
    console.error('analyze-cv error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
