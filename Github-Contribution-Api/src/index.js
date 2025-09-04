/*
  Cloudflare Worker: GitHub contributions API for user
  Endpoint: GET /api/contributions?year=YYYY
  Response shape: { "YYYY-MM-DD": ["contribution", ...] }
  - We map each contribution day with N total contributions to an array of length N
    with a placeholder string "contribution" so it fits the heatmap's existing code.
  - Uses GitHub GraphQL v4 to query the user's contributions calendar for the given year.
  - Supports CORS so it can be called from your Hexo site.
  Configuration: set environment variable GITHUB_TOKEN in Worker secrets (wrangler secret put GITHUB_TOKEN)
*/

const GQL_ENDPOINT = 'https://api.github.com/graphql';
const USERNAME = 'github user';//将此处改为你的GitHub用户名

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) });
    }

    if (url.pathname === '/api/health') {
      return json({ ok: true }, 200, request);
    }

    if (url.pathname === '/api/contributions') {
      const yearParam = url.searchParams.get('year');
      const now = new Date();
      const year = Number.isInteger(Number(yearParam)) ? Number(yearParam) : now.getFullYear();

      try {
        const data = await getContributionsForYear(USERNAME, year, env);
        return json(data, 200, request, 3600); // cache for 1 hour at edge/browser
      } catch (err) {
        return json({ error: err.message || 'failed' }, 500, request);
      }
    }

    if (url.pathname === '/api/years') {
      try {
        const info = await getContributionYears(USERNAME, env);
        return json(info, 200, request, 21600); // 6h cache
      } catch (err) {
        return json({ error: err.message || 'failed' }, 500, request);
      }
    }

    return json({ message: 'Not Found' }, 404, request);
  }
};

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

function json(obj, status = 200, request, maxAgeSeconds = 0) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    ...corsHeaders(request)
  };
  if (maxAgeSeconds > 0) {
    headers['Cache-Control'] = `public, max-age=${maxAgeSeconds}`;
  }
  return new Response(JSON.stringify(obj), { status, headers });
}

async function getContributionsForYear(username, year, env) {
  const from = new Date(Date.UTC(year, 0, 1, 0, 0, 0)).toISOString();
  const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59)).toISOString();

  const query = `
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
                color
              }
            }
          }
        }
      }
    }
  `;

  const token = env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('Missing GITHUB_TOKEN secret');
  }

  const res = await fetch(GQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`,
      'user-agent': 'cf-worker-github-contrib'
    },
    body: JSON.stringify({
      query,
      variables: { login: username, from, to }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error: ${res.status} ${text}`);
  }
  const jsonResp = await res.json();
  if (jsonResp.errors) {
    throw new Error(`GitHub API errors: ${JSON.stringify(jsonResp.errors)}`);
  }

  const weeks = jsonResp.data?.user?.contributionsCollection?.contributionCalendar?.weeks || [];
  const result = {};
  for (const week of weeks) {
    for (const day of week.contributionDays) {
      const date = day.date; // YYYY-MM-DD
      const count = day.contributionCount || 0;
      if (count > 0) {
        result[date] = Array.from({ length: count }, () => 'contribution');
      }
    }
  }
  return result;
}

async function getContributionYears(username, env) {
  const query = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionYears
        }
      }
    }
  `;

  const token = env.GITHUB_TOKEN;
  if (!token) throw new Error('Missing GITHUB_TOKEN secret');

  const res = await fetch(GQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`,
      'user-agent': 'cf-worker-github-contrib'
    },
    body: JSON.stringify({ query, variables: { login: username } })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error: ${res.status} ${text}`);
  }
  const jsonResp = await res.json();
  if (jsonResp.errors) {
    throw new Error(`GitHub API errors: ${JSON.stringify(jsonResp.errors)}`);
  }
  const years = jsonResp.data?.user?.contributionsCollection?.contributionYears || [];
  if (!years.length) {
    const thisYear = new Date().getUTCFullYear();
    return { startYear: thisYear, endYear: thisYear, years: [thisYear] };
  }
  const sorted = years.slice().sort((a, b) => a - b);
  return { startYear: sorted[0], endYear: sorted[sorted.length - 1], years: sorted };
}
