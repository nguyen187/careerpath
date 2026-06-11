const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
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

async function searchJobs(query, extraParams = '') {
  const q = encodeURIComponent(query);
  const url = `https://jsearch.p.rapidapi.com/search?query=${q}&page=1&num_pages=2${extraParams}`;
  const res = await fetch(url, {
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': 'jsearch.p.rapidapi.com'
    }
  });
  if (!res.ok) throw new Error(`JSearch error ${res.status}`);
  const { data = [] } = await res.json();
  return data;
}

async function scoreWithGroq(rawJobs) {
  const jobText = rawJobs.map((j, i) => {
    const loc  = [j.job_city, j.job_state, j.job_country].filter(Boolean).join(', ');
    const desc = (j.job_description || '').slice(0, 500);
    return `[${i}] ${j.job_title} @ ${j.employer_name} (${loc}${j.job_is_remote ? ' · Remote' : ''})\n${desc}`;
  }).join('\n---\n');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a senior career advisor. Score job matches and return ONLY valid JSON:
{"results":[{"index":0,"score":85,"verdict":"Strong Match","why":"2+ years Kafka+Flink exactly required","gaps":"AWS preferred, candidate has Azure","priority":"Apply Now"}]}
Rules:
- score 0-100
- verdict: "Strong Match"(≥80), "Good Match"(60-79), "Partial Match"(40-59), "Weak Match"(<40)
- priority: "Apply Now"(≥75), "Consider"(50-74), "Skip"(<50)
- why: max 12 words
- gaps: max 12 words or "None"`
        },
        {
          role: 'user',
          content: `CANDIDATE:\n${CV_PROFILE}\n\nJOBS:\n${jobText}`
        }
      ]
    })
  });

  if (!res.ok) throw new Error(`Groq error ${res.status}`);
  const groqData = await res.json();
  const content  = groqData.choices?.[0]?.message?.content ?? '{"results":[]}';
  const parsed   = JSON.parse(content);
  return parsed.results || [];
}

function mergeResults(rawJobs, scores) {
  // If Groq returned scores, merge them; otherwise assign defaults
  if (scores.length > 0) {
    return scores
      .filter(s => rawJobs[s.index])
      .map(s => buildJobObj(rawJobs[s.index], s));
  }
  // Fallback: return all jobs unscored
  return rawJobs.map((j, i) => buildJobObj(j, {
    index: i, score: 50, verdict: 'Review', why: 'AI scoring unavailable', gaps: 'Review manually', priority: 'Consider'
  }));
}

function buildJobObj(j, s) {
  const salary = j.job_min_salary
    ? `${j.job_salary_currency || 'USD'} ${Number(j.job_min_salary).toLocaleString()}–${Number(j.job_max_salary).toLocaleString()}`
    : null;
  return {
    title:    j.job_title,
    company:  j.employer_name,
    location: [j.job_city, j.job_state, j.job_country].filter(Boolean).join(', '),
    salary,
    remote:   !!j.job_is_remote,
    url:      j.job_apply_link,
    posted:   j.job_posted_at_datetime_utc,
    score:    s.score,
    verdict:  s.verdict,
    why:      s.why,
    gaps:     s.gaps,
    priority: s.priority
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  const { location = '', keywords = 'data engineer' } = event.queryStringParameters || {};

  if (!location.trim()) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Location is required.' }) };
  }

  try {
    const kw  = keywords.trim();
    const loc = location.trim();

    // ── Strategy 1: exact query ──────────────────────────────────────────────
    let rawJobs = await searchJobs(`${kw} ${loc}`);

    // ── Strategy 2: add "remote" if few results ──────────────────────────────
    if (rawJobs.length < 3) {
      const remote = await searchJobs(`${kw} remote ${loc}`);
      rawJobs = [...rawJobs, ...remote];
    }

    // ── Strategy 3: Southeast Asia fallback ─────────────────────────────────
    if (rawJobs.length < 3) {
      const sea = await searchJobs(`${kw} Southeast Asia remote`);
      rawJobs = [...rawJobs, ...sea];
    }

    // Deduplicate by job_id or title+company
    const seen = new Set();
    rawJobs = rawJobs.filter(j => {
      const key = j.job_id || `${j.job_title}|${j.employer_name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 10);

    if (!rawJobs.length) {
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ jobs: [], message: `No jobs found for "${kw}" near ${loc}. Try "Remote" or "Singapore".` })
      };
    }

    // ── Score with Groq (with fallback) ──────────────────────────────────────
    let scores = [];
    try {
      scores = await scoreWithGroq(rawJobs);
    } catch (err) {
      console.error('Groq scoring failed (using fallback):', err.message);
    }

    const jobs = mergeResults(rawJobs, scores).sort((a, b) => b.score - a.score);

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ jobs, total: jobs.length })
    };

  } catch (err) {
    console.error('find-jobs error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
