-- Daily traffic of the visible repositories over the last 90 days.
SELECT repo, date, views, visitors, clones, clone_uniques AS cloneUniques
FROM daily_traffic
WHERE date >= date('now', '-90 days')
  AND repo IN (
    SELECT repo FROM current_repositories
    WHERE :show_private::int = 1 OR private = 0
  )
ORDER BY date DESC
