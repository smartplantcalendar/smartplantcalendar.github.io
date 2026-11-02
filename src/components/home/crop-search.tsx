"use client";

import { ArrowLeft, MapPin, Search, SearchX, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useId, useMemo, useState } from "react";
import { CropImage } from "@/components/brand/crop-image";
import { useAppData } from "@/components/providers/app-data-provider";
import { ambiguityFor } from "@/domain/ambiguous-names";
import { buildCropIndex, normalizeArabic, searchCropIndex } from "@/domain/crop-search";
import { countryOfLocation } from "@/domain/location";
import { METHOD_SHORT_LABELS } from "@/domain/labels";
import { describeSimpleStatus, mainWindowsForZone, simplePlantingStatus, type SimpleStatusKind } from "@/domain/planting-windows";
import type { ClimateZone, Crop } from "@/domain/types";
import { formatMonthRange } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The fields the search needs; keeps the page payload small. */
export type SearchCrop = Pick<Crop, "slug" | "name" | "otherNames" | "scientificName" | "imageUrl" | "imageAlt" | "windows" | "propagation" | "primaryMethod">;

const MAX_RESULTS = 6;

/** Distinct month ranges of a crop's windows for one zone, e.g. "آذار – أيار، أيلول – تشرين الأول". */
/** «زراعة الأشتال في الأرض: آذار – نيسان» for the crop's main method in the zone (never nursery dates). */
function windowText(crop: SearchCrop, zone: ClimateZone, country: string | null): string | null {
  const windows = mainWindowsForZone(crop, zone, country);
  if (!windows.length) return null;
  const ranges = [...new Set(windows.map((w) => formatMonthRange(w.startMonth, w.endMonth)))];
  return `${METHOD_SHORT_LABELS[windows[0].method]}: ${ranges.join("، ")}`;
}

const STATUS_TONE: Record<SimpleStatusKind, string> = {
  now: "bg-brand-100 text-brand-700",
  soon: "bg-info-soft text-info",
  later: "bg-surface-muted text-muted-foreground",
  no_data: "border border-dashed border-border-strong text-muted-foreground",
};

/** The dialect/other name that matched, e.g. «الجبس» for البطيخ. */
function matchedAlias(crop: SearchCrop, query: string): string | null {
  const q = normalizeArabic(query);
  if (!q || normalizeArabic(crop.name).includes(q)) return null;
  return crop.otherNames?.find((n) => normalizeArabic(n).includes(q)) ?? null;
}

/**
 * Big crop search for the home page (ARIA combobox). Results come from the
 * real crop catalogue and show the planting months for the saved zone.
 */
export function CropSearch({ crops, ref }: { crops: SearchCrop[]; ref?: React.Ref<HTMLInputElement> }) {
  const router = useRouter();
  const { location, today, mode } = useAppData();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const deferred = useDeferredValue(query);
  const listId = useId();
  const hintId = useId();

  const index = useMemo(() => buildCropIndex(crops), [crops]);
  const ambiguous = ambiguityFor(deferred);
  const results = useMemo(() => (deferred.trim() ? searchCropIndex(index, deferred, MAX_RESULTS) : []), [index, deferred]);
  const showList = open && query.trim().length > 0;
  const zone = mode !== "loading" ? location?.zone ?? null : null;
  const country = countryOfLocation(location);

  const goTo = (slug: string) => {
    setOpen(false);
    router.push(`/crops/${slug}/`);
  };
  const goToAll = () => {
    setOpen(false);
    router.push(`/crops/?q=${encodeURIComponent(query.trim())}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (results.length ? (i + 1) % results.length : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (results.length ? (i <= 0 ? results.length - 1 : i - 1) : -1));
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      } else {
        setQuery("");
      }
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    const picked = active >= 0 ? results[active] : results.length === 1 ? results[0] : undefined;
    if (picked) goTo(picked.slug);
    else goToAll();
  };

  return (
    <form role="search" aria-label="البحث عن محصول" onSubmit={onSubmit} className="relative">
      <div
        className={cn(
          "flex items-center gap-2 rounded-2xl border-2 border-brand-600/25 bg-surface p-1.5 shadow-md transition-[border-color,box-shadow] duration-200 focus-within:border-brand-600 focus-within:shadow-lg",
        )}
      >
        <Search className="ms-3 size-6 shrink-0 text-brand-600" aria-hidden />
        <input
          ref={ref}
          id="crop-search"
          type="text"
          role="combobox"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          aria-label="ابحث عن محصول"
          aria-describedby={hintId}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          placeholder="اكتب اسم المحصول…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="h-12 min-w-0 flex-1 bg-transparent text-lg font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-subtle-foreground focus-visible:outline-none sm:h-14 sm:text-xl"
        />
        {query ? (
          <button
            type="button"
            aria-label="مسح البحث"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery("");
              setActive(-1);
            }}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-subtle-foreground hover:bg-surface-muted hover:text-foreground"
          >
            <X className="size-5" aria-hidden />
          </button>
        ) : null}
        <button
          type="submit"
          className="h-12 shrink-0 rounded-xl bg-primary px-4 text-base font-bold text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.97] sm:h-14 sm:px-6 sm:text-lg"
        >
          ابحث
        </button>
      </div>
      <p id={hintId} className="sr-only">
        اكتب اسم المحصول ثم اختر من النتائج بالأسهم، أو اضغط زر البحث.
      </p>

      <p className="sr-only" aria-live="polite">
        {showList ? (results.length ? `${results.length} نتائج` : "لا توجد نتائج") : ""}
      </p>

      {showList ? (
        <div
          className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-border bg-surface shadow-lg animate-fade-in"
          onMouseDown={(e) => e.preventDefault()}
        >
          {ambiguous ? (
            <p className="border-b border-border bg-info-soft px-4 py-2.5 text-sm font-bold text-info" data-testid="ambiguous-name">
              «{ambiguous.name}» اسم لأكثر من محصول. اختر المقصود:
            </p>
          ) : null}
          <ul id={listId} role="listbox" aria-label="نتائج البحث" className="max-h-[min(60vh,26rem)] overflow-y-auto p-1.5">
            {results.map((crop, i) => {
              const hint = ambiguous?.options.find((o) => o.slug === crop.slug)?.hint;
              const months = zone ? windowText(crop, zone, country) : null;
              const status = zone ? simplePlantingStatus(crop, zone, today, country) : null;
              const alias = matchedAlias(crop, deferred);
              return (
                <li
                  key={crop.slug}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  data-status={status?.kind ?? "no_location"}
                  onClick={() => goTo(crop.slug)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl p-2.5 transition-colors",
                    i === active ? "bg-accent" : "hover:bg-surface-muted",
                  )}
                >
                  <CropImage crop={crop} className="size-14 shrink-0 rounded-xl" sizes="56px" />
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-bold">
                      {crop.name}
                      {alias ? <span className="ms-1.5 text-sm font-semibold text-muted-foreground">({alias})</span> : null}
                    </p>
                    {hint ? <p className="text-sm font-semibold text-foreground">{hint}</p> : null}
                    {status ? (
                      <>
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-bold", status.general && status.kind === "now" ? "bg-warning-soft text-warning" : STATUS_TONE[status.kind])}>
                          {describeSimpleStatus(status).title}
                        </span>
                        {months ? <p className="text-sm text-muted-foreground">{months}</p> : null}
                      </>
                    ) : (
                      <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="mt-1 size-4 shrink-0 text-subtle-foreground" aria-hidden />
                        <span>حدّد منطقتك لمعرفة موعد زراعته</span>
                      </p>
                    )}
                  </div>
                  <ArrowLeft className="size-5 shrink-0 text-subtle-foreground" aria-hidden />
                </li>
              );
            })}
          </ul>
          {results.length === 0 ? (
            <div className="flex items-start gap-3 p-4">
              <SearchX className="mt-1 size-6 shrink-0 text-subtle-foreground" aria-hidden />
              <div>
                <p className="font-bold">لا يوجد محصول بهذا الاسم في الدليل بعد</p>
                <p className="text-sm text-muted-foreground">جرّب اسمًا آخر أو تهجئة أقصر، مثل «بندورة» أو «خس».</p>
              </div>
            </div>
          ) : null}
          <Link
            href="/crops/"
            className="flex items-center justify-between gap-2 border-t border-border bg-surface-muted px-4 py-3 text-sm font-bold text-brand-700 hover:bg-accent"
          >
            تصفّح كل المحاصيل في الدليل
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
        </div>
      ) : null}
    </form>
  );
}
