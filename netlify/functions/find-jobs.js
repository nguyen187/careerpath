const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const CV_PROFILE = `
Candidate: Dao Thanh Nguyen
Title: Big Data Engineer (2+ years at Viettel Networks, Vietnam's largest telecom)
Core skills: Apache Flink, Apache Spark, Apache Kafka, Apache Iceberg, HDFS, Kubernetes, Airflow, Python, Java, SQL, Azure, Azure Databricks, ClickHouse, PostgreSQL, Argo CD
Architecture patterns: Medallion, Data Lakehouse, Lambda/Kappa, ETL/ELT, Streaming pipelines
Key achievements:
  - Streaming pipeline processing 80-150M messages/min (5M msg/sec)
  - Fixed critical data skew: batch time from 2-4 hours → 3-4 minutes
  - Full Azure cloud platform: Event Hub → Stream Analytics → ML → ADLS → Power BI
  - ACID lakehouse with Apache Iceberg + time-travel queries
Education: BSc Data Science, GPA 3.47/4.0, thesis 10/10
Awards: Top 2 nationally in Data Engineering — Viettel Digital Talent 2024
Languages: Vietnamese (native), English TOEIC 740
Career goal: Solution Data Architect (3-year roadmap in progress)
Location: Vietnam, open to remote or relocation
`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const { location = '', keywords = 'data engineer' } = event.queryStringParameters || {};

  if (!location.trim()) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Location is required.' })
    };
  }

  try {
    // ── Step 1: Fetch jobs from JSearch ──────────────────────────────────────
    const query = encodeURIComponent(`${keywords.trim()} ${location.trim()}`);
    const jobRes = await fetch(
      `https://jsearch.p.rapidapi.com/search?query=${query}&page=1&num_pages=2&date_posted=month`,
      {
        headers: {
          'x-rapidapi-key': RAPIDAPI_KEY,
          'x-rapidapi-host': 'jsearch.p.rapidapi.com'
        }
      }
    );

    if (!jobRes.ok) throw new Error(`JSearch ${jobRes.status}`);

    const { data = [] } = await jobRes.json();
    const rawJobs = data.slice(0, 10);

    if (!rawJobs.length) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ jobs: [], message: 'No jobs found. Try a broader location.' })
      };
    }

    // ── Step 2: Score jobs with Groq AI ──────────────────────────────────────
    const jobText = rawJobs.map((j, i) => {
      const loc = [j.job_city, j.job_state, j.job_country].filter(Boolean).join(', ');
      const desc = (j.job_description || '').slice(0, 600);
      return `[${i}] ${j.job_title} @ ${j.employer_name} (${loc}${j.job_is_remote ? ' · Remote' : ''})\n${desc}`;
    }).join('\n---\n');

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
            content: `You are a senior career advisor. Analyze job fit and return ONLY valid JSON:
{"results":[{"index":0,"score":85,"verdict":"Strong Match","why":"2+ years Kafka+Flink exactly required","gaps":"AWS preferred, candidate has Azure","priority":"Apply Now"}]}

Rules:
- score 0-100 based on skills, experience level, and domain fit
- verdict: "Strong Match" (≥80), "Good Match" (60-79), "Partial Match" (40-59), "Weak Match" (<40)
- priority: "Apply Now" (≥75), "Consider" (50-74), "Skip" (<50)
- why: max 12 words — the strongest matching reason
- gaps: max 12 words — the main missing requirement, or "None"`
          },
          {
            role: 'user',
            content: `CANDIDATE:\n${CV_PROFILE}\n\nJOBS TO SCORE:\n${jobText}`
          }
        ]
      })
    });

    if (!groqRes.ok) throw new Error(`Groq ${groqRes.status}: ${await groqRes.text()}`);

    const groqData = await groqRes.json();
    const content  = groqData.choices?.[0]?.message?.content ?? '{"results":[]}';
    const { results: scores = [] } = JSON.parse(content);

    // ── Step 3: Merge + sort ─────────────────────────────────────────────────
    const jobs = scores
      .filter(s => rawJobs[s.index])
      .map(s => {
        const j = rawJobs[s.index];
        const salaryMin = j.job_min_salary;
        const salaryMax = j.job_max_salary;
        const curr      = j.job_salary_currency || 'USD';
        return {
          title:    j.job_title,
          company:  j.employer_name,
          location: [j.job_city, j.job_state, j.job_country].filter(Boolean).join(', '),
          salary:   salaryMin ? `${curr} ${salaryMin.toLocaleString()}–${salaryMax?.toLocaleString()}` : null,
          remote:   !!j.job_is_remote,
          url:      j.job_apply_link,
          posted:   j.job_posted_at_datetime_utc,
          score:    s.score,
          verdict:  s.verdict,
          why:      s.why,
          gaps:     s.gaps,
          priority: s.priority
        };
      })
      .sort((a, b) => b.score - a.score);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ jobs, total: jobs.length })
    };

  } catch (err) {
    console.error('find-jobs error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message })
    };
  }
};
