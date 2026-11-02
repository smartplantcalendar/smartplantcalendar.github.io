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
export function CropPhotoImage({
  photo,
  sizes,
  priority,
  className,
  maxWidth,
}: {
  photo: CropPhoto;
  sizes: string;
  priority?: boolean;
  className?: string;
  /** Leave out larger files (cards never need the 960 px file, even on dense phone screens). */
  maxWidth?: number;
}) {
  const files = maxWidth ? photo.srcSet.filter((s, i) => s.width <= maxWidth || i === 0) : photo.srcSet;
  const largest = files[files.length - 1];
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
      srcSet={files.map((s) => `${BASE_PATH}${s.src} ${s.width}w`).join(", ")}
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
