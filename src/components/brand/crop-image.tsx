import Image from "next/image";
import { CROP_PHOTOS } from "@/data/crop-photos";
import type { Crop } from "@/domain/types";
import { cn } from "@/lib/utils";
import { CropArt } from "./crop-art";
import { CropPhotoImage } from "./crop-photo";

/**
 * The crop's picture, by stable slug: an admin-uploaded photo, else the
 * licensed real photo (src/data/crop-photos.ts), else the bundled drawing.
 * Callers size the box (e.g. `size-16`, `aspect-[4/3]`); the image covers it.
 */
export function CropImage({
  crop,
  className,
  sizes = "(max-width: 640px) 100vw, 33vw",
  priority,
  decorative,
}: {
  crop: Pick<Crop, "slug" | "name" | "imageUrl" | "imageAlt">;
  className?: string;
  sizes?: string;
  priority?: boolean;
  /** Hidden from screen readers where the crop name is already in the text. */
  decorative?: boolean;
}) {
  const photo = crop.imageUrl ? null : CROP_PHOTOS[crop.slug];
  return (
    <div className={cn("relative overflow-hidden bg-surface-muted", className)} data-photo={photo ? "real" : crop.imageUrl ? "uploaded" : "art"} aria-hidden={decorative || undefined}>
      {crop.imageUrl ? (
        <Image
          src={crop.imageUrl}
          alt={crop.imageAlt || crop.name}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      ) : photo ? (
        <CropPhotoImage photo={photo} sizes={sizes} priority={priority} className="absolute inset-0" />
      ) : (
        <CropArt slug={crop.slug} title={crop.imageAlt || `رسم توضيحي: ${crop.name}`} />
      )}
    </div>
  );
}
