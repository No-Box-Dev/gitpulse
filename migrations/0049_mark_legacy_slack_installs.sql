-- Make the app cutover visible immediately. The health worker will maintain
-- this state too, but existing admins should see the reconnect action without
-- waiting for the next scheduled sweep.
UPDATE slack_settings
   SET health_status = 'degraded',
       last_error = 'Reconnect Slack to migrate this organization to NoxConnect',
       last_checked_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
 WHERE app_id IS NULL;
