# Practice Exam — Full Redesign Spec

## Vision

Like a professor handing out a practice exam before exam day. Students use it to simulate the real thing, surface where they stand, and identify gaps before it counts. It is not a flashcard drill or a quiz — it is a full exam simulation with a timer, a submit button, and a score.

---

## Information Architecture

```
Strategy → Practice Exams
  ├── Landing Page          (intro + CTA)
  ├── Setup Page            (course picker → input → config → generate)
  ├── Exam Screen           (full-screen simulator, existing)
  └── Results Screen        (score + breakdown + weak topics + time stats)
```

---

## 1. Landing Page (`activeSection === 'practice'`)

### Visual Treatment
- White background (`#FFFFFF`), more whitespace than surrounding app sections
- Subtle card shadow to feel slightly elevated from the `#F7F6F3` app background
- Consistent accent color (#3B61C4), Inter font, same design language as rest of app

### Layout
```
┌─────────────────────────────────────────────────┐
│  STRATEGY                                        │
│                                                  │
│  Practice Exams                                  │  ← h1, 28px, 800 weight
│  Simulate your real exam. See where you stand   │  ← subtitle, 14px muted
│  before it counts.                               │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │  📋  What it does (3 small callouts):    │   │  ← optional feature strip
│  │  Verbatim questions · AI fill · Timer    │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  [ Start Practice Exam → ]                       │  ← primary CTA button
│                                                  │
└─────────────────────────────────────────────────┘
```

### Tone
Academic, serious, direct:
- Headline: **"Simulate your real exam."**
- Subheadline: **"Upload notes, describe your exam, or paste a past test. We build a realistic look-alike — verbatim questions from your materials first, AI fills the rest."**
- CTA: **"Start Practice Exam →"**

### Empty State (no courses added)
```
┌───────────────────────────────────────┐
│  📚  No courses set up yet            │
│  Add a course to generate a           │
│  practice exam for it.                │
│                                       │
│  [ Go to Courses → ]                  │
└───────────────────────────────────────┘
```

### Paywall (free users who have already used their 1 exam)
- Free plan: **1 practice exam total**
- Show a banner on landing page if quota is exhausted: "You've used your free practice exam. Upgrade for unlimited."
- CTA still visible but triggers paywall on click

---

## 2. Setup Page

Navigated to when the user clicks "Start Practice Exam." Replaces the current `PracticeExamModal`.

### Navigation
- **Back arrow top-left** → returns to Practice Exams landing page
- Label: `← Practice Exams`
- No breadcrumb needed; back arrow is sufficient

### Layout — Structured Form

```
← Practice Exams

  Set up your exam
  ─────────────────────────────────────────

  Step 1: Choose a course
  [ Dropdown — picks from user's courses ]

  ─────────────────────────────────────────

  Step 2: Add your source material
  ┌──────────┬──────────┬──────────────┐
  │  Upload  │  Paste   │  Describe    │
  └──────────┴──────────┴──────────────┘

  [Tab content — see below]

  ─────────────────────────────────────────

  Step 3: How long?
  [ 30 ]  [ 45 ]  [ 60 ]  [ Custom: ___ ]

  Step 4: Timer?
  ☐ Time this exam   → auto-suggest based on length
    Suggested: X min  [ Accept ] [ Change: ___ min ]

  ─────────────────────────────────────────

  [ Generate Exam → ]   ← disabled until course + source provided
```

### Course Picker
- Dropdown showing all the user's courses (name + color dot)
- Selecting a course triggers a contextual display: "Using your grades, coach plan, and exam history for this course to personalize questions"
- If no courses: show inline message with link to courses section (don't navigate away)

### Source Material Tabs

**Upload tab**
- Drag-and-drop zone: PDF, DOCX, PPTX, TXT
- On drop: extract text, show character count + filename + ✓
- Replace button to swap file

**Paste tab**
- Large textarea, min-height 180px
- Placeholder: `Paste your notes, past exam questions, or slide content here…`

**Describe tab**
- Single open-ended textarea
- Placeholder:
  ```
  Describe your exam and make sure to include the topics it covers.

  e.g. "50 multiple choice exam on chapters 4–7. Topics include:
  cell division, protein synthesis, and enzyme kinetics. Prof
  usually focuses on diagram interpretation and definitions."
  ```
- No structured sub-fields — freeform but the placeholder strongly guides topic inclusion

### When Both Upload AND Describe are provided
- Equal weight — both are passed to the API as source material
- Prompt treats them as parallel inputs: "Here is the uploaded source AND the student's description of their exam"

### Exam Length
- Pill buttons: **30** | **45** | **60** | **Custom**
- Custom: number input, min 5, max 100
- Default: 30 selected

### Timer
- Checkbox: "Time this exam"
- When checked: auto-calculate suggested time at **1.5 min per question**
  - e.g. 30 questions → "Suggested: 45 min"
  - Show: `Suggested 45 min  [ Use this ]  [ Change: ___ min ]`
- Can override manually

### Personalization Context (passed to API)
Client collects and sends all of the following alongside the source material:

```js
{
  text: string,              // uploaded/pasted source
  description: string,       // described source (equal weight with text)
  courseName: string,
  courseId: string,
  examLength: number,
  context: string,           // free-form context field (legacy)
  personalization: {
    syllabus: string[],      // course topics/assignments from stored plan
    weakAreas: string[],     // topics with low grades or past missed exam questions
    gradeTarget: number,     // their target grade for this course
    coachPlanSummary: string,// what study coach identified as priorities
    pastExamScores: number[] // chronological scores from past practice exams
  }
}
```

### Generate Button
- Disabled until: course selected + at least one source tab has ≥50 chars
- Label: `Generate ${length}-question Exam`
- On click: check paywall first, then call API
- Loading states:
  1. "Extracting questions from your materials…"
  2. "Generating additional questions…"
  3. "Personalizing based on your course data…"

---

## 3. Exam Screen (existing, minor update)

- Full-screen takeover (existing behavior — keep as-is)
- Timer auto-populated from setup page
- Track `startTime` per question to enable time-per-question stats in results
  - Store array of `{ questionId, timeMs }` alongside answers on submit

---

## 4. Results Screen (existing + additions)

### Keep existing
- Score % (MC only)
- Self-grade note for short answer
- Weak topics summary
- Per-question breakdown with: your answer, correct answer, explanation

### Add: Time per question stats
- After the score card, add a "Time breakdown" row showing:
  - Total time taken
  - Average time per question
  - Slowest 3 questions highlighted (slowest = proxy for uncertainty)
  - Format: `Q7 · Protein Synthesis — 3m 12s`

### Navigation after results
- **"Back to Practice Exams"** button → returns to landing page
- **"Retake"** button → restarts with same questions, resets answers and timer
- Exam history NOT shown on landing page — only accessible here via Retake or reviewing a past exam from results

---

## 5. Backend API Changes (`/api/generate-practice-exam`)

### New request shape
```js
{
  text: string,             // source material (upload or paste)
  description: string,      // described source — equal weight with text
  courseName: string,
  examLength: number,
  context: string,          // legacy, keep for compatibility
  personalization: {
    syllabus: string[],
    weakAreas: string[],
    gradeTarget: number,
    coachPlanSummary: string,
    pastExamScores: number[]
  }
}
```

### Prompt changes
1. Merge `text` and `description` as equal-weight source:
   ```
   Source material:
   """
   {text}
   """

   Student's description of their exam:
   """
   {description}
   """
   ```
2. Inject personalization context before question generation:
   ```
   Personalization context for this student:
   - Course: {courseName}
   - Syllabus topics: {syllabus}
   - Weak areas from past performance: {weakAreas}
   - Grade target: {gradeTarget}%
   - Study coach priorities this week: {coachPlanSummary}
   - Past practice exam scores: {pastExamScores}

   Use this to skew questions toward weak areas and ensure the exam
   aligns with the student's actual course content.
   ```
3. All existing output format rules stay the same (verbatim first, sourceType field, etc.)

---

## 6. Paywall / Quota

- Free plan: **1 practice exam total** (not per month — total)
- Quota check happens at the **Generate button** on setup page
- After generating 1 exam, free user sees landing page banner: "You've used your free practice exam. Upgrade for unlimited."
- Paywall trigger: `onShowPaywall('practice_exam')`

---

## 7. Mobile Responsiveness

- Setup page: single column, full-width inputs, larger tap targets (min 44px)
- Course picker: native `<select>` on mobile or bottom-sheet style
- Pill buttons (length): 2x2 grid on small screens if 4 options don't fit in a row
- Timer suggestion: full-width layout on mobile
- Exam screen: already full-screen, keep as-is
- Results: already scrollable, keep as-is

---

## 8. State Management

```
Practice Exam flow lives inside OutputView.jsx as activeSection === 'practice'

practiceExamSubview: 'landing' | 'setup' | 'taking' | 'results'

State managed locally in PracticeExamView:
  - subview (replaces examPhase 'configure' with 'setup')
  - examCourse, examQuestions, examAnswers, examTimeMs, examTimerMinutes
  - questionTimings: { [questionId]: timeMs }[]  ← NEW
  - refreshKey (for history invalidation after save)
```

---

## 9. Files to Create / Modify

| File | Change |
|------|--------|
| `src/components/PracticeExamView.jsx` | Full rewrite — landing page + subview routing |
| `src/components/PracticeExamSetup.jsx` | New — replaces PracticeExamModal, full-page setup form |
| `src/components/PracticeExamScreen.jsx` | Add per-question timing (startTime on question change) |
| `src/components/PracticeExamResults.jsx` | Add time-per-question breakdown section |
| `api/generate-practice-exam.js` | Extend prompt to use personalization + description |

---

## 10. Out of Scope (this sprint)

- Saving exam history to Supabase (currently localStorage/cache only — keep)
- Sharing results
- AI-generated study plan based on results (future: connect to Study Coach)
- Question-level difficulty rating
