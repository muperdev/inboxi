import { Suspense } from "react";
import { MailApp, MailFallback } from "@/components/mail-app";

export default function Home() {
  return (
    <Suspense fallback={<MailFallback />}>
      <MailApp />
    </Suspense>
  );
}
