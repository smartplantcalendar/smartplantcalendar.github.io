# SmartPlant Calendar — project rules

@AGENTS.md

Arabic-first agricultural planning platform (Palestine / Levant). Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4, Supabase, Zod 4, React Hook Form.

## Non-negotiables

1. **100% Arabic UI.** Every visible string, error, empty/loading state, aria-label and toast is Arabic. English is allowed only in code identifiers, comments, file names, brand names (Open-Meteo, Supabase) and scientific crop names. The e2e helper `expectNoStrayEnglish` enforces this — extend its allow-list only for brand/scientific names.
2. **RTL everywhere.** Use logical utilities (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`). "Previous" arrows point right (`ChevronRight`), "next" arrows point left. Grids that hold wide content need `grid-cols-1` (minmax(0,1fr)) at the base breakpoint, or phones overflow.
3. **No fake data.** No invented statistics, testimonials, notifications or saves. Illustrative content must be labelled «مثال توضيحي». Guest data lives in localStorage and the UI must say so (`StorageNotice`).
4. **Agricultural honesty.** Seed crop data is `dataStatus: "preliminary"`. Never present plans as definitive; unknown growth periods stay `null` (no invented harvest date). Irrigation is "check soil moisture", never inferred from temperature alone.
5. **Security lives in the database.** The site is a static export on GitHub Pages (https://smartplantcalendar.github.io/): the browser talks to Supabase with the public key only. Hiding buttons is not protection — RLS, CHECK constraints and row limits in `supabase/migrations/` are. Every data-access call still does Zod parse → `supabase.auth.getUser()` → query as the user. Never add a service-role key or any secret to `NEXT_PUBLIC_*` variables.
6. **Static export only.** No Server Actions, Route Handlers, Proxy/middleware, `cookies()`, ISR (`revalidate`), `dynamic = "force-dynamic"`, or dynamic routes without `generateStaticParams` + `dynamicParams = false`. Pass ids via `?query` on a static page instead (see `/admin/crops/edit`). The server-rendered version lives on the `server-version` branch.
7. **Base path.** The site is served under `NEXT_PUBLIC_BASE_PATH` (empty: the site is the organization site https://smartplantcalendar.github.io/). `<Link>` and `useRouter` add it automatically; for anything else (auth email redirects, manifest, plain URLs) use `appUrl()` / `absoluteUrl()` from `src/lib/env.ts`. Anything date-dependent must be computed in the browser (`useAppData().today`), never at build time.
8. **Location privacy.** GPS/map coordinates (`SavedLocation.source` gps|map) must not reach any external service (OSM tiles, Nominatim, Open-Meteo) without `externalConsent`; use `coordsForServices()` (rounded ~1 km for weather). Nominatim: explicit submit only (never autocomplete), ≤1 req/s, cached, attributed «© مساهمو OpenStreetMap». Never log coordinates or put them in URLs of our own pages.
9. **Hosting.** Production is the public GitHub Pages organization site https://smartplantcalendar.github.io/, deployed by `.github/workflows/deploy-pages.yml` on every push to `main` (Pages source: GitHub Actions). Cloudflare Pages + Access (docs/PRIVATE_HOSTING.md) is an optional private alternative; its workflow must keep verifying Access on every hostname before uploading.

## Where things live

- `src/domain/` pure business logic (plan generator, windows, tasks, weather alerts, Zod schemas, Arabic labels). Keep framework-free and unit-tested.
- `src/lib/dates.ts` date-only math on `YYYY-MM-DD` strings; "today" via `todayInTimeZone` (default `Asia/Hebron`). Never use `new Date("YYYY-MM-DD")` for scheduling.
- `src/lib/format.ts` Arabic formatting (Levant month names, Western digits via `NUMBER_LOCALE`, plurals).
- `src/components/providers/app-data-provider.tsx` single client data source; switches between guest (localStorage) and signed-in (`src/data-access`, Supabase from the browser).
- `src/data-access/` browser data access (user + admin) through Supabase/RLS; `src/services/` build-time reads of public content.
- `src/lib/weather-client.ts` calls Open-Meteo directly from the browser (keyless).
- Location UI: `src/components/location/location-picker.tsx` (farmer flow: one button → consent → «هل هذه قريتك؟»; name and coordinates are independent) + `advanced-options.tsx` (map, town list, coordinates, zone, country).
- `src/domain/geo.ts` (zone rules, distances, accuracy), `src/domain/location.ts` (SavedLocation v2 + consent), `src/domain/recommendations.ts` (what-to-plant-now rules); browser geo clients in `src/lib/geo/`.
- Crop data: `src/data/crops.ts` (12 detailed crops + `SEED_CROPS`), `src/data/crop-catalogue.ts` (name-only `incomplete` crops: no windows, never guessed), `src/data/crop-sources.ts` (references; windows need a `used` source). Search/status: `src/domain/crop-search.ts` (typo-tolerant, synonyms), `simplePlantingStatus` in `src/domain/planting-windows.ts`. See docs/CROP_DATA.md; `npm run crops:report` prints coverage.
- `supabase/migrations/` schema + RLS; `supabase/seed.sql` is **generated** from `src/data` by `npm run db:seed:generate` — edit the TS data, then regenerate.
- Design tokens: `src/app/globals.css` (`:root` vars → `@theme inline`). Change colours there, not in components.

## Next.js 16 notes

- `output: "export"`, `trailingSlash: true`, `images.unoptimized` (see `next.config.ts`).
- `params` / `searchParams` are async.
- Cache Components is **off**.
- Client components using `useSearchParams` must be wrapped in `<Suspense>`.
- React Compiler lint rules are on: no synchronous `setState` in effects (derive state or reset during render), use `useWatch` instead of `form.watch`.

## Checks before committing

```bash
npm run lint && npm run typecheck && npm test
npm run test:db          # RLS tests on a throwaway PostgreSQL
npm run build:pages && npm run test:e2e   # e2e serves out/ like GitHub Pages (domain root)
```
Do not claim a check passed unless you ran it.
