# Estrutura de Componentes Cenários Estúdio

## Arquitetura de Navegação Refinada

```
┌─────────────────────────────────────────────────────────────────┐
│  CenariosPage (Control Layer)                                   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Navigation Bar (Single Row)                              │   │
│  │                                                           │   │
│  │  [⚙ Interativo] [📺 Estúdio] [🖼 Imagens] [🌐 Web]     │   │
│  │                              └──────────┬────────┘        │   │
│  │                                 (Sub-tabs)    [+ Novo]→   │   │
│  │                                              Template     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Content Area (Dynamic)                                   │   │
│  │                                                           │   │
│  │  Tab: "interativo" → CenarioInterativoPage              │   │
│  │  Tab: "estudio"                                         │   │
│  │    ├─ SubTab: "imagens" → CenariosEstudioTabs          │   │
│  │    │                        └→ CenariosEstudioPage     │   │
│  │    │                           └→ forwardRef.addGrupo()│   │
│  │    │                                                    │   │
│  │    └─ SubTab: "web" → CenariosEstudioTabs             │   │
│  │                        └→ CenariosEstudioWebPage       │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  State Management:                                              │
│  • tab: "interativo" | "estudio"                                │
│  • subTab: "imagens" | "web"                                    │
│  • onAddTemplate: () => void                                    │
│  • onChangeSubTab: (tab: SubTab) => void                        │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## UI Hierarchy

### Level 1: Main Tabs (Always Visible)
```
┌─────────────────────────────────────────┐
│ ⚙ Interativo    │    📺 Estúdio       │
│                 │                      │
└─────────────────────────────────────────┘
  (rounded-full)    (larger font-medium)
  (active: blue background, white text)
```

### Level 2: Sub-tabs (Conditional - Only when estudio tab active)
```
┌─────────────────────────────────────┐
│ 🖼 Cenário por imagens | 🌐 Web   │
│ (text-xs, smaller icons)            │
│ (ml-2, offset from main tabs)       │
└─────────────────────────────────────┘
  (rounded-full, secondary styling)
  (active: blue background, white text)
```

### Level 3: Action Button (Conditional - Only when estudio tab active)
```
┌────────────────────────────────────┐
│            + NOVO TEMPLATE         │
│ (ml-auto for right alignment)      │
│ (#C6F03C yellow background)        │
└────────────────────────────────────┘
  (text-[10px], uppercase, bold)
```

## Key Features

✅ **Conditional Rendering**
   - Sub-tabs only appear when `tab === "estudio"`
   - "+ NOVO TEMPLATE" button only appears when `tab === "estudio"`
   - Clean UI when viewing other tabs

✅ **Clean Visual Hierarchy**
   - Main tabs: Larger, more prominent
   - Sub-tabs: Smaller, secondary styling (text-xs)
   - Icons: Consistent with each level

✅ **Responsive Design**
   - Uses flex-wrap to handle small screens
   - Items stack naturally
   - ml-auto ensures button stays right-aligned

✅ **Theme Integration**
   - Uses CSS variables: `--layout-accent-color`, `--layout-page-bg`, etc.
   - Maintains consistency with app theme
   - Adapts to light/dark modes

## Communication Pattern: Callback Registration

### Flow Diagram

```
1. CenariosPage Mounts
   └─ registerChangeSubTab is exported (module-level)

2. CenariosEstudioTabs Mounts
   └─ registerAddTemplate stores callback to expose addGrupo()

3. User Clicks "+ NOVO TEMPLATE"
   └─ CenariosPage onClick → onAddTemplate?.()
      └─ Calls registered callback
         └─ CenariosEstudioTabs.pageRef.current?.addGrupo?.()
            └─ CenariosEstudioPage.addGrupo (via forwardRef)
               └─ Creates new template in Supabase

4. User Clicks Sub-tab Button
   └─ CenariosPage onClick → setSubTab(id) + onChangeSubTab?.(id)
      └─ Re-renders with new subTab value
         └─ CenariosEstudioTabs receives new subTab prop
            └─ Switches between CenariosEstudioPage and CenariosEstudioWebPage
```

## TypeScript Types

```typescript
type Tab = "interativo" | "estudio";
type SubTab = "imagens" | "web";

interface TabConfig {
  id: Tab;
  label: string;
  icon: IconComponent;
}

interface SubTabConfig {
  id: SubTab;
  label: string;
  icon: IconComponent;
}

// Callbacks
let onAddTemplate: (() => void) | null = null;
let onChangeSubTab: ((tab: SubTab) => void) | null = null;

// forwardRef Type
interface CenariosEstudioPageHandle {
  addGrupo: () => void;
}
```

## Styling Details

### Main Tab Button (Active State)
```css
background: var(--layout-accent-color, #2563eb);
color: var(--layout-page-bg, #ffffff);
box-shadow: 0 1px 2px rgba(0,0,0,0.08);
border-radius: 9999px;
padding: 0.75rem 1.5rem;
font-weight: 500;
font-size: 0.875rem;
```

### Main Tab Button (Inactive State)
```css
background: transparent;
color: color-mix(in srgb, var(--layout-page-text, #0d0446) 75%, transparent);
border-radius: 9999px;
padding: 0.75rem 1.5rem;
font-weight: 500;
font-size: 0.875rem;
transition: all 0.15s ease;
```

### Sub-tab Button (Active State)
```css
background: var(--layout-accent-color, #2563eb);
color: var(--layout-page-bg, #ffffff);
border-radius: 9999px;
padding: 0.375rem 0.75rem;
font-size: 0.75rem;
font-weight: 600;
gap: 0.375rem;
```

### "+ NOVO TEMPLATE" Button
```css
background: #C6F03C;
hover:background: #C6F03C/90;
color: #0A2540;
padding: 0 1.25rem;
height: 36px;
border-radius: 9999px;
font-size: 10px;
font-weight: bold;
text-transform: uppercase;
letter-spacing: 0.05em;
box-shadow: 0 1px 3px rgba(0,0,0,0.1);
margin-left: auto;
white-space: nowrap;
```

## Improvements Made vs Previous Version

| Aspect | Before | After |
|--------|--------|-------|
| Navigation Layout | Multiple nested rows | Single horizontal row |
| Tab Management | Scattered across components | Centralized in parent |
| Sub-tab Visibility | Always visible, cluttering | Conditional, clean |
| Button Position | Below header | In main navigation |
| Code Organization | Prop drilling | Callback registration |
| Visual Hierarchy | Unclear | Clear levels |

## Browser Compatibility

- Uses CSS `color-mix()` with fallbacks
- Uses CSS custom properties (CSS variables)
- Uses modern flexbox layout
- Uses `ml-auto` for right alignment
- Uses `shrink-0` to prevent flex shrinking
- All features supported in modern browsers (Chrome, Firefox, Safari, Edge)

## Performance Notes

- Sub-tabs rendered inline (no dynamic import overhead)
- Callbacks use module-level variables (no closure issues)
- Component memoization not needed (simple state)
- Lazy-loaded content components only (CenariosEstudioPage, CenariosEstudioWebPage)

## Future Enhancement Opportunities

1. **localStorage Persistence**
   ```typescript
   const [subTab, setSubTab] = useState<SubTab>(() => {
     const saved = localStorage.getItem("cenarios-subtab");
     return (saved as SubTab) || "imagens";
   });
   ```

2. **Sub-tab Animations**
   ```typescript
   // Slide transition between sub-tabs
   const [phase, setPhase] = useState<"in" | "out">("in");
   ```

3. **Keyboard Navigation**
   ```typescript
   onKeyDown={(e) => {
     if (e.key === "ArrowRight") selectNextTab();
     if (e.key === "ArrowLeft") selectPrevTab();
   }}
   ```

4. **Mobile Optimization**
   ```typescript
   // Dropdown menu for sub-tabs on mobile
   const isMobile = useMediaQuery("(max-width: 640px)");
   ```
