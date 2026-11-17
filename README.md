# cs-geriatrico-chatbot

Discord bot that fetches CS2/FaceIT match stats and posts match summaries to a Discord channel.

Hosted on Render: https://dashboard.render.com/web/srv-d39utvh5pdvs73boqmkg

## Endpoints
- POST /faceit/webhook — FaceIT webhook endpoint (returns JSON 200)
- GET  /fetchStats      — Manual trigger to fetch/post latest stats
- POST /broadcast       — Send arbitrary text messages to the configured Discord channel
- POST /weeklyReport    — Generate and post the weekly report (bearer authentication required)

## Environment
Create a `.env` with:
- DISCORD_TOKEN
- FACEIT_API_KEY
- DISCORD_CHANNEL_ID
- BROADCAST_API_TOKEN - a long, randomly generated secret used to authorize POST /broadcast and POST /weeklyReport
- (optional) PORT — defaults to 3000
- (optional) WEEKLY_REPORT_ENABLED — defaults to true; set false to disable automatic reports
- (optional) WEEKLY_REPORT_HOUR_UTC — Monday posting hour, 0–23; defaults to 9
- (optional) WEEKLY_REPORT_STATE_FILE — defaults to ./weekly_report_state.json; use a persistent disk path on Render

## Run locally
1. npm install
2. cp .env.example .env (fill values)
3. node index.js
4. Server runs on http://localhost:3000

## Behavior
- Fetches recent FaceIT matches and posts match embeds to the configured Discord channel.
- Configured to limit match queries to a recent time window (see service implementation).

## Weekly report

The Portuguese **Boletim semanal do Geriátrico** has two sections:

1. **Por jogador:** games played, wins/losses, win percentage, total kills/deaths/assists, aggregate K/D, average kills per match, and a playful comment based on performance. Inactive players get their own entry too.
2. **Achados gerais:** unique matches, player participations, group totals, shared awards for tied leaders, and the most played maps.

The roster lives in `config/players.js` and is shared with the existing match summaries. It includes the updated nicknames `-TheBrain` and `JORGE`. FACEIT player IDs are used to associate statistics, so old nicknames in historical matches still work.

Reports cover the **previous complete Monday–Sunday in UTC**, based on match completion time. All history pages are fetched, shared matches are fetched once, and every map of a series contributes to K/D/A. A series counts as one match. K/D is total kills divided by total deaths, not an average of individual ratios. Wins and losses are counted per player; opponents from the roster can therefore record different results in the same match. Missing outcomes are excluded from win percentage. Missing histories/statistics are clearly marked as partial data; a complete history outage fails and can be retried.

### On demand

Send `!weekly` in `DISCORD_CHANNEL_ID`, or call:

~~~sh
curl -X POST https://your-service.onrender.com/weeklyReport \
  -H "Authorization: Bearer $BROADCAST_API_TOKEN"
~~~

The endpoint waits for delivery and returns the report period as Unix timestamps plus `messagesPosted`. It returns 401 for invalid authorization, 503 for missing authentication configuration or a Discord client that is not ready, 409 if another report is running, and 502 if generation/delivery fails. On-demand requests intentionally allow reposting and do not consume the scheduled delivery.

### Automatic posting

The bot checks once a minute after Discord connects and posts on **Mondays at 09:00 UTC** by default. Set `WEEKLY_REPORT_HOUR_UTC` to change the hour. On startup it catches up the latest due report if that week has not been delivered, including on the first deployment; it does not post an entire backlog. Before the Monday posting hour, the latest due scheduled report is still the preceding week, while `!weekly` can already request the newly completed week.

Delivery state includes the rendered report and message progress, so ordinary restarts skip delivered weeks and failed sends resume from the remaining message. Failures retry after five minutes. Reports are split to respect Discord limits, and simultaneous requests are rejected.

Run **one bot instance** and set `WEEKLY_REPORT_STATE_FILE` to a path on a **Render persistent disk**, such as `/var/data/weekly_report_state.json`. An ephemeral filesystem loses delivery history on deployment and can cause a repost. A crash between a Discord send and its state-file update can also repeat that message; delivery is not transactional across Discord and the filesystem. Disable automatic posting locally with `WEEKLY_REPORT_ENABLED=false` if desired.

## Tests

Run `npm test` with Node.js 18 or newer. The suite uses mock FACEIT/Discord clients and a temporary localhost HTTP server; it does not contact FACEIT or post to Discord.

## Calling /broadcast
Set BROADCAST_API_TOKEN in Render's environment variables (and locally in .env). Send it only in the Authorization header; never commit it.

~~~sh
curl -X POST https://your-service.onrender.com/broadcast \
  -H "Authorization: Bearer $BROADCAST_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello"}'
~~~

Requests without a valid bearer token receive 401 Unauthorized. If BROADCAST_API_TOKEN is missing, /broadcast returns 503 rather than accepting unauthenticated requests.
