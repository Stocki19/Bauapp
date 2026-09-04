import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import { Projekt, projektLaden, leeresProjekt, SCHEMA_VERSION } from "../src/core/schema";

/**
 * Vertrag des Schemas. Diese Tests sichern die Grenze zwischen "geladen" und
 * "abgelehnt". Eine halb geladene Projektdatei ist schlimmer als eine
 * abgelehnte -- genau das wird hier geprueft.
 */

/** Kleinstes Projekt, das durchgehen muss. Alle Listen haben Defaults. */
const minimalprojekt = {
  schemaVersion: SCHEMA_VERSION,
  id: "prj_test_0001",
  name: "Testhaus",
  erstelltAm: "2026-01-15",
  geaendertAm: "2026-01-15",
};

describe("leeresProjekt", () => {
  it("erzeugt ein Projekt, das durch Projekt.parse laeuft", () => {
    const projekt = leeresProjekt("Testhaus");

    expect(() => Projekt.parse(projekt)).not.toThrow();
    expect(projekt.name).toBe("Testhaus");
    expect(projekt.schemaVersion).toBe(SCHEMA_VERSION);
    expect(projekt.id.startsWith("prj_")).toBe(true);
    // Listen sind angelegt, nicht undefined -- sonst knallt jede Geometrie.
    expect(projekt.waende).toEqual([]);
    expect(projekt.geschosse).toEqual([]);
    expect(projekt.aktiverRegelsatzId).toBe("min");
  });
});

describe("projektLaden", () => {
  it("gibt bei einem gueltigen Minimalprojekt ein Projekt zurueck", () => {
    const projekt = projektLaden(minimalprojekt);

    expect(projekt.id).toBe("prj_test_0001");
    expect(projekt.name).toBe("Testhaus");
    expect(projekt.schemaVersion).toBe(SCHEMA_VERSION);
    expect(projekt.raeume).toEqual([]);
    expect(projekt.varianten).toEqual([]);
  });

  it("wirft bei schemaVersion 99 mit verstaendlicher Meldung", () => {
    const zuNeu = { ...minimalprojekt, schemaVersion: 99 };

    // Kein roher ZodError: der Nutzer soll lesen koennen, was zu tun ist.
    expect(() => projektLaden(zuNeu)).toThrow(
      `Datei hat Schema-Version 99, diese App kennt nur ${SCHEMA_VERSION}. ` +
        `Bitte die App aktualisieren.`,
    );
  });

  it("wirft bei einer Wand ohne dicke, statt halb gefuellt zurueckzugeben", () => {
    const wandOhneDicke = {
      id: "wnd_0001",
      geschossId: "gsc_eg",
      vonKnoten: "knt_0001",
      bisKnoten: "knt_0002",
      // dicke fehlt absichtlich
      phase: "bestand",
      herkunft: { quelle: "aufmass", unsicherheit: 2 },
    };
    const roh = { ...minimalprojekt, waende: [wandOhneDicke] };

    let ergebnis: unknown = "NICHT_GESETZT";
    let fehler: unknown;
    try {
      ergebnis = projektLaden(roh);
    } catch (e) {
      fehler = e;
    }

    // Nichts zurueckgegeben -- kein Teilobjekt, das spaeter durchrutscht.
    expect(ergebnis).toBe("NICHT_GESETZT");
    expect(fehler).toBeInstanceOf(ZodError);
    expect((fehler as ZodError).issues).toHaveLength(1);
    expect((fehler as ZodError).issues[0]?.path).toEqual(["waende", 0, "dicke"]);
  });
});

describe("Sicherheitsdefaults", () => {
  it("setzt wand.tragend auf unbekannt, nicht auf nein", () => {
    const roh = {
      ...minimalprojekt,
      waende: [
        {
          id: "wnd_0001",
          geschossId: "gsc_eg",
          vonKnoten: "knt_0001",
          bisKnoten: "knt_0002",
          dicke: 120,
          phase: "bestand",
          herkunft: { quelle: "plan", unsicherheit: 30 },
          // tragend fehlt absichtlich
        },
      ],
    };

    const projekt = projektLaden(roh);

    expect(projekt.waende[0]?.tragend).toBe("unbekannt");
    expect(projekt.waende[0]?.installationswand).toBe(false);
    expect(projekt.waende[0]?.konstruktion).toBe("unbekannt");
  });
});
