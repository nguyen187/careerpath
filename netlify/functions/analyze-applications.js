const GROQ_API_KEY = process.env.GROQ_API_KEY;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { applications = [], profile = '' } = body;
  if (!applications.length) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'No applications provided' }) };

  const appText = applications.map((a, i) => {
    const lines = [`[${i + 1}] ${a.title} @ ${a.company} — Status: ${a.status}`];
    if (a.appliedDate) lines.push(`Applied: ${a.appliedDate}`);
    if (a.notes) lines.push(`Notes: ${a.notes}`);
    if (a.rejectionReason) lines.push(`Rejection reason: ${a.rejectionReason}`);
    return lines.join('\n');
  }).join('\n---\n');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      temperature: 0.3,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are an expert career coach. Analyze job application data and rejection patterns to give actionable advice. Return ONLY valid JSON:
{"score":72,"trend":"improving","insights":[{"priority":1,"title":"Short title (3-5 words)","problem":"What pattern is hurting success (max 15 words)","action":"Specific step to fix it right now (max 20 words)","impact":"High"}],"summary":"One sentence overall assessment and encouragement"}
Rules:
- score: 0-100 (probability of landing a job with current strategy)
- trend: "improving"|"declining"|"stable" (based on rejection pattern over time)
- insights: exactly 3 items, most impactful first
- impact: "High"|"Medium"|"Low"
- Be specific and actionable, reference actual rejection reasons when available`
        },
        {
          role: 'user',
          content: `CANDIDATE PROFILE:\n${profile || 'Not provided'}\n\nAPPLICATIONS (${applications.length} total):\n${appText}`
        }
      ]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Groq error:', err);
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: `AI service error ${res.status}` }) };
  }

  const groqData = await res.json();
  const content = groqData.choices?.[0]?.message?.content ?? '{}';

  try {
    const parsed = JSON.parse(content);
    return { statusCode: 200, headers: CORS, body: JSON.stringify(parsed) };
  } catch {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ score: 50, trend: 'stable', insights: [], summary: 'Analysis complete. Add more rejection notes for better insights.' }) };
  }
};
