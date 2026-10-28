-- The newest collection date whose run finished.
SELECT MAX(collected_on) AS date FROM collection_runs
WHERE finished_at IS NOT NULL
