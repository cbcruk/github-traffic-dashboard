-- Each repository's newest popular paths snapshot; see latest_referrers.sql.
SELECT p.repo, p.path, p.title, p.count, p.uniques
FROM popular_paths p
INNER JOIN (
  SELECT repo, MAX(date) AS max_date FROM popular_paths GROUP BY repo
) latest ON p.repo = latest.repo AND p.date = latest.max_date
ORDER BY p.count DESC
