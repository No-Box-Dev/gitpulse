-- Hot-path lookup used when calculating daily growth against the most recent
-- reported total. The table primary key is period-first after source, so this
-- metric-first index avoids scanning every metric for prior days.
CREATE INDEX idx_cue_daily_metrics_source_key_period
  ON cue_daily_metrics(source_id, metric_key, period DESC);

