# Italienische Vokabeln

Eine kleine Web-App zum Üben italienischer Vokabeln — die Oberfläche ist auf
Deutsch, gelernt wird Italienisch. Wortliste auswählen, einen Ausschnitt daraus
nehmen, Wortarten anhaken und dann tippen oder mit Karteikarten üben — in beide
Übersetzungsrichtungen. Vier Listen sind eingebaut (die 500 häufigsten Wörter
sowie Zahlen, Essen und Zeit), eigene lassen sich laden.

Es ist eine statische Seite: reines HTML, CSS und ES-Module, kein Build-Schritt
und keine Abhängigkeiten zur Laufzeit. `index.html` über einen beliebigen
Webserver öffnen, und sie läuft.

## Die Anleitung steckt in der App

Wer die App benutzt, muss dafür nicht hierher: auf der Auswahlseite führt gleich
unter dem Kopf ein Knopf **Anleitung** zu einem eigenen Bildschirm mit allem,
was im täglichen Gebrauch zählt — Auswahl, die drei Übungsarten, wie Antworten
geprüft werden, die Leitner-Kästen, die Serie, das Vorlesen und der
Home-Bildschirm. Er liegt als fünfter Bildschirm in `index.html`, ist also auch
offline da, und verweist am Ende hierher zurück.

Was unten darüber hinaus steht — das CSV-Format, wie eigene Listen fest
eingebaut werden, Aufbau, Tests, Veröffentlichen und die Pizza —, bleibt dem
Repository vorbehalten. Die folgenden Abschnitte sind die ausführliche Fassung
dessen, was in der App kürzer steht; wer beides ändert, sollte sie beieinander
halten.

## Bedienung

**Welche Wörter.** Oben eine Liste aus dem Auswahlfeld wählen, mit den Reglern
`Von` und `Bis` einen Abschnitt festlegen und die gewünschten Wortarten
anhaken. Die beiden Regler schieben einander, statt sich zu blockieren — zieht
man `Von` über `Bis` hinaus, wandert `Bis` mit — und sie passen sich an, wenn
man zu einer kürzeren Liste wechselt.

Der Bereich zählt **Positionen innerhalb der angehakten Wortarten**, immer nach
Häufigkeit sortiert. Nur „Substantive" angehakt und `1`–`100` ergibt die hundert
häufigsten Substantive; sind alle Wortarten angehakt, ist `200`–`400` schlicht
Wort 200 bis 400 der Liste. Die Zeile unter den Reglern schreibt aus, was gerade
ausgewählt ist:

> Positionen 1–100 · Grundlage: 200 Substantive, die du angehakt hast, nach Häufigkeit sortiert.

Eine Folge davon ist wissenswert: weil der Bereich erst nach dem Filtern
gemessen wird, ist die Auswahl immer so breit wie die Regler (oder so breit, wie
der Vorrat reicht). Wortarten an- und abzuhaken ändert, *welche* Wörter in den
Bereich fallen, nie wie viele.

**Wie viele.** *Wörter pro Runde* unter „Optionen" ist ein Regler, der durch die
Anzahl der gerade ausgewählten Wörter begrenzt ist. Ganz oben steht dort
„alle N" — alles zu nehmen ist also eine Position auf der Skala und kein
Sonderwert.

Jede Karte nennt die **Wortart**, nach der sie fragt. Ohne sie wäre ein
deutscher Prompt wie *Stockwerk* nicht von *leise* zu unterscheiden — beides
heißt `piano` — und man könnte nicht wissen, ob `il piano` oder das bloße
`piano` gemeint ist.

**Wie üben.**

- **Schreiben** — die Übersetzung eintippen und prüfen lassen (siehe unten).
  **Enter** macht dasselbe wie *Prüfen*; ein zweiter Druck geht zur nächsten
  Karte. **Tipp** deckt Buchstabe für Buchstabe auf, wenn man festhängt.
- **Karteikarten** — Antwort aufdecken und sich selbst mit *Nochmal / Gut /
  Leicht* benoten. Die Note fließt in die Wiederholungsplanung ein.
- **Liste durchsehen** — die aktuelle Auswahl als sortier- und durchsuchbare
  Tabelle.

**Fällige Wörter wiederholen** und **Schwierige Wörter üben** ziehen aus der
eigenen Historie statt aus dem Reglerbereich — was dabei als fällig und was als
schwierig gilt, steht gleich im nächsten Abschnitt.

### Wie wiederholt wird: die fünf Kästen

Dahinter steckt ein **Leitner-System**. Jedes Wort sitzt in einem von fünf
Kästen, und der Kasten allein bestimmt, wann es wieder fällig wird:

| Kasten | Nächste Wiederholung |
| ------ | -------------------- |
| 1 | sofort (noch am selben Tag) |
| 2 | nach 1 Tag |
| 3 | nach 3 Tagen |
| 4 | nach 7 Tagen |
| 5 | nach 21 Tagen |

Jedes Wort startet in Kasten 1. Nach jeder Antwort wandert es:

- **falsch** → zurück in Kasten 1, egal wie weit oben es saß. Ein Wort, das
  gerade noch 21 Tage Pause hatte, ist damit sofort wieder fällig.
- **richtig** → einen Kasten weiter.
- **Leicht** (nur bei Karteikarten) → zwei Kästen weiter.
- **richtig, aber mit Tipp** → der Kasten bleibt stehen. Es zählt als richtig
  und wird nicht als Fehler vermerkt, aber das Intervall wächst nicht: wer ein
  Wort nur mit Hilfe herausbekommt, soll es bald wiedersehen.

Über Kasten 5 hinaus geht es nicht, 21 Tage sind das längste Intervall. Das
Datum wird nach jeder Antwort neu aus dem aktuellen Kasten berechnet, nicht
fortgeschrieben.

Beim **Schreiben** vergibt die App die Noten selbst — richtig zählt wie *Gut*,
richtig nach einem Tipp wie oben, falsch wie *Nochmal*. Bei den **Karteikarten**
benotet man sich selbst mit *Nochmal / Gut / Leicht*.

Gezählt wird pro **Wort, nicht pro Richtung**: ob `il libro` aus dem
Italienischen oder aus dem Deutschen abgefragt wurde, landet im selben Konto.
Gleich geschriebene Wörter zählen dagegen getrennt, weil zur Identität eines
Wortes auch seine Wortart gehört — `il piano` (Stockwerk) und `piano` (leise)
haben eigene Kästen.

Die Zeile unter *Dein Fortschritt* liest daraus vier Zahlen ab:

> 12 sitzen · 43 am Lernen · 445 noch nicht gesehen · 452 jetzt fällig

**Sitzen** sind die Wörter in Kasten 4 und 5, also die mit einer Woche oder mehr
Pause. **Am Lernen** ist alles, was schon einmal beantwortet wurde und weiter
unten sitzt. Die ersten drei Zahlen ergeben zusammen die ganze Liste.

**Fällig** zählt quer dazu: fällig ist ein Wort, dessen Datum erreicht ist —
*und jedes noch nie gesehene Wort*. Deshalb ist diese Zahl am Anfang fast so
groß wie die Liste selbst und schrumpft erst, wenn die Wörter in die höheren
Kästen wandern. Im Beispiel sind es die 445 unbekannten plus sieben, deren
Intervall abgelaufen ist.

Eine normale Runde zieht ihre Wörter **zufällig aus der Auswahl** und schaut
dabei nicht auf die Kästen. Wer nach Plan üben will, nimmt *Fällige Wörter
wiederholen*. *Schwierige Wörter üben* geht nicht nach Kästen, sondern nach der
Fehlerquote: alles, was mindestens zweimal drankam und zu mindestens einem
Drittel falsch war, das Schlechteste zuerst.

Jede Wortliste führt ihre eigenen Kästen, und *Diese Liste zurücksetzen* leert
genau diese eine Liste.

### Die Serie

Der Chip oben auf der Auswahlseite zählt aufeinanderfolgende Übungstage. Er wird
grün, sobald der Tag im Kasten ist, und zeigt den Bestwert neben dem aktuellen
Stand.

Ein Tag zählt ab der **ersten bewerteten Antwort**, nicht ab einer beendeten
Runde — eine auf halber Strecke abgebrochene Runde zählt also trotzdem, weil ja
tatsächlich geübt wurde. Gezählt werden lokale Kalendertage, 23 Uhr und dann
8 Uhr am nächsten Morgen sind also zwei Tage, nicht einer. Fällt ein Tag aus,
beginnt die Zählung wieder bei 1, der Bestwert bleibt aber erhalten. Gestern
zählt noch als lebendig: die Serie gilt erst als gerissen, wenn ein ganzer Tag
ohne Übung vergangen ist.

Die Serie gilt über alle Listen hinweg — fünf Minuten Essensvokabeln halten sie
genauso am Leben wie die Hauptliste.

**Was die Serie nicht anrührt.** Sie hängt an keiner einzelnen Wortliste,
sondern wird für die ganze App gezählt und liegt an einem eigenen Platz im
Speicher des Browsers. Die **Wortliste zu wechseln, setzt sie also nicht
zurück** — im Gegenteil, jede Liste zahlt auf dieselbe Serie ein. Auch *Diese
Liste zurücksetzen* lässt sie stehen: das löscht nur die Leitner-Kästen dieser
einen Liste. Falsche Antworten, eine abgebrochene Runde, ein Wechsel der
Richtung oder irgendeine andere Einstellung sind ihr ebenso egal.

**Was sie zurücksetzt.** Nur dreierlei:

- **Ein ganzer Tag ohne eine einzige bewertete Antwort.** Dann steht der Chip
  wieder bei null und die nächste Übung beginnt bei 1. Der Bestwert bleibt.
- **Gelöschte Browserdaten.** Damit sind Serie, Bestwert und alle Kästen weg —
  es gibt kein Backup. Auf dem iPhone und iPad genügt dafür schon, die Seite
  eine Woche lang nicht zu öffnen, solange sie nicht auf dem Home-Bildschirm
  liegt (siehe unten).
- **Ein anderer Browser oder ein anderes Gerät.** Der zählt eigenständig von
  vorn; die Serie wandert nicht mit.

Zwei Feinheiten noch: Blättern in *Liste durchsehen* hält die Serie nicht am
Leben, es braucht wirklich eine bewertete Antwort. Und weil lokale Kalendertage
gezählt werden, richtet sich der Tageswechsel nach der Uhr des Geräts — eine
Reise über Zeitzonen hinweg kann die Grenze verschieben.

### Wie Antworten geprüft werden

Getippte Antworten werden großzügig bewertet, denn es geht ums Erinnern und
nicht darum, einer deutschen Tastatur Zeichen abzuringen, die sie nur über
Umwege hergibt:

- Groß- und Kleinschreibung sowie Satzzeichen werden ignoriert.
- **Akzente sind freigestellt**: `citta` gilt wie `città`, `perche` wie
  `perché`, `piu` wie `più`. Die Richtung des Akzents spielt ebenfalls keine
  Rolle, `cittá` geht also auch durch. Die richtige Schreibweise steht nach dem
  Antworten immer da.
- Der Apostroph zählt als Trennzeichen, `l'acqua` und `l acqua` sind dasselbe.
- Auf der **deutschen** Seite falten sich die Umlaute wie gewohnt: `für` /
  `fuer`, `schön` / `schoen`, und `ß` und `ss` sind austauschbar.
- Jede von mehreren Übersetzungen zählt: `machen; tun` nimmt beides.
- Ein vorangestellter deutscher Artikel ist freigestellt: `das Buch` ist so gut
  wie `Buch`, und `sich erinnern` geht auch als `erinnern`.
- Klammerzusätze sind freigestellt: `der` genügt für `der (bestimmter Artikel)`.
- Kleine Tippfehler werden standardmäßig verziehen (ein Zeichen, bei langen
  Wörtern zwei) und angezeigt, damit man die richtige Schreibweise trotzdem
  sieht. Vertauschte Nachbarbuchstaben zählen als ein Fehler und nicht als zwei.
  Wörter unter vier Buchstaben bekommen kein Fehlerbudget — bei `mai` und `mia`
  wäre sonst nichts mehr zu unterscheiden. Alles davon lässt sich unter
  *Optionen* abschalten.

Die deutsche Umlautfaltung gilt **nur für deutsche Antworten**. Italienisch ist
voll von `ue` und `uo`, die nie ein Umlaut waren — `due`, `questo`, `guerra` —,
und sie mitzufalten würde ganz normale Wörter verstümmeln.

Dass Akzente freigestellt sind, hat einen Preis, den man kennen sollte: `sì`
(ja) und `si` (sich) sind für die Prüfung dasselbe Wort. Das ist der bewusste
Tausch — eine deutsche Tastatur erreicht `ì` nur über die Akzenttaste, und
Wörter deswegen als falsch zu werten, würde mehr kaputt machen, als es lehrt.
Die Akzentleiste über dem Eingabefeld (`à è é ì ò ù`) ist trotzdem da, wer die
Schreibweise üben will, tippt sie mit.

Italienische Substantive sind die Ausnahme. **Der Artikel ist Pflicht** —
`libro` allein gilt als falsch, nur `il libro` zählt. Artikel werden außerdem
nie unscharf verglichen, `la libro` ist also ein Fehler und kein verziehener
Tippfehler: `il` und `la` unterscheiden sich um wenige Zeichen, und das
Geschlecht *ist* das, was hier geprüft wird. Unter *Optionen* lässt sich
*Bei italienischen Substantiven den richtigen Artikel (il/lo/la) verlangen*
abschalten, dann wird auch das nackte Substantiv angenommen.

> **Italienisch hat zwei Geschlechter**, aber drei Artikelformen im Singular:
> `il` für die meisten männlichen Wörter, `lo` für männliche vor s+Konsonant,
> z, gn, ps (`lo studente`, `lo zucchero`), und `la` für weibliche. Das
> Geschlecht deckt sich oft nicht mit dem deutschen (`il libro`, aber *das*
> Buch; `la macchina`, aber *das* Auto) — genau deshalb ist der Artikel Pflicht.
>
> Vor einem Vokal (und vor stummem h) werden `lo` und `la` zu **`l'`**:
> `l'acqua`, `l'uomo`, `l'hotel`. Die Karte zeigt genau diese Form, und sie wird
> natürlich auch akzeptiert. Weil `l'` das Geschlecht versteckt, geht die
> ausgeschriebene Form ebenso durch: `la acqua` ist richtig, `lo acqua` nicht.
> In den CSV-Dateien steht deshalb immer das zugrunde liegende `lo`/`la` — die
> Verschmelzung macht die App beim Anzeigen selbst, sonst wäre das Geschlecht
> in der Liste gar nicht mehr aufgeschrieben.
>
> Wörter, die es nur im Plural gibt, tragen ihren Pluralartikel: `i soldi`,
> `i capelli`, `gli occhiali`.

### Tipps und Aussprache

**Tipp** deckt die Antwort Buchstabe für Buchstabe auf — aus `····` wird `c···`,
dann `ca··`. Es hört einen Buchstaben vor Schluss auf, kann das Wort also nie
einfach ausbuchstabieren. Der Artikel eines Substantivs wird von einem Tipp nie
verraten, aus demselben Grund, aus dem er verlangt wird: der Platzhalter `··`
bleibt davor stehen und erinnert daran, dass das Geschlecht noch aussteht.

Ein Wort nach einem Tipp richtig zu haben, zählt weiterhin als richtig, schiebt
das Wort aber nicht weiter im Wiederholungsplan nach hinten — es kam ja mit
Hilfe zustande, und ein Wort, das man nicht allein abrufen kann, soll bald
wiederkommen. Die Rundenübersicht zählt, wie viele Antworten einen Tipp
gebraucht haben.

**🔊** neben einem italienischen Wort liest es vor, mit der italienischen
Stimme, die auf dem Gerät schon vorhanden ist. Der Lautsprecher steht beim
Prompt, wenn aus dem Italienischen übersetzt wird, und bei der Antwort, wenn ins
Italienische übersetzt wird — er folgt also immer der italienischen Seite. Unter
*Optionen* gibt es zusätzlich *Das italienische Wort vorlesen*, das jede Karte
automatisch abspielt.

Ein zweites **🔊** steht neben dem italienischen **Beispielsatz**, sobald die
Antwort aufgedeckt ist, und liest den ganzen Satz. Gerade im Italienischen sitzt
viel in der Betonung — welche Silbe den Ton trägt, entscheidet über `ancora` und
`àncora` —, ein Satz ist also mehr wert als das Einzelwort. Er wird immer nur
auf Knopfdruck gelesen — die Automatik liest bewusst nur das einzelne Wort, ein
voller Satz auf jeder Karte würde schnell nerven.

Die Aussprache braucht kein Netz und keinen API-Schlüssel, aber sehr wohl eine
**italienische Stimme auf dem Gerät**. iPads und iPhones bringen Italienisch
fast immer mit, ein deutscher Windows-Rechner nicht unbedingt. Fehlt die Stimme,
tauchen die Lautsprecher gar nicht erst auf und die Option ist ausgegraut, mit
einem Hinweis dazu — lieber still als das italienische Wort mit deutschem Akzent
vorzulesen und damit die falschen Laute einzuüben. Unter Windows lässt sich
Italienisch unter *Einstellungen → Zeit und Sprache → Sprache und Region*
nachladen.

### Die Pizza

Das Zeichen der App ist ein Stück Pizza. Auf der Seite selbst — im Kopf und im
Serien-Chip — ist es einfach das Zeichen 🍕, damit es in dem Stil erscheint, den
das Gerät ohnehin verwendet, und beide immer zueinander passen.

Symbole für den Home-Bildschirm und den Browser-Tab müssen echte Bilder sein.
Die entstehen, indem dasselbe Emoji aus der Farb-Emoji-Schrift des Systems auf
das Blau der App gerendert wird:

```bash
python tools/make-icons.py
```

Das überschreibt alle Dateien in `icons/`. Es braucht Pillow und eine
Farb-Emoji-Schrift und ist der einzige Teil des Projekts, der Python anfasst —
die App selbst bleibt davon unberührt.

Wissenswert: die eingecheckten Symbole wurden unter Windows gerendert, das
Home-Bildschirm-Symbol trägt also Microsofts Pizza, während das Zeichen auf der
Seite auf einem iPad Apples ist. Beides sind Pizzastücke und beides sieht
richtig aus, es sind nur nicht dieselben Zeichnungen. Wer es angleichen will,
führt das Skript auf einem Mac aus.

Das Blau ist übrigens Absicht und nicht Zufall: Grün und Rot sind auf dem
Runden-Bildschirm schon vergeben, sie sagen dort richtig und falsch. Ein Akzent
in den Farben der Trikolore würde genau das Signal verwischen, das eindeutig
bleiben muss — also das Azzurro, in dem Italien Fußball spielt.

## Eigene Wortliste hinzufügen

Zwei Wege:

**Eine Datei vom Gerät laden.** *CSV-Datei laden…* auf der Auswahlseite. Die
Datei wird lokal gelesen und nie hochgeladen. Sie wird im Browser gemerkt, muss
also nur einmal ausgewählt werden.

**Sie ins Repository legen.** Die CSV nach `data/` legen, eine Zeile in
`data/manifest.json` ergänzen, und sie erscheint im Auswahlfeld:

```json
[
  { "id": "it-top500", "name": "Italienisch — die 500 häufigsten Wörter", "file": "data/it-top500.csv" },
  { "id": "cucina",    "name": "Küchenwörter",                            "file": "data/cucina.csv" }
]
```

### CSV-Format

Nur **zwei Spalten sind Pflicht**: das italienische Wort und die deutsche
Übersetzung. Alles andere ist freiwillig.

| Spalte       | Pflicht | Hinweise                                                      |
| ------------ | ------- | ------------------------------------------------------------- |
| `italian`    | ja      | Nur das Stichwort. Substantive ohne Artikel — der gehört in `article`, auch das `l'`. Verben im Infinitiv. |
| `german`     | ja      | Mehrere Übersetzungen mit `;` trennen. Jede einzelne wird akzeptiert. |
| `rank`       | nein    | Sortierung für die Bereichsregler. Standard ist die Zeilenfolge. |
| `article`    | nein    | `il`, `lo` oder `la`, für reine Pluralwörter `i`, `gli`, `le`. Wird als „il libro" bzw. vor Vokal als „l'acqua" angezeigt. |
| `plural`     | nein    | Wird nur auf der italienischen Seite als Hinweis gezeigt.      |
| `pos`        | nein    | Eines von `noun, verb, adjective, adverb, pronoun, preposition, conjunction, article, numeral, other`. Standard ist `other`. |
| `example_it` | nein    | Beispielsatz, wird nach dem Antworten gezeigt.                 |
| `example_de` | nein    | Dessen Übersetzung.                                            |
| `also`       | nein    | Weitere italienische Wörter derselben Bedeutung, mit `;` getrennt. Werden als Antwort akzeptiert und mit der richtigen Lösung angezeigt, aber nie als Prompt verwendet. |

Spaltennamen werden großzügig erkannt, und deutsche wie italienische Namen
funktionieren ebenfalls — `Wort`, `Übersetzung`, `Wortart`, `Artikel`,
`Beispiel`, `parola`, `traduzione`, `categoria`, `articolo`, `plurale` werden
alle verstanden, genauso `it`/`de`/`word`/`translation`/`type`. Auch bei den
Wortarten sind deutsche und italienische Schreibweisen erlaubt (`Substantiv`,
`sostantivo`, `verbo`, `aggettivo`, …).

Die kleinstmögliche gültige Datei:

```csv
wort,übersetzung
cane,Hund
gatto,Katze
```

Als UTF-8 speichern. Felder mit Komma in Anführungszeichen setzen. Teilen sich
zwei Einträge ein Stichwort, müssen sie sich in `pos` unterscheiden — so bleiben
`il piano` (Stockwerk) und `piano` (leise) getrennt, auch im Lernfortschritt.

Beim Artikel gilt: **immer `lo`/`la` eintragen, nie `l'`.** `l'estate` steht als
`estate` mit `article = la`, und die App schreibt daraus wieder `l'estate`. Wer
`l'` in die Spalte schreibt, wirft das Geschlecht weg, und die Karte kann es
nicht mehr prüfen.

`also` ist für echte Synonyme da, besser als eine zweite Zeile. `jetzt` ist eine
Vokabel, die zufällig zwei italienische Wörter hat; `adesso` mit `also=ora`
akzeptiert also beide und lehrt beide. Zwei Zeilen ergäben stattdessen zwei
Karten und würden `adesso` auf der `ora`-Karte als falsch werten.

### Die mitgelieferten Listen

Vier Listen kommen mit der App und werden oben auf der Auswahlseite gewählt.
Jeder Eintrag trägt eine Wortart, bei Substantiven Artikel und Mehrzahl sowie
einen italienischen Beispielsatz mit Übersetzung.

| Liste | Wörter | Inhalt |
| ----- | ------ | ------ |
| **Italienisch — die 500 häufigsten Wörter** | 500 | Allgemeiner Wortschatz, nach Häufigkeit geordnet |
| **Zahlen & Zählen** | 116 | Grundzahlen, Ordnungszahlen, Brüche, Maße, Mengenwörter |
| **Essen & Restaurant** | 131 | Bestellen, Mahlzeiten, Zutaten, Kochen, Gedeck |
| **Zeit, Tage & Monate** | 120 | Uhrzeit, Wochentage, Monate, Jahreszeiten, Zeitadverbien |

Jede Liste führt ihren eigenen Lernfortschritt, Essensvokabeln stören also
nicht, wo man in der Hauptliste steht.

Die drei Themenlisten sind nach Thema und nicht nach Häufigkeit geordnet — die
Bereichsregler funktionieren trotzdem, „die ersten 40 der Essensliste" ist dann
eben der Restaurant-Block und nicht die 40 häufigsten Essenswörter.

Die Monatsnamen stehen als `other` und ohne Artikel in der Zeitliste: `gennaio`
ist ein Name, und `il gennaio` zu verlangen wäre falsch gelerntes Italienisch.
Die Wochentage dagegen sind Substantive mit Artikel — `il lunedì` heißt
„montags" und ist genau die Form, die man braucht.

Bei der Hauptliste ist `rank` eine **nach Häufigkeit gewichtete Lernreihenfolge**
und keine exakte Korpusposition. Die ersten rund 45 folgen der echten Häufigkeit
ziemlich genau, weshalb dort vor allem Funktionswörter stehen (*e, di, che, il,
non*); die sind es wert, und ihre Beispielsätze tragen den größten Teil des
Unterrichts. Danach neigt sich die Liste zu Alltagswortschatz, den Anfänger
wirklich benutzen, und endet mit den Höflichkeitsfloskeln, die man am ersten Tag
braucht (*grazie, prego, buongiorno*).

Die Übersetzungen sind von Hand zusammengestellt und eine Durchsicht wert. Es
sind schlichte CSV-Dateien — was schief aussieht, einfach korrigieren und
einchecken.

## Auf dem iPad

Die Seite in Safari öffnen, dann **Teilen → Zum Home-Bildschirm**. Das gibt ihr
ein Symbol, lässt sie ohne Browser-Leiste im Vollbild laufen und funktioniert
offline.

Es ist außerdem aus einem nicht offensichtlichen Grund wichtig: iOS löscht
`localStorage` für Seiten, die etwa sieben Tage nicht besucht wurden, und das
würde Fortschritt und Serie mitnehmen. Auf dem Home-Bildschirm ist die App davon
ausgenommen, und das ist das Einzige, was die Historie schützt — es gibt kein
Backup und keinen Export. Wer die Browserdaten löscht, ist sie los.

Auf Android und am Rechner geht dasselbe über **Installieren** bzw. *Zum
Startbildschirm hinzufügen* im Chrome-Menü.

## Entwicklung

```bash
python -m http.server 8765
```

Dann `http://localhost:8765` öffnen. Ein einfaches Öffnen per `file://`
funktioniert **nicht** — ES-Module und `fetch` brauchen beide einen echten
Server.

```bash
npm test
```

`package.json` existiert nur für die Tests, nichts daraus landet im Browser.
`test/logic.test.mjs` deckt Parsen, Filtern und Antwortprüfung ab und braucht
keine Installation. `test/decks.test.mjs` prüft alle mitgelieferten Listen gegen
den echten Parser und Bewerter — unter anderem darauf, dass jedes Substantiv
einen Artikel hat, dass kein `l'` im Stichwort steht und dass keine zwei Wörter
derselben Wortart dieselbe deutsche Übersetzung tragen, was eine unbeantwortbare
Deutsch-→-Italienisch-Karte ergäbe. Weil Akzente beim Prüfen wegfallen, wird
zusätzlich geprüft, dass sich keine zwei Wörter derselben Wortart *nur* durch
einen Akzent unterscheiden. `test/ui.test.mjs` fährt die echte Oberfläche in
jsdom und braucht vorher ein `npm install`.

### Aufbau

```
index.html               das gesamte Markup, fünf Bildschirme
                         (Auswahl, Runde, Ergebnis, Liste, Anleitung)
css/style.css            ein Stylesheet, hell und dunkel
js/app.js                Oberfläche und Zustand
js/csv.js                CSV-Parsen, Spaltenaliase, Artikel und Elision
js/deck.js               Bereichs- und Wortartenauswahl
js/quiz.js               Kartenerzeugung und Antwortbewertung
js/progress.js           localStorage, Leitner-Planung, Serie
data/*.csv               die mitgelieferten Wortlisten
data/manifest.json       welche Listen im Auswahlfeld erscheinen
icons/                   die erzeugten App-Symbole
tools/make-icons.py      erzeugt icons/ aus dem Pizza-Emoji neu
sw.js                    Offline-Cache
```

## Veröffentlichen

GitHub Pages, ohne Workflow. Im Repository **Settings → Pages → Source: Deploy
from a branch**, Branch `main`, Ordner `/ (root)`. Ein Push auf `main`
veröffentlicht.

`.nojekyll` ist vorhanden, damit Jekyll die Dateien nicht anfasst.

Wird eine App-Datei geändert, muss `CACHE` in `sw.js` hochgezählt werden — sonst
liefern Geräte, auf denen die App schon installiert ist, weiter die alte Fassung
aus dem Cache.
