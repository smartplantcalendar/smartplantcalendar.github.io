-- Imported planting ESTIMATES (not documented, not reviewed).
--  * crops.data_status 'estimated': the crop has only estimated dates.
--  * crop_planting_windows.confidence: 'documented' (default, every existing
--    row) or 'estimated'. An estimate is always scoped to a country and a
--    zone; the app uses it only where no documented window applies, so it
--    is replaced as soon as better data are added.
--  * crop_planting_windows.optional: an additional low-confidence season
--    (عروة إضافية), shown on the crop page and never recommended.
--  * crop_phase_windows: estimated flowering and yearly harvest seasons per
--    zone — never planting dates.
--  * crop_zone_estimates: open-field suitability per zone ('not_recommended'
--    = «لا يُوصى / غير ملائم غالبًا», a restriction, not a date), irrigation
--    system, days to the first harvest and years to the first yield.
--  * crops.estimate_*: dataset id, what "harvest" means, the caveat, and
--    general context links (not proof of each date).
-- Same RLS as the other crop tables: public read of published crops, admin write.

alter table public.crops drop constraint if exists crops_data_status_check;
alter table public.crops add constraint crops_data_status_check
  check (data_status in ('preliminary','reviewed','incomplete','estimated'));

alter table public.crops
  add column if not exists estimate_dataset text check (estimate_dataset ~ '^[a-z0-9-]{2,60}$'),
  add column if not exists estimate_harvest_meaning text check (char_length(estimate_harvest_meaning) <= 200),
  add column if not exists estimate_note text check (char_length(estimate_note) <= 1000),
  add column if not exists estimate_links text[] not null default '{}'
    check (cardinality(estimate_links) <= 10);

alter table public.crop_planting_windows
  add column if not exists confidence text not null default 'documented' check (confidence in ('documented','estimated')),
  add column if not exists optional boolean not null default false;

alter table public.crop_planting_windows drop constraint if exists crop_planting_windows_estimate_scope;
alter table public.crop_planting_windows add constraint crop_planting_windows_estimate_scope check (
  confidence = 'documented' or (zone is not null and country_code is not null and method <> 'nursery_sowing')
);
alter table public.crop_planting_windows drop constraint if exists crop_planting_windows_optional_estimated;
alter table public.crop_planting_windows add constraint crop_planting_windows_optional_estimated check (
  not optional or confidence = 'estimated'
);

create table if not exists public.crop_phase_windows (
  id uuid primary key default gen_random_uuid(),
  crop_id uuid not null references public.crops(id) on delete cascade,
  kind text not null check (kind in ('flowering','harvest')),
  zone text not null check (zone in ('coastal','highland','inland_plain','jordan_valley','arid')),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  start_month int not null check (start_month between 1 and 12),
  end_month int not null check (end_month between 1 and 12),
  confidence text not null default 'estimated' check (confidence in ('documented','estimated')),
  optional boolean not null default false,
  sort_order int not null default 0
);
create index if not exists crop_phase_windows_crop_idx on public.crop_phase_windows (crop_id);

create table if not exists public.crop_zone_estimates (
  id uuid primary key default gen_random_uuid(),
  crop_id uuid not null references public.crops(id) on delete cascade,
  zone text not null check (zone in ('coastal','highland','inland_plain','jordan_valley','arid')),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  suitability text not null check (suitability in ('possible','needs_irrigation','needs_frost_protection','local_guidance','not_recommended')),
  irrigation text not null check (irrigation in ('supplemental','irrigated_only')),
  days_to_first_harvest int check (days_to_first_harvest between 1 and 400),
  years_to_first_yield int check (years_to_first_yield between 1 and 30),
  not_applicable text[] not null default '{}' check (not_applicable <@ array['flowering','harvest','days','years']::text[]),
  unique (crop_id, zone, country_code)
);
create index if not exists crop_zone_estimates_crop_idx on public.crop_zone_estimates (crop_id);

alter table public.crop_phase_windows enable row level security;
alter table public.crop_zone_estimates enable row level security;

drop policy if exists "phases readable" on public.crop_phase_windows;
create policy "phases readable" on public.crop_phase_windows for select
  using (exists (select 1 from public.crops c where c.id = crop_id and (c.is_published or public.is_admin())));
drop policy if exists "phases admin write" on public.crop_phase_windows;
create policy "phases admin write" on public.crop_phase_windows for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "zone estimates readable" on public.crop_zone_estimates;
create policy "zone estimates readable" on public.crop_zone_estimates for select
  using (exists (select 1 from public.crops c where c.id = crop_id and (c.is_published or public.is_admin())));
drop policy if exists "zone estimates admin write" on public.crop_zone_estimates;
create policy "zone estimates admin write" on public.crop_zone_estimates for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.crop_phase_windows, public.crop_zone_estimates to anon, authenticated;
grant insert, update, delete on public.crop_phase_windows, public.crop_zone_estimates to authenticated;
