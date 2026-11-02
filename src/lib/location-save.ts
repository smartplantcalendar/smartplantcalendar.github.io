/**
 * Saving (or deleting) the farm location in two places: this browser
 * (localStorage) and, when signed in, the user's account (Supabase).
 * Pure decision logic with injected writers so every outcome is unit-tested.
 * The UI shows «تم الحفظ» only when `ok` is true, and says "this device only"
 * when the account save failed.
 */
import type { SavedLocation } from "@/domain/location";

export type LocationSaveResult =
  | {
      ok: true;
      data: {
        savedLocally: boolean;
        /** null = guest (no account). */
        savedToAccount: boolean | null;
        /** Why the account save failed (savedToAccount === false). */
        accountError?: string;
      };
    }
  | { ok: false; error: string };

export const LOCAL_LOCATION_SAVE_FAILED =
  "تعذّر حفظ الموقع في هذا المتصفح (قد يكون التصفح الخاص مفعّلًا أو مساحة التخزين ممتلئة). حاول مرة أخرى.";
export const LOCAL_LOCATION_DELETE_FAILED = "تعذّر حذف الموقع من هذا المتصفح. حاول مرة أخرى.";

export async function persistLocation(
  loc: SavedLocation | null,
  deps: {
    signedIn: boolean;
    writeLocal: (loc: SavedLocation | null) => boolean;
    saveToAccount: (loc: SavedLocation | null) => Promise<{ ok: true } | { ok: false; error: string }>;
  },
): Promise<LocationSaveResult> {
  if (loc === null) {
    // Delete: the account first, so a failure there leaves everything as it was.
    if (deps.signedIn) {
      const remote = await deps.saveToAccount(null);
      if (!remote.ok) return { ok: false, error: `تعذّر حذف الموقع من حسابك: ${remote.error}` };
      return { ok: true, data: { savedLocally: deps.writeLocal(null), savedToAccount: true } };
    }
    return deps.writeLocal(null)
      ? { ok: true, data: { savedLocally: true, savedToAccount: null } }
      : { ok: false, error: LOCAL_LOCATION_DELETE_FAILED };
  }

  const savedLocally = deps.writeLocal(loc);
  if (!deps.signedIn) {
    return savedLocally ? { ok: true, data: { savedLocally: true, savedToAccount: null } } : { ok: false, error: LOCAL_LOCATION_SAVE_FAILED };
  }
  const remote = await deps.saveToAccount(loc);
  if (remote.ok) return { ok: true, data: { savedLocally, savedToAccount: true } };
  if (savedLocally) return { ok: true, data: { savedLocally: true, savedToAccount: false, accountError: remote.error } };
  return { ok: false, error: `تعذّر حفظ الموقع في حسابك وفي هذا المتصفح: ${remote.error}` };
}
