-- The newest snapshot only: each is already a 14-day aggregate.
WITH input AS (SELECT :repo::text AS repo)
SELECT r.referrer, r.count, r.uniques
FROM referrers r, input
WHERE r.repo = input.repo
  AND r.date = (SELECT MAX(date) FROM referrers WHERE repo = input.repo)
ORDER BY r.count DESC
