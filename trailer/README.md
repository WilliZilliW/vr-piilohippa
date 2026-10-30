# Piilohippa-traileri

Trailerin kuvausmoottori. Sivu ajaa pelin oikeaa kaupunkia ja tekoälyä, liikuttaa kameraa
käsikirjoituksen mukaan biisin "Piilo-piilo-piilohippa" tahdissa ja tallentaa kuvan ja
äänen videoksi suoraan selaimessa. Tämä on kehitystyökalu: se ei kuulu julkaistuun peliin
(`npm run build` ei ota sitä mukaan).

## Tallentaminen (Windows, Mac tai Linux)

1. `npm install` (kerran)
2. `npm run dev:http`
3. Avaa Chromessa http://localhost:5174/trailer/
4. Valitse biisi (`Piilo-piilo-piilohippa.mp3`) tiedostovalitsimesta.
5. **▶ Esikatsele** soittaa trailerin valitusta kohdasta ("Aloita kohdasta").
   **● Tallenna video** soittaa koko biisin (2:49) ja lataa lopuksi tiedoston
   `piilohippa-traileri.webm`. Pidä välilehti näkyvissä tallennuksen ajan.
6. Esc pysäyttää.

Tallennus tapahtuu reaaliajassa, joten kone piirtää 1920×1080-kuvaa koko biisin ajan.
Jos kuva pätkii, sulje muut ohjelmat tai pienennä kuvaa: `?scale=0.75` (1440×810).

WebM toimii YouTubessa ja useimmissa soittimissa. MP4:ksi sen saa esim. komennolla
`ffmpeg -i piilohippa-traileri.webm -c:v libx264 -crf 18 -c:a aac -b:a 192k piilohippa-traileri.mp4`.

## Tiedostot

- `shots.ts` – käsikirjoitus: biisin rakenne, otokset (kamera-ajot ja tapahtumat) ja tekstit.
  Ajat on merkitty tahteina: `bar(k)` = tahdin k alku (n. 148 BPM, tahti 1,625 s).
- `trailer.ts` – kuvausmoottori: simulaatio, kamera, tekstien piirto, toisto ja tallennus.

Simulaatio etenee kiinteällä 1/60 s askeleella ja satunnaisluvut on siemennetty, joten sama
hetki näyttää aina samalta. Yksittäisen hetken saa kuvaksi konsolista:
`trailer.frameAt(55)` (palauttaa JPEG-data-URL:n).
