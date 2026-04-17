# Design System Specification: The Intellectual Workspace

## 1. Overview & Creative North Star
**Creative North Star: "The Digital Curator"**

This design system moves beyond the utility of a standard text editor to create a high-end, editorial environment for deep thought. While the user's foundation is "clean and minimal," our execution is **Sophisticated Atmospheric Minimalism**. We reject the "boxed-in" feel of traditional SaaS tools in favor of a layout that breathes.

By utilizing intentional asymmetry, expansive negative space, and tonal layering, we transform a research tool into a focused sanctuary. The interface should feel like a premium physical workspace—think matte black surfaces, heavy paper stock, and precision-engineered instruments.

---

2. Colors & Surface Architecture
Our palette isn't just about "dark mode"; it’s about depth and focus. We use a range of deeply desaturated navies and charcoals to reduce eye strain during multi-hour research sessions.

### The "No-Line" Rule
**Prohibit 1px solid borders for sectioning.** To achieve a premium look, boundaries are defined by background shifts, not outlines. 
- Use `surface-container-low` for sidebars sitting on a `surface` background.
- Use `surface-container-highest` for active selection states or popovers.

### Surface Hierarchy (Nesting)
Treat the UI as physical layers. Each step "up" in the hierarchy uses a lighter surface token:
- **Base Layer:** `surface` (#10131a) - The infinite canvas.
- **Structural Layer:** `surface-container-low` (#191c22) - Secondary navigation or metadata panels.
- **Interactive Layer:** `surface-container` (#1d2026) - Floating cards or document previews.
- **Focus Layer:** `surface-container-high` (#272a31) - Modals and active dialogs.

### The "Glass & Gradient" Rule
To prevent the dark mode from feeling "flat" or "muddy":
- **Floating Elements:** Use `surface-container-lowest` (#0b0e14) at 80% opacity with a `20px` backdrop-blur for a frosted glass effect on menus.
- **Signature Accents:** Use a solid background for primary CTAs (e.g., `primary` #adc6ff) to give buttons a clean, modern look.

---

3. Typography: The Editorial Voice
We use a dual-typeface system to distinguish between **Content** (The User's Work) and **Interface** (The System).

- **Manrope (Display & Headlines):** An authoritative, geometric sans-serif for high-level navigation. It feels modern and curated.
- **Inter (Title, Body, Labels):** A highly legible, neutral workhorse for the research itself.

### Typography Scales
- **Display LG:** 3.5rem (Manrope) - Use for empty state headers or large landing moments.
- **Headline SM:** 1.5rem (Manrope) - Standard for document titles.
- **Body MD:** 0.875rem (Inter) - The standard for research notes. Line height must be 1.6 to ensure readability during long-form reading.
- **Label SM:** 0.6875rem (Inter, All Caps, Tracking +5%) - Used for metadata (e.g., "LAST EDITED") to provide a technical, research-oriented aesthetic.

---

4. Elevation & Depth
Depth is communicated through **Tonal Layering** rather than traditional structural lines.

- **The Layering Principle:** Instead of drawing a box around a card, place a `surface-container-lowest` card on a `surface-container-low` background. The contrast is felt, not seen.
- **Ambient Shadows:** For floating elements (Modals, Context Menus), use an extra-diffused shadow: `box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4)`. The shadow should feel like a soft glow of darkness.
- **The "Ghost Border" Fallback:** If a container must be defined (e.g., an input field), use the `outline-variant` (#424754) at **20% opacity**. This creates a "suggestion" of a boundary that disappears into the background.

---

5. Components

### Primary Buttons
- **Style:** Solid background (`primary`), `md` (12px) rounded corners.
- **States:** On hover, increase the `surface-tint` overlay by 10%.
- **Typography:** `title-sm` (Inter, Semibold).

### Inputs & Search
- **Style:** Background `surface-container-lowest`, "Ghost Border" (20% `outline-variant`).
- **Focus State:** No thick borders. Use a 2px `primary` outer glow with 15% opacity and change the border to `primary` at 50% opacity.

### Research Chips
- **Style:** `surface-container-highest` background, no border.
- **Interaction:** On hover, shift background to `tertiary-container`. Use for tags, citations, or metadata categories.

### Document Cards & Lists
- **Rule:** **Forbidden: Horizontal Divider Lines.**
- **Implementation:** Separate list items with 8px of vertical whitespace. Use a `surface-container-low` background on hover to indicate interactivity.

### Contextual Tooltips
- **Style:** `surface-bright` background with `on-surface` text.
- **Radius:** `sm` (4px) to distinguish them from larger UI containers.

### Specialized Component: The Research Sidebar
A persistent vertical area using `surface-container-low`. Instead of a border, use a subtle 4px wide gradient shadow that bleeds into the main `surface` area to indicate the panel sits "above" the document.

---

6. Do's and Don'ts

| Do | Don't |
| :--- | :--- |
| **Do** use `0.875rem` (Body-MD) for the bulk of the text to maintain a professional "dense" information feel. | **Don't** use standard 16px (1rem) for UI labels; it feels too "consumer" and lacks the professional edge. |
| **Do** use `12px` (md) corners for large containers and `8px` (DEFAULT) for buttons. | **Don't** mix sharp 0px corners with rounded elements. It breaks the "Curator" aesthetic. |
| **Do** use background tonal shifts to separate the editor from the sidebar. | **Don't** use 1px solid lines to separate panels; it creates visual noise and "grid-locking." |
| **Do** use `backdrop-filter: blur(12px)` for all floating menus. | **Don't** use opaque, solid-color backgrounds for dropdowns. |
| **Do** prioritize the `primary` blue (#adc6ff) only for high-intent actions. | **Don't** use the accent color for decorative elements or non-interactive icons. |

---

7. Accessibility & Motion
- **Contrast:** Ensure all `on-surface-variant` text (#c2c6d6) against `surface` (#10131a) maintains a minimum 4.5:1 ratio.
- **Motion:** Transitions between surface levels (e.g., opening a sidebar) should use a `300ms` "Standard Easing" (Cubic-bezier 0.4, 0, 0.2, 1). Movement should feel weighted and deliberate, like a heavy sliding door.