-- A Slack API acknowledgement is only auditable when we retain the provider's
-- message timestamp. This is Slack's stable message identifier within a
-- channel and lets operators distinguish a real post from optimistic state.
ALTER TABLE delivery_outbox ADD COLUMN slack_message_ts TEXT;
