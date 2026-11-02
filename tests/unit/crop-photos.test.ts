import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { judgeCommonsFile, outputName, searchQuery, type CommonsPage } from "../../scripts/crop-photos/core";
import { SEED_CROPS } from "@/data/crops";
import { CROP_PHOTOS } from "@/data/crop-photos";
import { creditLine, defaultSubject, isAllowedLicense, photoAlt, plainText, PHOTO_SUBJECTS } from "@/domain/crop-photos";

function page(license: string, artist = '<a href="//commons.wikimedia.org/wiki/User:X">Jane &amp; Co</a>', extra: Partial<NonNullable<CommonsPage["imageinfo"]>[number]> = {}): CommonsPage {
  return {
    title: "File:Ficus carica fruit.jpg",
    imageinfo: [
      {
        url: "https://upload.wikimedia.org/x.jpg",
        descriptionurl: "https://commons.wikimedia.org/wiki/File:Ficus_carica_fruit.jpg",
        width: 3000,
        height: 2000,
        mime: "image/jpeg",
        thumburl: "https://upload.wikimedia.org/thumb/x.jpg",
        extmetadata: { LicenseShortName: { value: license }, Artist: { value: artist }, LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" } },
        ...extra,
      },
    ],
  };
}

describe("licences", () => {
  it.each(["CC BY 4.0", "CC BY-SA 3.0", "CC BY-SA 2.0 de", "CC0", "Public domain"])("allows %s", (l) => expect(isAllowedLicense(l)).toBe(true));
  it.each(["CC BY-NC 4.0", "CC BY-ND 3.0", "CC BY-NC-SA 2.0", "GFDL", "Fair use", "All rights reserved", ""])("rejects %s", (l) => expect(isAllowedLicense(l)).toBe(false));
});

describe("judging a Commons file", () => {
  it("accepts an attributed, freely licensed photo and keeps a plain-text author", () => {
    const v = judgeCommonsFile(page("CC BY-SA 4.0"));
    expect(v).toMatchObject({ ok: true, credit: { author: "Jane & Co", license: "CC BY-SA 4.0", source: "Wikimedia Commons" } });
  });
  it("rejects non-commercial, unattributed, small, vector or restricted files", () => {
    expect(judgeCommonsFile(page("CC BY-NC 4.0")).ok).toBe(false);
    expect(judgeCommonsFile(page("CC BY 4.0", "")).ok).toBe(false);
    expect(judgeCommonsFile(page("CC BY 4.0", "X", { width: 500 })).ok).toBe(false);
    expect(judgeCommonsFile(page("CC BY 4.0", "X", { mime: "image/svg+xml" })).ok).toBe(false);
    const restricted = page("CC BY 4.0");
    restricted.imageinfo![0].extmetadata!.Restrictions = { value: "trademarked" };
    expect(judgeCommonsFile(restricted).ok).toBe(false);
    expect(judgeCommonsFile({ title: "File:x.jpg", missing: true }).ok).toBe(false);
  });
  it("public-domain files need no author", () => {
    expect(judgeCommonsFile(page("Public domain", "")).ok).toBe(true);
  });
});

describe("search and naming", () => {
  it("searches by scientific name, never the Arabic name", () => {
    expect(searchQuery("Ficus carica", "fruit_on_tree")).toBe('"Ficus carica" fruit tree filetype:bitmap');
    expect(searchQuery("Musa spp.", "fruit_on_tree")).toBe('"Musa" fruit tree filetype:bitmap');
  });
  it("names files by the stable slug", () => {
    expect(outputName("date-palm", 640)).toBe("date-palm-640.webp");
    expect(() => outputName("التين", 640)).toThrow();
  });
  it("writes Arabic alt texts and credit lines", () => {
    expect(photoAlt({ name: "التين" }, defaultSubject("tree"))).toBe("صورة حقيقية: ثمار التين على الشجرة");
    expect(photoAlt({ name: "الورد" }, defaultSubject("ornamental"))).toBe("صورة حقيقية: أزهار الورد");
    expect(photoAlt({ name: "القمح" }, defaultSubject("cereal"))).toBe("صورة حقيقية: سنابل القمح في الحقل");
    expect(plainText("<b>A</b>&nbsp;&#1576;")).toBe("A ب");
    expect(creditLine({ title: "File:x.jpg", pageUrl: "", author: "", license: "CC0", licenseUrl: null, source: "Wikimedia Commons" })).toContain("مؤلف غير مذكور");
  });
});

describe("the photo manifest", () => {
  const selection = JSON.parse(readFileSync(join(process.cwd(), "data/crop-photos/selection.json"), "utf8")) as Record<string, { file: string; subject?: string }>;

  it("selection.json names real crops by slug, Commons bitmaps and known subjects", () => {
    for (const [slug, s] of Object.entries(selection)) {
      expect(SEED_CROPS.some((c) => c.slug === slug), slug).toBe(true);
      expect(s.file).toMatch(/^File:.+\.(jpe?g|png|webp)$/i);
      if (s.subject) expect(PHOTO_SUBJECTS).toContain(s.subject);
    }
  });

  it("every photo is keyed by a crop slug, licensed, credited, sized and present on disk", () => {
    for (const [slug, p] of Object.entries(CROP_PHOTOS)) {
      expect(SEED_CROPS.some((c) => c.slug === slug), slug).toBe(true);
      expect(selection[slug]?.file, slug).toBe(p.credit.title);
      expect(isAllowedLicense(p.credit.license), slug).toBe(true);
      expect(p.credit.pageUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      expect(p.alt).toMatch(/^صورة حقيقية: /);
      expect(p.alt).not.toMatch(/[A-Za-z]/);
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
      expect(p.srcSet.map((s) => s.width)).toEqual([...p.srcSet.map((s) => s.width)].sort((a, b) => a - b));
      for (const s of p.srcSet) {
        expect(s.src).toMatch(new RegExp(`^/images/crops/${slug}-\\d+\\.webp$`));
        expect(existsSync(join(process.cwd(), "public", s.src)), s.src).toBe(true);
      }
    }
  });
});
