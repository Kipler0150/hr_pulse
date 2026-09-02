"use client";

import { useState } from "react";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function PayslipDownload({ payslipId, label = "Download payslip" }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  async function download() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/payslips/${payslipId}/download`, { cache: "no-store" });
      if (!response.ok) throw new Error("The payslip link could not be created.");
      const result = await response.json();
      window.location.assign(result.url);
    } catch (downloadError) {
      setError(downloadError.message);
    } finally { setLoading(false); }
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <Button disabled={loading} onClick={download} type="button" variant="outline">{loading ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}{loading ? "Preparing link" : label}</Button>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
