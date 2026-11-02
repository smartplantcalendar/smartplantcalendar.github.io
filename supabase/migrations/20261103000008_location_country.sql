-- Location experience v3: the place name and the coordinates are separate.
--  * location_label_source: where the saved name came from
--    (OpenStreetMap for the point, a search result, the town list, typed by
--    the user, or unknown). Typing a name never changes the coordinates.
--  * location_country: the country confirmed for the point (by OpenStreetMap,
--    the chosen town, or the user). Null = unknown; the app then derives it
--    carefully from the coordinates and returns "unknown" near borders.
-- Owner-only like the other location columns (RLS on profiles).

alter table public.profiles
  add column if not exists location_country text check (location_country in ('PS','JO','LB','SY')),
  add column if not exists location_label_source text check (location_label_source in ('osm','search','list','manual','none'));

grant update (location_country, location_label_source) on public.profiles to authenticated;
