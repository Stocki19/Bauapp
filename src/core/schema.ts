/* =============================================================================
   HAUSPLANER – Datenmodell (Schema-Version 1)
   -----------------------------------------------------------------------------
   Konventionen, die im ganzen Projekt gelten und nie verhandelbar sind:

   1. EINHEITEN
      Alle Längen in Millimeter, als ganze Zahl. Keine Zentimeter, keine
      Fliesskommazahlen für Geometrie. Winkel in Grad als Fliesskommazahl.
      Flächen werden immer berechnet, nie gespeichert.

   2. KOORDINATEN
      Projektnullpunkt: Nordwest-Ecke des Gebäudeumrisses, OKFF Erdgeschoss.
      x -> Osten, y -> Sueden, z -> oben. Jedes Geschoss verwendet dasselbe
      x/y-System, damit Schächte und Treppen geschossübergreifend fluchten.

   3. HERKUNFT
      Jedes Bestandselement traegt eine Herkunft. Neue Elemente nicht --
      geplante Masse sind per Definition exakt.

   4. IDS
      Strings, stabil ueber die gesamte Projektlaufzeit. Niemals neu vergeben,
      auch nicht beim Laden. Praefix nach Typ, danach eine ULID/UUID.
============================================================================= */

import { z } from "zod";

/* ---------------------------------------------------------------------------
   Basis
--------------------------------------------------------------------------- */

export const Id = z.string().min(3);
export const Mm = z.number().int();
/** Millimeter, nicht negativ (Dicken, Breiten, Hoehen) */
export const MmPos = z.number().int().nonnegative();
export const Grad = z.number();

export const Punkt = z.object({ x: Mm, y: Mm });

/* ---------------------------------------------------------------------------
   Herkunft und Unsicherheit

   Bewusste Entscheidung: die Herkunft haengt am ELEMENT, nicht an jedem
   einzelnen Zahlenfeld. Feldweise Herkunft klingt praeziser, macht aber jede
   Geometriefunktion unlesbar. Wo einzelne Felder abweichen (typischer Fall:
   Wandlaenge gemessen, Wanddicke geschaetzt), gibt es `abweichungen`.
--------------------------------------------------------------------------- */

export const Quelle = z.enum([
  "aufmass",     // vor Ort gemessen
  "plan",        // aus dem Bestandsplan abgegriffen
  "annahme",     // begruendete Schaetzung
  "abgeleitet",  // aus anderen Werten berechnet
  "hersteller",  // Katalogmass eines Produkts
  "geplant",     // Sollwert des Umbaus, kein Bestand
]);

export const Herkunft = z.object({
  quelle: Quelle,
  /** Halbe Bandbreite in mm. aufmass ~2, plan ~30, annahme ~100. 0 = exakt. */
  unsicherheit: MmPos.default(0),
  erfasstAm: z.string().date().optional(),
  /** IDs von Belegen (Foto, Messprotokoll, Planseite) */
  belege: z.array(Id).default([]),
  notiz: z.string().optional(),
  /** Feldweise Abweichung, z. B. { dicke: { quelle: "annahme", ... } } */
  abweichungen: z.record(z.string(), z.lazy(() => HerkunftKurz)).optional(),
});

export const HerkunftKurz = z.object({
  quelle: Quelle,
  unsicherheit: MmPos.default(0),
  notiz: z.string().optional(),
});

/* ---------------------------------------------------------------------------
   Phase: Bestand / Abbruch / Neu

   Das entspricht der Konvention des Umbauplans (Bestand grau, Abbruch gelb,
   Neu rot). Ein Element ist genau in einem dieser drei Zustaende. Daraus
   ergeben sich ohne Zusatzaufwand: Bestandsplan, Abbruchplan, Neuplan,
   Abbruchmengen und spaeter die Zuordnung von Abbruchpositionen aus Offerten.
--------------------------------------------------------------------------- */

export const Phase = z.enum(["bestand", "abbruch", "neu"]);

/* ---------------------------------------------------------------------------
   Belege
--------------------------------------------------------------------------- */

export const Beleg = z.object({
  id: Id,
  typ: z.enum(["foto", "messprotokoll", "planseite", "dokument"]),
  dateiname: z.string(),
  aufgenommenAm: z.string().date().optional(),
  geschossId: Id.optional(),
  raumId: Id.optional(),
  notiz: z.string().optional(),
});

/* ---------------------------------------------------------------------------
   Rohmessungen aus dem Aufmass

   Nicht jede Messung landet direkt in der Geometrie. Diagonalen, Hoehen in
   vier Ecken, Lotabweichungen dienen der Plausibilitaetspruefung. Sie werden
   roh gespeichert, damit die Pruefung reproduzierbar bleibt.
--------------------------------------------------------------------------- */

export const Messung = z.object({
  id: Id,
  raumId: Id.optional(),
  wandId: Id.optional(),
  art: z.enum([
    "laenge", "breite", "diagonale", "raumhoehe",
    "bruestung", "lichte_breite", "lichte_hoehe",
    "kniestock", "dachneigung", "achsmass", "aufbauhoehe", "sonstige",
  ]),
  /** Wo gemessen: "unten links", "Ecke NO", "1 m ueber Boden" */
  ort: z.string().optional(),
  wert: z.number(),                       // mm, ausser art = dachneigung (Grad)
  erfasstAm: z.string().date().optional(),
  belege: z.array(Id).default([]),
  notiz: z.string().optional(),
});

/* ---------------------------------------------------------------------------
   Geschoss
--------------------------------------------------------------------------- */

export const Geschoss = z.object({
  id: Id,
  kuerzel: z.string(),                    // "UG", "EG", "DG"
  name: z.string(),
  reihenfolge: z.number().int(),          // -1 UG, 0 EG, 1 DG
  /** Absolute Hoehen ueber Projektnull (OKFF EG = 0) */
  okrd: Mm,                               // Oberkante Rohdecke des Geschosses
  okff: Mm,                               // Oberkante Fertigfussboden
  rohbauhoehe: MmPos,                     // OKRD bis Unterkante Decke darueber
  deckenstaerke: MmPos.optional(),
  herkunft: Herkunft,
});

/* ---------------------------------------------------------------------------
   Wandgraph

   Wandknoten und Wandsegmente statt Rechteckraeume. Ohne diesen Schritt sind
   nicht rechtwinklige Altbauraeume, T-Stoesse und Eckaufloesungen nicht
   abbildbar.
--------------------------------------------------------------------------- */

export const Wandknoten = z.object({
  id: Id,
  geschossId: Id,
  x: Mm,
  y: Mm,
  herkunft: Herkunft,
});

export const Wandkonstruktion = z.enum([
  "backstein", "kalksandstein", "beton", "staenderwand_metall",
  "staenderwand_holz", "holz", "unbekannt",
]);

/**
 * `tragend` ist bewusst dreiwertig und steht per Default auf "unbekannt".
 * "nein" ist eine AUSSAGE und muss aktiv gesetzt werden -- eine Wand, die
 * niemand geprueft hat, darf nie als nicht tragend durchgehen. Die Regel-
 * maschine erzeugt fuer jede Wand mit tragend = "unbekannt", die abgebrochen
 * oder durchbrochen werden soll, einen Fehler.
 */
export const Tragend = z.enum(["ja", "nein", "unbekannt"]);

export const Wand = z.object({
  id: Id,
  geschossId: Id,
  vonKnoten: Id,
  bisKnoten: Id,
  /** Gesamtdicke inkl. Putz. Schichtaufbau optional darunter. */
  dicke: MmPos,
  /** Versatz der Achse gegenueber der Verbindungslinie, fuer Vorsatzschalen */
  achsversatz: Mm.default(0),
  schichten: z.array(z.object({
    bezeichnung: z.string(),
    dicke: MmPos,
    art: z.enum(["tragend", "vorsatzschale", "vorwand", "putz", "daemmung", "sonstige"]),
  })).default([]),
  tragend: Tragend.default("unbekannt"),
  /** Freitext, warum tragend so eingestuft wurde. Bei "nein" Pflicht. */
  tragendBegruendung: z.string().optional(),
  konstruktion: Wandkonstruktion.default("unbekannt"),
  /** Abweichende Hoehe, z. B. Bruestung oder Halbhohe Trennwand */
  hoehe: MmPos.optional(),
  /** Wand fuehrt Installationen -> kein Schlitzen, Vorwandtiefe beachten */
  installationswand: z.boolean().default(false),
  phase: Phase,
  /** Bei phase = "neu": ersetzt diese Wand eine abgebrochene? */
  ersetztWandId: Id.optional(),
  herkunft: Herkunft,
});

/* ---------------------------------------------------------------------------
   Oeffnungen

   Oeffnungen gehoeren zur Wand, nicht zum Raum. Position wird entlang der
   Wandachse ab `vonKnoten` gemessen -- so bleibt sie beim Verschieben des
   Knotens korrekt.
--------------------------------------------------------------------------- */

export const Oeffnungstyp = z.enum(["tuer", "fenster", "durchgang", "nische", "dachfenster"]);

export const Oeffnung = z.object({
  id: Id,
  wandId: Id,
  typ: Oeffnungstyp,
  /** Abstand vonKnoten bis linke Oeffnungskante, entlang der Wandachse */
  abstandVonKnoten: Mm,
  rohbauBreite: MmPos,
  rohbauHoehe: MmPos,
  /** Lichtes Mass nach Einbau. Bei Tueren massgebend fuer SIA 500. */
  lichteBreite: MmPos.optional(),
  lichteHoehe: MmPos.optional(),
  /** Unterkante ueber OKFF. 0 bei Tueren, Bruestungshoehe bei Fenstern. */
  bruestung: MmPos.default(0),
  laibungstiefe: MmPos.optional(),
  tuer: z.object({
    anschlag: z.enum(["links", "rechts"]),
    oeffnung: z.enum(["innen", "aussen", "schiebe_vorlaufend", "schiebe_kassette"]),
    /** Radius des Schwenkbereichs = Blattbreite. Bei Schiebetuer entfaellt er. */
    blattbreite: MmPos.optional(),
  }).optional(),
  phase: Phase,
  herkunft: Herkunft,
});

/* ---------------------------------------------------------------------------
   Raum
--------------------------------------------------------------------------- */

export const Nutzung = z.enum([
  "bad", "dusch_wc", "kueche", "wohnen", "essen", "schlafen", "buero",
  "flur", "treppenhaus", "eingang", "waschkueche", "keller", "garage",
  "technik", "reduit", "estrich", "sonstige",
]);

/** Detaillierungsstufe: nur "detail"-Raeume werden voll geprueft und bepreist. */
export const Lod = z.enum(["huelle", "detail"]);

export const Raum = z.object({
  id: Id,
  geschossId: Id,
  nummer: z.string(),                     // "DG.02"
  name: z.string(),                       // "Elternbad"
  nutzung: Nutzung,
  lod: Lod.default("huelle"),
  /**
   * Umriss der lichten Raumflaeche als geschlossenes Polygon.
   * Bevorzugt als Knotenreferenzen (abgeleitet aus dem Wandgraph).
   * `polygonManuell` nur, solange der Graph noch unvollstaendig ist.
   */
  polygonKnoten: z.array(Id).default([]),
  polygonManuell: z.array(Punkt).default([]),
  /** Rohdecke und Fertigfussboden dieses Raums, falls vom Geschoss abweichend */
  okrd: Mm.optional(),
  okff: Mm.optional(),
  /** Lichte Raumhoehe. Bei Dachschraege der Maximalwert; Rest kommt vom Dach. */
  raumhoehe: MmPos.optional(),
  /** Rechtwinkligkeit aus Diagonalmessung; null = nicht geprueft */
  rechtwinklig: z.boolean().nullable().default(null),
  bodenaufbau: z.object({
    aufbauhoehe: MmPos,
    belag: z.string().optional(),
    bodenheizung: z.boolean().default(false),
  }).optional(),
  phase: Phase,
  herkunft: Herkunft,
});

/* ---------------------------------------------------------------------------
   Dach

   Ein Giebeldach wird ueber Firstachse, Neigung und Kniestock beschrieben.
   Die lichte Hoehe in jedem Dachgeschossraum wird daraus BERECHNET, nicht
   pro Raum eingegeben. Sonst driften fuenf Raeume auseinander.
--------------------------------------------------------------------------- */

export const Dach = z.object({
  id: Id,
  geschossId: Id,
  typ: z.enum(["giebel", "pult", "walm", "flach"]).default("giebel"),
  /** Firstachse in Geschosskoordinaten */
  firstVon: Punkt,
  firstBis: Punkt,
  /** Hoehe der Firstoberkante ueber OKFF des Dachgeschosses */
  firsthoehe: MmPos,
  /** Neigung je Dachflaeche in Grad, Reihenfolge: links/rechts der Firstachse */
  neigung: z.tuple([Grad, Grad]),
  /** Kniestockhoehe ueber OKFF, je Seite */
  kniestock: z.tuple([MmPos, MmPos]),
  /** Horizontaler Abstand Firstachse bis Kniestockwand, je Seite */
  spannweite: z.tuple([MmPos, MmPos]),
  herkunft: Herkunft,
});

/* ---------------------------------------------------------------------------
   Vertikale Elemente ueber mehrere Geschosse

   Fallstrang, Lueftungsschacht, Kamin, Treppenauge. Diese muessen in allen
   betroffenen Geschossen an derselben x/y-Position Flaeche blockieren --
   deshalb gehoeren sie ans Gebaeude, nicht ans Geschoss.
--------------------------------------------------------------------------- */

export const VertikalElement = z.object({
  id: Id,
  typ: z.enum(["fallstrang", "lueftungsschacht", "kamin", "treppenauge", "schacht"]),
  bezeichnung: z.string(),
  /** Grundriss-Umriss in Projektkoordinaten */
  umriss: z.array(Punkt).min(3),
  /** Von welchem bis zu welchem Geschoss (reihenfolge-Werte, inklusiv) */
  vonGeschoss: z.number().int(),
  bisGeschoss: z.number().int(),
  /** Bei Fallstrang: Nenndurchmesser in mm */
  dn: MmPos.optional(),
  phase: Phase,
  herkunft: Herkunft,
});

/* ---------------------------------------------------------------------------
   Deckendurchbruch (Treppenloch, Schachtdurchbruch)
--------------------------------------------------------------------------- */

export const Deckendurchbruch = z.object({
  id: Id,
  geschossId: Id,                         // Geschoss, dessen Decke durchbrochen ist
  umriss: z.array(Punkt).min(3),
  phase: Phase,
  herkunft: Herkunft,
});

/* ---------------------------------------------------------------------------
   Anschlusspunkte (Bestand und geplant)
--------------------------------------------------------------------------- */

export const Anschluss = z.object({
  id: Id,
  geschossId: Id,
  raumId: Id.optional(),
  typ: z.enum(["abwasser", "kaltwasser", "warmwasser", "heizung", "elektro", "lueftung"]),
  position: Punkt,
  /** Hoehe ueber OKFF. Negativ = unter Fertigfussboden. */
  hoehe: Mm.optional(),
  dn: MmPos.optional(),
  phase: Phase,
  herkunft: Herkunft,
});

/* ---------------------------------------------------------------------------
   Objekte (Apparate, Moebel, Geraete)
--------------------------------------------------------------------------- */

export const Objekt = z.object({
  id: Id,
  geschossId: Id,
  raumId: Id.optional(),
  katalogRef: z.string(),                 // Schluessel im Katalog
  /** Bezugspunkt: linke obere Ecke der unrotierten Grundflaeche */
  position: Punkt,
  rotation: Grad.default(0),
  /** Ueberschreibt die Katalogmasse, z. B. bei Bestandsapparaten */
  breite: MmPos.optional(),
  tiefe: MmPos.optional(),
  hoehe: MmPos.optional(),
  /** Montagehoehe Oberkante ueber OKFF, falls relevant */
  montagehoehe: Mm.optional(),
  bezeichnung: z.string().optional(),
  phase: Phase,
  herkunft: Herkunft,
});

/* ---------------------------------------------------------------------------
   Katalog
--------------------------------------------------------------------------- */

export const KatalogEintrag = z.object({
  ref: z.string(),
  gruppe: z.string(),
  bezeichnung: z.string(),
  /** Regelklasse fuer Bewegungsflaechen und Kopfhoehen */
  klasse: z.enum([
    "wanne", "dusche", "waschtisch", "wc", "bidet", "waschmaschine",
    "kueche_zeile", "kueche_geraet", "moebel", "heizkoerper",
    "trennwand", "glas", "punkt", "sonstige",
  ]),
  breite: MmPos,
  tiefe: MmPos,
  hoehe: MmPos.optional(),
  hersteller: z.string().optional(),
  artikelnummer: z.string().optional(),
  /** IGH-Artikelnummer, spaeter Bruecke zur Offerte */
  ighNummer: z.string().optional(),
  /** Vorwandtiefe bei WC, Beckenzahl bei Waschtisch usw. */
  parameter: z.record(z.string(), z.number()).default({}),
});

/* ---------------------------------------------------------------------------
   Regelsatz

   Normwerte sind DATEN, nicht Code. Jeder Wert traegt seine Quelle. Nur so
   laesst sich spaeter belegen, warum die App etwas beanstandet hat -- und nur
   so kann man zwischen Minimal-, Komfort- und SIA-500-Stufe umschalten.
--------------------------------------------------------------------------- */

export const Regelwert = z.object({
  wert: z.number(),
  einheit: z.enum(["mm", "grad", "prozent"]).default("mm"),
  quelle: z.string(),                     // "DIN 68935", "SIA 500:2009 Ziff. 9.2"
  stand: z.string().optional(),
  hinweis: z.string().optional(),
});

export const Regelsatz = z.object({
  id: z.string(),                         // "min", "komfort", "sia500"
  name: z.string(),
  beschreibung: z.string().optional(),
  /** Schluessel z. B. "wanne.bewegung.frontal", "wc.abstand.seitlich" */
  werte: z.record(z.string(), Regelwert),
});

/* ---------------------------------------------------------------------------
   Varianten

   Der Bestand ist EINE Wahrheit. Jede Planungsvariante ist ein Delta darauf:
   welche Bestandselemente abgebrochen werden und welche neuen dazukommen.
   Damit lassen sich Varianten vergleichen, ohne den Bestand zu duplizieren --
   und ein spaeter korrigiertes Aufmass wirkt sofort auf alle Varianten.
--------------------------------------------------------------------------- */

export const Variante = z.object({
  id: Id,
  name: z.string(),
  beschreibung: z.string().optional(),
  /** IDs von Bestandselementen, die in dieser Variante entfernt werden */
  abbruch: z.array(Id).default([]),
  /** IDs von Elementen mit phase = "neu", die zu dieser Variante gehoeren */
  neu: z.array(Id).default([]),
  erstelltAm: z.string().date().optional(),
  notiz: z.string().optional(),
});

/* ---------------------------------------------------------------------------
   Planhintergrund (kalibriertes Scan-PDF)
--------------------------------------------------------------------------- */

export const Planhintergrund = z.object({
  id: Id,
  geschossId: Id,
  dateiname: z.string(),
  seite: z.number().int().positive().default(1),
  /** Bildkoordinaten -> Projektkoordinaten, affine Transformation.
      [a, b, c, d, e, f] wie in SVG: x' = a*x + c*y + e ; y' = b*x + d*y + f */
  transformation: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]),
  /** Die zwei Referenzstrecken der Kalibrierung, zur Nachvollziehbarkeit */
  kalibrierung: z.array(z.object({
    bildVon: Punkt, bildBis: Punkt,
    sollLaenge: MmPos,
    quelle: Quelle,
  })).default([]),
  /** Abweichung Massstab x zu y in Prozent; > 1 % deutet auf Scanverzug */
  massstabsabweichung: z.number().optional(),
  deckkraft: z.number().min(0).max(1).default(0.4),
  sichtbar: z.boolean().default(true),
});

/* ---------------------------------------------------------------------------
   Projekt
--------------------------------------------------------------------------- */

export const SCHEMA_VERSION = 1;

export const Projekt = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Id,
  name: z.string(),
  adresse: z.string().optional(),
  erstelltAm: z.string().date(),
  geaendertAm: z.string().date(),

  geschosse: z.array(Geschoss).default([]),
  wandknoten: z.array(Wandknoten).default([]),
  waende: z.array(Wand).default([]),
  oeffnungen: z.array(Oeffnung).default([]),
  raeume: z.array(Raum).default([]),
  daecher: z.array(Dach).default([]),
  vertikalElemente: z.array(VertikalElement).default([]),
  deckendurchbrueche: z.array(Deckendurchbruch).default([]),
  anschluesse: z.array(Anschluss).default([]),
  objekte: z.array(Objekt).default([]),

  varianten: z.array(Variante).default([]),
  aktiveVarianteId: Id.optional(),

  messungen: z.array(Messung).default([]),
  belege: z.array(Beleg).default([]),
  planhintergruende: z.array(Planhintergrund).default([]),

  katalog: z.array(KatalogEintrag).default([]),
  regelsaetze: z.array(Regelsatz).default([]),
  aktiverRegelsatzId: z.string().default("min"),
});

/* ---------------------------------------------------------------------------
   Typen
--------------------------------------------------------------------------- */

export type Projekt = z.infer<typeof Projekt>;
export type Geschoss = z.infer<typeof Geschoss>;
export type Wand = z.infer<typeof Wand>;
export type Wandknoten = z.infer<typeof Wandknoten>;
export type Oeffnung = z.infer<typeof Oeffnung>;
export type Raum = z.infer<typeof Raum>;
export type Dach = z.infer<typeof Dach>;
export type VertikalElement = z.infer<typeof VertikalElement>;
export type Anschluss = z.infer<typeof Anschluss>;
export type Objekt = z.infer<typeof Objekt>;
export type Variante = z.infer<typeof Variante>;
export type Messung = z.infer<typeof Messung>;
export type Herkunft = z.infer<typeof Herkunft>;
export type Phase = z.infer<typeof Phase>;
export type Tragend = z.infer<typeof Tragend>;

/* ---------------------------------------------------------------------------
   Laden mit Migration

   Niemals Object.assign auf den Projektzustand. Jede Datei laeuft durch die
   Migrationskette und danach durch die Validierung. Faellt sie durch, wird sie
   NICHT geladen -- eine halb geladene Datei ist schlimmer als eine abgelehnte.
--------------------------------------------------------------------------- */

type Migration = (roh: any) => any;

const MIGRATIONEN: Record<number, Migration> = {
  // 1: (roh) => { ... } // ab Schema-Version 2 hier ergaenzen
};

export function projektLaden(roh: unknown): Projekt {
  let daten = roh as any;
  if (typeof daten !== "object" || daten === null) {
    throw new Error("Projektdatei ist kein Objekt.");
  }
  let version = Number(daten.schemaVersion ?? 0);
  if (version > SCHEMA_VERSION) {
    throw new Error(
      `Datei hat Schema-Version ${version}, diese App kennt nur ${SCHEMA_VERSION}. ` +
      `Bitte die App aktualisieren.`
    );
  }
  while (version < SCHEMA_VERSION) {
    const migration = MIGRATIONEN[version];
    if (!migration) throw new Error(`Keine Migration von Version ${version}.`);
    daten = migration(daten);
    version += 1;
    daten.schemaVersion = version;
  }
  return Projekt.parse(daten);
}

export function leeresProjekt(name: string): Projekt {
  const heute = new Date().toISOString().slice(0, 10);
  return Projekt.parse({
    schemaVersion: SCHEMA_VERSION,
    id: `prj_${crypto.randomUUID()}`,
    name,
    erstelltAm: heute,
    geaendertAm: heute,
  });
}
