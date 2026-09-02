"use client";

export default function SelfServiceError({ reset }) {
  return <main role="alert" className="flex min-h-64 flex-col items-start justify-center gap-4"><h1 className="text-3xl font-semibold tracking-tight">Self service is temporarily unavailable.</h1><p className="max-w-xl text-muted-foreground">Refresh the page and try again. Your employee records were not changed.</p><button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={() => reset()} type="button">Try again</button></main>;
}
