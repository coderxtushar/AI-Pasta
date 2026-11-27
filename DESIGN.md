---
name: AI Pasta
description: Compare AI models side by side, with latency, tokens and cost beside every answer.
colors:
  ground: "oklch(0.13 0.004 260)"
  surface: "oklch(0.165 0.005 260)"
  surface-raised: "oklch(0.195 0.006 260)"
  surface-subtle: "oklch(0.15 0.004 260)"
  popover: "oklch(0.2 0.006 260)"
  muted: "oklch(0.2 0.005 260)"
  accent-tint: "oklch(0.24 0.006 260)"
  ink: "oklch(0.94 0.003 260)"
  ink-muted: "oklch(0.7 0.01 260)"
  hairline: "oklch(1 0 0 / 8%)"
  field-line: "oklch(1 0 0 / 12%)"
  primary: "oklch(0.94 0.003 260)"
  on-primary: "oklch(0.15 0.004 260)"
  signal-tangerine: "oklch(0.74 0.16 50)"
  success: "oklch(0.78 0.15 155)"
  warning: "oklch(0.82 0.13 80)"
  danger: "oklch(0.7 0.17 22)"
  model-1: "oklch(0.72 0.13 255)"
  model-2: "oklch(0.78 0.13 60)"
  model-3: "oklch(0.78 0.11 170)"
  model-4: "oklch(0.72 0.15 10)"
  model-5: "oklch(0.72 0.13 295)"
  model-6: "oklch(0.85 0.12 95)"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.65
  answer:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  metric:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.75
    fontFeature: "tnum"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  window: "16px"
  pill: "9999px"
spacing:
  gutter-mobile: "16px"
  gutter: "24px"
  card-padding: "14px"
  section: "56px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.accent-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-ghost:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
    height: "32px"
  model-chip:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "32px"
  model-chip-selected:
    backgroundColor: "{colors.accent-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
  answer-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "{spacing.card-padding}"
  input:
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
  keycap:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.sm}"
    height: "20px"
---

# Design System: AI Pasta

## Overview

**Creative North Star: "Lights Down, Numbers Up"**

AI Pasta is a dark, low-glare developer tool where the only loud things are the answers
and their numbers. Surfaces are near-black and cool, stepping up in brightness as they
come forward. Borders are single translucent hairlines. Colour does work: one steady hue
per model, green, amber and red for status, and one warm tangerine signal for anything
live. The look is deliberately the category standard (the dark developer-tool page)
executed at Raycast's level of craft: conventions taken straight, with no ironic or
quirky twist.

Density is comfortable rather than cramped. Comparing six answers side by side is the
core experience, so the workspace gives columns the width and height, and keeps chrome
in a single composer card above them. Every answer carries its time to first token,
total time, tokens and cost in a mono line beneath it.

A light theme exists with matching tokens (see the sidecar's `colorMeta.lightValue`).
Dark is the default.

**Key Characteristics:**
- Near-black cool ground, three surface steps, 1px white-alpha hairlines
- Light-on-dark primary buttons; keyboard hints as keycaps
- One colour per model, the same on every surface
- Metrics in Geist Mono with tabular figures, beside every answer
- One warm accent, reserved for live and attention signals
- Motion that eases out (expo) from a visible end state: one authored entrance, the rest feedback

## Colors

A cool, nearly neutral grey ramp (hue ~260) carries the whole interface; colour appears
only where it means something.

### Primary
- **Inverted Ink** (`primary`): the primary button fill, light on the dark ground (dark
  on the light theme). One primary action per area: Compare, Start comparing, Run batch.

### Secondary
- **Signal Tangerine** (`signal-tangerine`): live and attention signals only. The
  streaming status and caret, focus rings, text selection, the "Add API keys" prompt
  when no key exists, and the tinted callouts (blind vote, key migration).

### Tertiary
- **Model Hues** (`model-1` … `model-6`): one per model, in registry order (GPT-5.4
  Mini, Claude Sonnet 5.5, Gemini Flash, DeepSeek Chat, GPT-OSS 120B, Qwen Plus). They
  appear as dots on chips, cards, tables and leaderboard bars. They are deliberately
  not the providers' brand colours.
- **Status** (`success`, `warning`, `danger`): Done and Fastest/Cheapest badges, notes
  about ignored settings, and errors. Status is always also written as a word.

### Neutral
- **Ground** (`ground`): the page.
- **Surface** (`surface`): cards, the composer, panels.
- **Raised** (`surface-raised`) and **Popover** (`popover`): menus, sheets, the
  command dialog.
- **Subtle** (`surface-subtle`): card footers and code blocks, a step below surface.
- **Ink** (`ink`) for text, and **Muted Ink** (`ink-muted`) for secondary text, metrics
  and placeholders.
- **Hairline** (`hairline`) and **Field Line** (`field-line`): every border and input
  outline.

### Named Rules
**The One Signal Rule.** Tangerine marks only what is live or needs attention. It never
decorates a heading, a background field or a card.

**The Steady Hue Rule.** A model keeps its hue everywhere. When a comparison is blind,
its dot turns grey until the vote, because colour would give the model away.

## Typography

**Display and UI font:** Geist (with ui-sans-serif, system-ui)
**Mono font:** Geist Mono (with ui-monospace)

**Character:** one neutral, engineered grotesque for everything people read; mono only
for code, metrics and keycaps, where alignment and measurement matter.

### Hierarchy
- **Display** (600, 60px desktop / 36px mobile, line-height 1, -0.035em): the landing
  headline only.
- **Headline** (600, 30px, -0.025em): landing section titles.
- **Title** (600, 24px): page titles (History, Leaderboard, Batch run, Comparison).
- **Body** (400, 15px, 1.65): landing copy and descriptions, kept to about 65ch.
- **Answer** (400, 14px, 1.65): model answers rendered as Markdown, with code in Geist
  Mono at 13px.
- **Label** (500, 13px): chips, card titles, form labels.
- **Metric** (Geist Mono, 12px, tabular figures): every latency, token and cost
  readout.

### Named Rules
**The Numbers-Up Rule.** Measurements are always set in Geist Mono with tabular figures
and shown beside the answer they measure. Unknown values print as "—", never as a guess.

## Layout

Pages sit in a centred container: 1440px wide for the workspace, landing hero and
comparison pages, 1100px for reading pages (history, leaderboard, landing sections).
Side gutters are 16px on mobile and 24px from `sm` up.

The workspace stacks one composer card, a status row, then answer columns. Columns sit
side by side at a minimum of 320px and scroll sideways when there are more than fit. On
phones they become a swipeable row with each column 88% wide, snapping one at a time.
Landing sections alternate copy and a framed UI fragment on a two-column grid, with
56px vertical rhythm and hairline dividers between sections. Everything holds at 390px
with no sideways page scroll.

## Elevation & Depth

Depth is mostly tonal: surfaces step up in brightness, and hairlines separate them.
Only framed "windows" are lifted with a shadow.

### Shadow Vocabulary
- **Window** (dark: `0 1px 0 0 oklch(1 0 0 / 6%) inset, 0 30px 60px -20px oklch(0 0 0 / 70%), 0 8px 24px -8px oklch(0 0 0 / 50%)`):
  the composer, the follow-up box, the landing replay window and its feature frames.

### Named Rules
**The Window Rule.** Only an element that behaves like an app window gets a shadow.
Cards, rows and chips stay flat, with hairline borders.

## Shapes

Gently rounded and consistent. Controls are 8px (`md`), answer cards and panels 14px
(`xl`), windows 16px (`window`), and model chips, badges and status pills are fully
round. Borders are always 1px. The landing replay window carries a title bar with three
neutral dots, its one piece of window chrome.

## Components

Crisp and tactile: clear surfaces, confident light primary buttons, visible keyboard
hints.

### Buttons
- **Shape:** gently rounded (8px), 36px tall by default, 32px small.
- **Primary:** Inverted Ink fill with dark text; the one main action in an area.
- **Secondary:** a raised grey tint for Stop, the judge, and "Try this prompt".
- **Ghost:** muted text that lifts to Ink on hover; toolbar actions (Export CSV,
  Compare answers, New comparison). Destructive ghosts stay muted and turn red only on
  hover.
- **Focus:** a 2px tangerine outline with a 2px offset.

### Chips (model selector)
- **Style:** a pill with a model-hue dot and the model name; unselected chips are
  outlined and muted, with the dot at 40%. A "no key" hint appears when a provider has
  no key.
- **State:** selected chips take the accent tint and full ink. The whole chip is the
  checkbox's hit area.

### Cards / Containers (answer card)
- **Corner Style:** 14px.
- **Background:** Surface, with a Subtle footer for metrics.
- **Structure:** a header (dot, name, badges, status word, copy and retry actions), a
  scrolling body (Markdown answer, earlier turns as "You:" bubbles), and a metric
  footer.
- **States:** a skeleton until the first token, then a tangerine caret while streaming,
  a status word in success, danger or muted ink, and anonymous mode hiding everything
  that could identify the model.

### Inputs / Fields
- **Style:** transparent fill, Field Line outline, 8px radius, tangerine caret.
- **Focus:** a tangerine ring. **Errors** are written in danger red beneath, and
  submission is disabled until fixed.

### Navigation
- **Top bar:** sticky, translucent ground with blur, wordmark set in type, then section
  links. The active link takes the accent tint. On the right: GitHub, a theme menu, the
  account menu or sign-in, and "Start comparing" outside the workspace. On phones the
  links move into a left sheet.
- **Command menu:** ⌘K opens every workspace action, model toggles, navigation and theme.

### Replay window (signature)
The landing proof: a framed window replaying six answers at their own timings, with an
honest label ("Illustrative example" or "Replay of a recorded run · date"). Panels use a
compact card variant: code blocks without a header bar and a one-line metric footer.

### Motion
- **Curve:** `cubic-bezier(0.16, 1, 0.3, 1)` (`ease-out-expo`) for arrivals; exits are faster than entrances.
- **Focal moment (landing only):** the hero copy rises out of a blur in a short stagger, then the
  replay window lands from below, tilted back, with one light pass along its top edge. The replay
  starts once it has landed, with a run clock and a tangerine progress line in its title bar.
- **Feedback:** buttons and model chips press (scale 0.98 / 0.97); keycaps sink 1px when their
  shortcut is pressed; the copy icon swaps with a small zoom.
- **State:** a model's dot pings while it streams; answers fade in over the skeleton; status
  words cross-fade; badges and metric footers settle in when an answer finishes; after a blind
  vote each real name resolves out of a blur and its dot fades from grey to the model's hue.
  The composer's top edge carries a progress line for the share of answers finished.
- **Continuity:** the nav highlight slides between sections; answer columns enter in a 50ms
  stagger; sheets and dialogs open on the expo curve.
- **Spotlight:** framed windows on the landing page catch light along their edge under a mouse
  pointer. Feature frames settle in as they scroll into view, where the browser supports it.
- **Reduced motion:** no travel, tilt, blur or loops. Entrances become fades, sheets fade in
  place, and colour and opacity changes stay.

## Do's and Don'ts

### Do:
- **Do** show latency, tokens and cost beside every answer, in Geist Mono with tabular
  figures.
- **Do** keep each model's hue identical on every surface, and grey while blind.
- **Do** reserve tangerine for live and attention signals.
- **Do** label any example data as an example, and any recorded run with its date.
- **Do** give every shortcut you display (⌘K, ⌘↵, ↵) a working binding.
- **Do** keep motion to feedback and state in the workspace; the authored entrance belongs to the landing hero.

### Don't:
- **Don't** use pasta or food imagery, or a playful or cartoonish tone (confirmed by the
  owner).
- **Don't** invent proof: no customer logos, testimonials, usage numbers or benchmarks.
- **Don't** use the AI providers' brand colours for models.
- **Don't** put shadows on flat cards or rows; only windows lift.
- **Don't** use glyph characters in place of icons; use Lucide icons at one stroke.
- **Don't** use bounce or elastic easing, or loop an animation that does not report live state.
