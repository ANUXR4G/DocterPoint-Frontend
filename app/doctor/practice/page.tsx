"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DOCTOR_SUBSCRIPTION_HREF,
  legacyPracticeTabHref,
} from "@/lib/doctorPracticeTabs";

export default function ProviderPracticePage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm opacity-70">Loading practice…</p>}>
      <PracticeLegacyRedirect />
    </Suspense>
  );
}

function PracticeLegacyRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const subscribePlan = searchParams.get("subscribePlan");

  useEffect(() => {
    if (tabParam === "billing") {
      const qs = subscribePlan
        ? `?subscribePlan=${encodeURIComponent(subscribePlan)}`
        : "";
      router.replace(`${DOCTOR_SUBSCRIPTION_HREF}${qs}`);
      return;
    }
    const target = legacyPracticeTabHref(tabParam || "calendar");
    const onboarded = searchParams.get("onboarded");
    router.replace(onboarded ? `${target}&onboarded=${onboarded}` : target);
  }, [router, searchParams, subscribePlan, tabParam]);

  return (
    <p className="p-6 text-sm opacity-70">Opening practice settings…</p>
  );
}
