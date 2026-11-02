import type { Metadata } from "next";
import { LocationPageView } from "@/components/location/location-page-view";

export const metadata: Metadata = { title: "موقع أرضي", robots: { index: false } };

export default function LocationPage() {
  return (
    <div className="container-page flex max-w-2xl flex-col gap-6 py-6 sm:py-10">
      <LocationPageView />
    </div>
  );
}
