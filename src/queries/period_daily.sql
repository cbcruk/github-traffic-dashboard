-- Daily traffic of the visible repositories from :from to :to.
SELECT repo, date, views, visitors, clones
FROM daily_traffic
WHERE date BETWEEN :from::text AND :to::text
  AND repo IN (
    SELECT repo FROM current_repositories
    WHERE :show_private::int = 1 OR private = 0
  )
