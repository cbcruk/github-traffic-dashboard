SELECT started_at AS startedAt, last_batch_at AS lastBatchAt,
       finished_at AS finishedAt, repos,
       succeeded, failed, failed_repos AS failedRepos, error
FROM collection_runs
ORDER BY started_at DESC
LIMIT :limit
