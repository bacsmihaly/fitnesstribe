# Kilométerekkel a Gyerekekért – Fitness Tribe Jótékonysági Futás (III. kiadás)

Regisztrációs és futás-beküldő platform a Fitness Tribe jótékonysági futásához (2026. december 1–21.).
Magyar és román felület, adventi naptár főoldal, nyilvános ranglista, egy admin belépés.

**Cu kilometri pentru copii – Eveniment de Alergare Caritabilă Fitness Tribe, ediția a III-a**

## Mit tud
- Futók regisztrációja és belépése, futások beküldése (Strava/Garmin link vagy képernyőfotó)
- Admin: beküldések jóváhagyása/elutasítása, befizetések visszaigazolása, szponzorok, beállítások, CSV export
- Főoldal: 21 ajtós naptár (napi km), visszaszámláló, ranglista (névre kattintva a futó futásai)
- Fülek: Az akcióról, Kiket támogatunk
- A km csak visszaigazolt befizetés után számít a nyilvános ranglistán

## Felépítés
| Mappa | Tartalom |
|---|---|
| `web/` | A weboldal (statikus, build nélkül): HTML, JS modulok, CSS, betűtípus, logó |
| `supabase/schema.sql` | Teljes adatbázis (táblák, jogosultságok, nyilvános függvények, képtároló) |
| `supabase/frissites-*.sql` | Kisebb frissítések, ha a sémát már régebben lefuttattad |
| `demo/` | Offline demó (`KGY-platform-DEMO.html`) és a felépítéséhez szükséges fájlok |
| `TELEPITES.md` | Lépésről lépésre: Supabase + Netlify beállítása |

## Technika
Supabase (adatbázis, belépés, képtároló) és Netlify (statikus tárhely), ingyenes csomaggal is elég.
A `web/config.js` fájlba a Supabase **publikus** (anon) kulcsa kerül, a `service_role` kulcsot soha ne tedd bele.

## Gyors kipróbálás
Nyisd meg a `demo/KGY-platform-DEMO.html` fájlt böngészőben. Minden adat csak a böngészőben tárolódik.

## Licenc és márka
- A Bricolage Grotesque betűtípus SIL Open Font License alatt van (`web/fonts`).
- A Fitness Tribe név és logó a Fitness Tribe tulajdona.
