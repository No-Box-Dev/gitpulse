-- NoxFeed now sends one structured release note per merged pull request.
-- Prevent older queued social-post mirrors from appearing beside it after
-- deployment. Delivered rows remain untouched as immutable delivery history.
UPDATE delivery_outbox
   SET status = 'blocked_service_disabled',
       last_error_code = 'stream_consolidated',
       last_error = 'NoxFeed sends one structured release note per merged pull request; the separate social post was not delivered.',
       next_attempt_at = NULL,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
 WHERE source = 'posts'
   AND status != 'delivered';
