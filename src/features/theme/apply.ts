import type { ThemePreference } from "./preference";

/** apply preference to the document. "system" removes the override so
 * the @media (prefers-color-scheme) rule in style.css takes over. */
export function applyThemePreference(p: ThemePreference): void {
  const root = document.documentElement;
  if (p === "system") {
    root.removeAttribute("data-theme");
    return;
  }
  root.setAttribute("data-theme", p);
}
