const GROQ_API_KEY = process.env.GROQ_API_KEY;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'POST only' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { cvSummary, workStatus, targetRole, location, skills = [], priorities = [], timeframe = '3 months' } = body;

  if (!cvSummary && !targetRole) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'cvSummary or targetRole required' }) };
  }

  const isUnemployed = workStatus?.toLowerCase().includes('unemployed') ||
                       workStatus?.toLowerCase().includes('not employed');

  const contextLines = [
    cvSummary    ? `Candidate profile: ${cvSummary}` : '',
    targetRole   ? `Target role: ${targetRole}` : '',
    location     ? `Location: ${location}` : '',
    skills.length ? `Key skills: ${skills.slice(0,12).join(', ')}` : '',
    priorities.length ? `Career priorities: ${priorities.join(', ')}` : '',
    workStatus   ? `Work status: ${workStatus}` : '',
    `Urgency: ${isUnemployed ? 'High — currently unemployed, needs income ASAP' : 'Medium — employed but exploring opportunities'}`,
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0.35,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a world-class career coach specializing in helping tech professionals land jobs fast. Create a detailed, personalized job search action plan. Return ONLY valid JSON with this exact structure:

{
  "estimated_weeks": 8,
  "timeline_summary": "2-3 sentence realistic estimate of how long it will take THIS specific candidate to land a job, citing their specific strengths and any challenges.",
  "confidence": "High",
  "phases": [
    {
      "phase": 1,
      "title": "Phase name (e.g. Foundation & Preparation)",
      "weeks": "Week 1–2",
      "focus": "One-sentence focus of this phase",
      "actions": [
        "Specific, concrete action — tool or platform named — max 15 words",
        "Another action"
      ],
      "milestone": "What success looks like at the end of this phase"
    }
  ],
  "daily_routine": {
    "morning": "Specific 30-min morning job search habit",
    "afternoon": "Specific 30-min afternoon habit",
    "evening": "Specific 15-min evening habit"
  },
  "tips": [
    {
      "category": "Applications",
      "tip": "Specific, actionable tip — max 20 words",
      "impact": "High"
    }
  ],
  "platforms_ranked": [
    {
      "name": "LinkedIn",
      "priority": "Primary",
      "why": "Why this platform for this candidate specifically",
      "action": "What to do on this platform first"
    }
  ],
  "quick_wins": [
    "Thing the candidate can do TODAY — specific, max 15 words"
  ],
  "red_flags_to_avoid": [
    "Common mistake specific to this candidate's situation — max 15 words"
  ]
}

Rules:
- estimated_weeks: realistic number based on their experience, skills, and job market
- confidence: "High" (strong profile), "Medium" (some gaps), "Low" (significant upskilling needed)
- phases: exactly 3 phases. If unemployed: Phase 1 = fast job-readiness (1 week), Phase 2 = active search (bulk of time), Phase 3 = close & negotiate
- actions: 4-6 per phase, highly specific to this candidate's tech stack and target role
- tips: exactly 5-6 tips covering: applications, networking, technical prep, interviews, mindset
- platforms_ranked: 3-4 platforms ordered by priority for this specific person
- quick_wins: exactly 5 things they can do TODAY
- red_flags_to_avoid: 4-5 common mistakes relevant to their situation
- Be SPECIFIC to the candidate — cite their skills, location, and target role throughout
- If unemployed: be more aggressive with timeline, focus on speed without sacrificing quality`
          },
          {
            role: 'user',
            content: `Generate a job search plan for this candidate:\n\n${contextLines}`
          }
        ]
      })
    });

    if (!res.ok) throw new Error(`Groq API error ${res.status}`);
    const data    = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '{}';
    JSON.parse(content); // validate
    return { statusCode: 200, headers: CORS, body: content };
  } catch (err) {
    console.error('job-search-plan error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
