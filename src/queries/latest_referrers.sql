-- Each repository's newest referrer snapshot. Every snapshot is already a
-- rolling 14-day aggregate, so adding several would multiply the counts.
SELECT r.repo, r.referrer, r.count, r.uniques
FROM referrers r
INNER JOIN (
  SELECT repo, MAX(date) AS max_date FROM referrers GROUP BY repo
) latest ON r.repo = latest.repo AND r.date = latest.max_date
ORDER BY r.count DESC
