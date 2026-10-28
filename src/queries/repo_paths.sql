-- The newest snapshot only: each is already a 14-day aggregate.
WITH input AS (SELECT :repo::text AS repo)
SELECT p.path, p.title, p.count, p.uniques
FROM popular_paths p, input
WHERE p.repo = input.repo
  AND p.date = (SELECT MAX(date) FROM popular_paths WHERE repo = input.repo)
ORDER BY p.count DESC
