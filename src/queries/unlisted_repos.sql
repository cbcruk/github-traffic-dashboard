-- repositories.repo is a TEXT PRIMARY KEY, which SQLite lets be NULL.
SELECT repo FROM repositories WHERE private IS NOT 0 AND repo IS NOT NULL
