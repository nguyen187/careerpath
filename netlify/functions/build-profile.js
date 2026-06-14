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

  const {
    cvText, targetRole, workStatus,
    name, currentRole, location, linkedin,
    yearsExp, timeframe, priorities, workMode,
    industries, companySize, salary, relocation, targetJD
  } = body;

  if (!cvText?.trim()) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'cvText is required' }) };
  }

  const goalsText = [
    targetRole   ? `Target role: ${targetRole}` : '',
    workStatus   ? `Current work status: ${workStatus}` : '',
    timeframe    ? `Time horizon: ${timeframe}` : '',
    priorities?.length ? `Priorities: ${priorities.join(', ')}` : '',
    workMode     ? `Preferred work mode: ${workMode}` : '',
    industries?.length ? `Industries of interest: ${industries.join(', ')}` : '',
    companySize  ? `Preferred company size: ${companySize}` : '',
    salary       ? `Target salary: ${salary}` : '',
    relocation   ? `Relocation: ${relocation}` : '',
    targetJD     ? `Target JD:\n${targetJD.slice(0, 1500)}` : ''
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.25,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a world-class career coach and technical writer. Extract CV data and generate a complete personal career website profile. Return ONLY valid JSON with this EXACT structure:

{
  "personal": {
    "name": "Full name from CV",
    "role": "Current or most recent job title",
    "badge": "Short status phrase e.g. 'Open to new opportunities' or 'Senior Engineer at Company X'",
    "summary": "3-4 sentence professional bio. Be specific, cite numbers from the CV, highlight unique value.",
    "email": "email from CV or null",
    "location": "City, Country or null"
  },
  "stats": [
    {"value": "3+", "label": "Years Experience"},
    {"value": "10", "label": "Projects Delivered"},
    {"value": "3.8", "label": "GPA"}
  ],
  "timeline": [
    {
      "year": "Jan 2023 – Present",
      "type": "work",
      "role": "Job title",
      "org": "Company name",
      "desc": "2-3 sentences about key responsibilities and measurable impact.",
      "bullets": ["Quantified achievement — include specific numbers", "Second key achievement"],
      "tech": ["Tech1", "Tech2", "Tech3"]
    }
  ],
  "skill_groups": [
    {
      "name": "Group name",
      "color": "accent",
      "items": [
        {"name": "Skill", "pct": 85, "level": "4/5", "yrs": "2y", "yr": "2022"}
      ]
    }
  ],
  "awards": [
    {
      "icon": "🏆",
      "title": "Award or Certification name",
      "org": "Granting organization",
      "year": "2024",
      "desc": "What this represents and why it matters (1-2 sentences)"
    }
  ],
  "roadmap": {
    "goal": "Target role from goals input",
    "phases": [
      {
        "n": 1,
        "title": "Phase title",
        "period": "2025 – 2026",
        "desc": "What this phase builds and achieves (2 sentences)",
        "skills_to_acquire": ["Skill 1", "Cert 1", "Tool 1"],
        "milestones": [
          "Complete specific certification",
          "Build specific project with measurable outcome",
          "Achieve specific professional goal"
        ]
      }
    ]
  },
  "cv_summary": "3-sentence profile for job matching: name, current role and company, top 5 technical skills, single biggest achievement with number."
}

STRICT RULES:
- timeline: include ALL work + education entries, newest first. type = "work" | "edu". tech=[] for education.
- skill_groups: exactly 3-4 groups. Colors: "accent"=data/backend, "purple"=ML/AI/cloud, "green"=devops/infra, "highlight"=soft/management
- Skill pct: 90-100=Expert(5+ yrs, core), 75-89=Proficient(2-4 yrs), 55-70=Competent(1-2 yrs), 35-50=Familiar(<1 yr)
- awards: ALL certs, competitions, honors, academic awards from CV (up to 8 items). Use emoji: 🏆=award, 🎓=edu, 📜=cert, 🥇=competition, ⭐=honor
- roadmap: EXACTLY 3 phases for target role. Base phases on REAL skill gaps between current CV and target role. Specific, not generic.
- stats: exactly 3 items — most impressive numbers from the CV
- milestones: 4-6 items per phase, concrete and measurable
- Do NOT include "null" strings — use actual null for missing values
- Return ONLY the JSON object, nothing else`
          },
          {
            role: 'user',
            content: `CV TEXT:\n${cvText.slice(0, 7000)}\n\nCAREER GOALS:\n${goalsText || 'Not specified'}`
          }
        ]
      })
    });

    if (!res.ok) throw new Error(`Groq API error ${res.status}: ${await res.text()}`);
    const data    = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '{}';

    // Validate it parses
    JSON.parse(content);

    return { statusCode: 200, headers: CORS, body: content };

  } catch (err) {
    console.error('build-profile error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
