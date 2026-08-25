-- ============================================================================
-- Phantom course data: detection, and the cleanup if it is ever needed
-- ============================================================================
-- READ-ONLY AS WRITTEN. The cleanup at the bottom is commented out and is not
-- to be run without first looking at what section 1 returns.
--
-- ── The answer today is: nothing to clean ───────────────────────────────────
-- Run against production on 2026-08-25:
--
--   courses matching a hardcoded onboarding name   2
--   accounts affected                              2
--   total courses                                  331
--   accounts with any course                       300
--
-- Both of those two are genuine, not phantoms:
--
--   Calculus II        code 'CII',       1 course,  signed up 2026-05-04
--   Organic Chemistry  code 'CHEM 301',  11 courses, 12 uploads, 25 signals,
--                      targetGrade 'B',  difficulty 'Hard', signed up 2026-04-07
--
-- Neither matches the fabrication signature. A course written by the invented
-- path would carry code '', targetGrade 'A', difficulty 'Medium' and no
-- customisation, and both of these were customised by hand. Both accounts also
-- predate CourseRequiredGate and the rewritten onboarding entirely.
--
-- That is the expected result, because the defect never wrote anything.
-- Onboarding step 2 rendered the invented courses and then
-- handleOnboardingComplete called setCourses([]). profileData carries only
-- yearLevel, learningStyle, preferredTime, schoolType, emailDigest, courseName
-- and examDate. The lie was on the screen, not in the database.
--
-- This file exists so that conclusion is checkable rather than asserted, and so
-- there is something to run if a future change does start persisting defaults.
-- ============================================================================

-- ── 1. Detection. Safe to run any time, reads only. ─────────────────────────
with c as (
  select d.user_id,
         u.created_at,
         u.email,
         jsonb_array_elements(coalesce(d.plan->'courses','[]'::jsonb)) as course
    from user_data d
    join auth.users u on u.id = d.user_id
)
select
  left(c.user_id::text, 8) || '...'                                as acct,
  c.course->>'name'                                                as course_name,
  coalesce(nullif(c.course->>'code',''), '(none)')                 as code,
  coalesce(nullif(c.course->>'examDate',''), '(none)')             as exam_date,
  coalesce(c.course->>'targetGrade', '(unset)')                    as target_grade,
  coalesce(c.course->>'difficulty',  '(unset)')                    as difficulty,
  c.created_at::date                                               as signed_up,
  (select count(*) from course_uploads      x where x.user_id = c.user_id) as uploads,
  (select count(*) from topic_signals       x where x.user_id = c.user_id) as signals,
  (select count(*) from generated_artifacts x where x.user_id = c.user_id) as artifacts,
  -- A phantom would be an exact hardcoded name AND untouched defaults AND no
  -- trace of the student ever working on it. All three, not any one.
  case
    when c.course->>'code' = ''
     and c.course->>'targetGrade' = 'A'
     and c.course->>'difficulty'  = 'Medium'
     and not exists (select 1 from course_uploads      x where x.user_id = c.user_id)
     and not exists (select 1 from topic_signals       x where x.user_id = c.user_id)
     and not exists (select 1 from generated_artifacts x where x.user_id = c.user_id)
      then 'PHANTOM SUSPECT: hardcoded name, untouched defaults, never worked on'
    else 'genuine: customised or worked on'
  end                                                              as verdict
from c
where c.course->>'name' in (
  'AP Biology', 'Pre-Calculus', 'AP English Literature',
  'Intro Psychology', 'Calculus II', 'Organic Chemistry',
  'Practice Sections', 'Concept Review', 'Timed Drills'
)
order by verdict, acct;

-- ── 2. The blunt count, if you just want the number ─────────────────────────
-- select count(*) from user_data d,
--   lateral jsonb_array_elements(coalesce(d.plan->'courses','[]'::jsonb)) course
--  where course->>'name' in ('AP Biology','Pre-Calculus','AP English Literature',
--        'Intro Psychology','Calculus II','Organic Chemistry',
--        'Practice Sections','Concept Review','Timed Drills')
--    and course->>'code' = '' and course->>'targetGrade' = 'A'
--    and course->>'difficulty' = 'Medium';
-- Expected: 0.

-- ── 3. Cleanup. DO NOT RUN unless section 1 returns PHANTOM SUSPECT rows. ───
--
-- BLAST RADIUS: this deletes course objects out of user_data.plan.courses for
-- the accounts it matches. It is a data deletion and there is no undo, so take
-- a snapshot first (Supabase dashboard -> Database -> Backups) and run section
-- 1 immediately before, so you are deleting the exact set you just read.
--
-- It is deliberately scoped to the three-part signature from section 1 rather
-- than to the name alone. Deleting on name alone would remove real courses
-- belonging to real students, which is a worse outcome than leaving a phantom.
--
-- BEGIN;
--
-- UPDATE user_data d
--    SET plan = jsonb_set(
--          d.plan,
--          '{courses}',
--          coalesce((
--            select jsonb_agg(course)
--              from jsonb_array_elements(d.plan->'courses') course
--             where not (
--                   course->>'name' in ('AP Biology','Pre-Calculus','AP English Literature',
--                                       'Intro Psychology','Calculus II','Organic Chemistry',
--                                       'Practice Sections','Concept Review','Timed Drills')
--               and course->>'code' = ''
--               and course->>'targetGrade' = 'A'
--               and course->>'difficulty'  = 'Medium'
--             )
--          ), '[]'::jsonb)
--        ),
--        updated_at = now()
--  WHERE exists (
--        select 1 from jsonb_array_elements(d.plan->'courses') course
--         where course->>'name' in ('AP Biology','Pre-Calculus','AP English Literature',
--                                   'Intro Psychology','Calculus II','Organic Chemistry',
--                                   'Practice Sections','Concept Review','Timed Drills')
--           and course->>'code' = ''
--           and course->>'targetGrade' = 'A'
--           and course->>'difficulty'  = 'Medium')
--    and not exists (select 1 from course_uploads      x where x.user_id = d.user_id)
--    and not exists (select 1 from topic_signals       x where x.user_id = d.user_id)
--    and not exists (select 1 from generated_artifacts x where x.user_id = d.user_id);
--
-- -- Check the row count before committing. If it is not what section 1 showed,
-- -- ROLLBACK instead.
-- COMMIT;
