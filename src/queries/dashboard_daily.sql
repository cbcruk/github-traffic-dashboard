-- The last 14 days of daily traffic per visible repository. GitHub's window
-- is 14 days including today, so it reaches back 13.
SELECT repo, date, views, visitors, clones, clone_uniques AS cloneUniques
FROM daily_traffic
WHERE date >= date('now', '-13 days')
  AND repo IN (
    SELECT repo FROM current_repositories
    WHERE :show_private::int = 1 OR private = 0
  )
ORDER BY repo, date
