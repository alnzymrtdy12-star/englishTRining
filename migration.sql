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
