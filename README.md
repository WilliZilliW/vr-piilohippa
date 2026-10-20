# VR-piilohippa

Selaimessa pelattava piilohippa VR-laseille: Android-puhelin laitetaan VR-kehikkoon ja peliä ohjataan Bluetooth-peliohjaimella (8BitDo NES30).

**Pelaa:** https://willizilliw.github.io/vr-piilohippa/

## Pelaaminen

1. Käynnistä NES30 pitämällä START pohjassa (Android-tila, ohjaimen oletus) ja yhdistä se puhelimeen Bluetoothilla.
2. Avaa peli puhelimen Chromessa ja paina **Aloita VR-laseilla**.
3. Laita puhelin laseihin. Aulassa valitaan rooli: katso porttia ja paina A, tai kävele portista läpi.

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

Kun peli pyytää painamaan nappia, kehotteessa näkyy NES30-ohjaimen kuva, jossa painettava nappi on korostettu keltaisella. NES30:n toimintonapit ovat ristissä: X ylhäällä, A oikealla, B alhaalla ja Y vasemmalla. Aulan nappitestillä näet, minkä napin peli tunnistaa.

## Pelin kulku

- **Etsijänä** lasket ensin 20 sekuntia silmät kiinni, kun neljä tietokoneen piiloutujaa juoksee piiloon. Sitten etsit: katso piiloutujaa läheltä ja paina A. Löydä kaikki 4 minuutissa.
- **Piiloutujana** juokset piiloon, kun tietokoneen etsijä laskee pesäpuulla. Etsijä näkee, kuulee juoksun ja osaa kiivetä tikkaita katoille. Lisäksi etsijä saa 30 sekunnin välein tietää, missä olet, ja lähtee sinne – vaihda siis välillä piilopaikkaa. Selviä 4 minuuttia jäämättä kiinni.
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
| Kaikuva "ping" | Etsijä sai tietää, missä olet |
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
