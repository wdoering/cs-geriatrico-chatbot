# cs-geriatrico-chatbot

Discord bot that fetches CS2/FaceIT match stats and posts match summaries to a Discord channel.

Hosted on Render: https://dashboard.render.com/web/srv-d39utvh5pdvs73boqmkg

## Endpoints
- POST /faceit/webhook — FaceIT webhook endpoint (returns JSON 200)
- GET  /fetchStats      — Manual trigger to fetch/post latest stats
- POST /broadcast       — Send arbitrary text messages to the configured Discord channel

## Environment
Create a `.env` with:
- DISCORD_TOKEN
- FACEIT_API_KEY
- DISCORD_CHANNEL_ID
- BROADCAST_API_TOKEN - a long, randomly generated secret used to authorize POST /broadcast
- (optional) PORT — defaults to 3000

## Run locally
1. npm install
2. cp .env.example .env (fill values)
3. node index.js
4. Server runs on http://localhost:3000

## Behavior
- Fetches recent FaceIT matches and posts match embeds to the configured Discord channel.
- Configured to limit match queries to a recent time window (see service implementation).

## Calling /broadcast
Set BROADCAST_API_TOKEN in Render's environment variables (and locally in .env). Send it only in the Authorization header; never commit it.

~~~sh
curl -X POST https://your-service.onrender.com/broadcast \
  -H "Authorization: Bearer $BROADCAST_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello"}'
~~~

Requests without a valid bearer token receive 401 Unauthorized. If BROADCAST_API_TOKEN is missing, /broadcast returns 503 rather than accepting unauthenticated requests.
