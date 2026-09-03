import Link from "next/link";
import { ArrowRightIcon, ShieldCheckIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadPrivacyNotice, parseNotice } from "@/content/privacy/notice";

export const metadata = { title: "Privacy notice | HR Pulse" };

function NoticeBlocks({ content }) {
  return parseNotice(content).map((block, index) => {
    if (block.type === "heading") return <section className="space-y-2" key={index}><h2 className="font-heading text-lg font-semibold">{block.value}</h2>{block.lines?.map((line) => <p className="leading-7 text-muted-foreground" key={line}>{line}</p>)}</section>;
    if (block.type === "list") return <ul className="list-disc space-y-2 pl-5 leading-7 text-muted-foreground" key={index}>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>;
    return <p className="leading-7 text-muted-foreground" key={index}>{block.value}</p>;
  });
}

export default async function PrivacyPage() {
  const notice = await loadPrivacyNotice("privacy");
  return <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6 sm:py-14">
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4"><Link className="text-sm font-semibold" href="/">HR Pulse</Link><nav aria-label="Legal notices" className="flex gap-4 text-sm"><Link className="underline underline-offset-4" href="/terms">Terms</Link><Link className="underline underline-offset-4" href="/privacy">Privacy</Link></nav></div>
      <Card>
        <CardHeader className="gap-4 border-b">
          <div className="flex items-start justify-between gap-4"><div className="flex gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><ShieldCheckIcon aria-hidden="true" /></span><div><CardTitle as="h1" className="text-2xl">{notice.title}</CardTitle><CardDescription className="mt-1">Internal policy for the HR Pulse workspace.</CardDescription></div></div><Badge variant="outline">{notice.version}</Badge></div>
          <p className="text-sm text-muted-foreground">Effective {notice.effectiveDate}</p>
        </CardHeader>
        <CardContent className="space-y-6 pt-6"><NoticeBlocks content={notice.content} /></CardContent>
      </Card>
      <p className="flex items-center justify-between gap-3 text-sm text-muted-foreground"><span>Questions about your workspace? Start with your administrator.</span><Link className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4" href="/terms">Read the terms <ArrowRightIcon aria-hidden="true" className="size-4" /></Link></p>
    </div>
  </main>;
}
