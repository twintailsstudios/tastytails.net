---
name: tastytails-ui-style-guide
description: Applies the TastyTails.net Universal Design System and Style Guide whenever creating new UI elements, designing pages, building features, or modifying existing components and stylesheets.
---

# TastyTails Universal UI Style Guide & Design System Skill

> **Usage Instruction**: Invoke or reference this skill whenever adding, modifying, or refactoring UI components, pages, forms, buttons, colors, typography, or CSS stylesheets in **TastyTails.net**.

---

## 1. Core Visual Theme & Documentation Map

Theme: **"Warm Medieval Tavern & Feral Guild Registry"** (Parchment, dark wood binders, iron rivets, entrance emerald green, crimson red, and metallic gold accents).

### Authoritative Documentation Links
- **Universal Design Guide**: [`docs/UNIVERSAL_STYLE_GUIDE.md`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/docs/UNIVERSAL_STYLE_GUIDE.md)
- **Character Bank Guide**: [`docs/style_guides/character_bank_style_guide.md`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/docs/style_guides/character_bank_style_guide.md)
- **Play Page Guide**: [`docs/style_guides/play_page_style_guide.md`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/docs/style_guides/play_page_style_guide.md)
- **Home Page Guide**: [`docs/style_guides/home_page_style_guide.md`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/docs/style_guides/home_page_style_guide.md)
- **Character Create Guide**: [`docs/style_guides/create_page_style_guide.md`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/docs/style_guides/create_page_style_guide.md)

---

## 2. Universal Design Tokens & CSS Variables

Ensure all stylesheets utilize these exact color tokens:

```css
:root {
    /* === BASE CANVAS & WOOD === */
    --palette-bg: #2c241b;                  /* Wood pattern body canvas */
    --palette-wood-dark: #3e2723;           /* Outer binders, heavy frames, modal borders */
    --palette-wood-light: #5d4037;          /* Card dividers, sub-borders, secondary buttons */
    --palette-wood-accent: #795548;         /* Active slot borders, splitter highlights */
    --palette-leather: #2a1b15;             /* Satchel tabs, leather trim */
    --palette-iron: #222222;                /* Hardware plates, rivets, spine widgets */

    /* === PAPER & PARCHMENT === */
    --palette-parchment: #f3e5ab;           /* Primary card fill, modal fill, active tabs */
    --palette-parchment-light: #faf3e0;     /* Paper notes, message cards */
    --palette-parchment-dark: #e6d598;      /* Subtitles, secondary paper text */
    --palette-text-dark: #3e2723;           /* Primary ink text for headings, bios, inputs */
    --palette-text-light: #f5f5f5;          /* White text on dark wood backgrounds */

    /* === ACCENTS & HIGHLIGHTS === */
    --palette-gold: #ffc107;                /* Logo title, active tab gold top line */
    --palette-gold-bright: #ffd700;         /* Header bottom rule line */
    --palette-accent-red: #8b0000;          /* Notice titles, danger buttons, warnings */

    /* === BUTTON COLOR TOKENS === */
    --btn-primary-bg: #6b8c42;              /* Entrance Emerald Green (Primary CTA) */
    --btn-primary-shadow: #3e5527;          /* 3D keycap shadow */
    --btn-primary-hover: #7ea34f;           /* Lighter green hover fill */

    --btn-secondary-bg: #5d4037;            /* Light Wood (Secondary Action) */
    --btn-secondary-shadow: #3e2723;        /* Dark wood keycap shadow */

    --btn-danger-bg: #8b0000;               /* Crimson Red (Danger / Destructive) */
    --btn-danger-shadow: #500000;           /* Dark garnet keycap shadow */
}
```

---

## 3. Typography & Font Suite

Always import required Google Fonts: `Cinzel`, `Caveat Brush`, `Philosopher`, and `Crimson Pro`.
- **`Cinzel`**: Logos (`2.2rem`), page titles (`3.0rem`), section headers, and **all button text**.
- **`Caveat Brush`**: In-world handwritten text, player bios, character nicknames (`2.4rem`), labels, text inputs, textareas, `.paper-note` cards.
- **`Philosopher`**: UI badges, species pills, HUD readouts, tooltips.
- **`Crimson Pro`**: Narrative text & chat logs.

---

## 4. Standardized Component System

1. **4-Tier 3D Keycap Buttons**: All buttons use `Cinzel` font, bold uppercase, solid bottom shadow, and `transform: translateY(2px)` on hover/press.
2. **Frames & Binders**: `.binder-container` (`10px solid #3e2723`, parchment fill `#f3e5ab`, inner vignette shadow).
3. **Form Controls**: Signature line inputs (bottom border `2px solid #5d4037`, `Caveat Brush` font).
4. **Custom Paw-Print Select**: `.custom-select-wrapper` with sliding gold FontAwesome paw print (`\f1b0`).
5. **Tab Bars**: Inactive `#3e2723`, active parchment `#f3e5ab` with inset gold top underline (`box-shadow: 0 -4px 0 #ffc107 inset`).

---

## 5. UI Pre-Flight Audit Checklist

Before applying HTML/CSS edits:
- [ ] Verify design tokens are used instead of ad-hoc hex values.
- [ ] Confirm keycap button classes (`.btn-primary`, `.btn-secondary`, `.btn-danger`) are applied.
- [ ] Verify ARIA accessibility labels (`aria-label`, `aria-selected`, `role="tab"`).
- [ ] Confirm layout math is dynamic and responsive (no hardcoded pixel offsets).
```

---

## 6. Core Execution Rules
- **No Generic Styling**: Ad-hoc RGB/hex colors or browser default fonts are strictly forbidden.
- **Clickable Links**: All file and symbol references must use clickable markdown syntax (`[file.js](file:///path/to/file.js#L10)`).
