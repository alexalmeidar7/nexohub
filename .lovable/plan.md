# Plan - Redesign vMix Broadcast Page

Redesign the vMix Broadcast page to improve usability, clarity, and visual harmony. The goal is to reduce visual clutter (too much text and buttons that are hard to see) while maintaining a robust, "Tech Premium" aesthetic.

## User Review Required

> [!IMPORTANT]
> The current layout was described as having "a lot of text and buttons that are hard to see." I will simplify the control panels and prioritize high-frequency actions.

## Proposed Changes

### 1. Layout Structure Optimization
- **Dashboard Refinement**: Use a more balanced two-column layout where the **Live Preview** stays large but the **Control Center** is grouped into logical, high-contrast Bento blocks.
- **Visual Hierarchy**: Standardize spacing and font sizes to ensure critical information (Active Session, Master Clock, Tally Status) stands out without overwhelming the UI.

### 2. Component Refinements
- **Broadcast Control Center**:
  - Group "Salvar Alterações" and "Inserir Live" into a primary action bar.
  - Simplify the "Content Identity" section; use clearer input labels and better contrast for overrides.
- **Tabbed System**:
  - Keep the tabbed interface for secondary features (Ticker, Assuntos, XML) but improve the transitions and active state indicators.
  - Ensure each tab panel is focused and uncluttered.
- **Mockup Preview (16:9 Stage)**:
  - Add subtle shadows and depth to the preview area.
  - Ensure the "Floating Status HUD" is clean and non-obstructive.

### 3. Visual Polish
- **Color Consistency**: Strictly adhere to the Navy Deep (#0A2540) and Cyan (#00BFF0) palette.
- **Typography**: Use 'Sora' for headings and 'Manrope' for body text with improved line-height and letter-spacing for readability.
- **Interactive Elements**: Standardize buttons to the high-contrast Lime (#C6F03C) style for primary actions and subtle glassmorphism for secondary ones.

## Technical Details

- **File**: `src/components/BroadcastPage.tsx`
- **Component**: `BroadcastPage`
- **Styles**: Inline Tailwind classes and dynamic CSS for aspect ratios and transitions.
- **Responsive**: Ensure the layout reflows elegantly for standard 1366x768 resolutions and higher.
