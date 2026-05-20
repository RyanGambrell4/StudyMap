# Nav Restructure Spec
_Derived from interview — 2026-05-20_

---

## Goal
Reduce nav from 5 items to 4, remove Courses from nav entirely, and group related features into hover-reveal flyout hubs. Cleaner nav without losing any features.

---

## Final Nav Structure (4 items)

| Position | Icon | Label | Behavior |
|----------|------|-------|----------|
| 1 | House SVG | _(none)_ | Navigates to Dashboard |
| 2 | Calendar SVG | Schedule | Navigates to CalendarView |
| 3 | Stacked-lines/grid SVG | Strategy | Hover → flyout hub (Coach + Tutor + Grades) |
| 4 | Stacked-lines/grid SVG | Brain Training | Hover → flyout hub (Brain Dump + Quiz Burst + Exam Rescue + Flashcards + Quizzes) |

**Account** stays as avatar button (no change).

---

## Courses — Removed from Nav
- Already lives on Dashboard as a clickable Courses card → takes user to CoursesView (no change to that behavior)
- Add a "My Courses" row to AccountView settings list → same link
- No nav slot needed

---

## Hub: Study (item 3)

### Flyout layout
- **2 large stacked buttons** (primary CTAs):
  1. **Study Coach** — subtitle: "Build your weekly AI plan" → `setActiveSection('coach')`
  2. **Track Grades** — subtitle: "Monitor grades and targets" → `setActiveSection('grades')`
- **Divider line**
- **AI Tutor** — smaller secondary row with chevron → `setActiveSection('tutor')`

### Visual
- Min-width: ~240px
- Sits below the nav item, left-aligned to the nav item
- Each big button: rounded card with left-colored border accent (blue for Coach, green for Grades)

---

## Hub: Practice (item 4)

### Flyout layout
- **3 equal-weight horizontal cards** side by side:
  1. **Brain Dump** — icon + label + 1-line sub ("Clear your head")
  2. **Quiz Burst** — icon + label + 1-line sub ("Fire 5 quick questions")
  3. **Exam Rescue** — icon + label + 1-line sub ("Emergency study plan")
- Each card triggers the corresponding modal (onOpenBrainDump, onOpenQuizBurst, onOpenExamRescue)

### Visual
- Total width: ~360px
- Cards sit side by side with equal padding
- Each card: icon pill on top, label, sub-label

---

## Flyout UX Behavior

### Desktop (hover)
- **Opens**: `onMouseEnter` on the nav item
- **Closes**: `onMouseLeave` on the entire flyout container (nav item + flyout together), with **150ms delay** to allow diagonal cursor movement without accidental close
- **Position**: drops directly below the nav item, slight shadow + border radius
- **Active state**: if currently in a section that belongs to the hub, the nav item stays highlighted

### Mobile (tap)
- Nav mirrors desktop layout but with larger tap targets (44px min height)
- Tapping a hub item opens an **inline flyout sheet** below the nav bar (not a modal)
- Tapping outside or tapping the same item again closes it
- Tapping a sub-item navigates and closes the sheet

---

## Nav Item Visual Hint
- Items with flyouts show a **small stacked-lines/grid icon** to the right of the label
- Items without flyouts (Home, Schedule) show no secondary icon
- Home icon: house SVG, **no text label** (universally understood)

---

## Active State Logic
- If `activeSection === 'dashboard'` → Home item is active
- If `activeSection === 'calendar'` → Schedule item is active
- If `activeSection` is one of `['coach', 'grades', 'tutor']` → Study hub item stays highlighted
- If opening Brain Dump / Quiz Burst / Exam Rescue → Practice hub item stays highlighted

---

## Implementation Checklist

### AppShell.jsx
- [ ] Remove `courses` from NAV_ITEMS
- [ ] Change Dashboard item to house icon, no label
- [ ] Add flyout state: `const [openHub, setOpenHub] = useState(null)` — `'study' | 'practice' | null`
- [ ] Wrap each hub nav item + its flyout in a `div` with `onMouseEnter` / `onMouseLeave` + 150ms close timer
- [ ] Render Study flyout: 2 big buttons + AI Tutor row
- [ ] Render Practice flyout: 3 horizontal cards
- [ ] Add stacked-lines icon hint to Study and Practice nav items
- [ ] Active state: hub item highlighted when any of its sections is active
- [ ] Mobile: replace hover with tap toggle on hub items

### AccountView.jsx
- [ ] Add "My Courses" row to the Settings section (same `onEditPlan` callback pattern but navigates to courses)
- [ ] Need `onNavigateToCourses` prop passed from OutputView

### OutputView.jsx
- [ ] Pass `onNavigateToCourses={() => setActiveSection('courses')}` to AccountView
- [ ] Pass hub action callbacks to AppShell: `onOpenBrainDump`, `onOpenQuizBurst`, `onOpenExamRescue`

### Dashboard
- No changes needed — Courses card already links to CoursesView

---

## What Is NOT Changing
- ProgressView — stays accessible via Account → "Full analytics →"
- StudyToolsView — still reachable via Study Tools in tools section if referenced
- All modal overlays (Brain Dump, Quiz Burst, Exam Rescue) — behavior unchanged
- Mobile bottom bar keeps 4 items: Home, Schedule, Study hub, Practice hub
