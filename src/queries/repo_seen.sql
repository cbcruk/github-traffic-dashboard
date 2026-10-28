-- When a repository was first and last listed, if the dashboard shows it:
-- listed by the newest collection, and public unless :show_private is 1.
SELECT first_seen AS firstSeen, last_seen AS lastSeen
FROM repositories
WHERE repo = :repo::text
  AND last_seen = (SELECT MAX(last_seen) FROM repositories)
  AND (:show_private::int = 1 OR private = 0)
