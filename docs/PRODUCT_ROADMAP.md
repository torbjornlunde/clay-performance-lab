# Clay Performance Lab – master product roadmap

Sist oppdatert: 19. juli 2026

Dette dokumentet er prosjektets **autoritative hovedkilde** for produktstatus, prioriteringer, beslutninger og idéregister.

Detaljerte roadmap-dokumenter kan utdype et område, men ved konflikt gjelder denne rekkefølgen:

1. faktisk produksjonsstatus og database
2. dette dokumentet
3. spesialiserte roadmap-dokumenter
4. eldre samtaler og enkeltstående idénotater

Authoritative near-term priority order, updated after issue #222:

1. Confirmed new data, safety and blocking regressions always come first.
2. Performance regression / issue #222: restore progressive-disclosure depth without recreating raw Results or Training archives.
3. Simple weapon `Last serviced` tracking / issue #224: implemented as a focused Equipment field in this PR.
4. Then continue the broader roadmap queue.

Målet med denne roadmapen er at ingen viktige produktidéer skal bli liggende bare i en chat.

Konkrete betatesterinnspill føres også i [TESTER_FEEDBACK.md](./TESTER_FEEDBACK.md).

---

## 1. Statusregler

Alle større funksjoner skal ligge i én av disse kategoriene:

- **Ferdig i produksjon** – kode er merget, nødvendig databaseendring er kjørt, og hovedflyten er kontrollert.
- **Under stabilisering** – funksjonen finnes i produksjon, men reell bruk har avdekket friksjon eller feil som må løses før den regnes som moden.
- **Neste** – prioritert arbeid som skal tas før øvrige idéer.
- **Planlagt** – viktig del av produktretningen, men ikke neste aktive arbeid.
- **Senere** – ønskelig, men avhengig av mer moden kjerne eller mer data.
- **Parkert** – bevisst ikke prioritert nå.

En funksjon skal ikke beskrives som ferdig bare fordi deler av den finnes i kode eller fordi den har vært diskutert.

---

## 2. Produktmål

Clay Performance Lab skal gjøre det enklere for leirdueskyttere å:

1. registrere konkurranser og trening uten unødvendig friksjon
2. forstå hvilke duer de bommer på og hvorfor
3. se utvikling og mønstre over tid
4. bruke resultat-, bom-, due-, bane-, utstyrs- og kontekstdata samlet
5. dele og gjenbruke bane-, post- og dueoppsett trygt
6. få praktiske treningsprioriteringer basert på egne data
7. gi en trener et bedre og mer strukturert beslutningsgrunnlag
8. bruke avansert AI på ekte strukturert skytterdata uten å skjule usikkerhet

Appen skal fungere både for enkel resultatregistrering og for svært detaljert prestasjonsanalyse. Avanserte funksjoner skal ikke gjøre den grunnleggende flyten tung.

Clay Performance Lab skal bygges som et **AI-native performance-produkt**, ikke som en generell scoreføringsapp med AI-tekst lagt på toppen.

---

## 3. Låste produktprinsipper

Disse beslutningene skal ikke åpnes på nytt uten en tydelig ny begrunnelse.

1. **Trening og konkurranse er forskjellige datatyper.** De skal kunne analyseres samlet der det er meningsfullt, men aldri blandes slik at prosent eller kontekst blir misvisende.
2. **Enkel og avansert bruk skal eksistere side om side.** En bruker skal kunne lagre bare et resultat, mens en avansert bruker kan logge bommer, duer, poster, utstyr og kontekst.
3. **Utstyr er valgfritt.** Våpen, ammunisjon, choke, linser og annet utstyr skal ikke blokkere rask registrering.
4. **Foto- og AI-import skal alltid ha review før lagring.** Ingen automatisk overskriving av brukerdata.
5. **Brukeren skal kunne korrigere AI.** En feil AI-tolkning skal aldri låse brukeren ute fra å fullføre importen.
6. **Offline skal bygges smalt og sikkert først.** Kritisk logging prioriteres før hele appen forsøkes gjort fullt offline.
7. **Delte oppsett skal aldri inneholde personlige prestasjonsdata.** Resultater, bommer, deltakere, utstyr, e-post, interne ID-er og private notater holdes utenfor.
8. **FITASC Sporting er foreløpig ikke del av delbare konkurranseoppsett.**
9. **Training Score Sheet har allerede live treff/bom per due.** Dette er ikke en fremtidig idé.
10. **Deltakerkobling i Training Score Sheet skal ikke kreve klubb i første versjon.** Navn + land/profilkontekst er enklere og gir mindre friksjon.
11. **Performance Report kommer før full Coach Report.** Skytteren skal få verdi selv før coach-samarbeid bygges ut.
12. **Våpen- og utstyrssammenligning skal vise usikkerhet.** Små utvalg og ulik vanskelighetsgrad skal ikke skjules.
13. **AI må være datagrunnlagt og ærlig.** Den skal ikke finne på årsaker eller presentere spekulasjon som fakta.
14. **AI App Copilot skal ikke endre viktig data i skjul.** Viktige handlinger må forhåndsvises og bekreftes.
15. **Betaling og roller er separate systemer.** Pro gir ikke automatisk tilgang til andres data.
16. **Closed beta skal ikke ha synlige paywalls.** Godkjente beta-/adminbrukere skal i praksis ha Pro-lignende tilgang mens billing er skjult.
17. **Betalte AI-kall skal gates server-side.** Frontend alene er ikke sikkerhet.
18. **Kjernefriksjon fra ekte bruk går foran spekulative funksjoner.**
19. **En funksjon er først ferdig når kode, database og faktisk brukerflyt er kontrollert.**
20. **Store PR-er skal kobles til denne roadmapen.**
21. **PWA-en skal oppføre seg som en app.** Innlogget bruker skal ikke møte en falsk login-/forsideflyt ved oppstart.
22. **Pushvarsler skal være opt-in og nyttige.** Ikke bygg masete engagement-varsler som standard.
23. **Én konkurranse kan bruke flere utstyrsoppsett underveis.** Datamodellen skal ikke anta ett fast choke- eller ammunisjonsoppsett for hele konkurransen.
24. **Choke lagres per løp når relevant.** Ammunisjon skal kunne variere mellom første og andre skudd.
25. **Utstyrsendringer bør kunne gjelde fra en bestemt post/stand og videre** til neste endring, slik at brukeren ikke må gjenta samme valg.
26. **Samme event-modell bør senere kunne støtte våpenbytte underveis.**
27. **PWA-appikonet skal bruke den faktiske Clay Performance Lab-logoen.** Det nåværende kodegenererte CP/LAB-ikonet er en teknisk midlertidig løsning, ikke sluttresultatet.

---

## 4. Ferdig i produksjon – nåværende baseline

### 4.1 Beta, tilgang og drift

- Closed beta-tilgang og godkjenningsflyt.
- Adminvisning for beta approvals.
- Feedback-innsending med admintriage og skjermbildevedlegg.
- Export my data.
- Hidden Free/Pro entitlement foundation.
- Billing modes som kan holde betaen uten priser, checkout og paywalls.
- Server-side entitlement guard for betalte AI-funksjoner som Coach Report.

### 4.2 PWA / installert app

- Installerbar PWA på mobil.
- Manifest, Apple web app-metadata, safe-area-støtte og service worker.
- Offline fallback uten caching av autentiserte API-/Supabase-data.
- `Install app` direkte i global meny.
- Android native install prompt der nettleseren tilbyr det.
- iPhone/iPad-veiledning for Safari → Share → Add to Home Screen → Open as Web App → Add.

**Delvis stabilisert:** korrekt auth-aware oppstarts-/login-routing er implementert for `/` og `/login`, mens ekte tilbakeflyt, swipe-back, bredere offlinefunksjonalitet og endelig merkevareikon fortsatt ikke er ferdig.

### 4.3 Konkurranse og resultater

- Opprette Competition-session.
- Result-only / rask resultatregistrering.
- Redigere sentrale sessionopplysninger.
- Leirdue.net-kilde-URL lagres og kan åpnes igjen.
- Competition og Training holdes separate i datagrunnlaget.
- Resultater kan eksistere uten detaljert bom- eller dueinformasjon.

### 4.4 Training Score Sheet

- Flere skyttere i samme treningsskjema.
- Arrangør fører for hele gruppen.
- Live target-by-target hit/miss per post.
- Automatisk totalsummering.
- Variable targets per post.
- Legacy total-only-data bevares trygt.
- Lokal draft for liveføring.

### 4.5 Bomregistrering

- Registrere bom på relevant post/presentasjon/due.
- Egen bomårsak for flere bom i et par.
- Redigere eksisterende bom.
- Strukturerte bomårsaker og target read.
- Fortsette logging uten unødvendig tilbakenavigasjon.

### 4.6 Duer, poster og oppsett

- Discipline-correct struktur for flere sportingdisipliner.
- Compak Sporting med FITASC-programmer og A–F-struktur.
- Sporttrap.
- English Sporting / postbasert sporting.
- Strukturert target definition med type, retning, vinkel, fart, avstand, vanskelighetsgrad og notat.
- Delte konkurranseoppsett med eksplisitt publisering og review før kopi.
- Private, lenkebaserte og søkbare delte oppsett.

### 4.7 Scorecard photo import

- AI-analyse av scorecardfoto.
- Review før apply.
- Hit/miss/unknown-celler.
- Strukturdiscovery.
- Variable targets per post.
- Zero-setup Competition-import for støttede postbaserte disipliner.
- Detektert struktur kan lagres atomisk sammen med score og miss positions.
- Eksisterende kjent setup beskyttes med fingerprint.
- Duplicate/import-retry-beskyttelse.
- Lokal bilde-/review-persistens.

### 4.8 Leirdue.net-import

- Import fra Leirdue.net med review.
- Disiplinnormalisering.
- Deduplication.
- Kildelenke på session.

### 4.9 Performance

- URL-baserte filtre for disiplin, periode og datatype.
- Recent, Best, Trend og Confidence.
- Winner context.
- Competition trend chart med rolling average.
- Shooting-ground analyse.
- Personal shooting ground alias/canonical grouping.
- Session reassignment uten å ødelegge original source ground.
- Performance-siden er komprimert og skal ikke lenger være en ekstra Results-/Training-historikkside.

---

## 5. Under stabilisering – feil og friksjon avdekket i ekte bruk

Dette er høyeste prioritet før større nye funksjoner.

### STAB-01: Scorecard review må bygges om

**Status 19. juli 2026:** Review-stabilisering er implementert i en fokusert PR, men funksjonen skal fortsatt stå som **Under stabilisering** til ekte iPhone/PWA-felttesting bekrefter flyten.

**Problem:** Dagens review flyt gjør det for tungt å sammenligne AI-tolkningen med originalbildet. Feiltolket hit/miss kan gi reconciliation conflict som blokkerer videre fremdrift. Poststruktur tar for mye plass.

**Mål:** Review skal handle om å kontrollere bildet, ikke om å administrere en lang setup-form.

**Krav til neste versjon:**

- Originalbildet skal være lett tilgjengelig under hele reviewen.
- Sticky/minimert bilde eller tilsvarende, med trykk for fullskjerm og zoom. **Implementert, trenger felttest.**
- Brukeren skal kunne endre hver due direkte mellom `Hit`, `Miss` og `Unknown`. **Implementert.**
- AI-detected score skal være et forslag, ikke en lås. **Implementert i review-reconciliation.**
- En brukerbekreftet korrigering skal kunne løse konflikten og tillate apply. **Implementert for komplett review-grid.**
- Konflikttekst skal forklare hva som er feil uten å blokkere en gyldig manuell overstyring. **Implementert.**
- Struktur vises kompakt: `16 posts · 120 targets`. **Implementert.**
- Standard + avvik foretrekkes fremfor 16 store inputs, eksempel: `Default 8 · Exceptions P8 6 · P11 6 · P13 6 · P14 6`. **Implementert.**
- Full strukturredigering åpnes bare ved behov. **Implementert.**
- Review skal ikke kreve lang scrolling mellom bilde og cellene som kontrolleres.
- På mobil bør aktiv post og relevant del av bildet kunne sammenlignes tett.

### STAB-02: PWA auth/startup-flow

**Problem:** En bruker som allerede har gyldig Supabase-session kan starte installert app og møte offentlig forside/login, samtidig som Dashboard kan åpnes fordi brukeren faktisk allerede er innlogget.

**Mål:** Ingen falsk login-opplevelse.

**Status 19. juli 2026:** Implementert som en fokusert stabiliseringsretting. `/` og `/login` bruker en delt persisted-session entry-sjekk, viser en nøytral oppstartstilstand mens session avklares, og bruker `router.replace("/dashboard")` når en session finnes. Manifestets `start_url` står fortsatt på `/`, fordi roten nå er auth-aware. `ProfileGate` er fortsatt ansvarlig for beta-, profil- og onboarding-gating på beskyttede sider.

**Implementert:**

- Gyldig innlogget session → åpne Dashboard/app-flow direkte fra `/`.
- Ikke innlogget → offentlig inngang eller login som før.
- Innlogget bruker som åpner `/login` → redirect til Dashboard.
- Automatisk entry-routing bruker replace-semantikk, ikke push.
- Offentlig forside/loginform rendres ikke før initial session-status er avklart.
- Beskyttede sider må fortsatt avvise faktisk utloggede brukere gjennom `ProfileGate`.

**Fortsatt separat:**

- Ekte mobil tilbake-/swipe-atferd.
- Endelig CPL-appikon.
- Bredere offlinefunksjonalitet utover eksisterende smale fallback.

### STAB-03: Mobil appnavigasjon

- Synlig tilbakeknapp på underliggende appskjermer.
- Swipe fra venstre kant for å gå tilbake der det kan gjøres trygt.
- Ikke fange swipe i komponenter der horisontal bevegelse brukes til noe annet.
- Oppførselen skal føles naturlig i standalone PWA.

### STAB-04: Endelig appikon og merkevare

- Erstatt kodegenerert CP/LAB-placeholder med faktisk CPL-monogram/logo.
- Bruk logo uten lang tekst som appikon.
- Lag korrekte størrelser/maskable/Apple-varianter uten å miste lesbarheten.

### STAB-05: Generell mobil tetthet

- Fortsett å redusere unødvendig vertikal plass der ekte bruk viser mye scrolling.
- Ikke globalt krympe touch targets.
- Valgfrie avanserte detaljer skal være collapsed/accordion som standard.

---

## 6. Neste prioriterte kø

Rekkefølgen under er standardrekkefølgen. Den kan endres dersom ekte betabruk avdekker en alvorlig feil.

### Prioritet 1 – Scorecard review v2

Gjennomfør STAB-01 før mer avansert scorecard-AI bygges.

### Prioritet 2 – PWA auth/startup

STAB-02 auth-aware `/` og `/login`-routing er implementert. Videre PWA-stabilisering fortsetter med separat tilbake-/swipe-atferd, endelig ikon og bredere offlinearbeid.

### Prioritet 3 – Varslingsfundament

Start med adminnytte og en generell arkitektur som også kan brukes av vanlige brukere senere.

**Første nyttige versjon:**

- In-app notification center / bjelle.
- Ulest-status.
- Push subscription per enhet.
- Pushvarsel til admin ved ny beta access request.
- Pushvarsel til admin ved ny beta feedback.
- Trykk på varsel åpner riktig adminside.
- App-badge der plattformen støtter det.
- Tydelig brukeropt-in for push.

**Senere bruker-varsler:**

- lagt til i delt Training Score Sheet
- mulig resultat klart til claim/review
- coach-/samarbeidshendelser
- brukerdefinerte treningspåminnelser
- viktig uferdig handling der brukeren faktisk forventer oppfølging

**Ikke mål:** tilfeldige engagement-varsler som `You have not trained for 7 days` uten at brukeren har bedt om dem.

### Prioritet 4 – Mobil appnavigasjon og endelig ikon

Gjennomfør STAB-03 og STAB-04.

### Prioritet 5 – Offline-kjerne

Se eget workstream under.

### Prioritet 6 – Deltakerkobling og personlig etterarbeid i Training Score Sheet

Se eget workstream under.

### Prioritet 7 – Performance Report v1

Shooter-facing analyse før full Coach Report.

---

## 7. Fullt produkt- og idéregister

Dette er masterlisten. Punkter skal ikke fjernes bare fordi de ikke er neste prioritet.

### 7.1 Scorecard, foto og review

**Ferdig / baseline:**

- scorecard photo import
- AI structure discovery
- known-setup verification
- variable targets per post
- review-before-save
- duplicate protection
- zero-setup Competition apply

**Neste / planlagt:**

- SCORE-01: scorecard review v2 med bilde tett på review
- SCORE-02: direkte Hit/Miss/Unknown-korrigering uten AI-lås
- SCORE-03: kompakt struktur med standard + exceptions
- SCORE-04: bedre crop/zoom/fullscreen under review
- SCORE-05: robust håndtering av store mobilbilder før upload
- SCORE-06: bedre kandidatvalg for scorecards med flere skyttere/blokker
- SCORE-07: sterkere local persistence og trygg retry
- SCORE-08: tydeligere server-side input hardening
- SCORE-09: kunne oppgradere result-only/importerte resultater med detaljert scorecard senere

### 7.2 Competition logging

**Planlagt:**

- COMP-01: personlig live Competition scorecard.
- Tre inngangsnivåer:
  - Quick result
  - Detailed result by course/post
  - Live target-by-target
- Første liveversjon støtter én innlogget skytter.
- Offisiell resultatkilde og personlig detaljlogging skal kunne eksistere samtidig.
- Offisiell import må ikke slette brukerens egne target-/missdetaljer.
- Pair/double-semantikk skal være discipline-correct.
- Fravær av registrert bom skal ikke automatisk tolkes som komplett hit-data uten eksplisitt completeness.

### 7.3 Training Score Sheet og delt trening

**Ferdig:**

- arrangør fører flere skyttere
- live target-by-target
- variable targets per post

**Planlagt:**

- TRAIN-01: live navnesøk/autocomplete når arrangør legger til skytter.
- TRAIN-02: forslag til mulig profilmatch for å redusere skrivefeil.
- TRAIN-03: navn + land/profilkontekst, ikke obligatorisk klubb.
- TRAIN-04: bruker kan finne en logg der vedkommende er lagt til.
- TRAIN-05: bruker kan claim/bekrefte sin egen del.
- TRAIN-06: hver deltaker kan etterpå legge til egne bomårsaker, antakelser og kommentarer uten å endre de andres data.
- TRAIN-07: delt treningsscore skal bruke korrekt skjema per disiplin.
- TRAIN-08: shared course/target details synlig for alle deltakere.
- TRAIN-09: Compak-course skal kunne inneholde brukt A–F-program og pair structure.
- TRAIN-10: Training-resultater skal inn i Coach Report, tydelig separert fra Competition.
- TRAIN-11: varsling når en bruker er lagt til eller har et resultat å reviewe/claime.

### 7.4 Offline

**Høy prioritet, smal første versjon:**

- OFFLINE-01: åpne eksisterende relevante sessions uten dekning.
- OFFLINE-02: opprette enkel Training/Competition-session uten dekning der det er trygt.
- OFFLINE-03: logge hit/miss og korrigere lokalt.
- OFFLINE-04: local device storage med tydelig status:
  - local
  - waiting to sync
  - synced
  - conflict
- OFFLINE-05: trygg synk når dekning kommer tilbake.
- OFFLINE-06: duplicate protection.
- OFFLINE-07: enkel konfliktløsning.
- OFFLINE-08: AI-jobber køes og fortsetter når nett er tilbake.

**Første avgrensning:** Training Score Sheet, enkel miss logging og nødvendige session-data. Ikke full offline for hele appen samtidig.

### 7.5 Resultatimport

**Leirdue.net:**

- eksisterende import videreutvikles
- profilbasert importforslag senere
- aliaser/navnematching
- free: mulig begrensning til inneværende sesong
- Pro: eldre historikk/full historikk senere
- deduplication
- fortsatt tydelig source URL

**ClayArena:**

- IMPORT-CA-01: bruker limer inn offentlig ClayArena-URL.
- Parse resultatside, velg skytterrad, review, bekreft.
- Lagre source system + URL.
- Start med HTML, PDF som senere fallback.
- Ingen bakgrunnscrawling i v1.
- Result-only hvis kilden ikke har target-level data.

Detaljer: [ROADMAP_CLAYARENA_IMPORT.md](./ROADMAP_CLAYARENA_IMPORT.md).

### 7.6 Due-, bane- og programdata

**Ferdig baseline:** strukturerte target details og flere discipline-correct oppsett.

**Planlagt / senere:**

- TARGET-01: overhead som egen target type der det er relevant.
- TARGET-02: copy/reuse av target definitions mellom runder.
- TARGET-03: competition target definitions kan deles med andre brukere med review før import.
- TARGET-04: shared target/course library med eksplisitt review.
- TARGET-05: structured profile + free text for vanskelige presentasjoner.
- TARGET-06: `uncertain/complex` tag.
- TARGET-07: course/program overrides uten å ødelegge base-skjema:
  - endre pair type
  - report/simo/on report
  - reverse order
  - andre discipline-correct overrides
- TARGET-08: bilde/video som valgfri dokumentasjon av presentasjon.
- TARGET-09: ShotKam-kobling til due/bom senere.

### 7.7 Performance dashboard og statistikk

**Ferdig baseline:** kompakt Performance-side, filtre, summary, trend, winner context, ground analysis.

**Planlagt:**

- PERF-01: deterministic focus areas fra bom-/targetmønstre.
- Maks få tydelige fokusområder, ikke lange generiske lister.
- Krev tilstrekkelig datagrunnlag før konklusjon.
- PERF-02: flere discipline-specific visualiseringer.
- PERF-03: target type / presentation / ground-analyse der datagrunnlaget støtter det.
- PERF-04: Trap/Jegertrap/Nordisk trap-analyse etter ground/target type når kildedata finnes.
- PERF-05: bedre sammenligning mot winning score over tid.
- PERF-06: kompakte drilldowns uten å gjøre Performance til en historikkside.
- PERF-07: tydelig `Needs cleanup` for importerte ground names uten personlig assignment der det er nyttig.

### 7.8 Performance Report og Coach Report

**Performance Report v1:**

- shooter-facing
- velg periode / siste X sessions
- Competition og Training separat
- kombinert syntese uten å blande målene feil
- én tydelig hovedprioritet for neste trening
- styrker, svakheter og utvikling
- sample size og confidence
- ekte AI-syntese over ferdig strukturert/analysert data
- råfunn skal kunne spores tilbake til sessions

**Coach Report senere:**

- mer datarik rapport
- valgt tidsrom eller siste X sessions
- Competition og Training i egne seksjoner
- preview før deling
- `Send report to coach`
- senere coach accounts og permissions
- kommentarer/feedback fra coach
- delte treningsmål

Detaljer: [ROADMAP_PERFORMANCE_REPORT_AND_COACH_REPORT.md](./ROADMAP_PERFORMANCE_REPORT_AND_COACH_REPORT.md).

### 7.9 AI-native lag

**Strategisk prinsipp:** strukturert data → deterministic validation → statistiske funn → discipline rules → AI-syntese → confidence/limitations.

**Planlagt / senere:**

- AI-01: Performance Report.
- AI-02: Coach Report-syntese.
- AI-03: AI Shooting Assistant Chat som kan svare på spørsmål om brukerens egne data og hagleskyting.
- AI-04: AI App Copilot som kan hjelpe med:
  - opprette økter
  - fylle inn data
  - finne sessions
  - lage rapporter
  - foreslå oppsett
  - tekst/tale
- Viktige Copilot-handlinger skal alltid previewes og bekreftes.
- AI-05: target/sign/scorecard import med multimodal AI.
- AI-06: treningstips koblet til faktiske bommønstre.
- AI-07: eventuelle lenker til relevante Ed Solomons-videoer eller andre godkjente kilder.
- AI-08: foreslå hva brukeren bør logge mer av for å forbedre analysen.

Detaljer:

- [ROADMAP_AI_NATIVE_PRODUCT_STRATEGY.md](./ROADMAP_AI_NATIVE_PRODUCT_STRATEGY.md)
- [ROADMAP_AI_SHOOTING_ASSISTANT_CHAT.md](./ROADMAP_AI_SHOOTING_ASSISTANT_CHAT.md)
- [ROADMAP_AI_APP_COPILOT.md](./ROADMAP_AI_APP_COPILOT.md)

### 7.10 Utstyr, våpen, choke og ammunisjon

**Ferdig baseline:** valgfritt våpen-/utstyrsgrunnlag og egne display names for våpenoppsett.

**Planlagt:**

- EQUIP-01: tagg våpen per session/runde.
- EQUIP-02: sammenlign våpen mot vanlig/default våpen med tydelig sample size.
- EQUIP-03: skill Training og Competition i sammenligning.
- EQUIP-04: varsle om ulik vanskelighetsgrad og lite datagrunnlag.
- EQUIP-05: session equipment timeline / change events.

**Session equipment timeline skal støtte:**

- standard våpen ved start
- standard choke i hvert løp
- standard ammunisjon
- `Change equipment from here` på bestemt post/stand/round
- chokeendring i ett eller begge løp
- forskjellig patron for første og andre skudd
- flere ammunisjonstyper i samme konkurranse
- senere våpenbytte underveis
- endringen gjelder til neste endring

**Analysekrav:**

- Ikke tilskriv hele konkurransen ett choke-/ammo-oppsett hvis flere ble brukt.
- Sammenlign bare de delene der oppsettet faktisk var aktivt.
- Vis små samples tydelig.
- Ikke konkluder med objektivt bedre utstyr uten tilstrekkelig grunnlag.

### 7.11 Choke- og ammunisjonsvelger

Senere beslutningsstøtte:

- brukerens egne registrerte choker og patroner prioriteres
- target distance, angle, visible target area, speed, target type og shot order kan inngå
- forskjellige choker per løp ved behov
- mønstringstester kan inngå når de finnes
- forklar usikkerhet
- aldri garanti for treff

Detaljer: [ROADMAP_CHOKE_SELECTOR.md](./ROADMAP_CHOKE_SELECTOR.md).

### 7.12 Shooter profile

**Planlagt:**

- navn og aliases
- land
- valgte disipliner
- default gun/barrel setup
- default ammo
- default lenses
- preferanser som kan forenkle import og defaults
- alt valgfritt utover det som faktisk trengs
- ingen unødvendig friksjon i onboarding

### 7.13 Shooting glasses

**Senere:**

- registrere egne linser/glass
- anbefale blant brukerens egne glass
- bruke kamera-/lys-/værkontekst der det kan gjøres pålitelig
- forklare usikkerhet
- ikke skjult kjøpsanbefaling

Detaljer: [ROADMAP_SHOOTING_GLASSES.md](./ROADMAP_SHOOTING_GLASSES.md).

### 7.14 Mental performance

**Strategisk konsept:** praktisk, shooting-specific og valgfritt, ikke terapi.

**Første nyttige versjon senere:**

- rask pre-session check-in:
  - energy
  - focus
  - nerves/pressure
  - confidence
  - main intention
- rask post-session reflection:
  - mental performance
  - pressure handling
  - routine consistency
  - reset after miss
  - what worked
  - what to improve
- valgfrie miss-level tags:
  - rushed shot
  - no clear plan
  - lost focus
  - overthinking
  - hesitation
  - pressure/nerves
  - frustration after previous miss
  - fatigue
  - unknown
- senere analyse av mønstre uten å hevde kausalitet
- enkle rutiner som reset after miss og competition preparation

Detaljer: [ROADMAP_MENTAL_PERFORMANCE.md](./ROADMAP_MENTAL_PERFORMANCE.md).

### 7.15 Varslinger og påminnelser

**Planlagt:**

- NOTIF-01: in-app notification center.
- NOTIF-02: Web Push subscription.
- NOTIF-03: admin – ny beta request.
- NOTIF-04: admin – ny beta feedback.
- NOTIF-05: delt Training Score Sheet.
- NOTIF-06: resultat klart til claim/review.
- NOTIF-07: brukerdefinerte påminnelser.
- NOTIF-08: app badge når støttet.

**Prinsipp:** nyttig hendelse eller eksplisitt valgt påminnelse, ikke tilfeldig engagement-mas.

### 7.16 PWA og app-opplevelse

**Planlagt / under stabilisering:**

- APP-01: riktig auth-aware start route. **Implementert for `/` og `/login`; videre PWA-stabilisering fortsetter separat.**
- APP-02: tilbakeknapp.
- APP-03: edge swipe-back.
- APP-04: ekte CPL-logo som ikon.
- APP-05: fortsatt mobile density cleanup.
- APP-06: tydelig standalone behavior og ingen irrelevante install prompts når appen allerede er installert.
- APP-07: senere vurdering av native wrapper/App Store kun hvis PWA-begrensninger faktisk krever det.

### 7.17 Roller, tilgang og samarbeid

**Planlagt senere:**

- shooter
- coach
- organizer
- shooting ground organization
- eventuelle andre roller med eksplisitte permissions

Produktnivå og rolle holdes separat.

Detaljer: [ROADMAP_ACCESS_LEVELS_AND_ROLES.md](./ROADMAP_ACCESS_LEVELS_AND_ROLES.md).

### 7.18 Free / Pro og betaling

**Ferdig foundation:** hidden entitlements.

**Fremtidig retning:**

- Free: enkel logging, grunnleggende oversikt og begrenset import/history.
- Pro: avansert analyse, AI, Coach workflows, packaged reports og mer historikk.
- Beta forblir uten synlige paywalls til onboarding, import, logging og stabilitet er god nok.
- Alle betalte AI-funksjoner gates server-side.

Detaljer:

- [FREE_VS_PRO.md](./FREE_VS_PRO.md)
- [ENTITLEMENTS.md](./ENTITLEMENTS.md)

### 7.19 Bilder, video og multimodal dokumentasjon

**Senere:**

- ShotKam-video knyttet til session/due/bom.
- Referansebilder av vanskelige presentasjoner.
- Device screenshots fra andre systemer som optional evidence.
- Sammenligne lignende presentasjoner visuelt.
- AI kan tolke materialet, men review og confidence beholdes.

### 7.20 Læring og treningsinnhold

**Senere:**

- tips koblet til reelle miss patterns
- relevante videoressurser
- personal training priorities
- foreslått drill/session structure
- planlagte treningsøkter
- mental routines

Dette skal være nyttig også uten Pro, men avansert personlig AI-syntese kan høre til Pro senere.

### 7.21 Konkurrentposisjonering og lansering

- Smoke'em / Smoke 'Em Claysports og BestShot følges som relevante referanser.
- Clay Performance Lab bør bevege seg mot riktige offentlige kanaler når kjerneflytene er pålitelige.
- Ikke ofre datakvalitet og tillit for å lansere for tidlig.
- Social feed, trophies, leaderboards og full club premium er ikke tidlige lanseringsblokker.
- Closed beta og kontrollert testergruppe prioriteres nå.

Detaljer: [ROADMAP_COMPETITOR_POSITIONING_AND_LAUNCH_WINDOW.md](./ROADMAP_COMPETITOR_POSITIONING_AND_LAUNCH_WINDOW.md).

---

## 8. Avhengighetsrekkefølge

Denne rekkefølgen skal beskytte mot å bygge avansert funksjonalitet på ustabil grunn.

### Først: kjernefriksjon og datakvalitet

1. Scorecard review v2.
2. Auth-aware PWA startup.
3. Appnavigasjon/branding.
4. Varslingsfundament.
5. Offline-kjerne.

### Deretter: bedre datainnsamling og samarbeid

6. Training participant matching/claiming.
7. Competition live target-by-target.
8. Mer robust equipment timeline.
9. Shared target/course reuse.

### Deretter: analyseproduktet

10. Deterministic focus areas.
11. Performance Report v1.
12. Coach-ready report.
13. AI Shooting Assistant.
14. AI App Copilot.

### Senere: utvidelser

15. ClayArena.
16. Mental performance.
17. Shooting glasses.
18. Choke/ammo recommendation.
19. ShotKam/video.
20. Bredere roller/organisasjoner og kommersialisering.

---

## 9. Spesialiserte roadmap-dokumenter

Disse dokumentene utdyper hovedroadmapen og skal ikke være parallelle kilder til prioritet:

- [ROADMAP_AI_NATIVE_PRODUCT_STRATEGY.md](./ROADMAP_AI_NATIVE_PRODUCT_STRATEGY.md)
- [ROADMAP_AI_SHOOTING_ASSISTANT_CHAT.md](./ROADMAP_AI_SHOOTING_ASSISTANT_CHAT.md)
- [ROADMAP_AI_APP_COPILOT.md](./ROADMAP_AI_APP_COPILOT.md)
- [ROADMAP_PERFORMANCE_REPORT_AND_COACH_REPORT.md](./ROADMAP_PERFORMANCE_REPORT_AND_COACH_REPORT.md)
- [ROADMAP_DISCIPLINE_SPECIFIC_VISUALS.md](./ROADMAP_DISCIPLINE_SPECIFIC_VISUALS.md)
- [ROADMAP_VISUAL_TARGET_BUILDER.md](./ROADMAP_VISUAL_TARGET_BUILDER.md)
- [ROADMAP_MENTAL_PERFORMANCE.md](./ROADMAP_MENTAL_PERFORMANCE.md)
- [ROADMAP_CLAYARENA_IMPORT.md](./ROADMAP_CLAYARENA_IMPORT.md)
- [ROADMAP_SHOOTING_GLASSES.md](./ROADMAP_SHOOTING_GLASSES.md)
- [ROADMAP_CHOKE_SELECTOR.md](./ROADMAP_CHOKE_SELECTOR.md)
- [ROADMAP_ACCESS_LEVELS_AND_ROLES.md](./ROADMAP_ACCESS_LEVELS_AND_ROLES.md)
- [ROADMAP_COMPETITOR_POSITIONING_AND_LAUNCH_WINDOW.md](./ROADMAP_COMPETITOR_POSITIONING_AND_LAUNCH_WINDOW.md)
- [FREE_VS_PRO.md](./FREE_VS_PRO.md)
- [ENTITLEMENTS.md](./ENTITLEMENTS.md)
- [PWA_INSTALLATION.md](./PWA_INSTALLATION.md)
- [SCORECARD_PHOTO_IMPORT.md](./SCORECARD_PHOTO_IMPORT.md)
- [TRAINING_SCORE_SHEETS.md](./TRAINING_SCORE_SHEETS.md)

---

## 10. Arbeidsmåte fremover

Når en ny idé kommer opp:

1. Legg den inn i denne roadmapen eller et detaljdokument samme dag som den blir en reell produktbeslutning.
2. Gi den et workstream-/feature-ID der det er nyttig.
3. Plasser den som Ferdig, Under stabilisering, Neste, Planlagt, Senere eller Parkert.
4. Beskriv problemet før løsningen.
5. Definer minste nyttige versjon.
6. Skriv hva som uttrykkelig ikke inngår.
7. Koble større PR-er til roadmap-punktet.
8. Flytt ikke punktet til Ferdig før produksjonsstatus er bekreftet.

Når tilbakemelding kommer fra en betatester:

1. Registrer innspillet i [TESTER_FEEDBACK.md](./TESTER_FEEDBACK.md).
2. Gi det en synlig status og kort begrunnelse.
3. Prioriter feil og friksjon i kjerneflyter først.
4. Trekk frem små, tydelige forbedringer med høy bruker-verdi.
5. Gi beskjed når innspillet er lansert.

Når en PR merges:

- oppdater relevant status i dette dokumentet ved større produktendringer
- legg inn ny beslutning dersom PR-en endrer produktretningen
- oppdater testerfeedback som er levert
- fjern utdaterte begrensninger
- behold viktige beslutninger som fortsatt gjelder

---

## 11. Audit-status 19. juli 2026

Denne versjonen samler og gjør eksplisitt de viktigste beslutningene og idéene som tidligere var fordelt mellom:

- hovedroadmapen
- spesialiserte roadmap-dokumenter
- beta- og testerfeedback
- nylige produksjonsendringer
- diskusjoner om scorecard, PWA, notifications, offline, AI, Performance, Coach, equipment og shared training

Særlig disse nylige idéene er nå eksplisitt sikret i masterroadmapen:

- scorecard review med fri manuell korrigering
- originalbildet tilgjengelig under review
- kompakt poststruktur med default + exceptions
- auth-aware PWA startup for `/` and `/login`
- admin pushvarsler for beta requests og feedback
- in-app notification center
- nyttige brukerpushvarsler senere
- tilbakeknapp og swipe-back
- faktisk CPL-logo som appikon
- flere ammunisjonstyper i samme konkurranse
- chokeendringer under konkurransen
- choke per løp
- forskjellig ammunisjon på første og andre skudd
- `Change equipment from here`-modell
- senere våpenbytte underveis

Ved uenighet mellom eldre samtaler og dette dokumentet skal denne roadmapen brukes som utgangspunkt, men faktisk kode og produksjonsstatus har alltid siste ord.


## Near-term Equipment note: Last serviced

Issue #224 is implemented as the first weapon-maintenance field: an optional date-only `Last serviced` value per weapon, visible on Equipment gun cards and editable from the existing gun editor Advanced details area. It does not add friction to quick Competition or Training logging and is intentionally not written into historical equipment snapshots. Full service history, service reminders and maintenance analytics remain follow-up work.

## Stabilization note: Scorecard review

Scorecard review remains under stabilization until real iPhone/PWA field testing confirms the PR #223 flow in the field.
