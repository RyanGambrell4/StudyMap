-- 20260810_brain_dump_score_signal_v1.sql
-- Adds the 'brain_dump_score' signal type to public.topic_signals.
--
-- Why this exists:
--   Before this change api/brain-dump-score.js wrote only 'brain_dump_gap'
--   rows (fixed score 0.0, one per named gap). The dump's own readiness
--   score for its own topic was never written to topic_signals; it landed
--   only in localStorage (se_mastery_v2) and in generated_artifacts.payload.
--   The Knowledge Map reads topic_signals as its single source of evidence,
--   so without this type a Brain Dump could never produce a scored row and
--   a topic could never read Solid off the back of one.
--
--   'brain_dump_score' is server_graded: it is written only by
--   api/brain-dump-score.js after the model returns, never by a client.
--   recordClientSignalBatch refuses server_graded types, so /api/record-signals
--   cannot be used to forge one.
--
-- Existing rows are untouched. This only widens the allowed set, so the
-- statement is safe to run on a live table and safe to run twice.
--
-- HOW TO RUN (manual, one time):
--   1. Open https://supabase.com/dashboard/project/vpmgamaspefwqywttdtj
--   2. SQL Editor -> New query -> paste this file -> Run.
--   3. Verify: the check constraint below lists six signal types.
--
-- Rollback (only valid if no brain_dump_score rows have been written):
--   alter table public.topic_signals drop constraint topic_signals_signal_type_check;
--   alter table public.topic_signals add constraint topic_signals_signal_type_check
--     check (signal_type in ('brain_dump_gap','teach_it_back','repair_misconception','quiz_answer','practice_exam_answer'));

alter table public.topic_signals
  drop constraint if exists topic_signals_signal_type_check;

alter table public.topic_signals
  add constraint topic_signals_signal_type_check
  check (signal_type in (
    'brain_dump_gap',
    'brain_dump_score',
    'teach_it_back',
    'repair_misconception',
    'quiz_answer',
    'practice_exam_answer'
  ));
