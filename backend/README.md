# Insightboard API (Node.js + Express + PostgreSQL)

## Run it
1. Install Node.js and PostgreSQL.
2. Create the database:  `createdb insightboard`  then  `psql insightboard -f schema.sql`
3. Copy `.env.example` to `.env` and put in your Postgres password.
4. `npm install` then `npm start`  -> http://localhost:4000

## Endpoints
| Method | URL | What it does |
|---|---|---|
| GET | /api/records?region=&category= | List records |
| POST | /api/records/import?replace=true | Bulk import (JSON array) |
| DELETE | /api/records | Clear all records |
| GET | /api/summary/:dim?metric= | Chart data (dim: month, category, region) |
| GET | /api/kpis | Revenue, profit, margin, growth |
| GET | /api/reports/monthly.csv | Downloadable CSV report |
| GET/POST/DELETE | /api/widgets | Saved dashboard charts |

## Connect the React dashboard
Replace the in-browser data with fetch calls, for example:

```js
const API = 'http://localhost:4000/api';
// load chart data
const d = await (await fetch(`${API}/summary/region?metric=profit`)).json(); // { labels, values }
// import mapped rows from the Data tab
await fetch(`${API}/records/import?replace=true`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out)
});
// download the report
window.open(`${API}/reports/monthly.csv`);
```
Run the React app locally (the published page can't call localhost).

## Deploy (Week 3)
Host the API on Render or Railway with a managed PostgreSQL database, and set `DATABASE_URL` there.
