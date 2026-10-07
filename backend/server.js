require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Only these values are allowed in SQL, so user input never goes into a query string.
const DIMS = { month: "to_char(date,'YYYY-MM')", category: 'category', region: 'region' };
const METRICS = { revenue: 'SUM(revenue)', cost: 'SUM(cost)', profit: 'SUM(revenue - cost)', units: 'SUM(units)' };

// Builds "WHERE region = $1 AND category = $2" from ?region=&category=
function where(q) {
  const parts = [], vals = [];
  ['region', 'category'].forEach((k) => {
    if (q[k] && q[k] !== 'All') { vals.push(q[k]); parts.push(`${k} = $${vals.length}`); }
  });
  return { sql: parts.length ? 'WHERE ' + parts.join(' AND ') : '', vals };
}
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: e.message }); });

// ---- Records ----
app.get('/api/records', wrap(async (req, res) => {
  const w = where(req.query);
  const { rows } = await pool.query(`SELECT id, to_char(date,'YYYY-MM-DD') AS date, category, region, revenue::float, cost::float, units FROM records ${w.sql} ORDER BY date`, w.vals);
  res.json(rows);
}));

// Bulk import: body is an array of { date, category, region, revenue, cost, units }
app.post('/api/records/import', wrap(async (req, res) => {
  const list = req.body;
  if (!Array.isArray(list) || !list.length) return res.status(400).json({ error: 'Send a non-empty array of records.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (req.query.replace === 'true') await client.query('TRUNCATE records RESTART IDENTITY');
    for (const r of list) {
      if (!r.date || isNaN(+r.revenue)) throw new Error('Every record needs a date and a numeric revenue.');
      await client.query(
        'INSERT INTO records (date, category, region, revenue, cost, units) VALUES ($1,$2,$3,$4,$5,$6)',
        [r.date, r.category || 'Other', r.region || 'All regions', +r.revenue, +r.cost || 0, +r.units || 0]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ imported: list.length });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { client.release(); }
}));

app.delete('/api/records', wrap(async (req, res) => {
  await pool.query('TRUNCATE records RESTART IDENTITY');
  res.json({ cleared: true });
}));

// ---- Aggregations for charts: /api/summary/region?metric=profit&category=Home ----
app.get('/api/summary/:dim', wrap(async (req, res) => {
  const dim = DIMS[req.params.dim], metric = METRICS[req.query.metric || 'revenue'];
  if (!dim || !metric) return res.status(400).json({ error: 'Unknown dimension or metric.' });
  const w = where(req.query);
  const order = req.params.dim === 'month' ? 'label' : 'value DESC';
  const { rows } = await pool.query(`SELECT ${dim} AS label, ROUND(${metric})::float AS value FROM records ${w.sql} GROUP BY 1 ORDER BY ${order}`, w.vals);
  res.json({ labels: rows.map((r) => r.label), values: rows.map((r) => r.value) });
}));

// ---- KPIs ----
app.get('/api/kpis', wrap(async (req, res) => {
  const w = where(req.query);
  const { rows } = await pool.query(`SELECT COALESCE(SUM(revenue),0)::float AS revenue, COALESCE(SUM(revenue-cost),0)::float AS profit FROM records ${w.sql}`, w.vals);
  const m = await pool.query(`SELECT to_char(date,'YYYY-MM') AS month, SUM(revenue)::float AS revenue FROM records ${w.sql} GROUP BY 1 ORDER BY 1 DESC LIMIT 2`, w.vals);
  const { revenue, profit } = rows[0];
  const growth = m.rows.length === 2 && m.rows[1].revenue ? ((m.rows[0].revenue - m.rows[1].revenue) / m.rows[1].revenue) * 100 : 0;
  res.json({ revenue, profit, margin: revenue ? (profit / revenue) * 100 : 0, growth });
}));

// ---- Export: downloadable CSV report ----
app.get('/api/reports/monthly.csv', wrap(async (req, res) => {
  const w = where(req.query);
  const { rows } = await pool.query(`SELECT to_char(date,'YYYY-MM') AS month, SUM(revenue) AS revenue, SUM(cost) AS cost, SUM(revenue-cost) AS profit,
    ROUND(100*SUM(revenue-cost)/NULLIF(SUM(revenue),0),1) AS margin_pct FROM records ${w.sql} GROUP BY 1 ORDER BY 1`, w.vals);
  const csv = 'month,revenue,cost,profit,margin_pct\n' + rows.map((r) => [r.month, r.revenue, r.cost, r.profit, r.margin_pct].join(',')).join('\n');
  res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="monthly-report.csv"' }).send(csv);
}));

// ---- Custom dashboards: saved chart widgets ----
app.get('/api/widgets', wrap(async (req, res) => res.json((await pool.query('SELECT * FROM widgets ORDER BY id')).rows)));
app.post('/api/widgets', wrap(async (req, res) => {
  const { type, dim, metric } = req.body;
  if (!['bar', 'line', 'doughnut'].includes(type) || !DIMS[dim] || !METRICS[metric]) return res.status(400).json({ error: 'Invalid widget.' });
  res.status(201).json((await pool.query('INSERT INTO widgets (type, dim, metric) VALUES ($1,$2,$3) RETURNING *', [type, dim, metric])).rows[0]);
}));
app.delete('/api/widgets/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM widgets WHERE id = $1', [req.params.id]);
  res.status(204).end();
}));

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));
