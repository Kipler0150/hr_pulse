# Frontend and design system

The frontend uses the Next.js App Router, React 19, Tailwind CSS, and checked-in shadcn-style primitives. Most screens are server-rendered; client JavaScript is added for interaction rather than by default.

## App Router structure

`src/app/` maps directories to URLs. Parentheses create route groups without changing the URL:

- `(auth)` groups sign-in and recovery screens.
- `(protected)` groups authenticated product screens.

Important file conventions:

| File | Purpose |
| --- | --- |
| `layout.js` | Shared wrapper and broad route guard |
| `page.js` | Route UI and server-side data load |
| `loading.js` | Suspense/loading fallback |
| `error.js` | Route-segment client error boundary |
| `route.js` | HTTP endpoint |

Dynamic folders such as `[id]` receive route parameters. Search parameters are used for filters and cursors, but every value is parsed and authorized on the server.

## Layout composition

The root layout owns fonts, global CSS, theme class, metadata, and the application icon. The root protected layout rejects anonymous or inactive profiles. Domain layouts add selection, role, employee-link, and feature-flag checks, then render `AppShell`.

`AppShell` owns:

- desktop sidebar and mobile sheet navigation;
- organization and identity context;
- role/flag-aware destinations;
- sign out;
- theme control;
- skip-to-content link;
- consistent content width and responsive spacing.

Pages should render their workflow content inside the shell supplied by the layout. They should not recreate global navigation.

## Server components by default

Use a server component when the component:

- loads database or authenticated data;
- formats a complete initial screen;
- redirects based on server context;
- does not require event handlers, effects, or browser-only state.

Benefits include a smaller client bundle, direct access to server helpers, and fewer accidental data APIs.

Use a client component when it needs:

- `useState`, `useEffect`, `useTransition`, or `useActionState`;
- click handlers or browser events;
- polling;
- interactive disclosure/dialog primitives;
- client-side accessibility announcements tied to state.

Keep the client boundary narrow. For example, a server page loads a payroll run and passes only the run ID and initial status to `RunPolling`.

## Form mutation patterns

### `useActionState`

Form-heavy components such as authentication and profile forms bind a server action with `useActionState`. The action receives `(previousState, formData)` and returns a serializable success/error object unless it redirects.

Typical shape:

```jsx
const [state, formAction, pending] = useActionState(action, initialState);

return (
  <form action={formAction}>
    {/* persistent labels and inputs */}
    <Button disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
    {/* safe state feedback */}
  </form>
);
```

### `useTransition`

Small command controls such as check-in use `useTransition` when the component directly invokes an async server action and stores its returned state.

### Plain server forms

Simple redirecting actions can be bound directly with `<form action={serverAction}>` without a client wrapper.

Regardless of UI pattern, the server action owns authoritative validation and authorization.

## Mutation response design

Actions generally return a small discriminated state:

```js
{ success: true, message: "...", result: { ...safeFields } }
```

or:

```js
{ success: false, code: "STABLE_CODE", message: "...", retryable: true }
```

Do not send raw exception messages to client components. Database and provider messages can leak schema, identity, or operational detail.

After success, call `revalidatePath` for affected server-rendered routes. If navigation is the correct result, use `redirect` and rethrow Next.js redirect errors from broad catch blocks.

## Design tokens

`src/app/globals.css` contains the real visual tokens. `design.md` describes their intended character and usage.

The palette uses:

- deep navy for structure and primary actions;
- warm gold for restrained emphasis;
- neutral surfaces for dense operational information;
- semantic success, warning, information, and destructive colors.

Light and dark themes define equivalent semantic tokens. Components use classes such as `bg-primary` and `text-muted-foreground`, not duplicated raw colors.

Other token groups include radius, elevation, motion duration/easing, borders, focus ring, chart colors, and sidebar colors.

## Component system

Reusable primitives live in `src/components/ui/`. Prefer composing these before adding custom form or card markup.

Important patterns:

| Component | Use |
| --- | --- |
| `Button` | Primary, supporting, destructive, and icon controls with consistent targets |
| `Field`, `FieldLabel`, `FieldGroup` | Persistent accessible form labels and grouping |
| `Alert` | Actionable success, warning, information, or error feedback |
| `Card` | Bounded summary or task, with header/description/content structure |
| `Table` | Wide administrative review with semantic headers/caption |
| `ResponsiveRecord` | Same record as compact mobile details and expanded desktop values |
| `Empty` | A truthful empty state with explanation and optional next action |
| `StatusBadge` | Text plus semantic color/icon for workflow status |
| `SensitiveValue` | Masked value with an accessible reveal control when permitted |
| `Sheet` | Mobile navigation or constrained overlay content |
| `Skeleton` / `Spinner` | Loading state at page or action scale |

`src/app/design-system/page.js` is a development-only gallery. It is unavailable in production and is useful for checking component composition and themes.

## Page composition

A complete operational page usually contains:

1. an eyebrow that establishes workflow context;
2. a clear `h1` describing the current task;
3. short supporting copy;
4. the primary status or action;
5. named sections for summaries, evidence, history, and actions;
6. honest loading, empty, blocked, error, stale, and success states;
7. navigation back to related destinations.

Detail pages present identity and state first, then totals, evidence, workflow history, and available actions.

## Responsive design

The minimum supported body width is 20rem. Build from the small layout first.

- Actions wrap or become full width on narrow screens.
- Wide tables have a corresponding `ResponsiveRecord` presentation where necessary.
- Priority values remain visible; secondary values move into `<details>` on mobile.
- The desktop sidebar becomes an accessible sheet menu.
- Touch controls use comfortable target sizes.
- Text and identifiers use truncation or deliberate wrapping to avoid horizontal overflow.

Browser tests check representative widths such as 360, 768, and 1280 pixels.

## Accessibility expectations

- One clear page `h1`, followed by meaningful section headings.
- Persistent labels connected to controls.
- Buttons for actions and links for navigation.
- Keyboard-operable dialogs, sheets, disclosure, and sensitive-value controls.
- Visible focus ring and skip link.
- `aria-live` or alert semantics for asynchronous mutation/status feedback.
- Icons marked decorative when text already communicates meaning.
- Color paired with text or an icon for status.
- Semantic tables with captions or accessible container labels.
- Reduced-motion preferences respected by global CSS.

Automated axe checks catch common problems, but keyboard order, focus restoration, readable errors, and responsive comprehension still require manual/browser verification.

## Loading and failure states

Segment `loading.js` files provide route transitions without replacing the complete layout. Segment `error.js` files give users a retry path for unexpected render failures.

Domain pages may handle expected partial failures inline. Self-service home, for example, can show profile data while separately reporting that timecard or payslip summaries are unavailable. This is preferable when independent reads should not blank the entire screen.

## Polling

`RunPolling` demonstrates bounded client polling:

- start only for active states;
- use `cache: "no-store"`;
- keep the last known status through temporary network failures;
- increase delay when status is unchanged;
- refresh server components only when meaningful state changes;
- cancel timers on unmount;
- offer a manual refresh control.

Polling reads do not own workflow truth. The database state remains authoritative.

## Adding a page

1. Choose the route group and add a `page.js`.
2. Reuse or add a domain layout for broad guards and `AppShell`.
3. Load authorized data in the server page.
4. Extract only interactive controls into client components.
5. Compose checked-in UI primitives and existing formatters.
6. Implement loading, empty, error, forbidden, and feature-disabled behavior.
7. Add the navigation destination only when the complete slice is usable.
8. Test mobile, desktop, keyboard, theme, and accessible naming.
