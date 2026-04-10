# Visual Environment Map

This document catalogs the live environmental and atmospheric UI layers in Magnum Opus.

The goal is to separate:

1. The true environment/background layer
2. App chrome and shell surfaces
3. View-specific panel systems
4. One-off local cards that bypass shared styling

## Render Stack

From back to front, the live app currently renders in this order:

| Layer                     | Purpose                                                                                | Source                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `MagnumBackground` canvas | Sky, time-of-day, weather, stars, sun, moon, fog, rain, snow, lightning                | [src/components/MagnumBackground.tsx](/Users/scottfoster/novawrite-work/src/components/MagnumBackground.tsx) |
| App shell                 | Root stacking context for the whole product UI                                         | [src/App.tsx](/Users/scottfoster/novawrite-work/src/App.tsx#L391)                                            |
| Top nav                   | Header bar and project pill                                                            | [src/App.tsx](/Users/scottfoster/novawrite-work/src/App.tsx#L394)                                            |
| Main view shell           | The active screen: projects, editor, autonomous, story bible, style, metrics, settings | [src/App.tsx](/Users/scottfoster/novawrite-work/src/App.tsx#L476)                                            |

## Environment Layer Map

### 1. Global Atmospheric Background

| Item                 | What It Paints                                       | Primary Controls                                                                                                  | Notes                                                  |
| -------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `MagnumBackground`   | Full-screen animated canvas                          | `draw()`, `sample()`, weather decode, orbital positions                                                           | This is the real environment layer, not a card layer.  |
| Sky gradient         | Base top-to-bottom sky color                         | [src/components/MagnumBackground.tsx](/Users/scottfoster/novawrite-work/src/components/MagnumBackground.tsx#L338) | Driven by `KEYS` time-of-day palette.                  |
| Celestial glow       | Sun, moon, stars                                     | [src/components/MagnumBackground.tsx](/Users/scottfoster/novawrite-work/src/components/MagnumBackground.tsx#L347) | Visibility is dimmed by cloud cover.                   |
| Atmospheric overlays | Horizon glow, cloud veil, fog, rain, snow, lightning | [src/components/MagnumBackground.tsx](/Users/scottfoster/novawrite-work/src/components/MagnumBackground.tsx#L420) | These are visual weather systems, not UI panels.       |
| Mount point          | Fixed full-screen canvas behind the app              | [src/components/MagnumBackground.tsx](/Users/scottfoster/novawrite-work/src/components/MagnumBackground.tsx#L585) | `position: fixed`, `pointerEvents: none`, `zIndex: 1`. |

Adjustment rule:
If the user wants the environment itself changed, this is the file. If the user wants cards to feel more transparent against that environment, this is not the file to start with.

### 2. App Chrome

| Item           | What It Paints                                                     | Source                                                                                                                                  | Control Type            |
| -------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Root app shell | Main stacking context                                              | [src/App.tsx](/Users/scottfoster/novawrite-work/src/App.tsx#L391)                                                                       | Structural only         |
| Header bar     | White rounded nav bar                                              | [src/App.tsx](/Users/scottfoster/novawrite-work/src/App.tsx#L395)                                                                       | Direct Tailwind classes |
| Project pill   | Current project badge                                              | [src/App.tsx](/Users/scottfoster/novawrite-work/src/App.tsx#L461)                                                                       | Direct Tailwind classes |
| Nav buttons    | Project, Editor, Autonomous, Story Bible, Style, Metrics, Settings | [src/App.tsx](/Users/scottfoster/novawrite-work/src/App.tsx#L411) and [src/App.tsx](/Users/scottfoster/novawrite-work/src/App.tsx#L548) | Direct Tailwind classes |

Important:
The live header is not using the old `.glass-panel`, `.glass-panel-strong`, or `.glass-pill` classes in `src/index.css`. Those exist, but the live app chrome is currently controlled directly in `App.tsx`.

### 3. Shared Surface Systems In `src/index.css`

These are the main reusable environmental surface layers for most non-metrics views.

| Selector                 | Purpose                                             | Source                                                                |
| ------------------------ | --------------------------------------------------- | --------------------------------------------------------------------- |
| `.autonomous-shell ...`  | Inputs, selects, focus states for autonomous view   | [src/index.css](/Users/scottfoster/novawrite-work/src/index.css#L235) |
| `.settings-shell ...`    | Inputs, selects, focus states for settings view     | [src/index.css](/Users/scottfoster/novawrite-work/src/index.css#L241) |
| `.editor-sidebar`        | Left chapter rail and right generation rail skin    | [src/index.css](/Users/scottfoster/novawrite-work/src/index.css#L301) |
| `.editor-main`           | Main editor column background                       | [src/index.css](/Users/scottfoster/novawrite-work/src/index.css#L310) |
| `.editor-toolbar`        | Top toolbar, formatting bar, bottom context bar     | [src/index.css](/Users/scottfoster/novawrite-work/src/index.css#L318) |
| `.editor-canvas`         | Scrollable writing area backdrop                    | [src/index.css](/Users/scottfoster/novawrite-work/src/index.css#L324) |
| `.editor-prose`          | The visible writing page surface                    | [src/index.css](/Users/scottfoster/novawrite-work/src/index.css#L336) |
| `.story-bible-shell ...` | Story Bible card, color, border, and form overrides | [src/index.css](/Users/scottfoster/novawrite-work/src/index.css#L398) |

Important:
This stylesheet is the real control surface for Editor, Story Bible, Settings, and much of Autonomous.

### 4. Editor View: Actual Painted Surfaces

The editor is the most layered environment. These are the specific visible blocks.

| Surface                         | JSX Source                                                                                     | CSS Source                                                                                 | What It Is                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Chapter rail                    | [src/components/Editor.tsx](/Users/scottfoster/novawrite-work/src/components/Editor.tsx#L687)  | `.editor-sidebar` in [src/index.css](/Users/scottfoster/novawrite-work/src/index.css#L301) | Left column shell                              |
| Editor column                   | [src/components/Editor.tsx](/Users/scottfoster/novawrite-work/src/components/Editor.tsx#L744)  | `.editor-main` in [src/index.css](/Users/scottfoster/novawrite-work/src/index.css#L310)    | Middle column shell                            |
| Top toolbar                     | [src/components/Editor.tsx](/Users/scottfoster/novawrite-work/src/components/Editor.tsx#L746)  | `.editor-toolbar` in [src/index.css](/Users/scottfoster/novawrite-work/src/index.css#L318) | Chapter title and save/export bar              |
| Formatting toolbar              | [src/components/Editor.tsx](/Users/scottfoster/novawrite-work/src/components/Editor.tsx#L830)  | `.editor-toolbar` in [src/index.css](/Users/scottfoster/novawrite-work/src/index.css#L318) | Buttons row                                    |
| Canvas backdrop                 | [src/components/Editor.tsx](/Users/scottfoster/novawrite-work/src/components/Editor.tsx#L975)  | `.editor-canvas` in [src/index.css](/Users/scottfoster/novawrite-work/src/index.css#L324)  | Area behind the page                           |
| Writing page                    | [src/components/Editor.tsx](/Users/scottfoster/novawrite-work/src/components/Editor.tsx#L977)  | `.editor-prose` in [src/index.css](/Users/scottfoster/novawrite-work/src/index.css#L336)   | The main white “paper” card                    |
| Bottom context bar              | [src/components/Editor.tsx](/Users/scottfoster/novawrite-work/src/components/Editor.tsx#L986)  | `.editor-toolbar` in [src/index.css](/Users/scottfoster/novawrite-work/src/index.css#L318) | Footer status strip                            |
| Generation rail                 | [src/components/Editor.tsx](/Users/scottfoster/novawrite-work/src/components/Editor.tsx#L995)  | `.editor-sidebar` in [src/index.css](/Users/scottfoster/novawrite-work/src/index.css#L301) | Right column shell                             |
| Beats block                     | [src/components/Editor.tsx](/Users/scottfoster/novawrite-work/src/components/Editor.tsx#L1002) | Direct Tailwind `bg-purple-50`                                                             | Local accent card inside right rail            |
| Warning cards and preview cards | [src/components/Editor.tsx](/Users/scottfoster/novawrite-work/src/components/Editor.tsx#L1039) | Direct Tailwind `bg-amber-50`, `bg-white`, `bg-red-50`, `bg-stone-100`, `bg-blue-50`       | Local sub-panels that bypass shared editor CSS |

Key takeaway:
If the editor “doesn’t look changed,” the likely misses are:

1. `.editor-prose`
2. `.editor-sidebar`
3. `.editor-toolbar`
4. Local Tailwind cards inside the generation rail

### 5. Autonomous View

| Surface                 | Source                                                                                                                                                                                                                                    | Control Type                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Top wrapper             | [src/components/AutonomousWriter.tsx](/Users/scottfoster/novawrite-work/src/components/AutonomousWriter.tsx#L1000)                                                                                                                        | Wrapper class                                                              |
| Main cards              | [src/components/AutonomousWriter.tsx](/Users/scottfoster/novawrite-work/src/components/AutonomousWriter.tsx#L1002)                                                                                                                        | Direct Tailwind `bg-white rounded-xl border`                               |
| Guidance/status accents | [src/components/AutonomousWriter.tsx](/Users/scottfoster/novawrite-work/src/components/AutonomousWriter.tsx#L1039) and [src/components/AutonomousWriter.tsx](/Users/scottfoster/novawrite-work/src/components/AutonomousWriter.tsx#L1098) | Direct Tailwind `bg-amber-50`, `bg-purple-50`, `bg-blue-50`, `bg-stone-50` |
| Form fields             | Shared overrides in [src/index.css](/Users/scottfoster/novawrite-work/src/index.css#L235)                                                                                                                                                 | Shared CSS                                                                 |

Key takeaway:
Autonomous is mostly local Tailwind cards plus shared form overrides. It is not centrally themed the way the editor is.

### 6. Story Bible

| Surface                   | Source                                                                                                 | Control Type                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Wrapper shell             | [src/components/StoryBible.tsx](/Users/scottfoster/novawrite-work/src/components/StoryBible.tsx#L667)  | Wrapper class                              |
| Main tab panel            | [src/components/StoryBible.tsx](/Users/scottfoster/novawrite-work/src/components/StoryBible.tsx#L1131) | `story-bible-panel` plus wrapper overrides |
| Accent buttons and alerts | [src/components/StoryBible.tsx](/Users/scottfoster/novawrite-work/src/components/StoryBible.tsx#L693)  | Direct Tailwind colors                     |
| Theme overrides           | [src/index.css](/Users/scottfoster/novawrite-work/src/index.css#L398)                                  | Shared CSS wrapper                         |

Key takeaway:
Story Bible is already wrapper-driven. It is one of the safest places to centralize environmental tuning.

### 7. Settings

| Surface        | Source                                                                                            | Control Type                                 |
| -------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Wrapper shell  | [src/components/Settings.tsx](/Users/scottfoster/novawrite-work/src/components/Settings.tsx#L497) | Wrapper class                                |
| Main sections  | [src/components/Settings.tsx](/Users/scottfoster/novawrite-work/src/components/Settings.tsx#L547) | Direct Tailwind `bg-white rounded-xl border` |
| Message strips | [src/components/Settings.tsx](/Users/scottfoster/novawrite-work/src/components/Settings.tsx#L528) | Direct Tailwind accent backgrounds           |
| Form fields    | Shared overrides in [src/index.css](/Users/scottfoster/novawrite-work/src/index.css#L241)         | Shared CSS                                   |

Key takeaway:
Settings is a hybrid of wrapper-driven inputs and direct card backgrounds.

### 8. Projects And Style Learning

| View           | Surface          | Source                                                                                                      | Control Type               |
| -------------- | ---------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------- |
| Projects       | Modal shell      | [src/components/ProjectList.tsx](/Users/scottfoster/novawrite-work/src/components/ProjectList.tsx#L95)      | Direct Tailwind `bg-white` |
| Projects       | Project cards    | [src/components/ProjectList.tsx](/Users/scottfoster/novawrite-work/src/components/ProjectList.tsx#L246)     | Direct Tailwind `bg-white` |
| Projects       | Feature cards    | [src/components/ProjectList.tsx](/Users/scottfoster/novawrite-work/src/components/ProjectList.tsx#L315)     | Direct Tailwind `bg-white` |
| Style Learning | Sample card      | [src/components/StyleLearning.tsx](/Users/scottfoster/novawrite-work/src/components/StyleLearning.tsx#L119) | Direct Tailwind `bg-white` |
| Style Learning | Fingerprint card | [src/components/StyleLearning.tsx](/Users/scottfoster/novawrite-work/src/components/StyleLearning.tsx#L175) | Direct Tailwind `bg-white` |

Key takeaway:
These views have no shared environmental wrapper beyond page spacing. If we want them to respond to one control knob, we need a shared class or shared component.

### 9. Metrics View

| Surface                   | Source                                                                                                            | Control Type                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Background plate          | [src/components/MetricsDashboard.tsx](/Users/scottfoster/novawrite-work/src/components/MetricsDashboard.tsx#L518) | Inline Tailwind background gradients |
| Bright particles          | [src/components/MetricsDashboard.tsx](/Users/scottfoster/novawrite-work/src/components/MetricsDashboard.tsx#L520) | Local decorative particles           |
| Primary glass recipe      | [src/components/MetricsDashboard.tsx](/Users/scottfoster/novawrite-work/src/components/MetricsDashboard.tsx#L11)  | Inline `CSSProperties` object        |
| Secondary glass recipe    | [src/components/MetricsDashboard.tsx](/Users/scottfoster/novawrite-work/src/components/MetricsDashboard.tsx#L20)  | Inline `CSSProperties` object        |
| Primary glass consumers   | [src/components/MetricsDashboard.tsx](/Users/scottfoster/novawrite-work/src/components/MetricsDashboard.tsx#L183) | `MetricCard`                         |
| Secondary glass consumers | [src/components/MetricsDashboard.tsx](/Users/scottfoster/novawrite-work/src/components/MetricsDashboard.tsx#L219) | `SectionCard`                        |

Key takeaway:
Metrics is a completely separate visual system. It does not share the editor/story/settings environment controls.

## Current Adjustment Control Points

If the goal is “change how environmental transparency feels,” these are the real knobs:

| Knob                           | Best File                                                                                                                                                                                                                | Affects                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Background intensity and mood  | [src/components/MagnumBackground.tsx](/Users/scottfoster/novawrite-work/src/components/MagnumBackground.tsx)                                                                                                             | The sky and weather only                            |
| Header/nav opacity             | [src/App.tsx](/Users/scottfoster/novawrite-work/src/App.tsx#L394)                                                                                                                                                        | Top chrome only                                     |
| Editor shell translucency      | [src/index.css](/Users/scottfoster/novawrite-work/src/index.css#L301)                                                                                                                                                    | Chapter rail, main column, toolbars, canvas, paper  |
| Editor local accent cards      | [src/components/Editor.tsx](/Users/scottfoster/novawrite-work/src/components/Editor.tsx#L1002)                                                                                                                           | Right rail sub-panels and warnings                  |
| Story Bible panel translucency | [src/index.css](/Users/scottfoster/novawrite-work/src/index.css#L404)                                                                                                                                                    | Story Bible main panel and wrapper-overridden cards |
| Settings and autonomous cards  | [src/components/Settings.tsx](/Users/scottfoster/novawrite-work/src/components/Settings.tsx#L547) and [src/components/AutonomousWriter.tsx](/Users/scottfoster/novawrite-work/src/components/AutonomousWriter.tsx#L1002) | Direct `bg-white` cards                             |
| Metrics translucency           | [src/components/MetricsDashboard.tsx](/Users/scottfoster/novawrite-work/src/components/MetricsDashboard.tsx#L11)                                                                                                         | Metrics only                                        |

## Why The Earlier Transparency Pass Was Hard To Steer

The live environment is not controlled by one theme layer.

It is split across:

1. A canvas background renderer
2. Direct Tailwind classes in `App.tsx`
3. Wrapper-based CSS in `src/index.css`
4. Direct Tailwind white cards inside views
5. A fully separate metrics glass system

So “increase transparency across the whole UI” is not one change. It is at least four separate surface systems.

## Safest Refactor Direction

If we want this to become easy to tune, the next move should be structural, not another opacity guess.

Recommended isolation path:

1. Introduce a dedicated environment token set in `src/index.css` for panel opacity, paper opacity, rail opacity, toolbar opacity, blur, and border strength.
2. Replace direct white panel classes in `Editor.tsx`, `Settings.tsx`, `AutonomousWriter.tsx`, `ProjectList.tsx`, and `StyleLearning.tsx` with semantic classes like `env-card`, `env-card-soft`, `env-rail`, `env-toolbar`, and `env-paper`.
3. Keep `MagnumBackground.tsx` separate as the atmosphere engine.
4. Keep `MetricsDashboard.tsx` separate unless we explicitly want to merge it into the main environment system.

## Immediate Recommendation

For the transparency issue you were trying to adjust, the most effective and least risky targets are:

1. `editor-sidebar`
2. `editor-toolbar`
3. `editor-prose`
4. The direct `bg-white` and `bg-purple-50` blocks inside the editor generation rail

That is the actual visible editor environment from the screenshot, and it avoids disturbing the nav, settings, projects, and metrics unnecessarily.
