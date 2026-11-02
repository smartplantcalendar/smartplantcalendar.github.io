-- Catalogue: seed applied twice (see run.sh) without duplicates.
do $$
begin
  if (select count(*) from public.crops) < 100 then raise exception 'catalogue not seeded'; end if;
  if (select count(*) from public.crop_planting_windows w join public.crops c on c.id = w.crop_id where c.slug = 'tomato') <> 6 then
    raise exception 'tomato windows duplicated or missing';
  end if;
  if (select count(*) from public.crop_task_templates t join public.crops c on c.id = t.crop_id where c.slug = 'tomato') <> 9 then
    raise exception 'tomato task rules duplicated or missing';
  end if;
  if (select data_status from public.crops where slug = 'okra') <> 'preliminary' then raise exception 'okra should be preliminary'; end if;
  if (select count(*) from public.crop_planting_windows w join public.crops c on c.id = w.crop_id where c.slug = 'okra' and w.source_id = 'moa-ps-okra') <> 3 then
    raise exception 'okra sourced windows missing or duplicated';
  end if;
  if (select count(*) from public.crop_planting_windows w join public.crops c on c.id = w.crop_id
      where c.slug = 'wheat' and w.zone is null and w.country_code = 'PS' and w.source_id = 'wafa-field-crops') <> 2 then
    raise exception 'wheat general Palestinian windows missing';
  end if;
  if exists (select 1 from public.crop_planting_windows w join public.crops c on c.id = w.crop_id where c.slug = 'tomato' and w.country_code is not null) then
    raise exception 'existing general windows must stay unscoped';
  end if;
  if not exists (select 1 from public.crops where slug = 'narcissus' and category = 'ornamental' and propagation = array['bulbs']::text[]) then
    raise exception 'narcissus (bulbs, ornamental) missing';
  end if;
  if (select first_yield_note from public.crops where slug = 'olive') is null then raise exception 'olive first-yield note missing'; end if;
  -- A nursery sowing date can never be the primary (planting) method.
  begin
    update public.crops set primary_method = 'nursery_sowing' where slug = 'tomato';
    raise exception 'nursery sowing accepted as primary method';
  exception when check_violation then null;
  end;
  -- Imported estimates: status "estimated", never documented/reviewed, scoped to Palestine and a zone.
  if (select data_status from public.crops where slug = 'eggplant') <> 'estimated' then raise exception 'eggplant should be estimated'; end if;
  if (select count(*) from public.crops where data_status = 'estimated') <> 88 then raise exception 'expected 88 estimated crops'; end if;
  if (select count(*) from public.crop_planting_windows w join public.crops c on c.id = w.crop_id where c.slug = 'eggplant' and w.confidence = 'estimated' and not w.optional) <> 5 then
    raise exception 'eggplant estimated windows missing or duplicated';
  end if;
  if (select count(*) from public.crop_planting_windows w join public.crops c on c.id = w.crop_id where c.slug = 'eggplant' and w.optional) <> 1 then
    raise exception 'eggplant optional season missing or duplicated';
  end if;
  if exists (select 1 from public.crop_planting_windows where confidence = 'estimated' and (country_code is distinct from 'PS' or zone is null)) then
    raise exception 'estimates must be scoped to Palestine and a zone';
  end if;
  if exists (select 1 from public.crop_planting_windows w join public.crops c on c.id = w.crop_id where c.slug in ('tomato', 'okra', 'wheat') and w.confidence <> 'documented') then
    raise exception 'documented windows must stay documented';
  end if;
  if (select suitability from public.crop_zone_estimates z join public.crops c on c.id = z.crop_id where c.slug = 'apple' and z.zone = 'coastal') <> 'not_recommended' then
    raise exception 'apple coastal restriction missing';
  end if;
  if exists (select 1 from public.crop_planting_windows w join public.crops c on c.id = w.crop_id where c.slug = 'apple' and w.zone = 'coastal') then
    raise exception 'a not-recommended zone must not get a planting window';
  end if;
  if (select count(*) from public.crop_zone_estimates) <> 440 then raise exception 'expected 440 zone estimates'; end if;
  if cardinality((select estimate_review_notes from public.crops where slug = 'carob')) = 0 then raise exception 'carob review note missing'; end if;
  if not exists (select 1 from public.crop_phase_windows p join public.crops c on c.id = p.crop_id where c.slug = 'fig' and p.kind = 'harvest' and p.zone = 'highland') then
    raise exception 'fig harvest season missing';
  end if;
  -- An estimate must name its country and zone; an optional season is always an estimate.
  begin
    insert into public.crop_planting_windows (crop_id, zone, country_code, start_month, end_month, method, confidence)
      values ((select id from public.crops where slug = 'fig'), 'highland', null, 1, 2, 'saplings', 'estimated');
    raise exception 'estimate without country accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.crop_planting_windows (crop_id, zone, country_code, start_month, end_month, method, optional)
      values ((select id from public.crops where slug = 'fig'), 'highland', 'PS', 1, 2, 'saplings', true);
    raise exception 'documented optional season accepted';
  exception when check_violation then null;
  end;
  begin
    update public.crops set data_status = 'documented' where slug = 'fig';
    raise exception 'unknown data status accepted';
  exception when check_violation then null;
  end;
  if exists (select 1 from public.crop_planting_windows w join public.crops c on c.id = w.crop_id where c.data_status = 'incomplete') then
    raise exception 'incomplete crops must not have windows';
  end if;
  if not exists (select 1 from public.crops where slug = 'tomato' and 'الطماطة' = any(other_names)) then raise exception 'aliases not merged'; end if;
  if (select cardinality(other_names) from public.crops where slug = 'tomato') <> cardinality(array(select distinct unnest(other_names) from public.crops where slug = 'tomato')) then
    raise exception 'duplicate aliases';
  end if;
end $$;

-- RLS / permission tests. Each block raises an exception on failure.
\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', '{"full_name":"مستخدم أ"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', '{"full_name":"مستخدم ب"}'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@example.com', '{"full_name":"المشرف"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000ad';

-- Profiles and preferences are created automatically.
do $$ begin
  if (select count(*) from public.profiles) <> 3 then raise exception 'profiles not created'; end if;
  if (select count(*) from public.notification_preferences) <> 3 then raise exception 'prefs not created'; end if;
  if (select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a') <> 'مستخدم أ' then raise exception 'name not copied'; end if;
end $$;

-- ---------- user A creates a plan through the RPC ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

select public.create_plan(jsonb_build_object(
  'garden', jsonb_build_object('name','حديقتي','space_type','home_garden','region_id','ps-hebron','zone','highland'),
  'planting', jsonb_build_object('crop_slug','tomato','crop_name','البندورة','planted_on','2026-04-15','method','transplanting'),
  'tasks', jsonb_build_array(
    jsonb_build_object('type','planting','title','شتل','due_date','2026-04-15','template_key','plant'),
    jsonb_build_object('type','irrigation','title','ري','due_date','2026-04-17','template_key','water#2')
  )
));

do $$ begin
  if (select count(*) from public.tasks) <> 2 then raise exception 'A should see 2 tasks'; end if;
  if (select crop_id from public.plantings limit 1) is null then raise exception 'crop_id not resolved from slug'; end if;
end $$;

-- A can complete a task; completed_at is set automatically.
update public.tasks set status = 'done' where template_key = 'plant';
do $$ begin
  if (select completed_at from public.tasks where template_key = 'plant') is null then raise exception 'completed_at not set'; end if;
end $$;

-- A cannot promote themselves to admin (column privilege).
do $$ begin
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'role update should fail';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A can update allowed profile columns, including the confirmed location.
update public.profiles set full_name = 'اسم جديد', region_id = 'ps-gaza',
  latitude = 31.6103, longitude = 35.0711, location_label = 'قرية تجريبية', location_source = 'gps',
  location_accuracy_m = 12, elevation_m = 870, external_geo_consent = true, location_confirmed_at = now(),
  location_country = 'PS', location_label_source = 'manual'
  where id = auth.uid();

-- Only supported countries and known name sources are accepted.
do $$ begin
  begin
    update public.profiles set location_country = 'XX' where id = auth.uid();
    raise exception 'invalid location_country accepted';
  exception when check_violation then null;
  end;
  begin
    update public.profiles set location_label_source = 'guess' where id = auth.uid();
    raise exception 'invalid location_label_source accepted';
  exception when check_violation then null;
  end;
end $$;

-- A greenhouse garden is accepted.
insert into public.gardens (name, space_type, zone) values ('بيتي المحمي', 'greenhouse', 'highland');

-- A is not admin: cannot edit crops, cannot read stats.
do $$ begin
  update public.crops set name = 'تخريب' where slug = 'tomato';
  if (select name from public.crops where slug = 'tomato') <> 'البندورة' then raise exception 'non-admin edited crop'; end if;
  if (select count(*) from public.crop_phase_windows) = 0 then raise exception 'published phases not readable'; end if;
  if (select count(*) from public.crop_zone_estimates) = 0 then raise exception 'published zone estimates not readable'; end if;
  update public.crop_zone_estimates set suitability = 'possible';
  if exists (select 1 from public.crop_zone_estimates where suitability = 'possible' and zone = 'coastal' and crop_id = (select id from public.crops where slug = 'apple')) then
    raise exception 'non-admin edited zone estimates';
  end if;
  begin
    insert into public.crop_phase_windows (crop_id, kind, zone, country_code, start_month, end_month)
      values ((select id from public.crops where slug = 'fig'), 'harvest', 'highland', 'PS', 1, 2);
    raise exception 'non-admin inserted a phase window';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_stats();
    raise exception 'stats should be forbidden';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Constraints added for the static build reject malformed rows from direct API calls.
do $$ begin
  begin
    insert into public.gardens (name, space_type, zone) values ('   ', 'balcony', 'coastal');
    raise exception 'blank garden name accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.create_plan(jsonb_build_object(
      'garden', jsonb_build_object('name','x','space_type','balcony','zone','coastal'),
      'planting', jsonb_build_object('crop_slug','Bad Slug!','crop_name','x','planted_on','2026-04-15'),
      'tasks', '[]'::jsonb));
    raise exception 'invalid crop slug accepted';
  exception when check_violation then null;
  end;
end $$;

-- ---------- user B must not see or touch A's data ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$
declare a_task uuid; a_planting uuid; a_garden uuid;
begin
  if (select count(*) from public.tasks) <> 0 then raise exception 'B sees A tasks'; end if;
  if (select count(*) from public.plantings) <> 0 then raise exception 'B sees A plantings'; end if;
  if (select count(*) from public.gardens) <> 0 then raise exception 'B sees A gardens'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'B sees other profiles'; end if;
  if exists (select 1 from public.profiles where location_label is not null) then raise exception 'B sees A location'; end if;

  update public.tasks set title = 'hacked';
  delete from public.tasks;

  -- B cannot attach a task to A's planting even if the id is known.
  reset role;
  select id, garden_id into a_planting, a_garden from public.plantings limit 1;
  set role authenticated;
  begin
    insert into public.tasks (type, title, due_date, planting_id) values ('custom', 'x', '2026-05-01', a_planting);
    raise exception 'B attached a task to A planting';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.tasks (user_id, type, title, due_date) values ('00000000-0000-0000-0000-00000000000a', 'custom', 'x', '2026-05-01');
    raise exception 'B inserted a task for A';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_plan(jsonb_build_object(
      'garden', jsonb_build_object('id', a_garden),
      'planting', jsonb_build_object('crop_slug','tomato','crop_name','x','planted_on','2026-04-15'),
      'tasks', '[]'::jsonb));
    raise exception 'B used A garden';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$ begin
  if (select count(*) from public.tasks where title = 'hacked') <> 0 then raise exception 'B modified A tasks'; end if;
  if (select count(*) from public.tasks) <> 2 then raise exception 'B deleted A tasks'; end if;
end $$;

-- ---------- anonymous visitors ----------
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  if (select count(*) from public.crops) < 12 then raise exception 'anon cannot read crops'; end if;
  if (select count(*) from public.crop_guides) = 0 then raise exception 'anon cannot read guides'; end if;
  begin
    perform count(*) from public.tasks;
    raise exception 'anon read tasks';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_plan('{}'::jsonb);
    raise exception 'anon called create_plan';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Unpublished crops are hidden from the public.
reset role;
update public.crops set is_published = false where slug = 'grape';
set role anon;
do $$ begin
  if exists (select 1 from public.crops where slug = 'grape') then raise exception 'unpublished crop visible'; end if;
  if exists (select 1 from public.crop_guides g join public.crops c on c.id = g.crop_id where c.slug = 'grape') then raise exception 'unpublished guides visible'; end if;
end $$;

-- ---------- admin ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', false);
do $$
declare s jsonb;
begin
  if not exists (select 1 from public.crops where slug = 'grape') then raise exception 'admin cannot see unpublished crop'; end if;
  update public.crops set name = 'العنب' where slug = 'grape';
  insert into public.faqs (question, answer) values ('سؤال تجريبي؟', 'إجابة تجريبية');
  update public.site_settings set value = '{"frostTempC":3,"heatTempC":36,"rainProbabilityPct":60,"heavyRainMm":20,"strongWindKmh":40}' where key = 'weather_thresholds';
  s := public.admin_stats();
  if (s ->> 'users')::int <> 3 then raise exception 'stats users wrong: %', s; end if;
  if (s ->> 'tasks')::int <> 2 then raise exception 'stats tasks wrong: %', s; end if;
  -- Admin still cannot read other users' private tasks directly.
  if (select count(*) from public.tasks) <> 0 then raise exception 'admin reads private tasks'; end if;
  if exists (select 1 from public.profiles where location_label is not null) then raise exception 'admin reads user location'; end if;
  if not (select frost_sensitive from public.crops where slug = 'tomato') then raise exception 'tomato frost flag missing'; end if;
end $$;

reset role;

-- Upgrading an existing database: a crop seeded earlier as "incomplete"
-- becomes "preliminary" with its sourced windows, unless an admin edited it.
update public.crops set data_status = 'incomplete', summary = 'نسخة قديمة', updated_by = (select id from auth.users limit 1) where slug = 'okra';
delete from public.crop_planting_windows where crop_id = (select id from public.crops where slug = 'okra');
\ir ../../supabase/seed.sql
do $$
begin
  if (select data_status from public.crops where slug = 'okra') <> 'incomplete' then raise exception 'seed overwrote an admin-edited crop'; end if;
  if (select summary from public.crops where slug = 'okra') <> 'نسخة قديمة' then raise exception 'seed overwrote admin summary'; end if;
  if exists (select 1 from public.crop_planting_windows w join public.crops c on c.id = w.crop_id where c.slug = 'okra') then
    raise exception 'seed added windows to an admin-edited crop';
  end if;
end $$;
update public.crops set updated_by = null where slug = 'okra';
\ir ../../supabase/seed.sql
\ir ../../supabase/seed.sql
do $$
begin
  if (select data_status from public.crops where slug = 'okra') <> 'preliminary' then raise exception 'okra not upgraded'; end if;
  if (select count(*) from public.crop_planting_windows w join public.crops c on c.id = w.crop_id where c.slug = 'okra') <> 3 then
    raise exception 'okra windows not inserted exactly once';
  end if;
  if (select count(*) from public.crops) <> (select count(distinct slug) from public.crops) then raise exception 'duplicate crops'; end if;
end $$;

-- Estimates: re-running the seed replaces them exactly once; an admin-edited
-- estimated crop keeps the admin's data.
do $$
begin
  if (select count(*) from public.crop_planting_windows w join public.crops c on c.id = w.crop_id where c.slug = 'eggplant') <> 6 then
    raise exception 'eggplant windows duplicated by re-running the seed';
  end if;
  if (select count(*) from public.crop_zone_estimates z join public.crops c on c.id = z.crop_id where c.slug = 'eggplant') <> 5 then
    raise exception 'eggplant zone estimates duplicated';
  end if;
end $$;
update public.crops set updated_by = (select id from auth.users limit 1) where slug = 'fig';
delete from public.crop_planting_windows where crop_id = (select id from public.crops where slug = 'fig');
\ir ../../supabase/seed.sql
do $$
begin
  if exists (select 1 from public.crop_planting_windows w join public.crops c on c.id = w.crop_id where c.slug = 'fig') then
    raise exception 'seed re-added estimates to an admin-edited crop';
  end if;
end $$;

select 'ALL RLS TESTS PASSED' as result;
