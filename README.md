# VR-piilohippa

Selaimessa pelattava piilohippa VR-laseille: Android-puhelin laitetaan VR-kehikkoon ja peliä ohjataan Bluetooth-peliohjaimella (8BitDo NES30).

**Pelaa:** https://willizilliw.github.io/vr-piilohippa/

## Pelaaminen

1. Käynnistä NES30 pitämällä START pohjassa (Android-tila, ohjaimen oletus) ja yhdistä se puhelimeen Bluetoothilla.
2. Avaa peli puhelimen Chromessa ja paina **Aloita VR-laseilla**.
3. Laita puhelin laseihin. Aulassa valitaan rooli: katso porttia ja paina A, tai kävele portista läpi. Keskimmäinen ARVONTA-portti arpoo roolin puolestasi.

| Nappi | Toiminto |
|---|---|
| Pää | Katsominen (puhelimen asentoanturi) |
| Ristiohjain | Liikkuminen katseen suuntaan |
| L / R | Kääntyminen |
| A | Valitse / ota kiinni |
| B (pohjassa) | Juoksu |
| X (pohjassa) | Kyykky |
| Y | Hyppy, reunalle kiipeäminen |
| Select | Nollaa katsesuunta |
| Start | Asetukset |

### Kännykällä ilman VR-laseja

Paina aloitusruudulla **Pelaa kännykällä** ja käännä puhelin vaakaan. Peliohjainta ei tarvita.

| Kosketus | Toiminto |
|---|---|
| Vasen peukalo (ruudun vasen puoli) | Liikkuminen; tikku reunaan = juoksu |
| Vedä ruudun oikealla puolella | Katsominen |
| A | Valitse / ota kiinni |
| Y | Hyppy, reunalle kiipeäminen |
| B (pohjassa) | Juoksu |
| X | Kyykky päälle / pois |
| ☰ | Asetukset (tikulla liikutaan, A valitsee) |

Kosketusnapeissa on samat kirjaimet kuin NES30-ohjaimessa, joten pelin nappikehotteet pätevät myös kännykällä.

Kun peli pyytää painamaan nappia, kehotteessa näkyy NES30-ohjaimen kuva, jossa painettava nappi on korostettu keltaisella. NES30:n toimintonapit ovat ristissä: X ylhäällä, A oikealla, B alhaalla ja Y vasemmalla. Aulan nappitestillä näet, minkä napin peli tunnistaa.

## Pelin kulku

Pelissä on sinä ja neljä tietokoneen hahmoa, joista yksi on etsijä. Aulassa valitset, aloitatko etsijänä vai piiloutujana. Peli kestää 4 minuuttia.

- **Kiinni jäänyt muuttuu etsijäksi.** Aina kun etsijä saa jonkun kiinni, kiinni jäänyt on uusi etsijä ja entisestä etsijästä tulee piiloutuja. Uusi etsijä laskee pesäpuulla 20 sekuntia, ja muut juoksevat piiloon. Peliaika ei nollaudu, eikä se kulu laskennan aikana. Sama sääntö koskee myös tietokoneen hahmoja keskenään.
- **Etsijänä** lasket silmät kiinni ja etsit sitten: katso piiloutujaa läheltä ja paina A. 30 sekunnin välein näet hetken seinien läpi näkyvät valopylväät kaikkien piiloutujien kohdalla. Etsijän tunnistaa punaisesta paidasta ja lippiksestä.
- **Piiloutujana** juokset piiloon, kun etsijä laskee. Etsijä näkee, kuulee juoksun ja osaa kiivetä tikkaita katoille. Lisäksi etsijä saa 30 sekunnin välein tietää, missä kaikki piiloutujat ovat, ja lähtee lähimmän luo – vaihda siis välillä piilopaikkaa.
- **Kun aika loppuu**, voitat, jos olet piiloutuja, ja häviät, jos olet etsijä.
- Kaupunkia kiertää metsä, jossa voi juosta ja piiloutua puiden, pensaiden, kivien ja kaatuneiden runkojen taakse.
- **Aarrelaatikko** ilmestyy etsinnän aikana satunnaiseen paikkaan. Sen tunnistaa kultaisesta valokeilasta ja hiljaisesta kilkatuksesta. Piiloutuja, joka kävelee laatikon luo, saa siitä satunnaisen apuvälineen. Etsijä ei näe laatikkoa. Kun etsijä 30 sekunnin välein saa tietää piiloutujien sijainnit, piiloutujat näkevät samalla hetken kultaisen pylvään laatikon kohdalla seinien läpi. Uusi laatikko ilmestyy 25 sekuntia edellisen avaamisen jälkeen. Tietokoneen piiloutujat hakevat laatikon, jos tietävät siitä (paljastuksen jälkeen tai aivan vierestä) ja etsijä on kaukana.

  | Apuväline | Mitä tekee |
  |---|---|
  | Näkymättömyys (12 s) | Etsijä ei näe eikä kuule sinua |
  | Pikajuoksu (15 s) | Liikut 1,6 kertaa tavallista nopeammin |
  | Hämäysääni | Kaukana kuuluu askelia, ja etsijä lähtee tutkimaan niitä |
  | Etsijätutka (10 s) | Etsijän kohdalla näkyy seinien läpi näkyvä pylväs |
- Pensaissa ja kyykyssä on vaikeampi huomata. Tietokoneen piiloutujat pakenevat, jos etsijä tulee liian lähelle.
- Vaikeustaso (asetukset) vaikuttaa etsijän näköön, reaktioaikaan ja nopeuteen.

## Äänet

Käytä kuulokkeita: hahmojen ja autojen äänet ovat 3D-ääniä, joten kuulet, mistä suunnasta ne tulevat. Äänenvoimakkuuden voi säätää asetuksista.

| Ääni | Mitä tarkoittaa |
|---|---|
| Raskaat, matalat askeleet | Etsijä on lähellä |
| Kevyet, terävät askeleet | Piiloutuja liikkuu |
| Nouseva "hm?" | Etsijä kuuli jotain ja tulee katsomaan |
| Kaksisävyinen hälytys | Etsijä näki sinut – juokse! |
| Piippaukset (viimeiset kolme korkeampia) | Laskenta |
| Torvisointu | Etsintä alkaa |
| Tik-tak | 30 sekuntia jäljellä |
| Nouseva fanfaari | Löysit piiloutujan |
| Kaksi laskevaa nuottia | Etsijä sai jonkun muun kiinni |
| Kaikuva "ping" | Kaikkien piiloutujien sijainnit paljastuivat etsijälle |
| Kimalteleva kolmisointu | Aarrelaatikko ilmestyi (kuuluu sen suunnalta) |
| Hiljainen kilkatus | Aarrelaatikko on lähellä |
| Nouseva liuku ja kimallus | Aarrelaatikko avattiin |
| Kaksi laskevaa piippausta | Apuväline loppui |
| Laskeva "vaa-vaa" | Jäit kiinni |
| Metallinen kilahdus | Tikkaat |
| Tööttäys | Seisot auton edessä |

Kyykyssä liikut äänettömästi; juokseminen kuuluu etsijälle.

Tikkaita pitkin kiivetään ristiohjaimen ylänuolella. Katoille pääsee tikkailla, ja matalille reunoille (aidat, autot, laatikot, katokset) Y-napilla.

## Kehitys

```bash
npm install
npm run dev        # HTTPS, myös puhelimelle samasta verkosta
npm run dev:http   # pelkkä HTTP tietokoneella testaamiseen
npm run build
```

Tekniikka: Vite + TypeScript + Three.js. Kaikki tekstuurit piirretään koodilla, joten kuvatiedostoja ei tarvita. Jokainen push `main`-haaraan julkaisee pelin automaattisesti GitHub Pagesiin.
