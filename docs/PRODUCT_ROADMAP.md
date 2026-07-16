# Clay Performance Lab – produktplan

Sist oppdatert: 16. juli 2026

Dette dokumentet er prosjektets hovedkilde for produktstatus, prioriteringer og avgrensninger. Det skal oppdateres når en funksjon endrer status, når en viktig beslutning tas, eller når en PR flytter noe fra plan til produksjon.

Konkrete innspill fra betatestere føres i [TESTER_FEEDBACK.md](./TESTER_FEEDBACK.md).

## Statusregler

Alle større funksjoner skal ligge i én av disse kategoriene:

- **Ferdig i produksjon** – kode er merget, nødvendig databaseendring er kjørt, og hovedflyten er kontrollert.
- **Pågår** – aktivt arbeid i en åpen gren eller PR.
- **Neste** – prioritert arbeid som skal tas før øvrige idéer.
- **Senere** – ønskelig, men ikke prioritert nå.
- **Utsatt eller avvist** – bevisst ikke del av nærmeste plan.

En funksjon skal ikke beskrives som ferdig bare fordi deler av den finnes i kode eller fordi den har vært diskutert.

---

## 1. Produktmål

Clay Performance Lab skal gjøre det enklere for leirdueskyttere å:

1. registrere konkurranser og trening uten unødvendig friksjon
2. forstå hvilke duer de bommer på og hvorfor
3. se utvikling over tid
4. dele og gjenbruke bane-, post- og dueoppsett trygt
5. gi en trener et bedre og mer strukturert beslutningsgrunnlag
6. bruke avansert AI på strukturert skytterdata for å gjøre resultatdata om til praktisk treningsfokus

Appen skal fungere både for enkel resultatregistrering og for detaljert prestasjonsanalyse. Avanserte funksjoner skal ikke gjøre den grunnleggende flyten tung.

Clay Performance Lab skal behandles som et AI-native performance-produkt, ikke bare en scoreføringsapp med AI-tekst på toppen. Se [ROADMAP_AI_NATIVE_PRODUCT_STRATEGY.md](./ROADMAP_AI_NATIVE_PRODUCT_STRATEGY.md).

---

## 2. Ferdig i produksjon

### Registrering og sessioner

- Opprette konkurranse og trening.
- Enkel result-only-registrering.
- Redigere sentrale sessionopplysninger i etterkant.
- Skille mellom trening og konkurranse i datagrunnlaget.
- Valgfri registrering av våpen, ammunisjon og relevant utstyr.

### Training Score Sheet

- Opprette delt treningsscorekort for flere skyttere.
- Live registrering av **treff og bom for hver enkelt due**.
- Automatisk summering per skytter og post.
- Mobiltilpasset livevisning for bruk ute på banen.
- En arrangør kan føre resultatene for hele gruppen.

Dette betyr at target-by-target-føring allerede er implementert. Det skal ikke stå som en fremtidig oppgave.

### Bomregistrering og analysegrunnlag

- Registrere bom på riktig due eller presentasjon.
- Egne bomårsaker for flere bom i samme par.
- Redigere lagrede bommer.
- Fortsette registreringen uten unødvendig tilbakenavigasjon.
- Strukturert dueinformasjon for sportingdisipliner, blant annet type, retning, vinkel, fart, avstand, vanskelighetsgrad og notat.

### Disipliner og oppsett

- Leirduesti og andre post-/standbaserte sportingflyter.
- Compak Sporting med FITASC-programmer og A–F-struktur.
- Sporttrap.
- English Sporting med standbasert oppsett.
- Discipline-correct struktur for relevante skjemaer og presentasjoner.

### Fotoimport og kontroll

- Import av post-/standskilt fra bilde med manuell kontroll før lagring.
- Lokal kø for bilder som tas uten dekning og senere kan analyseres.
- Scorecard-import fra bilde for støttede disipliner.
- Review før data skrives.
- Beskyttelse mot dobbeltimport og overskriving.
- Kontroll av at session-oppsettet ikke har endret seg mellom analyse og apply.
- Støtte for varierende antall duer per post/stand der disiplinen krever det.

### Leirdue.net-import

- Import av resultater fra Leirdue.net med manuell gjennomgang.
- Normalisering av relevante disiplinvarianter.
- Beskyttelse mot duplikater.

### Delte konkurranseoppsett

- En bruker kan publisere et konkurranseoppsett eksplisitt.
- Oppsett kan være privat, tilgjengelig via lenke eller søkbart.
- Andre brukere kan forhåndsvise og kopiere oppsettet uten å få med resultater, bommer, deltakere, utstyr eller private notater.
- Søkbart oppsett kan foreslås ved opprettelse av vanlig konkurranse og result-only.
- Forslag bruker disiplin, dato, navn, skytebane, antall duer og kompletthet.
- Treff på dato innen pluss/minus én dag støttes.
- Brukeren må selv velge og bekrefte oppsettet.
- Oppsettet legges på samme session; det opprettes ikke en skjult ekstrasession.

Delte oppsett støttes foreløpig ikke i scorecard-import eller Leirdue.net-import.

### Data og sikkerhet

- Eksport av egne data.
- Godkjent bruker kreves for beskyttede funksjoner.
- Databasefunksjoner for delte oppsett er begrenset til innloggede brukere.
- Serveren kontrollerer eierskap, disiplin og om en session er tom før delt oppsett kan legges til.

---

## 3. Pågående arbeid

Ingen større produktfunksjon er registrert som aktiv etter merge av PR #129.

Før nytt hovedarbeid starter skal denne delen oppdateres med:

- PR-nummer
- konkret mål
- avgrensning
- testansvar
- hva som må være godkjent før merge

Det skal normalt bare være én større produktfunksjon under aktiv utvikling om gangen.

---

## 4. Neste prioriterte arbeid

### Prioritet 1: Stabilisering og reell brukertest av de nyeste flytene

**Problem:** Flere store funksjoner er nylig levert tett etter hverandre. Nye feil eller friksjon må oppdages før enda mer bygges oppå dem.

**Omfang:**

- Test vanlig konkurranse med delt oppsett.
- Test result-only med delt oppsett.
- Test scorecard-import i støttede disipliner.
- Test Training Score Sheet med flere skyttere over en full økt.
- Registrer konkrete feil, ekstra trykk og uklare tekster.

**Ikke del av dette arbeidet:** Nye analysefunksjoner eller større redesign.

**Ferdig når:** Kjente kritiske feil er rettet, og minst én reell økt eller konkurranse er gjennomført uten datatap eller blokkering.

### Prioritet 2: Raske forbedringer fra betatestere

**Problem:** Testere må oppleve at konkrete og nyttige tilbakemeldinger blir registrert, prioritert og synlige i appen. Ellers faller motivasjonen for videre testing raskt.

**Første godkjente innspill fra Simon:**

1. **Konkurranseaktivitet:** Vis totalt antall konkurranser, totalt antall konkurranseduer/skudd, antall konkurranser i inneværende år og mulighet til å velge et annet år.
2. **Eget navn på våpenoppsett:** La brukeren gi hvert våpen eller løpsoppsett et valgfritt navn, slik at flere like modeller og forskjellige løpssett kan skilles fra hverandre.

**Minste nyttige versjon:**

- konkurranseoversikten skiller tydelig mellom trening og konkurranse
- importerte og manuelt registrerte resultater skal ikke dobbelttelles
- våpennavn er valgfritt og ødelegger ikke eksisterende utstyrsdata
- det egendefinerte navnet vises ved valg av utstyr, i historikk og i senere sammenligninger

**Ferdig når:** Begge forbedringene er testet av minst én betatester og tilbakemeldingen er markert som Released i [TESTER_FEEDBACK.md](./TESTER_FEEDBACK.md).

### Prioritet 3: Deltakerkobling og personlig etterarbeid for Training Score Sheet

**Problem:** Arrangøren kan føre hele treningen, men deltakerne bør senere kunne finne sin egen registrering og berike den med personlige vurderinger.

**Minste nyttige versjon:**

- Arrangøren legger til skyttere med navn og eventuelt land/profilkontekst.
- Søk og forslag reduserer skrivefeil og dobbeltprofiler.
- En innlogget bruker kan se en mulig treningsregistrering der vedkommende er oppført.
- Brukeren kan bekrefte eller overta sin egen del av resultatet.
- Etter overtakelse kan brukeren legge inn egne bomårsaker, antakelser og notater uten å endre de andre deltakernes data.

**Ikke i første versjon:**

- klubbfelt
- full automatisk matching uten bekreftelse
- avanserte roller eller coach-tilganger
- varsling i alle kanaler

**Hvorfor dette er neste større produktfunksjon:** Training Score Sheet er allerede brukbart live. Den største mangelen er nå eierskap og verdi for hver enkelt deltaker etter økten.

### Prioritet 4: Offline-kjerne for logging

**Problem:** Enkelte skytebaner mangler mobildekning. Kritisk registrering må ikke være avhengig av nett.

**Minste nyttige versjon:**

- Opprette eller åpne en relevant session uten dekning.
- Føre treff, bom og enkle korrigeringer lokalt.
- Tydelig status for lokalt lagret, venter på synk og synkronisert.
- Sikker synk når nettet kommer tilbake.
- Beskyttelse mot duplikater og enkle konflikter.

**Første avgrensning:** Start med Training Score Sheet og enkel bomregistrering. Ikke forsøk å gjøre alle appfunksjoner offline samtidig.

### Prioritet 5: Performance Report v1 og coach-ready rapportgrunnlag

**Problem:** Data finnes, men den må bli en engasjerende, AI-støttet prestasjonsanalyse som hjelper skytteren videre – ikke bare en liste med tall.

**Minste nyttige versjon:**

- Shooter-facing **Performance Report** med én tydelig hovedprioritet for neste trening.
- Egen seksjon for konkurranse og trening.
- Kombinert oversikt uten å blande datatypene ukritisk.
- Treffprosent og bommønstre etter tilgjengelig dueinformasjon.
- Ekte AI-syntese over strukturert data, med regler/statistikk som beskytter analysen.
- Tydelig markering av lite datagrunnlag og usikkerhet.
- Disiplinspesifikk visuell visning der datagrunnlaget støtter det.
- Forhåndsvisning før Coach Report deles.

**Ikke i første versjon:** Egen coach-konto, løpende chat, automatiske treningsprogrammer, skjult deling eller betalt coach-marketplace.

**Detaljer:** Se [ROADMAP_PERFORMANCE_REPORT_AND_COACH_REPORT.md](./ROADMAP_PERFORMANCE_REPORT_AND_COACH_REPORT.md) og [ROADMAP_DISCIPLINE_SPECIFIC_VISUALS.md](./ROADMAP_DISCIPLINE_SPECIFIC_VISUALS.md).

### Prioritet 6: Våpentesting og enkel sammenligning

**Problem:** Skyttere, blant annet Simon, tester nye våpen og ønsker å kunne sammenligne uten misvisende konklusjoner.

**Minste nyttige versjon:**

- Tagg våpen per session eller runde.
- Sammenlign med brukerens vanlige våpen.
- Skill trening fra konkurranse.
- Vis antall sessioner og antall duer bak sammenligningen.
- Advar ved små utvalg eller tydelig ulik vanskelighetsgrad.

**Ikke i første versjon:** Påstand om at et våpen er objektivt bedre, avansert statistisk modell eller automatisk kjøpsanbefaling.

---

## 5. Senere idébank

Disse punktene er ønskelige, men skal ikke behandles som neste oppgave uten at prioriteringen endres eksplisitt.

### AI-native analyse og assistenter

- Clay Performance Lab skal bygges som et AI-native performance-produkt, ikke bare scoreføring med AI-tekst på toppen.
- AI skal brukes til å tolke strukturert skytterdata, forklare mønstre og foreslå praktisk treningsfokus.
- AI Shooting Assistant Chat skal senere kunne svare på spørsmål om skytterens data, rapporter, trening og hagleskyting innenfor trygge grenser.
- AI App Copilot skal senere kunne hjelpe brukeren å opprette økter, rapporter, søk og treningsplaner ved tekst eller tale, men alltid med forhåndsvisning og bekreftelse før viktige handlinger.
- Detaljer: [ROADMAP_AI_NATIVE_PRODUCT_STRATEGY.md](./ROADMAP_AI_NATIVE_PRODUCT_STRATEGY.md), [ROADMAP_AI_SHOOTING_ASSISTANT_CHAT.md](./ROADMAP_AI_SHOOTING_ASSISTANT_CHAT.md), [ROADMAP_AI_APP_COPILOT.md](./ROADMAP_AI_APP_COPILOT.md).

### Trening og læring

- Tips basert på bommønstre.
- Lenker til relevante videoer fra Ed Solomons eller andre godkjente kilder.
- Personlige treningsprioriteter.
- Planlagte treningsøkter basert på tidligere mønstre.

### Skyteglass

- Kamera- og værbasert anbefaling av det beste glasset blant glassene brukeren faktisk eier.
- Detaljert konsept, MVP, datagrunnlag og avgrensninger: [ROADMAP_SHOOTING_GLASSES.md](./ROADMAP_SHOOTING_GLASSES.md).

### Choke- og ammunisjonsvelger

- Anbefaling av choke og ammunisjon basert på avstand, vinkel, synlig dueflate, hastighet, duetype og forventet skuddrekkefølge.
- Ved flere duer skal appen beregne beste samlede kompromiss og eventuelt anbefale forskjellige choker i øvre og nedre løp.
- Detaljert konsept, MVP, beregningsgrunnlag og avgrensninger: [ROADMAP_CHOKE_SELECTOR.md](./ROADMAP_CHOKE_SELECTOR.md).

### Tilgangsnivåer og brukerroller

- Skill mellom produktnivå og rolle.
- Støtt blant annet skytter, coach, arrangør og skytebaneorganisasjoner med konkrete tillatelser.
- Dette er nødvendig arkitekturgrunnlag før betaling og større coach- eller skytebanefunksjoner lanseres.
- Detaljert konsept: [ROADMAP_ACCESS_LEVELS_AND_ROLES.md](./ROADMAP_ACCESS_LEVELS_AND_ROLES.md).

### Coach og samarbeid

- Sende rapport direkte til trener.
- Coach-kontoer og tilgangsstyring.
- Kommentarer fra trener på utvalgte sessioner eller duer.
- Delte treningsmål.

### Deling og gjenbruk

- Delte treningsbaneoppsett.
- Felles bibliotek for dueoppsett med review før import.
- Forslag til konkurranseoppsett også i scorecard-import og Leirdue.net-import når det kan gjøres sikkert.
- Varsling når en bruker er lagt til i et delt treningsscorekort.

### Bilder og video

- ShotKam-video knyttet til en registrert due eller bom.
- Referansebilder av vanskelige duer.
- Enklere visuell sammenligning av lignende presentasjoner.

### Statistikk og profil

- Mer fleksible periodefiltre.
- Resultatutvikling mot vinnerscore.
- Statistikk per bane, duekategori og presentasjonstype.
- Valgfri skytterprofil med aliaser, standardvåpen, ammunisjon og linser.
- Pro-funksjoner og betaling først når onboarding, import og logging er stabile.

### Konkurrentposisjonering og lansering

- Smoke'em / Smoke 'Em Claysports og BestShot følges som relevante referanser.
- Clay Performance Lab bør bevege seg raskere mot riktige offentlige kanaler, men ikke på bekostning av datakvalitet og tillit.
- Sosial feed, trophies, leaderboards og full club premium er senere muligheter, ikke første lanseringsblokker.
- Detaljer: [ROADMAP_COMPETITOR_POSITIONING_AND_LAUNCH_WINDOW.md](./ROADMAP_COMPETITOR_POSITIONING_AND_LAUNCH_WINDOW.md).

---

## 6. Låste beslutninger og avgrensninger

Disse beslutningene skal ikke åpnes på nytt uten en tydelig ny begrunnelse.

1. **Training Score Sheet har allerede live treff/bom per due.** Dette er ikke en fremtidig oppgave.
2. **Trening og konkurranse skal være tydelig adskilt** i statistikk og Coach Report.
3. **Klubb skal ikke være et obligatorisk matchingfelt** i første versjon av deltakerkobling. Navn og land/profilkontekst er enklere og gir mindre friksjon.
4. **Utstyr er valgfritt.** Våpen, ammunisjon og linser skal ikke blokkere rask registrering.
5. **Enkel og avansert bruk skal kunne eksistere side om side.** Brukeren skal kunne lagre bare resultat uten å fylle inn detaljert dueinformasjon.
6. **Ingen automatisk overskriving fra fotoimport.** Brukeren skal se og godkjenne data før de skrives.
7. **Delte oppsett skal aldri inneholde personlige prestasjonsdata.** Resultater, bommer, deltakere, utstyr, e-post, interne ID-er og private notater skal holdes utenfor.
8. **FITASC Sporting er foreløpig ikke støttet i delbare konkurranseoppsett.**
9. **Scorecard-import og Leirdue.net-import bruker ikke automatisk delte konkurranseoppsett ennå.**
10. **Offline skal bygges smalt og sikkert.** Kritisk logging prioriteres før full offline-støtte i hele appen.
11. **Performance Report kommer før full Coach Report.** Shooter-facing analyse skal hjelpe brukeren selv først; Coach Report er den mer datarike delings-/eksportversjonen for ekte coach.
12. **Sammenligning av våpen skal vise usikkerhet.** Små utvalg og forskjell mellom trening og konkurranse skal ikke skjules.
13. **En funksjon er først ferdig når kode, database og faktisk brukerflyt er kontrollert.**
14. **Nye store funksjoner skal kobles til denne roadmapen.** PR-beskrivelsen skal si hvilket roadmap-punkt den gjennomfører eller endrer.
15. **Skyteglass-anbefalingen skal i første versjon velge blant brukerens egne registrerte glass.** Den skal forklare usikkerhet og være beslutningsstøtte, ikke en sikker fasit eller et skjult kjøpsforslag.
16. **Choke- og ammunisjonsvelgeren skal i første versjon prioritere brukerens egne registrerte choker og patroner.** Den skal vise usikkerhet, bruke egne mønstringstester når de finnes og aldri fremstille anbefalingen som en garanti for treff.
17. **Brukerrolle og produktnivå er separate systemer.** Betaling gir aldri automatisk tilgang til andres data.
18. **Konkrete innspill fra aktive betatestere skal registreres og vurderes før nye spekulative funksjoner.** Små forbedringer med høy nytte og lav risiko kan trekkes foran større roadmap-punkter.
19. **Clay Performance Lab skal være AI-native.** AI skal bruke strukturert skytterdata til analyse, forklaring og treningsfokus, ikke bare generere generisk tekst.
20. **AI må være datagrunnlagt og ærlig om usikkerhet.** AI skal ikke finne på årsaker, skjule lavt datagrunnlag eller presentere tekniske diagnoser som fakta uten støtte.
21. **AI App Copilot skal ikke endre viktig data i skjul.** Den kan lage forslag, drafts og prefill, men viktige handlinger må forhåndsvises og bekreftes av brukeren.

---

## 7. Arbeidsmåte fremover

Når en ny idé kommer opp:

1. Plasser den i Ferdig, Pågår, Neste, Senere eller Utsatt.
2. Beskriv problemet før løsningen.
3. Definer minste nyttige versjon.
4. Skriv hva som uttrykkelig ikke inngår.
5. Flytt ikke punktet til Ferdig før produksjonsstatus er bekreftet.

Når tilbakemelding kommer fra en betatester:

1. Registrer innspillet i [TESTER_FEEDBACK.md](./TESTER_FEEDBACK.md).
2. Gi det en synlig status og kort begrunnelse.
3. Prioriter feil og friksjon i kjerneflyter først.
4. Trekk frem små, tydelige forbedringer med stor bruker-verdi.
5. Gi beskjed til testeren eller betagruppen når innspillet er lansert.

Når en PR merges:

- oppdater relevant status i dette dokumentet
- legg inn PR-nummer ved større endringer
- oppdater testerinnspill som er levert
- fjern utdaterte begrensninger
- behold viktige beslutninger som fortsatt gjelder

Ved uenighet mellom eldre samtaler og dette dokumentet skal denne roadmapen brukes som utgangspunkt, men faktisk kode og produksjonsstatus har alltid siste ord.
