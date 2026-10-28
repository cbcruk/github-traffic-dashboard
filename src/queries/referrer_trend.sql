-- Each referrer's rolling 14-day count per collection date from :from to
-- :to, summed across the visible repositories.
SELECT date, referrer, COALESCE(SUM(count), 0) AS count
FROM referrers
WHERE date BETWEEN :from::text AND :to::text
  AND repo IN (
    SELECT repo FROM current_repositories
    WHERE :show_private::int = 1 OR private = 0
  )
GROUP BY date, referrer
