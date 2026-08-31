# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Added the HR Pulse application foundation with Next.js App Router, JavaScript, Tailwind CSS, and shadcn/ui.
- Added Supabase PostgreSQL, Supabase Auth, Drizzle migrations, private Storage, Inngest, Sentry, Vitest, Playwright, and the Vercel deployment path (see spec 0001).
- Added the shared organization centered HR data model with relational constraints, lifecycle guards, Row Level Security, and audit history (see spec 0002).
- Added email and password sign in, session protected routes, organization selection, password recovery, and role based access checks (see spec 0003).
- Added the shared design tokens, responsive application shell, reusable interface primitives, theme controls, accessible states, and development gallery (see spec 0004).
- Added employee check in and clock out with trusted database timestamps, audit history, duplicate-state handling, and organization-scoped attendance review (see spec 0006).
- Added reviewable timecards, deterministic overtime calculations, manager approval and return workflows, administrator corrections, and approved payroll earning snapshots (see spec 0007).
- Added employee time off requests, manager and administrator decisions, cancellation, workflow history, replay receipts, attendance leave markers, filters, cursor pagination, responsive detail views, and production feature shutdown (see spec 0008).

### Fixed
- Protected payroll processing from stale workers releasing replacement leases and preserved confirmation idempotency across expired tokens (see spec 0005).
- Refreshed payroll run status when delayed or recovery eligibility changes, and made employee profile linking explicit and organization scoped (see spec 0005).
- Fixed time off authorization, organization isolation, inactive identity handling, immutable workflow history, concurrent transitions, and safe error states (see spec 0008).
