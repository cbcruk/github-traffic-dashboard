-- Dates collections ran on, from :from onward. Every collection stamps its
-- snapshots with its date; together the three tables reach back past
-- traffic_totals, which only exists since 2026-09-09.
WITH input AS (SELECT :from::text AS since)
SELECT date FROM traffic_totals, input WHERE date >= input.since
UNION SELECT date FROM referrers, input WHERE date >= input.since
UNION SELECT date FROM popular_paths, input WHERE date >= input.since
