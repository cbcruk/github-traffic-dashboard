SELECT repo, date, views, visitors, clones, clone_uniques AS cloneUniques
FROM daily_traffic
WHERE repo = :repo::text
ORDER BY date
