-- The visible repositories' referrer snapshots dated on :dates.
WITH input AS (
  SELECT :dates::json('{ "type": "array", "items": { "type": "string" } }') AS dates
)
SELECT repo, date, referrer, count, uniques
FROM referrers
WHERE date IN (SELECT j.value FROM input, json_each(input.dates) AS j)
  AND repo IN (
    SELECT repo FROM current_repositories
    WHERE :show_private::int = 1 OR private = 0
  )
