# Sherevo Card Generator

Serverless card generator API using Vercel Functions, `puppeteer-core`, and `@sparticuz/chromium`.

## Local Development

```bash
npm i
npm run dev
```

## Deploy

Using Vercel CLI (requires login):

```bash
vercel --confirm --name sherevo-card-generator
```

Or link an existing project and deploy:

```bash
vercel link --project sherevo-card-generator --yes
vercel deploy --prod --confirm
```

## Endpoint

POST `api/generate-card`

Body:
```json
{
  "cardDesign": { "canvas_width": 1080, "canvas_height": 1920, "text_elements": [] },
  "guest": { "id": "123", "name": "Jane Doe" },
  "event": { "name": "Event", "date": "2025-01-01", "time": "18:00", "venue": "Hall" },
  "eventAttributes": []
}
```

