# Hausplaner – Architektur und Datenmodell

Dieses Dokument ist die verbindliche Grundlage des Projekts. Es wird jeder
KI-Sitzung als Kontext mitgegeben. Wer davon abweichen will, ändert zuerst
dieses Dokument – nicht den Code.

---

## 1. Was die App ist

Ein Planungswerkzeug für den Innenausbau eines bestehenden Einfamilienhauses
mit drei Geschossen und Giebeldach. Schwerpunkt: die Nassräume und die Küche.
Kein CAD, kein BIM, keine Architektursoftware.

Der Kern des Werts liegt nicht in der Zeichnung, sondern in der **Regelprüfung
unter Unsicherheit**: Die App weiss, welche Masse gemessen und welche nur aus
einem Scan abgegriffen sind, und sagt, welche Entscheidung mit welcher Sicherheit
tragfähig ist.

## 2. Rahmenbedingungen, die nicht verhandelbar sind

| Bedingung | Konsequenz |
|---|---|
| Keine Installation beim Nutzer | statische Web-App, GitHub Pages plus Einzeldatei-HTML |
| Kein Backend, keine Accounts, keine Server | alles im Browser, Daten bleiben lokal |
| Betrieb kostet nichts | nur Open-Source-Abhängigkeiten, MIT oder ähnlich permissiv |
| Code wird von KI geschrieben | kleine Dateien, harte Modulgrenzen, Tests als Vertrag |
| Insellösung | kein IFC, kein Datenaustausch mit Planern |

Ausgeschlossene Abhängigkeiten: alles unter GPL oder AGPL, weil die App später
an Bekannte weitergegeben werden soll.

## 3. Konventionen

1. **Millimeter als Ganzzahl.** Überall. Keine Zentimeter, keine
   Fliesskommazahlen für Geometrie. Winkel in Grad.
2. **Ein Koordinatensystem für alle Geschosse.** Nullpunkt: Nordwest-Ecke des
   Gebäudeumrisses, OKFF Erdgeschoss. x nach Osten, y nach Süden, z nach oben.
   Nur so fluchten Fallstränge und Treppen über die Geschosse.
3. **IDs sind stabil.** Einmal vergeben, nie neu vergeben – auch nicht beim
   Laden einer Datei.
4. **Flächen werden berechnet, nie gespeichert.**
5. **Deutsche Bezeichner** im Datenmodell, weil die Fachbegriffe deutsch sind
   und Übersetzung nur Fehlerquellen schafft.

## 4. Modulgrenzen

```
src/
  core/          kein DOM, kein three.js, vollständig testbar
    schema.ts      Datenmodell (Zod) – die einzige Wahrheit über die Struktur
    geometrie/     Polygone, Wandgraph, Schnitte, Dachhöhen
    regeln/        Prüfungen, Regelsätze, Befunde
    varianten/     Ableitung des Zielzustands aus Bestand + Delta
    commands/      Zustandsänderungen (Basis für Undo/Redo)
  io/            Laden, Speichern, PDF-Hintergrund, Export
  ui-2d/         SVG-Editor
  ui-3d/         three.js-Ansicht (nur Ausgabe)
  ui-aufmass/    Erfassungsmodus für vor Ort
```

`core` darf nichts aus `ui-*` importieren. Nie. Diese eine Regel entscheidet
darüber, ob das Projekt in einem Jahr noch wartbar ist.

Keine Datei über 300 Zeilen. Wird eine länger, wird sie geteilt.

## 5. Die vier tragenden Entscheidungen im Datenmodell

### 5.1 Herkunft am Element

Jedes Bestandselement trägt `herkunft` mit Quelle und Unsicherheit in mm.
Richtwerte:

| Quelle | Unsicherheit | Bedeutung |
|---|---|---|
| `aufmass` | 2 mm | vor Ort mit Laser gemessen |
| `plan` | 30 mm | aus dem Scan abgegriffen |
| `annahme` | 100 mm | begründete Schätzung |
| `hersteller` | 0 mm | Katalogmass |
| `geplant` | 0 mm | Sollwert des Umbaus |

Geplante Elemente brauchen keine Herkunft im engeren Sinn – sie sind exakt,
weil sie Vorgabe sind.

Die Herkunft hängt bewusst am Element, nicht an jedem Zahlenfeld. Feldweise
Herkunft macht jede Geometriefunktion unlesbar. Für den Sonderfall
(Wandlänge gemessen, Dicke geschätzt) gibt es `herkunft.abweichungen`.

### 5.2 Phase statt zweier Modelle

Jedes Element hat `phase: "bestand" | "abbruch" | "neu"`. Das entspricht der
Konvention des Umbauplans. Daraus ergeben sich ohne Zusatzarbeit: Bestandsplan,
Abbruchplan, Neuplan, Abbruchmengen – und später die Zuordnung von
Abbruchpositionen aus Handwerkerofferten.

### 5.3 Varianten als Delta

Der Bestand ist eine Wahrheit. Eine Variante ist ein Delta darauf: eine Liste
abgebrochener Bestands-IDs plus eine Liste neuer Elemente. Vorteil: Wenn du
nach dem Aufmass ein Bestandsmass korrigierst, wirkt das sofort auf alle
Varianten. Bei duplizierten Vollmodellen wäre das eine Fehlerquelle ersten
Ranges.

### 5.4 Wandgraph statt Rechteckräume

Wände sind Segmente zwischen Knoten. Räume sind Polygone, bevorzugt aus dem
Graphen abgeleitet. Altbauräume sind nicht rechtwinklig – die Diagonalmessung
wird das zeigen. Das Feld `raum.rechtwinklig` steht auf `null`, solange die
Diagonalen nicht gemessen wurden.

## 6. Tragende Wände

`wand.tragend` ist dreiwertig: `"ja" | "nein" | "unbekannt"`, Default
**`"unbekannt"`**.

Das ist eine bewusste Sicherheitsentscheidung. `"nein"` ist eine Aussage und
muss aktiv gesetzt werden, mit Begründung in `tragendBegruendung`. Eine Wand,
die niemand geprüft hat, darf niemals stillschweigend als nicht tragend
durchgehen – das ist die Fehlerklasse, die im Innenausbau richtig teuer wird.

Das Feld ist jederzeit nachträglich änderbar. Ändert es sich, laufen die Regeln
neu und alte Befunde können wieder auftauchen. Das ist gewollt.

**Regeln, die daran hängen:**

| Situation | Befund |
|---|---|
| `tragend = "unbekannt"` und Wand in `variante.abbruch` | Fehler: Tragfähigkeit vor Abbruch klären |
| `tragend = "unbekannt"` und neue Öffnung in der Wand | Fehler: dito |
| `tragend = "ja"` und Wand in `variante.abbruch` | Fehler: Abbruch nur mit Statiker und Ersatzabtragung |
| `tragend = "ja"` und neue Öffnung | Warnung: Sturz beziehungsweise Unterzug erforderlich, Statiker beiziehen |
| `tragend = "ja"` und `installationswand = true` | Warnung: Schlitzen in tragendem Mauerwerk ist eingeschränkt, Vorwand statt Schlitz prüfen |
| `tragend = "nein"` ohne `tragendBegruendung` | Hinweis: Einstufung nicht belegt |
| Wand `phase = "neu"` über einem Deckenfeld ohne Auflager | Hinweis: Lastabtragung prüfen |

Die App ersetzt keinen Statiker und behauptet das nirgends. Sie stellt sicher,
dass die Frage überhaupt gestellt wird.

## 7. Was `core` können muss (Reihenfolge der Umsetzung)

1. Schema laden, validieren, migrieren.
2. Wandgraph: Knoten, Segmente, Schnittpunkte, Ecken.
3. Raumpolygone aus dem Graphen ableiten, Flächen berechnen.
4. Dachhöhen: lichte Höhe an beliebigem Punkt aus der Dachgeometrie.
5. Variante auflösen: Bestand plus Delta ergibt den effektiven Elementsatz.
6. Regelmaschine mit Regelsätzen als Daten.
7. Unsicherheitsrechnung: jeder Befund bekommt `sicher | bedingt | verletzt`.
8. Konsistenzprüfung: Massketten, Geschossfluchten, Diagonalen.

## 8. Befunde

Ein Regelbefund ist immer:

```ts
{
  id: string;
  stufe: "fehler" | "warnung" | "hinweis";
  sicherheit: "sicher" | "bedingt" | "unbekannt";
  text: string;
  betroffen: string[];      // Element-IDs
  regelRef?: string;        // Schlüssel im Regelsatz, für die Quellenangabe
  fehlendesMass?: string;   // welche Messung den Befund auflösen würde
}
```

`fehlendesMass` ist das wichtigste Feld: Daraus entsteht die Liste „was muss
ich beim nächsten Gang durchs Haus messen" – priorisiert nach Konsequenz.

## 9. Tests

- **Unit-Tests** für jede Geometriefunktion.
- **Golden-File-Tests** für die Regelmaschine: je Beispielprojekt eine
  Eingabedatei und eine Datei mit den erwarteten Befunden. Ändert eine
  Anpassung ungewollt eine Prüfung, schlägt der Test fehl.
- Keine Änderung wird übernommen, solange die Tests rot sind.

Die sechs Varianten der bisherigen Badplaner-App sind die ersten
Golden-File-Fälle. Sie belegen, dass die Portierung nichts verloren hat.

## 10. Was bewusst nicht gemacht wird

- Keine automatische Wanderkennung aus dem Plan. Der Scan hat keine Vektoren
  und keinen verlässlichen Massstab; Automatik würde nur schneller falsche
  Geometrie erzeugen.
- Kein IFC, kein BIM-Austausch.
- Keine Bearbeitung in der 3D-Ansicht. 3D ist Ausgabe.
- Kein serverseitiger Code, keine Anmeldung, keine Datenbank.
