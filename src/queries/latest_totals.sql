-- Each repository's newest window totals as GitHub reported them. Only the
-- uniques are used: they are deduplicated across the window, so daily figures
-- cannot rebuild them.
SELECT t.repo, t.view_uniques AS viewUniques, t.clone_uniques AS cloneUniques
FROM traffic_totals t
INNER JOIN (
  SELECT repo, MAX(date) AS max_date FROM traffic_totals GROUP BY repo
) latest ON t.repo = latest.repo AND t.date = latest.max_date
