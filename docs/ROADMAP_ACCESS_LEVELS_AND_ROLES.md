# Roadmap-idé: tilgangsnivåer og brukerroller

Status: Senere idébank, men viktig arkitekturgrunnlag før betaling, coach-funksjoner og skytebane-funksjoner bygges ut.

## Problem

Appen vil etter hvert ha brukere med svært ulike behov. En vanlig skytter trenger personlig logging og analyse. En coach trenger tilgang til delte rapporter og eventuelt flere skyttere. En skytebane eller arrangør trenger verktøy for baneoppsett, treningsscorekort, konkurranseoppsett og deling.

Dersom alle brukere får samme menyer og samme rettigheter, blir appen både uoversiktlig og vanskelig å sikre. Betalingsnivå og brukerrolle må derfor behandles som to forskjellige ting.

## Hovedprinsipp

Tilgang skal bestemmes av to lag:

1. **Abonnements- eller produktnivå** – hvor mye funksjonalitet brukeren har betalt for eller fått tilgang til.
2. **Brukerrolle og tillatelser** – hva brukeren har lov til å gjøre i en bestemt sammenheng.

En coach kan for eksempel ha Coach-rollen, men fortsatt være på et begrenset abonnement. En skytter kan ha Pro-abonnement uten å få tilgang til andre skytteres data.

## Foreslåtte produktnivåer

Navnene er foreløpige og skal ikke låses før produktet er mer modent.

### Basic / Free

- enkel konkurranse- og treningslogging
- result-only
- grunnleggende historikk
- begrenset import eller historikk
- enkel profil
- tilgang til egne data

### Performance / Pro

- detaljert bomanalyse
- avansert dueinformasjon
- utvidet historikk og import
- Coach Report for egne data
- våpen-, ammunisjons- og glassprofil
- choke- og ammunisjonsvelger når den finnes
- skyteglass-anbefaling når den finnes
- mer avansert statistikk

### Coach

- coach-spesifikke arbeidsflater
- motta og organisere rapporter fra skyttere som har delt tilgang
- kommentarer og oppfølging dersom dette bygges
- oversikt over flere skyttere uten å få tilgang til mer enn de uttrykkelig har delt

### Shooting Ground / Organizer

- opprette og administrere bane-, post- og dueoppsett
- arrangørstyrt Training Score Sheet
- publisere og vedlikeholde delte konkurranseoppsett
- administrere ansatte eller medhjelpere med begrensede rettigheter
- eventuelt lage offisielle oppsett for et anlegg

### Event / Club / Federation

Mulig senere nivå for større arrangører eller organisasjoner:

- administrere arrangementer og flere baner
- rollefordeling mellom arrangør, dommer, sekretariat og banebygger
- deling av offisielle oppsett
- eventuelle eksport- og integrasjonsbehov

Dette skal ikke bygges før det finnes et reelt behov.

## Foreslåtte brukerroller

En bruker kan ha flere roller samtidig.

### Shooter

- eier og administrerer egne sessioner, resultater, bommer og utstyr
- velger hva som deles med coach eller arrangør
- kan kreve eller bekrefte sin del av et delt treningsscorekort

### Coach

- får bare tilgang til skyttere og data som er uttrykkelig delt
- kan ikke endre skytterens originale resultater
- kan eventuelt legge til egne coach-notater eller anbefalinger i et separat lag

### Shooting Ground Owner / Admin

- administrerer en skytebaneorganisasjon
- inviterer ansatte eller medhjelpere
- bestemmer hvem som kan opprette, redigere og publisere offisielle baneoppsett

### Ground Staff / Course Setter

- kan opprette eller redigere bane-, post- og dueoppsett innenfor en bestemt skytebane
- kan ikke administrere abonnement, fakturering eller andre medlemmer med mindre ekstra tillatelse gis

### Organizer / Scorekeeper

- kan opprette og føre delte treningsscorekort eller arrangementer
- får ikke automatisk permanent tilgang til deltakernes private data

### Admin / Support

- intern driftsrolle
- skal være svært begrenset og loggført
- skal ikke bruke vanlige brukerroller som snarvei til private data

## Organisasjoner og medlemskap

Skytebaner, coach-virksomheter og eventuelt klubber bør representeres som organisasjoner, ikke som spesielle personkontoer.

En organisasjon bør ha:

- navn og type
- eier eller hovedadministrator
- medlemmer
- roller per medlem
- eksplisitte tillatelser
- logg over viktige endringer

En bruker kan være skytter privat, coach i én organisasjon og medarbeider på en skytebane samtidig.

## Tillatelsesmodell

Rettigheter bør gis som konkrete tillatelser fremfor å basere alt på ett rollenavn.

Eksempler:

- `session:create_own`
- `session:read_shared`
- `coach_report:comment`
- `training_score_sheet:create`
- `training_score_sheet:manage`
- `ground_setup:create`
- `ground_setup:publish`
- `organization:invite_member`
- `organization:manage_billing`

Dette gjør det mulig å endre eller kombinere roller uten å skrive om hele sikkerhetsmodellen.

## Deling og samtykke

- Skytterens private data skal være private som standard.
- Coach-tilgang skal kreve tydelig invitasjon eller deling fra skytteren.
- Deling skal kunne avgrenses etter datotype, periode eller rapport.
- Brukeren skal kunne trekke tilbake tilgang.
- Tilbaketrekking skal ikke nødvendigvis slette coachens allerede opprettede egne notater, men videre tilgang til skytterens data skal stoppe.
- Arrangørrollen skal ikke gi permanent tilgang til deltakernes øvrige historikk.

## Minste nyttige versjon

Første tekniske versjon bør være liten:

- behold Shooter som standardrolle
- innfør organisasjoner
- støtt medlemskap med rolle per organisasjon
- innfør konkrete tillatelser på serversiden
- skill produktnivå fra rolle
- lag grunnlag for Coach og Shooting Ground uten å bygge alle arbeidsflatene samtidig
- vis bare relevante menyer og handlinger for brukerens faktiske tilgang

## Viktige avgrensninger

- Rolle skal aldri alene gi tilgang til private data; eierskap, organisasjonstilknytning og eksplisitt deling må også kontrolleres.
- Skjult UI er ikke sikkerhet. Alle rettigheter må håndheves i database og serverfunksjoner.
- Betalt nivå skal ikke overstyre personvern eller eierskap.
- En bruker kan ha flere roller og tilhøre flere organisasjoner.
- Det må finnes tydelig logging av invitasjoner, rolleendringer, deling og tilbakekalling.
- Rolle- og abonnementsmodellen bør bygges før omfattende betaling eller coach-kontoer lanseres.

## Mulige senere utvidelser

- egne planer for individuelle coacher og coach-team
- skytebaneabonnement basert på antall ansatte eller arrangementer
- gjestetilgang med utløpsdato
- midlertidige roller for konkurranser
- foreldrekonto eller vergefunksjon for mindreårige skyttere
- klubb- og forbundsroller
- SSO eller bedriftsinnlogging for større organisasjoner
- fakturering per organisasjon

## Låst beslutning

Brukerrolle og produktnivå skal være to separate systemer. En betalt bruker får ikke automatisk tilgang til andres data, og en coach- eller skytebanerolle skal bare gi de konkrete tillatelsene som trengs i den aktuelle organisasjonen eller delingen.
