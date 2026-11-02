import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/env";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { StorageNotice } from "@/components/layout/storage-notice";
import { PlannerWizard } from "@/components/planner/planner-wizard";
import { Skeleton } from "@/components/ui/skeleton";
import { getRegionZoneOverrides } from "@/services/content";
import { isPlannable } from "@/domain/crop-search";
import { getCrops } from "@/services/crops";


export const metadata: Metadata = {
  title: "مولّد الخطط الزراعية",
  description: "أنشئ خطة زراعية شخصية خطوة بخطوة: حدد موقعك ومساحتك ومحصولك وتاريخ الزراعة، واحصل على مهام الري والتسميد والحصاد في رزنامتك.",
  alternates: { canonical: absoluteUrl("/planner") },
};

export default async function PlannerPage() {
  const [{ crops }, zoneOverrides] = await Promise.all([getCrops(), getRegionZoneOverrides()]);
  return (
    <div className="container-page flex flex-col gap-6 py-10 sm:py-12">
      <PageHeader
        eyebrow="مولّد الخطط الزراعية"
        title="أنشئ خطتك الزراعية"
        description="خمس خطوات قصيرة، وتحصل على جدول مهام مرتبط بتاريخ زراعتك ومنطقتك. الجدول إرشادي ويمكنك تعديله في أي وقت."
      />
      <StorageNotice />
      <Suspense fallback={<Skeleton className="h-[32rem] w-full rounded-2xl" />}>
        <PlannerWizard
          crops={crops.filter(isPlannable).map((c) => ({ ...c, guide: [], summary: "", sourceNote: "", wateringSummary: "", phases: [] }))}
          zoneOverrides={zoneOverrides}
        />
      </Suspense>
    </div>
  );
}
