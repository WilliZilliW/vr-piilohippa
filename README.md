# VR-piilohippa

Selaimessa pelattava piilohippa VR-laseille: Android-puhelin laitetaan VR-kehikkoon ja peliä ohjataan Bluetooth-peliohjaimella (8BitDo NES30).

**Pelaa:** https://williziliw.github.io/vr-piilohippa/

## Pelaaminen

1. Yhdistä NES30 puhelimeen Bluetoothilla.
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

Tikkaita pitkin kiivetään ristiohjaimen ylänuolella. Katoille pääsee tikkailla, ja matalille reunoille (aidat, autot, laatikot, katokset) Y-napilla.

## Kehitys

```bash
npm install
npm run dev        # HTTPS, myös puhelimelle samasta verkosta
npm run dev:http   # pelkkä HTTP tietokoneella testaamiseen
npm run build
```

Tekniikka: Vite + TypeScript + Three.js. Kaikki tekstuurit piirretään koodilla, joten kuvatiedostoja ei tarvita. Jokainen push `main`-haaraan julkaisee pelin automaattisesti GitHub Pagesiin.
