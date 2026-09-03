"use client";

export default function Error({ reset }) {
  return <main className="mx-auto flex min-h-64 max-w-2xl flex-col justify-center gap-4" role="alert"><h1 className="text-3xl font-semibold tracking-tight">Privacy settings are temporarily unavailable.</h1><p className="text-muted-foreground">Refresh and try again. No privacy preference or request was changed.</p><button className="w-fit underline underline-offset-4" onClick={() => reset()} type="button">Try again</button></main>;
}
