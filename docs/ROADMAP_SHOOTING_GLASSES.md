# Roadmap-idé: kamera- og værbasert valg av skyteglass

Status: Senere idébank

## Problem

Det er vanskelig å velge riktig glass ut fra lysnivå, bakgrunn, farger, vær og temperatur, særlig når forholdene varierer gjennom dagen eller mellom poster.

## Mål

Skytteren skal kunne åpne kameraet i appen, rette det mot banen og få anbefalt det beste alternativet blant glassene skytteren faktisk eier.

## Foreslått flyt

1. Skytteren registrerer sine egne glass i profilen.
2. Appen bruker en produktdatabase med glass fra kjente leverandører.
3. Skytteren åpner kameraet og tar et bilde av aktuell bakgrunn eller bane.
4. Appen analyserer blant annet lysstyrke, kontrast, dominerende bakgrunnsfarger, himmel, vegetasjon, skygge og mulig blending.
5. Appen henter lokal værinformasjon, blant annet skydekke, nedbør, solforhold og temperatur.
6. Appen kombinerer bilde, vær og egenskapene til brukerens egne glass.
7. Brukeren får en rangert anbefaling med kort forklaring på hvorfor ett glass er anbefalt foran et annet.

## Datagrunnlag for glass

- leverandør og modell
- linsefarge og produktnavn
- oppgitt eller målt lysgjennomgang der dette finnes
- anbefalte lys- og værforhold
- fargeforsterkning og hvilke bakgrunner glasset er ment å fungere mot
- eventuelle polariserte, fotokromatiske eller speilbelagte egenskaper
- kilde og dato for produktinformasjonen

Databasen bør prioritere de mest brukte leverandørene innen leirdueskyting. Brukeren skal også kunne legge inn et ukjent eller eldre glass manuelt dersom modellen ikke finnes.

## Minste nyttige versjon

- profilside der brukeren velger hvilke glass vedkommende eier
- kuratert database for et begrenset antall vanlige leverandører og modeller
- ett bilde av banen eller bakgrunnen
- kobling mot aktuell værmelding
- anbefaling bare blant brukerens registrerte glass
- vis toppvalg og ett eller to alternativer
- vis hvilke faktorer som påvirket anbefalingen
- brukeren kan markere hvilket glass som faktisk ble brukt og gi enkel tilbakemelding på om anbefalingen fungerte

## Viktige avgrensninger

- Anbefalingen skal beskrives som beslutningsstøtte, ikke som en fasit.
- Kameraeksponering, automatisk hvitbalanse og skjermgjengivelse kan påvirke analysen og må tas med i usikkerheten.
- Værdata alene er ikke nok; lokal skygge, skyteretning og bakgrunn kan avvike fra værmeldingen.
- Appen skal i første versjon ikke anbefale glass brukeren ikke eier som et kjøpsforslag.
- Produktdata må kunne spores til leverandør eller annen dokumentert kilde og holdes oppdatert.
- Bildet skal ikke lagres permanent uten at brukeren uttrykkelig velger det.

## Mulige senere utvidelser

- sanntidsanalyse direkte fra kameravisningen
- egne anbefalinger per post eller skyteretning
- historikk over glass, forhold og faktisk prestasjon
- personlig tilpasning basert på brukerens tilbakemeldinger
- støtte for fargesyn, individuell kontrastpreferanse og ulike duefarger
- varsling dersom været endrer seg betydelig før eller under økten

## Låst beslutning for første versjon

Anbefalingen skal baseres på brukerens egne registrerte glass. Kamera- og væranalysen skal gi forklart beslutningsstøtte, ikke presenteres som en sikker fasit eller et skjult kjøpsforslag.
