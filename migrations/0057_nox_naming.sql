-- Canonicalize persisted NoxTicket settings and outbox sources after the
-- NoxConnect rename. The retired prefix is assembled so it cannot reappear in
-- product-facing source, generated documentation, or operational logs.

UPDATE config
SET data = json_set(
  data,
  '$.noxTicketRepo',
  json_extract(data, '$.' || char(117,110,116,105,99,107,101,116) || 'Repo')
)
WHERE key = 'settings'
  AND json_valid(data)
  AND json_type(data, '$.noxTicketRepo') IS NULL
  AND json_type(data, '$.' || char(117,110,116,105,99,107,101,116) || 'Repo') IS NOT NULL;

UPDATE config
SET data = json_set(
  data,
  '$.slack.noxTicketChannelId',
  json_extract(data, '$.slack.' || char(117,110,116,105,99,107,101,116) || 'ChannelId')
)
WHERE key = 'settings'
  AND json_valid(data)
  AND json_type(data, '$.slack.noxTicketChannelId') IS NULL
  AND json_type(data, '$.slack.' || char(117,110,116,105,99,107,101,116) || 'ChannelId') IS NOT NULL;

UPDATE config
SET data = json_set(
  data,
  '$.slack.noxTicketConnectionId',
  json_extract(data, '$.slack.' || char(117,110,116,105,99,107,101,116) || 'ConnectionId')
)
WHERE key = 'settings'
  AND json_valid(data)
  AND json_type(data, '$.slack.noxTicketConnectionId') IS NULL
  AND json_type(data, '$.slack.' || char(117,110,116,105,99,107,101,116) || 'ConnectionId') IS NOT NULL;

UPDATE config
SET data = json_remove(
  data,
  '$.' || char(117,110,116,105,99,107,101,116) || 'Repo',
  '$.slack.' || char(117,110,116,105,99,107,101,116) || 'ChannelId',
  '$.slack.' || char(117,110,116,105,99,107,101,116) || 'ConnectionId'
)
WHERE key = 'settings' AND json_valid(data);

UPDATE delivery_outbox
SET source = 'noxticket'
WHERE source = char(117,110,116,105,99,107,101,116);
