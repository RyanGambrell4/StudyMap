-- Per-course upload registry.
-- Stores extracted text from student materials (notes, slides, syllabi, etc.)
-- keyed by course so AI features can cite only what the student uploaded.
--
-- kind: 'material' (default) | 'syllabus'
-- The syllabus kind is distinguished so re-upload diffing and coach prompts
-- can treat it differently from general study materials.

create table if not exists course_uploads (
  id            uuid        default gen_random_uuid() primary key,
  user_id       uuid        references auth.users not null,
  course_id     text        not null,
  filename      text        not null,
  file_type     text        not null,
  kind          text        not null default 'material',
  char_count    integer     not null default 0,
  extracted_text text,
  status        text        not null default 'processed',
  error_message text,
  uploaded_at   timestamptz default now() not null
);

create index if not exists course_uploads_user_course
  on course_uploads (user_id, course_id);

alter table course_uploads enable row level security;

create policy "users own their uploads"
  on course_uploads for all
  using (auth.uid() = user_id);
