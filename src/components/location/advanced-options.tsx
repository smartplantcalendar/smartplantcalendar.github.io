"use client";

import { Map as MapIcon, Settings2, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Label, Select } from "@/components/ui/form-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { COUNTRIES, regionsForCountry } from "@/data/regions";
import { formatAccuracy, formatCoordinate, type ZoneSuggestion } from "@/domain/geo";
import { CLIMATE_ZONE_DESCRIPTIONS, CLIMATE_ZONE_LABELS, COUNTRY_LABELS } from "@/domain/labels";
import { LOCATION_SOURCE_LABELS, type LocationDraft } from "@/domain/location";
import { CLIMATE_ZONES, type ClimateZone } from "@/domain/types";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const MapPicker = dynamic(() => import("./map-picker").then((m) => m.MapPicker), {
  ssr: false,
  loading: () => <Skeleton className="h-72 w-full rounded-xl" />,
});

/**
 * «خيارات متقدمة»: everything a farmer does not need by default — the map,
 * the short town list (works offline), the technical details, the climate
 * zone and the country.
 */
export function AdvancedOptions(props: {
  draft: LocationDraft | null;
  accuracyM: number | null;
  elevationM: number | null;
  nearestName: string | null;
  zone: ClimateZone | null;
  suggestion: ZoneSuggestion | null;
  onZone: (z: ClimateZone) => void;
  country: string | null;
  detectedCountry: string | null;
  onCountry: (c: string | null) => void;
  consent: boolean;
  onConsent: (v: boolean) => void;
  onPickTown: (regionId: string) => void;
  onPickMap: (p: { latitude: number; longitude: number }) => void;
  onUseMapPoint: () => void;
  hasSaved: boolean;
  onDelete: () => void;
  storageHint: string;
}) {
  const { draft } = props;
  const [listCountry, setListCountry] = useState("PS");
  const [showMap, setShowMap] = useState(false);

  return (
    <details className="group rounded-2xl border border-border bg-surface" data-testid="advanced-options">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 px-4 font-bold [&::-webkit-details-marker]:hidden">
        <Settings2 className="size-5 text-subtle-foreground" aria-hidden />
        خيارات متقدمة
        <span className="ms-auto text-sm font-semibold text-muted-foreground group-open:hidden">الخريطة، قائمة المدن، التفاصيل</span>
      </summary>
      <div className="flex flex-col gap-6 border-t border-border p-4">
        {/* Map */}
        <section aria-labelledby="adv-map" className="flex flex-col gap-3">
          <h3 id="adv-map" className="font-bold">اختر مكان أرضك على الخريطة</h3>
          {props.consent ? (
            showMap ? (
              <>
                <p className="text-sm text-muted-foreground">اضغط على مكان أرضك أو اسحب الدبوس، ثم اضغط «استخدم هذا المكان».</p>
                <MapPicker value={draft} accuracyM={props.accuracyM} onChange={props.onPickMap} />
                <Button className="self-start" disabled={!draft || draft.source !== "map"} onClick={props.onUseMapPoint}>
                  استخدم هذا المكان
                </Button>
              </>
            ) : (
              <Button variant="outline" className="self-start" onClick={() => setShowMap(true)}>
                <MapIcon /> افتح الخريطة
              </Button>
            )
          ) : (
            <label className="flex items-start gap-3 rounded-xl bg-surface-muted p-3 text-sm leading-7">
              <Checkbox className="mt-1.5" checked={props.consent} onChange={(e) => props.onConsent(e.target.checked)} />
              <span>أوافق على تحميل الخريطة من OpenStreetMap (يكشف لها المنطقة المعروضة) وعلى إرسال المكان الذي أختاره لمعرفة اسمه وارتفاعه.</span>
            </label>
          )}
        </section>

        {/* Town list */}
        <section aria-labelledby="adv-list" className="flex flex-col gap-3">
          <h3 id="adv-list" className="font-bold">اختر أقرب مدينة من القائمة</h3>
          <p className="text-sm text-muted-foreground">قائمة مختصرة بالمدن ومراكز المحافظات، وتعمل دون إنترنت. للقرى، الأفضل التحديد التلقائي أو البحث.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adv-country">الدولة</Label>
              <Select id="adv-country" value={listCountry} onChange={(e) => setListCountry(e.target.value)}>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adv-city">المدينة</Label>
              <Select id="adv-city" value="" onChange={(e) => e.target.value && props.onPickTown(e.target.value)}>
                <option value="" disabled>اختر المدينة</option>
                {regionsForCountry(listCountry).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </div>
          </div>
        </section>

        {draft ? (
          <>
            {/* Technical details */}
            <section aria-labelledby="adv-tech" className="flex flex-col gap-2">
              <h3 id="adv-tech" className="font-bold">تفاصيل المكان</h3>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold text-subtle-foreground">الإحداثيات</dt>
                  <dd dir="ltr" className="text-end font-mono text-xs" data-testid="location-coords">
                    {draft.latitude.toFixed(5)}, {draft.longitude.toFixed(5)}
                  </dd>
                  <dd className="text-xs text-subtle-foreground">
                    {formatCoordinate(draft.latitude, "lat")}، {formatCoordinate(draft.longitude, "lon")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-subtle-foreground">طريقة التحديد</dt>
                  <dd>{LOCATION_SOURCE_LABELS[draft.source]}</dd>
                  {props.accuracyM != null ? (
                    <dd className="text-xs" data-testid="location-accuracy">الدقة كما أبلغ عنها جهازك: {formatAccuracy(props.accuracyM)}</dd>
                  ) : draft.source !== "gps" ? (
                    <dd className="text-xs text-subtle-foreground">مكان القرية أو المدينة المختارة، وليس نقطة أرضك بالضبط.</dd>
                  ) : null}
                </div>
                <div>
                  <dt className="text-xs font-semibold text-subtle-foreground">الارتفاع</dt>
                  <dd>
                    {props.elevationM != null
                      ? `${formatNumber(Math.round(props.elevationM), 0)} م ${props.elevationM < 0 ? "(تحت سطح البحر)" : "فوق سطح البحر"}`
                      : "غير متوفر"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-subtle-foreground">أقرب مدينة في قائمتنا (للمرجع فقط)</dt>
                  <dd>{props.nearestName ?? "—"}</dd>
                </div>
              </dl>
            </section>

            {/* Climate zone */}
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 font-bold">المنطقة المناخية</legend>
              {props.suggestion ? (
                <p className="text-sm leading-7 text-muted-foreground">
                  المقترح: <strong className="text-foreground">{CLIMATE_ZONE_LABELS[props.suggestion.zone]}</strong> — {props.suggestion.reason}
                </p>
              ) : null}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {CLIMATE_ZONES.map((z) => (
                  <label
                    key={z}
                    className={cn("flex cursor-pointer gap-3 rounded-xl border p-3", props.zone === z ? "border-primary bg-accent/50" : "border-border hover:bg-surface-muted")}
                  >
                    <input type="radio" name="loc-zone" value={z} checked={props.zone === z} onChange={() => props.onZone(z)} className="mt-1.5 accent-[var(--primary)]" />
                    <span>
                      <span className="block font-semibold">
                        {CLIMATE_ZONE_LABELS[z]}
                        {props.suggestion?.zone === z ? <Badge className="ms-2">مقترح</Badge> : null}
                      </span>
                      <span className="block text-xs leading-6 text-muted-foreground">{CLIMATE_ZONE_DESCRIPTIONS[z]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Country */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adv-loc-country">البلد</Label>
              <Select id="adv-loc-country" value={props.country ?? ""} onChange={(e) => props.onCountry(e.target.value || null)}>
                <option value="">
                  {props.detectedCountry ? `تلقائي: ${COUNTRY_LABELS[props.detectedCountry]}` : "تلقائي: غير مؤكد"}
                </option>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </Select>
              <p className="text-xs text-subtle-foreground">نستعمل المواعيد الخاصة ببلد ما فقط إذا تأكدنا أن أرضك فيه.</p>
            </div>
          </>
        ) : null}

        <div className="flex flex-col gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
          <p>{props.storageHint} لا نضع موقعك في روابط الصفحات، ولا نستخدم أدوات تحليلات.</p>
          {props.hasSaved ? (
            <Button variant="danger-ghost" className="self-start" onClick={props.onDelete}>
              <Trash2 /> حذف الموقع المحفوظ
            </Button>
          ) : null}
        </div>
      </div>
    </details>
  );
}
