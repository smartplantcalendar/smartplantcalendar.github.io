"use client";

import type { CropPhoto } from "@/domain/crop-photos";
import { BASE_PATH } from "@/lib/env";
import { cn } from "@/lib/utils";

/**
 * A real crop photo: responsive WebP files with their intrinsic size (no
 * layout shift), lazy-loaded unless `priority`, and a light fade-in once
 * decoded. Server-rendered visible; after hydration an image that is still
 * loading is hidden until its `load` event (see `.crop-photo` in globals.css),
 * so a visitor without JavaScript always sees it.
 */
export function CropPhotoImage({ photo, sizes, priority, className }: { photo: CropPhoto; sizes: string; priority?: boolean; className?: string }) {
  const largest = photo.srcSet[photo.srcSet.length - 1];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static export: plain responsive <img> with pre-sized WebP files
    <img
      ref={(img) => {
        if (img && !img.complete) img.dataset.pending = "";
      }}
      onLoad={(e) => {
        delete e.currentTarget.dataset.pending;
      }}
      onError={(e) => {
        delete e.currentTarget.dataset.pending;
      }}
      src={`${BASE_PATH}${largest.src}`}
      srcSet={photo.srcSet.map((s) => `${BASE_PATH}${s.src} ${s.width}w`).join(", ")}
      sizes={sizes}
      width={photo.width}
      height={photo.height}
      alt={photo.alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className={cn("crop-photo h-full w-full object-cover", className)}
    />
  );
}
