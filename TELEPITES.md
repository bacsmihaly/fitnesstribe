# Kilométerekkel a Gyerekekért III – telepítési útmutató

A platform két ingyenes szolgáltatásra épül:
- **Supabase**: adatbázis, futói fiókok (belépés), képtároló az igazolásokhoz
- **Netlify**: a weboldal kiszolgálása (a saját domain később ráköthető)

Kb. 30–40 perc az egész. A mappák:
- `supabase/schema.sql` – az adatbázis, egyszer kell lefuttatni
- `web/` – maga a weboldal (ezt kell feltölteni a Netlify-ra)

---

## 1. Supabase projekt létrehozása

1. Menj a https://supabase.com oldalra → **Start your project** → regisztrálj (lehet Google-fiókkal, pl. a fitnesstribegroup@gmail.com-mal, hogy a szervezőké legyen).
2. **New project**:
   - Name: `kilometerekkel-a-gyerekekert`
   - Database password: generálj egyet és **mentsd el**
   - Region: **Central EU (Frankfurt)**
   - Plan: Free
3. Várj 1–2 percet, amíg elkészül.

## 2. Az adatbázis létrehozása

1. Bal oldali menü → **SQL Editor** → **New query**.
2. Nyisd meg a `supabase/schema.sql` fájlt, másold be az egészet, majd **Run**.
3. „Success. No rows returned” üzenetet kell kapnod.

## 3. Belépési beállítások (Authentication)

**3a. URL-ek** – Authentication → **URL Configuration**:
- Site URL: a Netlify-cím, amit az 5. lépésben kapsz (pl. `https://kgy2026.netlify.app`). Ezt a 5. lépés után töltsd ki.
- Redirect URLs: ugyanez a cím, és később a saját domain is.

**3b. E-mail küldés** – fontos döntés:

A Supabase beépített levelezője csak próbára való: nagyon kevés levelet küld óránként, és jellemzően csak a projekt csapattagjainak. 150 futónál ez nem elég. Két lehetőség:

- **A) Gyors indulás (ajánlott a határidő miatt):** Authentication → **Sign In / Providers** → Email → kapcsold **ki** a „Confirm email” opciót. A futó regisztráció után azonnal be van lépve, nem kell e-mailt megerősítenie.
  Hátrány: az „Elfelejtett jelszó” e-mail ilyenkor sem fog kimenni; ha valaki elfelejti a jelszavát, szólj nekem / az adminban kell segíteni (lásd 8. pont).
- **B) Saját levelező (teljes megoldás):** ingyenes Brevo-fiók (https://www.brevo.com, napi 300 levél) → SMTP-adatok → Supabase: Authentication → **Emails → SMTP Settings** → Enable custom SMTP. Ezután működik a megerősítő és a jelszó-visszaállító e-mail is, és a „Confirm email” bekapcsolva maradhat.

Javaslat: indulj az A-val, és ha marad idő, állítsd be a B-t is.

## 4. Kulcsok beírása a weboldalba

1. Supabase → **Project Settings → API** (vagy „API Keys”).
2. Másold ki:
   - **Project URL** (pl. `https://abcdxyz.supabase.co`)
   - a **publishable** kulcsot (`sb_publishable_…`) – régebbi felületen ez az **anon public** kulcs
3. Nyisd meg a `web/config.js` fájlt, és írd be a kettőt az idézőjelek közé.

⚠ A **service_role / secret** kulcsot SOHA ne írd ide – az mindenhez hozzáfér.

## 5. Weboldal feltöltése (Netlify)

1. https://app.netlify.com → regisztráció (ingyenes).
2. **Add new site → Deploy manually**, és húzd rá a teljes `web` mappát.
3. Kapsz egy címet (pl. `random-nev-123.netlify.app`). Site configuration → **Change site name** → pl. `kgy2026`.
4. Ezt a címet írd be a Supabase-be (3a. lépés).

Ha később módosítunk valamit: ugyanígy, a Deploys fülön húzd rá újra a `web` mappát.

## 6. Admin fiók

1. Nyisd meg a weboldalt → **Regisztráció** a saját adataiddal.
2. Supabase → SQL Editor → futtasd (a saját e-mail-címeddel):
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'bacsmihaly@gmail.com';
   ```
3. Lépj ki és be a weboldalon → megjelenik az **Admin** menü.

## 7. Beállítások az adminban

Admin → **Beállítások**:
- Dátumok: 2026-12-01 – 2026-12-21 (alapból így van)
- Beküldési határidő: 2026-12-22 23:59 (alapból így van)
- Km-ár: 2 lej/km
- **Utalási adatok** magyarul és románul (kedvezményezett, IBAN, bank) – ezt látják a még nem fizetett futók
- Nevezési díj összege (ha van fix összeg)

Admin → **Szponzorok**: vedd fel a cégeket; amikor megjön a pénz, pipáld be a „Befizetve” mezőt – csak ekkor jelenik meg a főoldalon és számít bele a km-be.

## 8. Napi teendők az esemény alatt

- **Beküldések** fül: a függő futások listája. Link → megnyitod → **Elfogad**, vagy beírod az okot → **Elutasít** (a futó látja az okot).
  A „⚠ azonos dátum + km többször” jelzés lehetséges dupla beküldést mutat.
- **Futók és befizetések** fül: amikor megjön egy utalás, pipáld be a „Befizetve” mezőt; a megjegyzésbe írhatod a kivonat dátumát. **Csak a befizetett futók km-je kerül a ranglistára.**
  Itt a neveket is javíthatod (elírás, kis/nagybetű).
- **Export**: mindhárom fülön van CSV export, ami Excelben megnyílik.
- Elfelejtett jelszó (ha az e-mail küldés nincs beállítva): Supabase → Authentication → Users → a felhasználó sora → „…” menü → **Send password recovery**, vagy töröld a fiókot és regisztráljon újra.

## 9. Teszt indulás előtt (javasolt)

Mivel a beküldés csak december 1-jétől engedélyezett, teszteléshez az adminban ideiglenesen állítsd a kezdőnapot egy korábbi napra, próbálj ki néhány beküldést (link és kép), fogadd el / utasítsd el, pipáld be a befizetést, nézd meg a ranglistát. Utána:
```sql
delete from public.activities;           -- tesztfutások törlése
```
és állítsd vissza a kezdőnapot 2026-12-01-re.

## Jó tudni

- A Supabase ingyenes projektje egy hét teljes inaktivitás után „elalszik”; az admin felületen egy kattintással újraindítható. Az esemény alatt ez nem fordul elő.
- Adatvédelem: a futók regisztrációkor hozzájárulnak, hogy a nevük a km-ükkel együtt nyilvános legyen. Érdemes a Fitness Tribe oldalán egy rövid adatkezelési tájékoztatót is közzétenni.
- Saját domain: Netlify → Domain management → Add a domain; utána a Supabase URL Configuration-be is fel kell venni.


## Ha a schema.sql régebbi változatát már lefuttattad
A ranglistán a futó nevére kattintva látszik, milyen futásokból áll össze az összkilométere. Ehhez egyszer futtasd le a `supabase/frissites-futo-futasai.sql` fájlt (Supabase → SQL Editor). Új telepítésnél nem kell, a `schema.sql` már tartalmazza.


## Ha a schema.sql régebbi változatát már lefuttattad (utalási adatok)
A tavalyi kiírás alapján az utalási adatok (IBAN, kedvezményezett, megjegyzés) és a 50 lejes nevezési díj alapból benne vannak a `schema.sql`-ben, és a főoldalon, valamint a Futásaim oldalon is látszanak. Régebbi telepítésnél futtasd le a `supabase/frissites-szamlaszam.sql` fájlt, vagy írd be az adatokat az adminban (Beállítások). A meglévő adatot nem írja felül.
