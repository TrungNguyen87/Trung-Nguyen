# From game to classroom platform — development plan & roadmap

**Status:** proposal, for discussion with the teacher before anything is built
**Version:** draft 1 · September 2026
**Scope:** turning the current single-player maths games into a platform a
teacher can run a class on — pupil accounts, session logging, development
tracking, and teacher-made exams.

---

## 1. One honest concern before the plan

The current app is a Streamlit app: every click sends a message to the
server, the whole script re-runs, and the result is streamed back. That is
excellent for a single child on one laptop, and it is why the app got this
good this fast. It is *not* what you want under thirty children tapping
buttons at once in the same classroom: one Python process per connected
pupil, all the state in server memory, and no concept of accounts.

That is not a reason to stop or to rewrite now. It is a reason to make the
re-platform decision **deliberately, once, with pilot data in hand**, rather
than by accident when a lesson falls over. So this plan:

- keeps Streamlit through the pilot, because it gets a real classroom in
  front of a real teacher in weeks rather than months;
- puts everything that matters — the question generators, the learning
  objectives, the mastery model, the database — in plain Python and SQL,
  behind interfaces that do not care what draws the screen;
- schedules an explicit **go / re-platform decision** at Checkpoint 5, with
  the load test that informs it as a named deliverable.

Roughly 70% of the work below is the part that survives a re-platform. The
UI is the cheap half.

---

## 2. What we are building, in one paragraph

A teacher opens a link, creates a class by pasting a list of first names,
and gets a class code. Children go to the same link on a Chromebook or
tablet, type the code, tap their name, and play. Everything they answer is
recorded against a learning objective. The teacher sees, live, who is stuck
and on what; and afterwards, per child, which objectives are secure, which
are shaky, and what to do next. When the teacher wants to test rather than
practise, they pick a few objectives, and the platform generates an exam —
a different but equivalent paper per child — marks it automatically, and
reports per-objective results.

---

## 3. The four capabilities, and what each really requires

### 3.1 Multiple pupil accounts, used in class

The hard part is not accounts, it is **accounts children can actually use**.
Nine-year-olds cannot manage passwords, and a lesson dies if six of them are
locked out.

| Decision | Recommendation | Why |
|---|---|---|
| How a pupil signs in | Class code → tap your name → 4-digit PIN or a picture password | No email, no typing a username, no password resets mid-lesson |
| Who creates pupils | Teacher, by pasting a list of names | The teacher already has that list; anything more is a barrier |
| What identifies a pupil in the data | An internal id; the display name is just a label | Lets us pseudonymise exports and rename without breaking history |
| Wrong-name taps | Teacher can reassign a session's data to another pupil | It *will* happen, and it must be a two-click fix, not a support ticket |
| Devices | Shared devices assumed; log out at end of session, and auto-log-out after inactivity | A Chromebook trolley is the norm |

### 3.2 Logging and analysing development

We already log every answered question. The missing piece is that a log line
currently says *which game* was played, not *what was being learned*.

**The central piece of work in this whole plan is the learning-objective
map**: every question type in every game, tagged with the objective it
practises, aligned to the Dutch *referentieniveaus* (1F / 1S) and the SLO
domains (getallen, verhoudingen, meten & meetkunde, verbanden).

Once that map exists, everything else follows almost for free:

- a per-child, per-objective mastery estimate;
- "what should this child do next" recommendations;
- exams defined in terms of objectives instead of game names;
- a class heatmap that says *what to reteach on Monday*, not *who played
  the pizza game*.

**Two axes, not one.** The arithmetic games measure whether a child *can*
do something. The speed games added in the last release (Bliksemronde,
Getallenjacht) measure whether they can do it *without thinking* — response
time per question is already recorded. Accuracy and fluency are genuinely
different things, and a child who is accurate but slow needs different work
from one who is fast but sloppy. Very few classroom tools show a teacher
both. This one can.

**Explainable beats clever.** For v1, mastery is a recency-weighted accuracy
at the highest level attempted, with the sample size shown next to it.
No item-response theory, no hidden Elo. If the teacher cannot see *why* the
system says a child is shaky on fractions, they will not trust it — and a
recommendation nobody trusts is worse than no recommendation, because it
costs attention.

### 3.3 Exams the teacher creates

Not a form builder — a teacher without software skills will not build
question banks. Instead:

1. Pick objectives (checkboxes, in Dutch, phrased the way the curriculum
   phrases them).
2. Pick how many questions and how hard.
3. The platform generates a draft from the same generators the games use.
4. The teacher previews, swaps any individual question they dislike, and
   saves it as a reusable template.
5. Assign to the class or to individuals, with an open/close window.

Two things fall out of generating rather than authoring:

- **Auto-marking is free.** Every question already knows its own answer.
- **Every child can get a different but equivalent paper.** Same objectives,
  same difficulty, different numbers. Copying stops being a problem, and the
  same exam can be re-sat without being memorised.

Output: per-child score, per-objective breakdown, class heatmap, and a
printable PDF — Dutch primary teachers still print, and an exam that cannot
be printed will not be used.

### 3.4 Results improving the playing experience

The adaptive levelling already in the app works within a session and resets
its reasoning every time. With persistent per-objective mastery it becomes:

- start each child where they actually left off, per objective, not per game;
- resurface an objective that was mastered three weeks ago and is going stale
  (spaced repetition, at the objective level);
- when a child is stuck, drop to the objective *underneath* the one they are
  failing rather than merely making the same question easier;
- let the teacher pin a focus ("this week, everyone works on fractions")
  that biases what the games serve up without removing the child's choice.

---

## 4. Roadmap

Seven phases, each ending in a checkpoint. Estimates assume roughly one
part-time developer working with AI assistance — the calendar allows for
Dutch school holidays and for the teacher having a day job.

### Phase 0 — Discovery and co-design *(2 weeks, no code)*

Sit with the teacher and watch a maths lesson. Understand what actually
happens: how long a group works, what the teacher does while they work, what
they currently write down about progress, and what they already have to use
(a method like Wereld in Getallen or Pluspunt, a school system like ParnasSys
or Magister).

**Deliverables**
- A one-page description of the lesson the platform has to fit into.
- The learning-objective map, drafted with the teacher and checked against
  the method the school actually uses.
- A written answer to the privacy questions in §6 — before any pupil data
  exists, not after.
- A prioritised list of what the teacher wants, in the teacher's words.

> **Checkpoint 1 — kick-off brainstorm.** Teacher + developer, 2 hours.
> Walk through this document. Cut anything the teacher doesn't care about;
> the plan should get *shorter* here, not longer. Decide the pilot class and
> the pilot date. **Decision: what is in the pilot, and what is explicitly
> not.**

### Phase 1 — Foundations *(3–4 weeks)*

The unglamorous phase everything else stands on.

- Replace the CSV/JSON files with a real database (SQLite for the pilot;
  the schema is written so Postgres is a config change).
- Data model: school → class → pupil; game session; attempt; objective;
  mastery.
- Backfill the objective tag onto every existing question type.
- Teacher account and login; pupil accounts via class code + name + PIN.
- Class management: create a class, paste names, print the class code sheet.

**Deliverables:** a teacher can create a class and five children can log in
on five devices and play, with everything recorded against objectives.

> **Checkpoint 2 — dry run.** Teacher + developer + 4–5 children (a lunch
> group, not a lesson), 1 hour. Watch them log in. Do not help. Count how
> many need help anyway. **Decision: is the login flow good enough to face a
> full class?** If more than one child in five needs help, we fix it before
> Phase 2 — this is the single most common way classroom tools fail.

### Phase 2 — Classroom mode *(3 weeks)*

- Teacher's live view: who is online, what they are playing, current
  accuracy, who has been stuck on the same thing for five minutes.
- Start/stop a class session; project a class goal on the board.
- Assign a game/level/objective to the class or to a group.
- Per-pupil quick actions: nudge, change level, reassign a misclick.

**Deliverables:** the teacher can run a 30-minute lesson from one screen.

> **Checkpoint 3 — first real lesson.** One class, one lesson, developer
> present and silent. Debrief the same day while it is fresh.
> **Decision: continue as planned, or fix classroom mode first?**

### Phase 3 — Development tracking *(4 weeks)*

- Mastery model per pupil × objective, with sample size and recency shown.
- Pupil card: secure / shaky / not yet started, per objective; accuracy *and*
  fluency; trend over time.
- Class heatmap: objectives down, pupils across — the "what do I reteach"
  view.
- Suggested next steps per pupil: two to consolidate, one to stretch, each
  linked to the game and level that trains it.
- Export: CSV and a printable per-pupil PDF for parent evenings.

**Deliverables:** the teacher can answer "how is Sofie doing with fractions,
and what should she do next?" in under ten seconds.

> **Checkpoint 4 — does the teacher believe it?** Teacher + developer,
> 2 hours. Pull up six pupils the teacher knows well and compare the
> platform's picture with the teacher's own. Where they disagree, work out
> which one is wrong. **Decision: is the mastery model trustworthy enough to
> show to parents?** This is the checkpoint most likely to send us back to
> the drawing board, and that is fine — better here than at a parent evening.

### Phase 4 — Exams *(4 weeks)*

- Exam builder as described in §3.3.
- Assign, sit, auto-mark, review, override.
- Per-objective results; class overview; printable PDF paper and answer key.
- "Practise what you got wrong" hand-off back into the games.

**Deliverables:** the teacher builds and marks a real end-of-block test.

> **Checkpoint 5 — the usability gate.** The teacher builds an exam alone,
> unaided, while the developer watches without speaking. Every hesitation is
> a bug. Fix them all before moving on.
> **Also at this checkpoint: the re-platform decision.** Bring the load test
> (30 concurrent pupils on the target hardware), the hosting cost, and the
> pilot's crash log. **Decision: stay on Streamlit, or budget a rebuild of
> the pupil-facing app on a normal web stack while the Python core stays
> put?**

### Phase 5 — Personalisation loop *(3 weeks)*

- Cross-session adaptive difficulty, per objective.
- Spaced resurfacing of stale objectives.
- Teacher-set class focus.
- Pupil-facing progress: a child sees their own objectives filling up.

> **Checkpoint 6 — pilot review.** Teacher, developer, and — if the school
> is willing — one other teacher and the school lead. Six to eight weeks of
> real data on the table. **Decision: does this go to more classes, and what
> would have to be true for that?**

### Phase 6 — Hardening and widening *(ongoing)*

Multi-class and multi-teacher, backups and restore, accessibility pass,
performance work, and whatever Checkpoint 6 decided. Nothing here should be
a surprise; if it is, an earlier phase skipped something.

### Calendar sketch

| | Phase | Checkpoint |
|---|---|---|
| Sep 2026 | 0 — discovery | C1 kick-off brainstorm |
| Oct 2026 | 1 — foundations | C2 dry run |
| Nov 2026 | 2 — classroom mode | C3 first real lesson |
| Nov–Dec 2026 | 3 — development tracking | C4 does the teacher believe it |
| Jan 2027 | 4 — exams | C5 usability gate + re-platform decision |
| Feb 2027 | 5 — personalisation | C6 pilot review |
| Mar 2027 → | 6 — hardening and widening | |

Deliberately: the first real lesson lands well before the Christmas break,
and the pilot review lands in time to decide about the *next* school year.

---

## 5. Design rules for a teacher who does not write software

These are constraints on every screen, not aspirations.

1. **Nothing to install.** A link and a class code. No app store, no plugin.
2. **Nothing to configure before first use.** A class is created by pasting
   names. Every other setting has a working default.
3. **Three clicks from login to a class playing.** Count them on every
   release.
4. **One question per screen.** "Who is stuck?" and "how is Sofie doing?"
   are different screens.
5. **Dutch first**, in the words the curriculum uses. English is the
   secondary language, as it already is in the app.
6. **Everything prints.** Class code sheets, pupil reports, exam papers,
   answer keys.
7. **Undo everywhere; confirm anything destructive.** Deleting a pupil must
   be recoverable for 30 days.
8. **The teacher's phone works.** Not beautifully — but the live class view
   must be usable while walking around the room.
9. **No jargon on screen.** Not "mastery coefficient". "Secure", "needs
   practice", "not started yet".
10. **It has to survive being ignored.** If nobody opens the dashboard for
    three weeks, it must still make sense when they come back.

---

## 6. Privacy — settle this in Phase 0, not later

This is personal data about identifiable children in a Dutch school. Under
the AVG (GDPR) that is a special-care category, and Dutch schools have a
specific framework for it. Getting this wrong does not produce a bug; it
produces a school that is not allowed to use the platform.

**Questions to answer in Phase 0, in writing:**

- Who is the *verwerkingsverantwoordelijke* (controller)? Almost certainly
  the school board, not us. We are the processor.
- Is a **verwerkersovereenkomst** (data processing agreement) required?
  Almost certainly yes, and the school will likely want the standard model
  from the Dutch *Privacyconvenant Onderwijs*.
- Is a **DPIA** required before the pilot? Ask the school's privacy officer.
- Where does the data live? Recommendation: **EU hosting, no exceptions.**
- What is the retention period, and who deletes at the end of the year?
- What may a parent see, and how do they ask for it or ask for erasure?
- What happens to the data if this project stops?

**Build rules that follow from this:**

- Collect first names only. No surnames, no dates of birth, no email
  addresses for pupils.
- Pupil records are keyed by an internal id; every export is pseudonymised
  by default, with the name mapping a separate deliberate action.
- No third-party analytics, no ad tech, no external fonts or CDNs on
  pupil-facing pages.
- Encrypted backups, EU-hosted, with a tested restore.
- A visible, plain-Dutch page saying what is stored and why — one a parent
  can read.

**Do not start Phase 1 until §6 has written answers.** Retrofitting privacy
onto a schema that already holds children's data is far more expensive than
getting the schema right the first time.

---

## 7. What we keep from the app as it stands

The current codebase is a bigger head start than it looks:

| Asset | Status | In the platform |
|---|---|---|
| 12 games, 6 levels each | Working, tested | The content library, unchanged |
| Question generators with known answers | Working | Also the exam generator — this is the piece that makes auto-marking free |
| Adaptive levelling | Per-session | Becomes per-objective and persistent |
| NL/EN translation, 459 keys | Complete and parity-tested | Extends to the teacher UI |
| SVG visual + animation library | Working, no dependencies | Unchanged; also used in printed exams |
| Session logging | CSV → needs a database | Schema and objective tag added |
| Parent dashboard | Single-child | Grows into the teacher dashboard |
| `tests/test_app.py` | 23 tests | The base of the regression suite |

The main *new* build is: accounts, the database, the objective map, the
mastery model, the teacher UI, and the exam flow.

---

## 8. Risks, honestly

| Risk | Likelihood | What we do about it |
|---|---|---|
| Streamlit does not hold 30 concurrent pupils | **High** | Load test in Phase 2, not Phase 6; re-platform decision at C5 with real numbers |
| Privacy approval blocks the pilot | Medium | §6 answered in Phase 0, before any code |
| The teacher does not have time | **High** | Checkpoints are short and scheduled in advance; the platform must be useful even if unattended for weeks |
| Mastery model disagrees with the teacher's judgement | Medium | C4 exists precisely to catch this; the model is explainable so disagreements are debuggable |
| School devices are old / the wi-fi is bad | Medium | Test on the school's actual hardware in Phase 1; keep pages light; degrade gracefully offline |
| We build features nobody asked for | Medium | Every phase ends with a cut, not just an add |
| One teacher's needs ≠ every teacher's needs | Medium | C6 brings in a second teacher before widening |

---

## 9. How we will know it worked

Pilot success is not "the software runs".

- The teacher uses it **unprompted** in at least 8 of 10 maths lessons.
- Fewer than 1 child in 20 needs help logging in, by the third lesson.
- The teacher can name at least one teaching decision they made *because of*
  something the dashboard showed them.
- At least one exam is built, sat, and marked without developer involvement.
- The teacher would be uncomfortable going back to not having it.

The last one is the real test. The others are how we get there.

---

## 10. For the first brainstorm (Checkpoint 1)

Open questions, in rough order of how much they change the plan:

1. Which method does the school use, and should objectives be mapped to it
   directly rather than only to the referentieniveaus?
2. Practice tool, assessment tool, or both? If we could only build one this
   school year, which?
3. Do children play at home too, or only in class? (Changes the login model
   and the privacy answer significantly.)
4. What does the school already have — is there an existing system whose
   data we should read, or write back to?
5. What does the teacher currently record about progress by hand? Can the
   platform replace that, exactly, rather than adding a parallel thing?
6. How many children, how many devices, what kind, and how good is the wi-fi?
7. Should parents see anything at all? (Big scope and privacy implications.)
8. What would make the teacher *stop* using it? Ask directly — the answer is
   usually specific and usually fixable.

---

*This is a proposal, not a commitment. The point of Checkpoint 1 is to cut
it down to what the teacher actually wants.*
