"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { EntryStartup } from "@/app/components/auth/EntryStartup";
import { useEntrySession } from "@/app/components/auth/useEntrySession";

export default function HomeEntry() {
  const router = useRouter();
  const entrySession = useEntrySession();

  useEffect(() => {
    if (entrySession === "authenticated") router.replace("/dashboard");
  }, [entrySession, router]);

  if (entrySession !== "unauthenticated") return <EntryStartup />;

  return (
    <main>
      <div className="heroCard publicHero">
        <div>
          <p className="eyebrow">Clay Performance Lab</p>
          <h2>Your clay shooting results, schemes, and training insights in one place.</h2>
          <p>Plan sessions, view schemes, log misses, save results, and track your progress over time.</p>
        </div>
        <div className="btns heroActions">
          <Link href="/login?signup=1" className="button">
            Get started
          </Link>
          <Link href="/login" className="button secondary">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
