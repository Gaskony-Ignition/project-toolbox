/**
 * Text colour for an element sitting on the app's light blue-tinted active
 * state (rgba(59,130,246,0.15)) over the page's own surface, which is dark
 * in dark mode and near-white in light mode. `primary.main` alone only
 * clears 4.5:1 in one of those two cases, so callers pick whichever of the
 * theme's blues actually passes against that tint (WCAG 1.4.3).
 */
export const ACCENT_TEXT = { dark: '#79c0ff', light: '#0550ae' } as const;
