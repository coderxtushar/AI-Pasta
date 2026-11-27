---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/app/app/page.tsx"]
---

# Surface brief: landing (/) and workspace (/app)

## Scope and mode

- `/` landing page: **Persuade**. A visiting developer should understand the offer in one
  viewport and start comparing with no signup.
- `/app` workspace, plus history, saved comparison, leaderboard and batch: **Operate**.
  They inherit the same world with Operate restraint.

## Audience, job, action, proof

- Developers choosing a model for their app, mid-decision, with a real prompt in hand.
- Primary action: **Start comparing**, no signup (opens `/app`); sign-in is offered later
  for history, sharing, saved keys and the leaderboard.
- Proof: an animated replay of a comparison streaming side by side with metrics. It ships
  with an illustrative run labelled as such until the owner records a real run with
  `npm run demo:capture`. No users, testimonials, logos or benchmarks exist; none are shown.
- Avoid: pasta/food gimmicks; playful or cartoonish tone.

## Direction contract

THESIS: The category standard, executed at Raycast's craft: a near-black dev-tool page whose
hero is the product itself, a framed window where six models answer one prompt live. It
refuses spectacle in place of proof: no abstract hero art, no logo wall, no invented stats.

OWN-WORLD: Near-black ground with faint cool-grey surfaces stepping up in luminance, 1px
white-alpha borders, one warm accent used sparingly for the live/primary signal, a calm
categorical colour per model, Geist Sans and Geist Mono (mono only for metrics and code),
keycap chips for shortcuts, soft offset shadows under raised windows, light theme available.

STORY: Visitors see the six-panel window answering at once, read that keys stay theirs and
nothing is marked up, see blind votes, metrics and batch evals in real UI fragments, and
start comparing without an account.

FIRST VIEWPORT: Top bar (wordmark left; Compare, Batch, GitHub; Sign in and a light Start
comparing button right). Centred: headline at about 64px, one-line subhead, primary Start
comparing button with a ⌘K/Enter-style keycap hint and a secondary View on GitHub. Below,
filling the remaining height: a framed app window (title bar, prompt row, 3×2 panels)
replaying the comparison with streaming text and metric chips; its label says replay.

FORM: Category standard (canon), chosen by the user over the rolled Figure Plate; quality
bar Raycast. seed:fa9a9953cb64ca4a

SIGNATURE INTERACTION: the replay window streams all panels at once on first view (once,
reduced-motion shows the finished state), and its Try this prompt control opens /app with
the prompt filled in. In the app, ⌘K opens a command palette for every action.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Real recorded demo run (owner to capture with their keys).
- Logo/wordmark beyond set type.
