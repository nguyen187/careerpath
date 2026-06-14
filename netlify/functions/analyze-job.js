const GROQ_API_KEY = process.env.GROQ_API_KEY;

const CV_PROFILE = `
Candidate: Dao Thanh Nguyen
Title: Big Data Engineer (2+ years at Viettel Networks, Vietnam's largest telecom)
Core skills: Apache Flink, Apache Spark, Apache Kafka, Apache Iceberg, HDFS, Kubernetes, Airflow, Python, Java, SQL, Azure, Azure Databricks, ClickHouse, PostgreSQL, Argo CD
Architecture patterns: Medallion, Data Lakehouse, Lambda/Kappa, ETL/ELT, Streaming pipelines
Key achievements:
  - Streaming pipeline processing 80-150M messages/min (5M msg/sec)
  - Fixed critical data skew: batch time from 2-4 hours to 3-4 minutes
  - Full Azure cloud platform: Event Hub → Stream Analytics → ML → ADLS → Power BI
  - ACID lakehouse with Apache Iceberg + time-travel queries
Education: BSc Data Science, GPA 3.47/4.0, thesis 10/10
Awards: Top 2 nationally in Data Engineering — Viettel Digital Talent 2024
Languages: Vietnamese (native), English TOEIC 740
Career goal: Solution Data Architect (3-year roadmap)
Location: Vietnam, open to remote or relocation
`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'POST only' }) };
  }

  let jobText, cvProfile;
  try {
    ({ jobText, cvProfile } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  if (!jobText?.trim()) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'jobText is required' }) };
  }

  const profileToUse = cvProfile?.trim() || CV_PROFILE;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0.25,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a senior technical recruiter and career advisor specialising in data engineering roles.
Analyse the job posting against the candidate profile. Return ONLY valid JSON with this exact structure:
{
  "score": 82,
  "verdict": "Strong Match",
  "decision": "Apply Now",
  "summary": "One sentence overall assessment, max 20 words.",
  "strengths": [
    "Specific strength relevant to this job — max 15 words",
    "2 to 4 items total"
  ],
  "missing_skills": [
    { "skill": "AWS", "importance": "Required", "fix": "AWS SAA cert — 2 months self-study on A Cloud Guru" }
  ],
  "plan": [
    { "period": "Week 1–2", "action": "Concrete action with resource or deliverable" }
  ],
  "cover_tips": [
    "Specific thing to highlight for this exact job, max 15 words",
    "2 to 3 items"
  ],
  "red_flags": ["Concern if any — empty array [] if none"]
}
Scoring rules:
- score: 0-100 integer based on skills match, experience level, and role alignment
- verdict: "Strong Match" (≥80) | "Good Match" (60–79) | "Partial Match" (40–59) | "Weak Match" (<40)
- decision: "Apply Now" (≥75) | "Apply after prep" (50–74) | "Low priority" (<50)
- missing_skills importance: "Required" | "Preferred" | "Nice to have"
- plan: only include if there are Required or Preferred gaps, 2–5 steps max
- Be specific to THIS job, not generic career advice`
          },
          {
            role: 'user',
            content: `CANDIDATE PROFILE:\n${profileToUse}\n\nJOB POSTING:\n${jobText.slice(0, 4000)}`
          }
        ]
      })
    });

    if (!res.ok) throw new Error(`Groq error ${res.status}`);
    const data    = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '{}';
    return { statusCode: 200, headers: CORS, body: content };

  } catch (err) {
    console.error('analyze-job error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
