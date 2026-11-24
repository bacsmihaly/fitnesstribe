-- Utalási adatok és nevezési díj, szó szerint a tavalyi „Konfirmalo uzenetet regisztracio” dokumentum szerint.
-- Csak akkor kell, ha a schema.sql régebbi változatát már lefuttattad. Ugyanezt az adminban is beállíthatod: Beállítások.
-- Felülírja az üres mezőt és a korábbi alapértelmezett szöveget; ha te már átírtad kézzel, azt békén hagyja.
update public.settings set
  entry_fee    = coalesce(entry_fee, 50),
  bank_info_hu = case when bank_info_hu in ('', E'Kedvezményezett: ASOCIATIA FITNESS TRIBE EGYESULET\nIBAN: RO24BTRLRONCRT0465351002\nMegjegyzés: név + donatie pentru copiii') then E'Számlaszám: RO24BTRLRONCRT0465351002\nMegnevezés: ASOCIATIA FITNESS TRIBE EGYESULET\nMegjegyzés: "név + donatie pentru copiii"' else bank_info_hu end,
  bank_info_ro = case when bank_info_ro in ('', E'Beneficiar: ASOCIATIA FITNESS TRIBE EGYESULET\nIBAN: RO24BTRLRONCRT0465351002\nMențiune: nume + donatie pentru copiii') then E'Cont: RO24BTRLRONCRT0465351002\nDenumire: ASOCIATIA FITNESS TRIBE EGYESULET\nNotă: "nume + donatie pentru copiii"' else bank_info_ro end
where id = 1;
