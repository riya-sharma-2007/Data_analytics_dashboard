CREATE TABLE IF NOT EXISTS records (
  id       SERIAL PRIMARY KEY,
  date     DATE NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  region   TEXT NOT NULL DEFAULT 'All regions',
  revenue  NUMERIC(14,2) NOT NULL,
  cost     NUMERIC(14,2) NOT NULL DEFAULT 0,
  units    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_records_date ON records (date);

CREATE TABLE IF NOT EXISTS widgets (
  id     SERIAL PRIMARY KEY,
  type   TEXT NOT NULL CHECK (type IN ('bar','line','doughnut')),
  dim    TEXT NOT NULL CHECK (dim IN ('month','category','region')),
  metric TEXT NOT NULL CHECK (metric IN ('revenue','cost','profit','units'))
);
