---
name: hr-pulse-operational-design-system
source: extracted-from-code
character: "Calm, trustworthy operational software with deep navy structure and restrained warm gold emphasis. Information is dense enough for payroll work, but generous spacing, explicit language, and clear status treatment keep every surface approachable."
tokens: "Real values live in src/app/globals.css. Read them there and never duplicate them here."
contrast: "Body 5.67:1 light and 10.57:1 dark. Ink 15.33:1 light and 16.94:1 dark. Primary text 11.60:1 light and 8.47:1 dark. Control borders 3.49:1 light and 3.55:1 dark."
---

## Build mandate

Ship every HR Pulse page as a complete operational surface. Include the product shell, specific context, clear hierarchy, the main workflow, supporting guidance, and honest loading, empty, blocked, error, stale, and success states. Use real application data. Avoid isolated forms, bare tables, decorative clutter, or controls without surrounding context.

## Character and direction

HR Pulse should feel dependable and composed. Deep navy anchors navigation and primary actions. Warm gold is a measured signal for emphasis, not decoration. Cards, subtle elevation, strong typography, and tabular number treatment make payroll and attendance evidence easy to scan. Language is direct, specific, and calm even when work is blocked.

## Composition patterns

Protected screens live inside the shared application shell. Start with an eyebrow, a clear page title, concise supporting copy, and the most important status or action. Group related work into named sections with a steady vertical rhythm. Use cards for summaries and bounded tasks, alerts for actionable context, tables for wide administrative review, and responsive records for the same information on small screens. Detail pages lead with identity and state, then show totals, evidence, history, and actions in that order.

## Component and usage rules

Use checked in shadcn components before custom markup. Use complete card composition with a header and description. Use `FieldGroup` and `Field` for forms, with persistent labels and linked errors. Use semantic status variants and tokens. Reserve the primary button for the main action in a section. Use outline or ghost variants for supporting actions. Use borders for structure and existing shadow tokens only for intentional elevation. Use Lucide icons from the configured library, and pair color with text or an icon whenever it communicates status.

Do not introduce raw colors, duplicate CSS tokens, manual dark mode colors, custom overlay stacking, decorative gradients, or one off form layouts. Do not hide payroll or attendance context behind hover only interactions. Render notes as plain text.

## Responsive and accessibility direction

Design from the smallest supported width. Keep primary values and actions visible, and move secondary table columns into `ResponsiveRecord` disclosure on small screens. Preserve at least comfortable touch targets, visible focus, semantic headings and tables, keyboard operation, and announced mutation results. Light and dark themes must carry the same meaning and hierarchy. Organization timezone, currency, period, employee identity, and workflow status stay explicit wherever they affect a decision.
