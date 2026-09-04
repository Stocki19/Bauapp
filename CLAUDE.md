# CLAUDE.md

Planungswerkzeug für den Innenausbau eines bestehenden EFH (UG/EG/DG, Giebeldach).
Statische Web-App, kein Backend, keine Accounts. Details: @ARCHITECTURE.md

## Befehle

```bash
npm install
npm run dev            # Vite-Devserver
npm run test           # Vitest, einmalig
npm run test:watch     # Vitest im Watch-Modus
npm run build          # Build nach dist/ (PWA)
npm run build:single   # Einzeldatei-HTML nach dist-single/
npm run typecheck      # tsc --noEmit
```

## Vor jeder Fertigmeldung

`npm run typecheck` und `npm run test` müssen grün sein. Nicht "sollte gehen"
melden, ohne die Tests laufen zu lassen.

## Harte Regeln

- **Einheiten: Millimeter als Ganzzahl.** Keine Zentimeter, keine
  Fliesskommazahlen für Geometrie. Winkel in Grad. Flächen werden berechnet,
  nie gespeichert.
- **`src/core` darf nichts aus `src/ui-*` oder `src/io` importieren.** Kein DOM,
  kein three.js, keine Browser-API in `core`. Diese Grenze ist nicht verhandelbar.
- **Keine Datei über 300 Zeilen.** Wird eine länger, teilen.
- **Keine neuen Abhängigkeiten ohne Rückfrage.** Und niemals etwas unter GPL
  oder AGPL – die App wird weitergegeben.
- **Keine Browser-Storage-API ausser IndexedDB.** Kein localStorage für
  Projektdaten.
- **Das Schema in `src/core/schema.ts` ist die einzige Wahrheit über die
  Datenstruktur.** Änderungen daran brauchen eine Erhöhung von
  `SCHEMA_VERSION` plus eine Migration. Nie stillschweigend Felder ergänzen.
- **Deutsche Bezeichner** im Datenmodell und in Regeltexten. Kommentare deutsch.

## Fallstricke, die schon Geld gekostet haben

- `wand.tragend` hat den Default `"unbekannt"`, nicht `"nein"`. Das ist Absicht.
  Niemals auf `"nein"` defaulten, auch nicht "der Einfachheit halber".
- Projektdateien werden über `projektLaden()` geladen, das bei ungültigen Daten
  wirft. Niemals `Object.assign` auf den Projektzustand.
- Bestandsmasse tragen eine Herkunft mit Unsicherheit. Eine Prüfung, die diese
  Unsicherheit ignoriert, ist falsch – auch wenn sie durchläuft.
- Alle Geschosse teilen ein x/y-Koordinatensystem. Niemals geschosslokale
  Koordinaten einführen.

## Tests

- Unit-Tests für jede Geometriefunktion.
- Golden-File-Tests für die Regelmaschine unter `tests/golden/`: je Fall eine
  Projekt-JSON und eine erwartete Befund-JSON. Ändert sich ein erwartetes
  Ergebnis, muss die Änderung im Commit begründet werden.

## Was nicht gebaut wird

Keine automatische Wanderkennung aus PDF. Kein IFC. Keine Bearbeitung in der
3D-Ansicht. Kein Server, keine Anmeldung, keine Datenbank.
