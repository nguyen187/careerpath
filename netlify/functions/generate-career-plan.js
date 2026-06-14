const GROQ_API_KEY = process.env.GROQ_API_KEY;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'POST only' }) };

  let profile, goals;
  try {
    ({ profile, goals } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  if (!profile || !goals) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'profile and goals are required' }) };
  }

  const profileSummary = `
Name: ${profile.name || 'Unknown'}
Current role: ${profile.current_role || 'Not specified'}
Years of experience: ${profile.years_experience ?? 'Unknown'}
Skills: ${(profile.skills || []).join(', ')}
Education: ${profile.education || 'Not specified'}
Key achievements: ${(profile.key_achievements || []).join(' | ')}
Industries: ${(profile.industries || []).join(', ')}
Languages: ${(profile.languages || []).join(', ')}
Location: ${profile.location || 'Not specified'}
`.trim();

  const goalSummary = `
Work status: ${goals.workStatus}
Target role: ${goals.targetRole}
Time horizon: ${goals.timeframe}
Primary goal: ${goals.mainGoal}
${goals.targetJD ? `Target job description:\n${goals.targetJD.slice(0, 2000)}` : ''}
`.trim();

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0.3,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are an expert career coach and technical recruiter. Create a personalized career roadmap based on the candidate's profile and goals. Return ONLY valid JSON with this exact structure:
{
  "target_role": "The target role they specified",
  "timeframe": "3 years",
  "summary": "2-3 sentence personalized summary of their situation and what this plan achieves. Be specific to their background.",
  "phases": [
    {
      "phase": 1,
      "title": "Phase title (5-7 words)",
      "period": "Months 1–6",
      "description": "2-3 sentences explaining the focus and expected outcome of this phase.",
      "key_actions": [
        "Specific, actionable step with concrete resource or metric — max 15 words",
        "2 to 4 actions total"
      ],
      "target_roles": ["Role they could get after this phase"],
      "skills_to_gain": ["skill1", "skill2", "skill3"]
    }
  ],
  "skill_gaps": [
    {
      "skill": "Specific skill or certification",
      "priority": "High",
      "how_to_learn": "Specific resource, course, or project to build this skill",
      "time_estimate": "6 weeks"
    }
  ],
  "quick_wins": [
    "Actionable thing they can do this week — specific, max 15 words",
    "3 to 5 items total"
  ],
  "recommended_certs": ["Cert 1", "Cert 2"]
}
Rules:
- phases: 3 phases for 3-year plan, 4 phases for 5-year plan
- Be SPECIFIC to this person's actual skills and target. No generic advice.
- skill_gaps: only skills truly missing for the target role, max 6 items
- priority values: "High", "Medium", or "Low" only
- quick_wins: things they can start immediately (today or this week)
- If work status is unemployed/looking, prioritize job-readiness actions first`
          },
          {
            role: 'user',
            content: `CANDIDATE PROFILE:\n${profileSummary}\n\nCAREER GOALS:\n${goalSummary}`
          }
        ]
      })
    });

    if (!res.ok) throw new Error(`Groq API error ${res.status}`);
    const data    = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '{}';
    return { statusCode: 200, headers: CORS, body: content };

  } catch (err) {
    console.error('generate-career-plan error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
