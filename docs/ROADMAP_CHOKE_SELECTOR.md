# Roadmap-idé: choke- og ammunisjonsvelger

Status: Senere idébank

## Problem

Skyttere må ofte velge choke og ammunisjon ut fra flere duer med ulik avstand, vinkel, hastighet og synlig flate. Det er vanskelig å finne et oppsett som fungerer godt både på én enkelt due og samlet for hele posten, banen eller konkurransen.

## Mål

Appen skal kunne anbefale choke og ammunisjon for én enkelt due, eller finne det beste kompromisset for flere duer samlet. For over/under-hagler skal appen også kunne foreslå ulike choker i nedre og øvre løp når det er hensiktsmessig.

## Input per due

- estimert avstand ved skuddløsning
- vinkel eller presentasjonstype
- hvor mye av duen som er synlig mot skytteren
- hastighet
- retning og eventuell stigning eller fall
- duekategori, for eksempel standard, battue, midi, mini, rabbit eller annen type
- forventet første- eller andreskudd
- eventuell usikkerhet i estimatene

## Brukerprofil og utstyrsdata

Brukeren bør kunne registrere:

- hagle og kaliber
- løpslengde
- hvilke choker brukeren eier
- faktisk innsnevring dersom kjent
- stål- eller blygodkjenning og andre relevante begrensninger
- hvilke patroner brukeren har tilgjengelig
- haglstørrelse
- ladningsvekt
- utgangshastighet dersom kjent
- produsent og patronmodell

Appen skal i første versjon primært anbefale blant brukerens egne registrerte choker og patroner.

## Foreslått flyt for én due

1. Brukeren registrerer dueegenskapene.
2. Appen beregner et ønsket spenn for mønstertetthet og energireserve.
3. Brukerens tilgjengelige choke- og ammunisjonskombinasjoner vurderes.
4. Appen rangerer alternativene.
5. Brukeren får ett hovedforslag og ett eller to alternativer med forklaring.

Eksempel på forklaring:

- anbefalt på grunn av lang avstand og liten synlig flate
- åpnere choke er mulig, men gir mindre margin ved ytterkant av svermen
- større hagl kan gi bedre energireserve, men færre hagl i svermen

## Foreslått flyt for flere duer

Når flere duer legges inn, skal appen kunne:

- evaluere hver due separat
- beregne en samlet egnethetsscore for hver tilgjengelige choke- og ammunisjonskombinasjon
- foreslå det beste kompromisset for alle duene
- vise hvilke duer som trekker anbefalingen i strammere eller åpnere retning
- foreslå ulike choker i løp 1 og løp 2 når dette gir bedre total dekning
- ta hensyn til sannsynlig skuddrekkefølge
- skille mellom enkeltduer, reportpar, simopar og on-report-par

For en over/under-hagle kan resultatet for eksempel være:

- nedre løp: Improved Cylinder med patron A
- øvre løp: Modified med patron B

Appen bør også vise et enklere alternativ dersom brukeren ønsker samme patron i begge løp eller samme choke gjennom hele banen.

## Beregningsmodell

Modellen bør bygge på dokumenterte prinsipper for:

- forventet mønsterdiameter og mønstertetthet ved ulike avstander
- chokeinnsnevring
- antall hagl i ladningen
- haglstørrelse og forventet energitap
- dueflate og presentasjonsvinkel
- ønsket sikkerhetsmargin for treff

Faktiske mønstre varierer mellom hagle, choke og patron. Derfor må appen kunne bruke brukerens egne mønstringstester som et bedre datagrunnlag enn generelle tabellverdier når slike tester finnes.

## Minste nyttige versjon

- registrer tilgjengelige choker og patroner i profilen
- legg inn én eller flere duer manuelt
- anbefaling av choke og patron per due
- samlet anbefaling for alle registrerte duer
- støtte for én eller to forskjellige choker i over/under-hagle
- forklaring på hvilke egenskaper som påvirket anbefalingen
- tydelig usikkerhetsnivå
- mulighet til å lagre faktisk valgt oppsett

## Viktige avgrensninger

- Anbefalingen skal være beslutningsstøtte, ikke en garanti for treff.
- Appen må ikke late som generelle chokeverdier beskriver det faktiske mønsteret i enhver hagle.
- Personlig mønstring på papir skal veie tyngre enn standardtabeller når data finnes.
- Lovlige begrensninger for haglmateriale, haglstørrelse og ladningsvekt må respekteres for aktuell disiplin og bane.
- Rekyl, skytterkomfort og våpengodkjenning må tas med i vurderingen av ammunisjon.
- Appen skal ikke anbefale en kombinasjon som brukeren har registrert som uegnet eller ikke godkjent for våpenet.
- Ved stor usikkerhet i avstand eller hastighet skal anbefalingen vise dette tydelig.

## Mulige senere utvidelser

- kameraanalyse av duebanen for å estimere vinkel, synlig flate og hastighet
- import av kronografdata
- lagring av egne mønstringsbilder og automatisk telling av hagl
- personlig modell basert på faktisk treffprosent med ulike oppsett
- anbefaling per post, bane eller konkurranse
- kobling mot delte konkurranseoppsett og dueinformasjon som allerede finnes i appen
- forslag til når det er bedre å bruke samme oppsett hele dagen fremfor å bytte ofte
- sammenligning av innvendige og utvendige choker

## Låst beslutning for første versjon

Første versjon skal prioritere brukerens egne choker og patroner, vise tydelig usikkerhet og støtte både enkelt-due-anbefaling og samlet kompromiss for flere duer. Ulike choker i de to løpene skal bare anbefales når skuddrekkefølgen og dueoppsettet gjør det relevant.
