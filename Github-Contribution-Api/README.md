# Cloudflare Worker: GitHub Contributions API

This Worker exposes an endpoint that returns GitHub contribution data for user in a shape compatible with your Hexo homepage heatmap.

Endpoint:
- GET /api/contributions?year=YYYY

Response shape example:
```
{
  "2025-01-01": ["contribution", "contribution"],
  "2025-01-02": ["contribution"]
}
```

Notes:
- Requires a GitHub Personal Access Token as a Worker secret `GITHUB_TOKEN` with scope `read:user` (no private repo scope needed, public contributions only).

## Deploy (Windows PowerShell)

1) Install Wrangler (if not installed):
```
npm i -g wrangler
```

2) Authenticate:
```
wrangler login
```

3) Set the GitHub token secret:
```
wrangler secret put GITHUB_TOKEN
```
Paste your token when prompted.

4) Publish the Worker:
```
wrangler deploy
```

5) Note the deployed URL, e.g. `https://github-contrib-api.your-subdomain.workers.dev`.

6) Update your Hexo page code to fetch from:
```
https://<your-worker-host>/api/contributions?year=2025
```
and keep the local `events.json` as a fallback.
