"use client";

import {
  ArrowLeft,
  CircleCheck,
  LocateFixed,
  MapPin,
  MapPinned,
  PencilLine,
  RotateCcw,
  Search,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAppData } from "@/components/providers/app-data-provider";
import { Button } from "@/components/ui/button";
import { Alert, Spinner } from "@/components/ui/feedback";
import { Input } from "@/components/ui/form-controls";
import { COUNTRIES, findRegion, nearestRegion } from "@/data/regions";
import { accuracyLevel, isInLevant, suggestZone } from "@/domain/geo";
import {
  buildSavedLocation,
  countryOfLocation,
  normalizeCountry,
  type LabelSource,
  type LocationDraft,
  type SavedLocation,
  type ZoneSource,
} from "@/domain/location";
import type { ClimateZone } from "@/domain/types";
import { fetchElevation } from "@/lib/geo/elevation";
import { GPS_ERROR_MESSAGES, GpsError, locateHighAccuracy, type GpsFix } from "@/lib/geo/gps";
import { GeocodeError, reverseGeocode, searchPlaces, type Place } from "@/lib/geo/nominatim";
import { cn } from "@/lib/utils";
import { AdvancedOptions } from "./advanced-options";

type Step = "start" | "locating" | "consent" | "naming" | "confirm" | "fix-name" | "search" | "saved";

/** What we know about the place name, independently of the coordinates. */
interface NameInfo {
  /** Village/town name, or null when unknown. */
  locality: string | null;
  district: string | null;
  kind: Place["localityKind"] | null;
  source: LabelSource;
  countryCode: string | null;
  /** Why the name is unknown, for the message shown. */
  reason?: "no_consent" | "not_found" | "offline";
}

const BIG = "h-14 w-full rounded-2xl text-lg font-bold sm:w-auto sm:px-8";

function labelOf(n: NameInfo | null): string {
  if (!n?.locality) return "";
  return [n.locality, n.district && n.district !== n.locality ? n.district : null].filter(Boolean).join("، ");
}

function fromPlace(p: Place, source: LabelSource): NameInfo {
  return {
    locality: p.locality ?? null,
    district: p.district ?? null,
    kind: p.localityKind ?? null,
    source: p.locality ? source : "none",
    countryCode: normalizeCountry(p.countryCode),
    reason: p.locality ? undefined : "not_found",
  };
}

/**
 * Farmer-first location flow: one big button, then «هل هذه قريتك؟».
 * Technical details (map, town list, coordinates, elevation, climate zone,
 * country) live in «خيارات متقدمة». Coordinates never leave the device before
 * the user agrees; the place search sends only the typed text, on submit.
 */
export function LocationPicker({
  onConfirmed,
  className,
  showIntro = true,
  startInEdit = false,
}: {
  onConfirmed?: (loc: SavedLocation) => void;
  className?: string;
  /** The «وين أرضك؟» heading (off when embedded in the planner). */
  showIntro?: boolean;
  /** Skip the "already saved" view. */
  startInEdit?: boolean;
}) {
  const { location, setLocation, mode } = useAppData();
  const [step, setStep] = useState<Step>(location && !startInEdit ? "saved" : "start");
  /** Set only after a real save: everywhere, or this device only (account failed). */
  const [justSaved, setJustSaved] = useState<null | { deviceOnly: boolean; accountError?: string }>(null);
  /** A save/delete that failed, kept so the farmer can retry it. */
  const [saveFailure, setSaveFailure] = useState<{ error: string; location: SavedLocation } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [consent, setConsent] = useState<boolean>(location?.externalConsent ?? false);
  const [draft, setDraft] = useState<LocationDraft | null>(null);
  const [gpsFix, setGpsFix] = useState<GpsFix | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [name, setName] = useState<NameInfo | null>(null);
  const [typedName, setTypedName] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<{ status: "idle" | "loading" | "done" | "error"; results: Place[] }>({ status: "idle", results: [] });
  const [manualZone, setManualZone] = useState<ClimateZone | null>(null);
  const [manualCountry, setManualCountry] = useState<string | null>(null);
  const [elevation, setElevation] = useState<{ key: string; value: number | null } | null>(null);
  const [saving, setSaving] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  // Each new step starts at the top of the flow (after a long form, the next
  // step would otherwise open half-scrolled under the header).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const el = rootRef.current;
    if (el && el.getBoundingClientRect().top < 80) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 88, behavior: reduce ? "auto" : "smooth" });
    }
  }, [step]);

  const pointKey = draft ? `${draft.latitude.toFixed(4)},${draft.longitude.toFixed(4)}` : null;
  // Elevation (Open-Meteo, ~100 m rounding) only with consent; set from an async callback.
  useEffect(() => {
    if (!consent || !draft || !pointKey || draft.source === "list") return;
    let cancelled = false;
    fetchElevation(draft).then((value) => {
      if (!cancelled) setElevation({ key: pointKey, value });
    });
    return () => {
      cancelled = true;
    };
  }, [consent, draft, pointKey]);

  const nearest = draft ? nearestRegion(draft.latitude, draft.longitude) : null;
  const gpsAltitude = draft?.source === "gps" && gpsFix?.altitudeM != null && (gpsFix.altitudeAccuracyM ?? 999) <= 30 ? gpsFix.altitudeM : null;
  const elevationM = gpsAltitude ?? (elevation && elevation.key === pointKey ? elevation.value : null);
  const listRegion = draft?.source === "list" && nearest ? nearest : null;
  const suggestion = draft && !listRegion ? suggestZone(draft, elevationM, nearest ? { name: nearest.name, zone: nearest.zone } : null) : null;
  const zone: ClimateZone | null = manualZone ?? listRegion?.zone ?? suggestion?.zone ?? null;
  const zoneSource: ZoneSource = manualZone ? "manual" : listRegion ? "list" : (suggestion?.basis ?? "nearest_town");
  const countryCode = manualCountry ?? name?.countryCode ?? null;
  const detectedCountry = draft ? countryOfLocation({ ...draft, regionId: nearest?.id ?? null, countryCode }) : null;
  const level = draft?.source === "gps" && draft.accuracyM != null ? accuracyLevel(draft.accuracyM) : null;

  function resetFor(next: LocationDraft) {
    setDraft(next);
    setManualZone(null);
    setManualCountry(null);
    setName(null);
    setTypedName("");
  }

  async function lookupName(d: LocationDraft) {
    setStep("naming");
    try {
      const place = await reverseGeocode(d);
      setName(place ? fromPlace(place, "osm") : { locality: null, district: null, kind: null, source: "none", countryCode: null, reason: "not_found" });
    } catch (e) {
      setName({
        locality: null,
        district: null,
        kind: null,
        source: "none",
        countryCode: null,
        reason: e instanceof GeocodeError && e.message === "network" ? "offline" : "not_found",
      });
    }
    setStep("confirm");
  }

  async function runGps() {
    setGpsError(null);
    setStep("locating");
    try {
      const fix = await locateHighAccuracy({ maxWaitMs: 25_000 });
      const d: LocationDraft = { latitude: fix.latitude, longitude: fix.longitude, source: "gps", accuracyM: fix.accuracyM };
      setGpsFix(fix);
      resetFor(d);
      if (consent) await lookupName(d);
      else setStep("consent");
    } catch (e) {
      const kind = e instanceof GpsError ? e.kind : "unavailable";
      setGpsError(GPS_ERROR_MESSAGES[kind]);
      setStep("start");
    }
  }

  async function answerConsent(yes: boolean) {
    if (!draft) return;
    if (yes) {
      setConsent(true);
      await lookupName(draft);
    } else {
      setName({ locality: null, district: null, kind: null, source: "none", countryCode: null, reason: "no_consent" });
      setStep("confirm");
    }
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearch({ status: "loading", results: [] });
    try {
      setSearch({ status: "done", results: await searchPlaces(query) });
    } catch {
      setSearch({ status: "error", results: [] });
    }
  }

  function pickSearchResult(p: Place) {
    resetFor({ latitude: p.latitude, longitude: p.longitude, source: "search", accuracyM: null });
    setName(fromPlace(p, "search"));
    setStep("confirm");
  }

  function pickTown(regionId: string) {
    const r = findRegion(regionId);
    if (!r) return;
    resetFor({ latitude: r.latitude, longitude: r.longitude, source: "list", accuracyM: null });
    setName({ locality: r.name, district: null, kind: "city", source: "list", countryCode: r.countryCode });
    setStep("confirm");
  }

  function pickOnMap(p: { latitude: number; longitude: number }) {
    resetFor({ latitude: p.latitude, longitude: p.longitude, source: "map", accuracyM: null });
  }

  async function save(label: string, labelSource: LabelSource) {
    if (!draft || !zone) return;
    const saved = buildSavedLocation({
      draft,
      label: label || "موقع أرضي",
      labelSource: label ? labelSource : "none",
      countryCode,
      zone,
      zoneSource,
      elevationM,
      externalConsent: consent,
    });
    await persist(saved);
  }

  /** Saves and shows success only when the location is really stored. */
  async function persist(saved: SavedLocation) {
    setSaving(true);
    const res = await setLocation(saved);
    setSaving(false);
    if (!res.ok) {
      setSaveFailure({ error: res.error, location: saved });
      return;
    }
    setSaveFailure(null);
    setDeleteError(null);
    setJustSaved({ deviceOnly: res.data.savedToAccount === false, accountError: res.data.accountError });
    setStep("saved");
    onConfirmed?.(saved);
  }

  async function removeSaved() {
    const res = await setLocation(null);
    if (!res.ok) {
      setDeleteError(res.error);
      toast.error(res.error);
      return;
    }
    setDeleteError(null);
    setJustSaved(null);
    setDraft(null);
    setName(null);
    setStep("start");
    toast.success("تم حذف الموقع المحفوظ");
  }

  const knownLabel = labelOf(name);

  return (
    <div ref={rootRef} className={cn("flex flex-col gap-5", className)}>
      {saveFailure && step !== "saved" ? (
        <Alert tone="danger" title="لم يُحفظ الموقع">
          <span className="block" data-testid="location-save-error">{saveFailure.error}</span>
          <Button size="lg" className="mt-3" disabled={saving} onClick={() => persist(saveFailure.location)}>
            {saving ? <Spinner /> : <RotateCcw />} حاول مرة أخرى
          </Button>
        </Alert>
      ) : null}
      {deleteError ? (
        <Alert tone="danger" title="لم يُحذف الموقع">
          <span className="block" data-testid="location-delete-error">{deleteError}</span>
          <Button size="lg" variant="outline" className="mt-3" onClick={removeSaved}>
            <RotateCcw /> حاول مرة أخرى
          </Button>
        </Alert>
      ) : null}
      {step === "saved" && location ? (
        <section key="saved" aria-labelledby="loc-saved" className="loc-step flex flex-col gap-4 rounded-3xl border border-border bg-surface p-5 shadow-xs sm:p-7">
          {justSaved && !justSaved.deviceOnly ? (
            <p role="status" className="flex items-center gap-2 text-lg font-extrabold text-brand-700">
              <CircleCheck className="size-6" aria-hidden /> تم حفظ موقع أرضك بنجاح
            </p>
          ) : null}
          {justSaved?.deviceOnly ? (
            <Alert tone="warning" title="حُفظ موقع أرضك على هذا الجهاز فقط">
              <span className="block" data-testid="location-device-only">
                لم نتمكن من حفظه في حسابك{justSaved.accountError ? ` (${justSaved.accountError})` : ""}. سيبقى على هذا الجهاز، ولن يظهر على أجهزتك الأخرى حتى ينجح الحفظ في الحساب.
              </span>
              <Button size="lg" variant="outline" className="mt-3" disabled={saving} onClick={() => persist(location)}>
                {saving ? <Spinner /> : <RotateCcw />} أعد المحاولة للحفظ في حسابك
              </Button>
            </Alert>
          ) : null}
          <div>
            <h2 id="loc-saved" className="text-sm font-bold text-muted-foreground">أرضك في</h2>
            <p className="mt-1 flex items-center gap-2 text-2xl font-extrabold" data-testid="location-saved-name">
              <MapPin className="size-6 shrink-0 text-brand-600" aria-hidden />
              {location.label}
            </p>
            {countryOfLocation(location) == null ? (
              <p className="mt-2 text-sm text-muted-foreground">لم نتأكد من البلد لهذا الموقع، لذلك لن نعرض مواعيد خاصة ببلد معيّن. يمكنك تحديده من «تغيير» ثم «خيارات متقدمة».</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className={BIG}>
              <Link href="/recommendations/">
                اعرف ماذا تزرع الآن <ArrowLeft />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className={BIG}
              onClick={() => {
                setJustSaved(null);
                setStep("start");
              }}
            >
              <PencilLine /> تغيير
            </Button>
          </div>
        </section>
      ) : null}

      {step === "start" ? (
        <section key="start" aria-labelledby="loc-title" className="loc-step flex flex-col gap-5">
          {showIntro ? (
            <div className="space-y-2">
              <h1 id="loc-title" className="text-4xl font-extrabold">وين أرضك؟</h1>
              <p className="text-lg text-muted-foreground">حدد موقع أرضك حتى نعرف مواعيد الزراعة المناسبة لمنطقتك.</p>
            </div>
          ) : (
            <h2 id="loc-title" className="sr-only">تحديد موقع الأرض</h2>
          )}
          <Button size="lg" className={cn(BIG, "h-16 text-xl")} onClick={runGps}>
            <LocateFixed className="!size-6" /> حدد موقعي تلقائيًا
          </Button>
          <Button variant="link" className="h-auto self-start text-base font-bold" onClick={() => setStep("search")}>
            أو ابحث عن قريتك بالاسم
          </Button>
          <p className="rounded-2xl bg-surface-muted p-4 text-sm leading-7 text-muted-foreground">
            <strong className="text-foreground">لست في أرضك الآن؟</strong> التحديد التلقائي يأخذ مكانك الحالي. إن كانت أرضك في مكان آخر، ابحث عن قريتها بالاسم أو اخترها على الخريطة من «خيارات متقدمة».
          </p>
          {gpsError ? (
            <Alert tone="warning" title="تعذّر تحديد الموقع">
              <span className="block">{gpsError}</span>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => setStep("search")}>
                <Search /> ابحث عن قريتك بالاسم
              </Button>
            </Alert>
          ) : null}
        </section>
      ) : null}

      {step === "locating" ? (
        <section key="locating" role="status" aria-live="polite" className="loc-step flex flex-col items-center gap-5 rounded-3xl border border-border bg-surface px-5 py-10 text-center">
          <span className="relative flex size-24 items-center justify-center">
            <span className="loc-pulse absolute inset-0 rounded-full bg-brand-100" aria-hidden />
            <span className="loc-pulse loc-pulse-2 absolute inset-3 rounded-full bg-brand-100" aria-hidden />
            <span className="relative flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
              <MapPin className="size-7" aria-hidden />
            </span>
          </span>
          <div>
            <p className="text-xl font-extrabold">جارٍ تحديد موقعك…</p>
            <p className="mt-1 text-sm text-muted-foreground">قد يستغرق ذلك حتى نصف دقيقة. يساعد الوقوف في مكان مكشوف.</p>
          </div>
        </section>
      ) : null}

      {step === "consent" ? (
        <section key="consent" aria-labelledby="loc-consent" className="loc-step flex flex-col gap-4 rounded-3xl border border-border bg-surface p-5 sm:p-7">
          <p className="flex items-center gap-2 font-bold text-brand-700">
            <CircleCheck className="size-5" aria-hidden /> حددنا المكان
          </p>
          <h2 id="loc-consent" className="text-2xl font-extrabold">نعرف اسم قريتك؟</h2>
          <p className="text-base leading-8 text-muted-foreground">
            لمعرفة اسم قريتك نرسل موقعك إلى خدمة الخرائط المفتوحة (OpenStreetMap). ونرسل للطقس موقعًا تقريبيًا فقط.
          </p>
          <details className="rounded-xl bg-surface-muted p-3 text-sm leading-7 text-muted-foreground">
            <summary className="cursor-pointer font-bold text-foreground">التفاصيل</summary>
            <ul className="mt-2 list-disc space-y-1 ps-5">
              <li>بموافقتك نرسل الإحداثيات إلى OpenStreetMap لمعرفة اسم المكان وعرض الخريطة، وإلى Open-Meteo لمعرفة الارتفاع (مقرّبة نحو 100 م) والطقس (مقرّبة نحو 1 كم).</li>
              <li>دون الموافقة يبقى موقعك على جهازك فقط، ويمكنك كتابة اسم قريتك بنفسك.</li>
              <li>لا نستخدم أدوات تحليلات، ولا نضع موقعك في روابط الصفحات.</li>
            </ul>
          </details>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" className={BIG} onClick={() => answerConsent(true)}>
              <ShieldCheck /> نعم، اعرف اسم قريتي
            </Button>
            <Button variant="outline" size="lg" className={BIG} onClick={() => answerConsent(false)}>
              لا، سأكتب الاسم بنفسي
            </Button>
          </div>
        </section>
      ) : null}

      {step === "naming" ? (
        <section key="naming" role="status" aria-live="polite" className="loc-step flex items-center gap-3 rounded-3xl border border-border bg-surface p-6">
          <Spinner className="size-6" />
          <p className="text-lg font-bold">نبحث عن اسم قريتك…</p>
        </section>
      ) : null}

      {step === "confirm" && draft ? (
        <section key="confirm" aria-labelledby="loc-confirm" className="loc-step flex flex-col gap-4 rounded-3xl border border-border bg-surface p-5 shadow-xs sm:p-7">
          {knownLabel ? (
            <>
              <div>
                <p className="text-sm font-bold text-muted-foreground">{draft.source === "gps" ? "موقعك الآن في" : "المكان المختار"}</p>
                <p className="mt-1 flex items-center gap-2 text-3xl font-extrabold" data-testid="location-label">
                  <MapPin className="size-7 shrink-0 text-brand-600" aria-hidden />
                  {name?.locality}
                </p>
                {name?.district && name.district !== name.locality ? (
                  <p className="ms-9 text-lg text-muted-foreground" data-testid="location-district">{name.district}</p>
                ) : null}
                {name?.source === "osm" || name?.source === "search" ? (
                  <p className="ms-9 mt-1 text-xs text-subtle-foreground">اسم المكان: © مساهمو OpenStreetMap</p>
                ) : null}
              </div>
              {name?.kind === "city" || name?.kind === "town" ? (
                <p className="rounded-xl bg-surface-muted p-3 text-sm leading-7 text-muted-foreground">
                  إن كانت أرضك في قرية صغيرة قرب {name.locality}، اضغط «لا، غيّر القرية».
                </p>
              ) : null}
              <h2 id="loc-confirm" className="text-xl font-extrabold">هل هذه قريتك؟</h2>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button size="lg" className={BIG} disabled={saving || !zone} onClick={() => save(knownLabel, name?.source ?? "none")}>
                  {saving ? <Spinner /> : <CircleCheck />} نعم، احفظ الموقع
                </Button>
                <Button variant="outline" size="lg" className={BIG} onClick={() => setStep("fix-name")}>
                  لا، غيّر القرية
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 id="loc-confirm" className="text-xl font-extrabold">لم نتمكن من معرفة اسم القرية بدقة</h2>
              <p className="text-base leading-8 text-muted-foreground" data-testid="name-unknown-reason">
                {name?.reason === "no_consent"
                  ? "لم نرسل موقعك إلى خدمة الخرائط. اكتب اسم قريتك ليظهر في التطبيق، وسنحفظ المكان الذي حدده جهازك."
                  : name?.reason === "offline"
                    ? "لا يوجد اتصال بالإنترنت الآن. اكتب اسم قريتك، وسنحفظ المكان الذي حدده جهازك."
                    : `لم تتعرف الخرائط على اسم قرية في هذا المكان${name?.district ? ` (يبدو أنه في ${name.district})` : ""}. اكتب اسم قريتك.`}
              </p>
              {name?.reason === "offline" ? <WifiOff className="size-6 text-subtle-foreground" aria-hidden /> : null}
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (typedName.trim().length >= 2) void save(typedName.trim(), "manual");
                }}
              >
                <Input
                  aria-label="اسم قريتك"
                  placeholder="مثال: بيت أمر"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  className="h-14 text-lg"
                />
                <Button type="submit" size="lg" className={BIG} disabled={saving || !zone || typedName.trim().length < 2}>
                  {saving ? <Spinner /> : <CircleCheck />} احفظ الموقع بهذا الاسم
                </Button>
              </form>
              <Button variant="link" className="h-auto self-start font-bold" onClick={() => setStep("search")}>
                أو ابحث عن قريتك بالاسم
              </Button>
            </>
          )}

          {level === "low" || level === "very_low" ? (
            <Alert tone="warning" title="الموقع تقريبي">
              حدد جهازك مكانك بدقة ضعيفة، فقد يبتعد عن أرضك. أعد المحاولة في مكان مكشوف، أو ابحث عن قريتك بالاسم.
              <Button variant="outline" size="sm" className="mt-2 flex" onClick={runGps}>
                <RotateCcw /> أعد المحاولة
              </Button>
            </Alert>
          ) : null}
          {!isInLevant(draft) ? (
            <Alert tone="warning">هذا الموقع خارج بلاد الشام. مواعيد الزراعة في التطبيق مصممة لفلسطين والمنطقة، فقد لا تناسبه.</Alert>
          ) : detectedCountry == null ? (
            <Alert tone="info" title="لم نتأكد من البلد">
              هذا الموقع قريب من الحدود أو لم تحدد الخرائط بلده. لن نعرض مواعيد خاصة ببلد معيّن إلا إذا اخترته:
              <span className="mt-2 flex flex-wrap gap-2">
                {COUNTRIES.map((c) => (
                  <Button key={c.code} size="sm" variant="outline" onClick={() => setManualCountry(c.code)}>
                    {c.name}
                  </Button>
                ))}
              </span>
            </Alert>
          ) : null}
        </section>
      ) : null}

      {step === "fix-name" && draft ? (
        <section key="fix" aria-labelledby="loc-fix" className="loc-step flex flex-col gap-4 rounded-3xl border border-border bg-surface p-5 sm:p-7">
          <h2 id="loc-fix" className="text-2xl font-extrabold">ما المشكلة؟</h2>
          <form
            className="flex flex-col gap-3 rounded-2xl border border-border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (typedName.trim().length >= 2) void save(typedName.trim(), "manual");
            }}
          >
            <p className="font-bold">المكان صحيح، لكن الاسم غير صحيح</p>
            <p className="text-sm text-muted-foreground">نحفظ نفس المكان الذي حدده جهازك، مع الاسم الذي تكتبه.</p>
            <Input aria-label="الاسم الصحيح لقريتك" placeholder="اكتب الاسم الصحيح" value={typedName} onChange={(e) => setTypedName(e.target.value)} className="h-14 text-lg" />
            <Button type="submit" size="lg" className={BIG} disabled={saving || !zone || typedName.trim().length < 2}>
              {saving ? <Spinner /> : <PencilLine />} احفظ بهذا الاسم
            </Button>
          </form>
          <div className="flex flex-col gap-3 rounded-2xl border border-border p-4">
            <p className="font-bold">أرضي في قرية أخرى</p>
            <p className="text-sm text-muted-foreground">ابحث عنها بالاسم، وسنحفظ مكان تلك القرية بدل مكانك الحالي.</p>
            <Button variant="outline" size="lg" className={BIG} onClick={() => setStep("search")}>
              <Search /> ابحث عن قريتك
            </Button>
          </div>
          <Button variant="ghost" className="self-start" onClick={() => setStep("confirm")}>رجوع</Button>
        </section>
      ) : null}

      {step === "search" ? (
        <section key="search" aria-labelledby="loc-search" className="loc-step flex flex-col gap-4 rounded-3xl border border-border bg-surface p-5 sm:p-7">
          <h2 id="loc-search" className="text-2xl font-extrabold">ابحث عن قريتك</h2>
          <form onSubmit={runSearch} role="search" className="flex flex-col gap-3 sm:flex-row">
            <Input
              aria-label="اسم القرية أو البلدة"
              placeholder="مثال: بيت أمر، سعير، سبسطية"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-14 text-lg"
            />
            <Button type="submit" size="lg" className={cn(BIG, "sm:w-40")} disabled={search.status === "loading" || query.trim().length < 2}>
              {search.status === "loading" ? <Spinner /> : <Search />} بحث
            </Button>
          </form>
          <p className="text-xs text-subtle-foreground">نرسل نص البحث فقط إلى OpenStreetMap عند الضغط على «بحث».</p>
          {search.status === "error" ? (
            <Alert tone="warning" title="تعذّر البحث الآن">
              قد لا يوجد اتصال بالإنترنت. حاول بعد قليل، أو اختر أقرب مدينة من «خيارات متقدمة» (تعمل دون إنترنت).
            </Alert>
          ) : null}
          {search.status === "done" && search.results.length === 0 ? (
            <p className="text-base text-muted-foreground">لم نجد هذا الاسم. جرّب كتابته بطريقة أخرى، أو أضف اسم المحافظة.</p>
          ) : null}
          {search.results.length ? (
            <>
              {search.results.length > 1 ? <p className="text-sm font-bold">اختر قريتك (انتبه للمحافظة إن تكرر الاسم):</p> : null}
              <ul className="flex flex-col gap-2">
                {search.results.map((r) => (
                  <li key={`${r.latitude},${r.longitude},${r.displayName}`}>
                    <button
                      type="button"
                      onClick={() => pickSearchResult(r)}
                      className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border p-3 text-start transition-colors hover:bg-surface-muted active:scale-[0.99]"
                    >
                      <MapPinned className="size-6 shrink-0 text-brand-600" aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-lg font-bold">{r.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">{r.displayName}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-subtle-foreground">بيانات الأماكن © مساهمو OpenStreetMap</p>
            </>
          ) : null}
          <Button variant="ghost" className="self-start" onClick={() => setStep(draft ? "confirm" : location ? "saved" : "start")}>رجوع</Button>
        </section>
      ) : null}

      {step !== "saved" && step !== "locating" && step !== "naming" ? (
        <AdvancedOptions
          draft={draft}
          accuracyM={draft?.source === "gps" ? draft.accuracyM : null}
          elevationM={elevationM}
          nearestName={nearest?.name ?? null}
          zone={zone}
          suggestion={suggestion}
          onZone={(z) => setManualZone(z === suggestion?.zone ? null : z)}
          country={countryCode}
          detectedCountry={detectedCountry}
          onCountry={setManualCountry}
          consent={consent}
          onConsent={setConsent}
          onPickTown={pickTown}
          onPickMap={pickOnMap}
          onUseMapPoint={() => (draft ? (consent ? lookupName(draft) : setStep("consent")) : undefined)}
          hasSaved={Boolean(location)}
          onDelete={removeSaved}
          storageHint={mode === "remote" ? "يُحفظ موقعك في حسابك." : "يُحفظ موقعك في هذا المتصفح فقط."}
        />
      ) : null}
    </div>
  );
}
