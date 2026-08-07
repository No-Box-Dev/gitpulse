-- Every social PR narration carries a separate, three-line technical summary.
-- Keeping it as a first-class column lets feed clients switch presentation
-- without parsing model metadata out of payload_json.
ALTER TABLE events ADD COLUMN technical_summary TEXT;
