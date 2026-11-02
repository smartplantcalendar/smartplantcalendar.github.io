"use client";

import { ShieldCheck } from "lucide-react";
import { useAppData } from "@/components/providers/app-data-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { LocationPicker } from "./location-picker";

export function LocationPageView() {
  const { mode } = useAppData();
  if (mode === "loading") {
    return (
      <div className="flex flex-col gap-4" aria-hidden>
        <Skeleton className="h-12 w-48 rounded-xl" />
        <Skeleton className="h-6 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-2xl" />
      </div>
    );
  }
  return (
    <>
      <LocationPicker />
      <details className="rounded-2xl bg-surface-muted p-4 text-sm leading-7 text-muted-foreground">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-foreground [&::-webkit-details-marker]:hidden">
          <ShieldCheck className="size-4 text-brand-600" aria-hidden /> خصوصية موقعك
        </summary>
        <ul className="mt-2 list-disc space-y-1 ps-5">
          <li>التحديد التلقائي يتم داخل جهازك، ولا نرسل موقعك إلى أي خدمة قبل موافقتك.</li>
          <li>نرسل للطقس موقعًا تقريبيًا (نحو 1 كم) فقط.</li>
          <li>يُحفظ موقعك في هذا المتصفح، أو في حسابك إن كنت مسجلًا، ولا يراه غيرك.</li>
          <li>يمكنك حذف الموقع المحفوظ في أي وقت من «تغيير» ثم «خيارات متقدمة».</li>
        </ul>
      </details>
    </>
  );
}
