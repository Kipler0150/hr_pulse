import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadPrivacyNotice, parseNotice } from "@/content/privacy/notice";

export const metadata = { title: "Terms of use | HR Pulse" };

export default async function TermsPage() {
  const notice = await loadPrivacyNotice("terms");
  return <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6 sm:py-14">
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4"><Link className="text-sm font-semibold" href="/">HR Pulse</Link><nav aria-label="Legal notices" className="flex gap-4 text-sm"><Link className="underline underline-offset-4" href="/terms">Terms</Link><Link className="underline underline-offset-4" href="/privacy">Privacy</Link></nav></div>
      <Card>
        <CardHeader className="gap-4 border-b"><div className="flex items-start justify-between gap-4"><div><CardTitle as="h1" className="text-2xl">{notice.title}</CardTitle><CardDescription className="mt-1">Internal policy for the HR Pulse workspace.</CardDescription></div><Badge variant="outline">{notice.version}</Badge></div><p className="text-sm text-muted-foreground">Effective {notice.effectiveDate}</p></CardHeader>
        <CardContent className="space-y-6 pt-6">{parseNotice(notice.content).map((block, index) => block.type === "heading" ? <section className="space-y-2" key={index}><h2 className="font-heading text-lg font-semibold">{block.value}</h2>{block.lines?.map((line) => <p className="leading-7 text-muted-foreground" key={line}>{line}</p>)}</section> : block.type === "list" ? <ul className="list-disc space-y-2 pl-5 leading-7 text-muted-foreground" key={index}>{block.items.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="leading-7 text-muted-foreground" key={index}>{block.value}</p>)}</CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">See the <Link className="font-medium underline underline-offset-4" href="/privacy">privacy notice</Link> for data handling and retention.</p>
    </div>
  </main>;
}
