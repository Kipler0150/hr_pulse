---
name: calm-operational-design-system
source: derived from the approved spec and current interface
character: "Calm, dependable, and precise. Deep blue anchors operational work, restrained gold marks selected context, and clear neutral surfaces keep payroll and attendance information easy to scan."
tokens: "Real values live in src/app/globals.css. Read them there and never duplicate them here."
contrast: "Muted text 5.67:1 light and 10.57:1 dark. Ink 15.33:1 light and 16.94:1 dark. On primary 11.60:1 light and 8.47:1 dark. Control borders exceed 3:1 in both themes."
---

## Build mandate

Every page is a complete HR Pulse surface with a clear brand, direct product copy, useful context, responsive states, and a focused next action. Authentication uses a composed two panel layout on wide screens and a substantial branded card on narrow screens. Operational pages use the application shell and never leave content floating on an empty canvas.

## Character and direction

The interface should feel like a steady operations desk. Use deep blue for navigation and primary actions. Use gold only for selected context or a small point of emphasis. Prefer crisp hierarchy, low chroma surfaces, tabular numbers, and modest depth over decorative effects.

## Composition patterns

Authentication pairs a branded context panel with a comfortable form. Access states use a branded frame with one clear explanation and recovery action. Signed in work uses a persistent desktop sidebar, a mobile modal sheet, a compact context bar, a page header, and responsive content cards. Data keeps priority values visible and moves secondary values into labelled disclosure on narrow screens.

## Component and usage rules

Use semantic tokens and the shared components under `src/components/ui`. Primary buttons are deep blue and reserved for the main action. Gold is not a warning color. Cards use a visible boundary and subtle surface shadow. Forms use comfortable controls and persistent labels. Administrative tables and toolbars may use compact spacing. Status always includes text plus an icon or shape. Future destinations do not appear until their routes work.

## Responsive and accessibility direction

Design from 360 pixels upward. The desktop shell begins at 768 pixels and content reaches its maximum at 1280 pixels. Comfortable actions have at least a 44 pixel target. Keep navigation and actions available at every width. Use native elements first, restore focus after overlays, provide a skip link, honor reduced motion, and meet WCAG 2.1 AA contrast in both themes.
