-- VocabStory — schema migration for Think Fast + Dictionary support sentences
-- Run this once in Supabase → SQL Editor.

ALTER TABLE dictionary
  ADD COLUMN IF NOT EXISTS example_en      text,
  ADD COLUMN IF NOT EXISTS definition_en   text,
  ADD COLUMN IF NOT EXISTS quiz_correct    int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quiz_wrong      int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quiz_last_seen  timestamptz,
  ADD COLUMN IF NOT EXISTS quiz_avg_ms     int;

-- example_en      → support sentence shown in Dictionary
-- definition_en   → English definition used as the Think Fast clue
-- quiz_correct    → counter for correct answers
-- quiz_wrong      → counter for wrong/timeout answers
-- quiz_last_seen  → last time the word appeared in a quiz
-- quiz_avg_ms     → running avg response time (automaticity proxy)

-- ──────────────────────────────────────────────────────────────
-- Sentence Mode — new table for the "3 contextual sentences" feature
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sentences_words (
  id         bigserial PRIMARY KEY,
  word_en    text        NOT NULL,
  word_ar    text,
  sentences  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  added_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sentences_words_added_at_idx
  ON sentences_words (added_at DESC);

-- sentences → jsonb array of {event: text, sentence: text} (3 items)
-- each row = one word + its 3 contextual sentences
