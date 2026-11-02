import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { CropImage } from "@/components/brand/crop-image";
import { CROP_PHOTOS } from "@/data/crop-photos";
import { SOURCE_NAMES } from "@/domain/crop-photos";
import { absoluteUrl } from "@/lib/env";
import { getCrops } from "@/services/crops";

export const metadata: Metadata = {
  title: "مصادر الصور",
  description: "مصادر صور المحاصيل الحقيقية وتراخيصها وأسماء مصوّريها.",
  alternates: { canonical: absoluteUrl("/image-credits") },
};

/**
 * Attribution for every real crop photo (author, licence, source link), as
 * the licences require, plus the crops that still use a drawing.
 */
export default async function ImageCreditsPage() {
  const { crops } = await getCrops();
  const withPhoto = crops.filter((c) => !c.imageUrl && CROP_PHOTOS[c.slug]);
  const withArt = crops.filter((c) => !c.imageUrl && !CROP_PHOTOS[c.slug]);
  return (
    <div className="container-page flex flex-col gap-8 py-8 sm:py-12">
      <header className="max-w-3xl space-y-3">
        <h1 className="text-3xl font-extrabold sm:text-4xl">مصادر الصور</h1>
        <p className="leading-8 text-muted-foreground">
          صور المحاصيل الحقيقية مأخوذة من البيانات المفتوحة لموقع آي ناتشراليست أو من ويكيميديا كومنز، بتراخيص تسمح بإعادة نشرها مع ذكر المصوّر (CC0 أو CC BY أو CC BY-SA)، ولا نستعمل صورًا بتراخيص غير تجارية. صغّرنا الصور وحوّلناها إلى صيغة خفيفة تناسب الهواتف، ولم نغيّر محتواها. المحاصيل التي لم نجد لها صورة موثوقة بترخيص مناسب تظهر برسم توضيحي.
        </p>
        <p className="text-sm text-muted-foreground" data-testid="credits-count">
          {withPhoto.length ? `${withPhoto.length} محصولًا بصورة حقيقية، و${withArt.length} برسم توضيحي.` : `لا توجد صور حقيقية بعد؛ كل المحاصيل (${withArt.length}) تظهر برسم توضيحي.`}
        </p>
      </header>

      {withPhoto.length ? (
        <section aria-labelledby="photos-title">
          <h2 id="photos-title" className="mb-4 text-xl font-extrabold">الصور الحقيقية وتراخيصها</h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {withPhoto.map((c) => {
              const credit = CROP_PHOTOS[c.slug].credit;
              return (
                <li key={c.slug} id={c.slug} className="flex gap-3 rounded-2xl border border-border bg-surface p-3" data-testid={`credit-${c.slug}`}>
                  <CropImage crop={c} className="size-20 shrink-0 rounded-xl" sizes="80px" />
                  <div className="min-w-0 text-sm leading-6">
                    <Link href={`/crops/${c.slug}`} className="font-bold text-foreground hover:text-brand-700">{c.name}</Link>
                    {c.scientificName ? (
                      <span dir="ltr" className="block text-xs italic text-subtle-foreground">{c.scientificName}</span>
                    ) : null}
                    <span className="block">المصوّر: {credit.author || "غير مذكور"}</span>
                    <span className="block">
                      الترخيص:{" "}
                      {credit.licenseUrl ? (
                        <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer license" className="font-semibold text-brand-700 underline underline-offset-4">
                          {credit.license}
                        </a>
                      ) : (
                        credit.license
                      )}
                    </span>
                    <a href={credit.pageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-700 underline underline-offset-4">
                      <ExternalLink className="size-3.5" aria-hidden /> صفحة الصورة في {SOURCE_NAMES[credit.source]}
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="art-title">
        <h2 id="art-title" className="mb-2 text-xl font-extrabold">محاصيل تظهر برسم توضيحي</h2>
        <p className="mb-3 text-sm text-muted-foreground">رسوم مبسّطة من تصميم الموقع، نستعملها حتى نجد صورة حقيقية موثوقة بترخيص مناسب، ولا نستبدلها بصورة لنبات آخر.</p>
        <p className="text-sm leading-7" data-testid="art-list">{withArt.map((c) => c.name).join("، ")}</p>
      </section>
    </div>
  );
}
