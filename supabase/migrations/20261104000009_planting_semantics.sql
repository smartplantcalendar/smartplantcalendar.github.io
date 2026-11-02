-- "Planting date" means planting in the FINAL place.
--  * New method 'bulbs' (أبصال: narcissus, tulips…) and category 'ornamental'.
--  * 'nursery_sowing' stays allowed but is only ever a secondary date
--    («لمن يريد تجهيز الأشتال بنفسه»); the app never uses it as the planting date.
--  * primary_method: the most common way to plant the crop in the ground.
--  * Separate phases: flowering, harvest season and time to first yield
--    (trees) are their own fields, never mixed with the planting window.

alter table public.crops drop constraint if exists crops_category_check;
alter table public.crops add constraint crops_category_check check (category in (
  'fruiting_vegetable','leafy_vegetable','root_tuber','bulb','herb','fruit','tree',
  'legume','cereal','forage','field_crop','ornamental'
));

alter table public.crops drop constraint if exists crops_propagation_valid;
alter table public.crops add constraint crops_propagation_valid check (
  propagation <@ array['direct_sowing','transplanting','tubers','cloves','cuttings','saplings','nursery_sowing','offshoots','bulbs']::text[]
);

alter table public.crop_planting_windows drop constraint if exists crop_planting_windows_method_check;
alter table public.crop_planting_windows add constraint crop_planting_windows_method_check check (
  method in ('direct_sowing','transplanting','tubers','cloves','cuttings','saplings','nursery_sowing','offshoots','bulbs')
);

alter table public.plantings drop constraint if exists plantings_method_check;
alter table public.plantings add constraint plantings_method_check check (
  method in ('direct_sowing','transplanting','tubers','cloves','cuttings','saplings','nursery_sowing','offshoots','bulbs')
);

alter table public.crops
  add column if not exists primary_method text check (primary_method in ('direct_sowing','transplanting','tubers','cloves','cuttings','saplings','offshoots','bulbs')),
  add column if not exists flowering_note text check (char_length(flowering_note) <= 300),
  add column if not exists harvest_note text check (char_length(harvest_note) <= 300),
  add column if not exists first_yield_note text check (char_length(first_yield_note) <= 300);
