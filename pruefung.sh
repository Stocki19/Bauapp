#!/usr/bin/env bash
# Kontrolle der Einrichtung. Im Codespace-Terminal ausfuehren:  bash pruefung.sh
# Aendert nichts, liest nur.

ok=0; warn=0; err=0
JA() { echo "  OK      $1"; ok=$((ok+1)); }
HM() { echo "  HINWEIS $1"; warn=$((warn+1)); }
NEIN() { echo "  FEHLER  $1"; err=$((err+1)); }

echo
echo "=== 1. Dateien im Repo ==="
for f in ARCHITECTURE.md CLAUDE.md .gitignore .devcontainer/devcontainer.json src/core/schema.ts; do
  [ -f "$f" ] && JA "$f vorhanden" || NEIN "$f FEHLT"
done
[ -f badplaner-dg-v2.html ] && JA "badplaner-dg-v2.html vorhanden (Referenz)" \
  || HM "badplaner-dg-v2.html fehlt - nur als Referenz noetig"

echo
echo "=== 2. Inhalte stichprobenartig ==="
grep -q "SCHEMA_VERSION" src/core/schema.ts 2>/dev/null \
  && JA "schema.ts enthaelt SCHEMA_VERSION" || NEIN "schema.ts unvollstaendig oder leer"
grep -q 'Tragend.default("unbekannt")' src/core/schema.ts 2>/dev/null \
  && JA 'tragend hat Default "unbekannt"' || NEIN "tragend-Default fehlt oder wurde geaendert"
grep -q "postCreateCommand" .devcontainer/devcontainer.json 2>/dev/null \
  && JA "devcontainer.json enthaelt postCreateCommand" || NEIN "devcontainer.json unvollstaendig"
grep -q "300 Zeilen" CLAUDE.md 2>/dev/null \
  && JA "CLAUDE.md enthaelt die Regeln" || HM "CLAUDE.md pruefen - Inhalt unerwartet"

echo
echo "=== 3. .gitignore wirkt ==="
for probe in plaene/grundriss.pdf aufmass/dg.json offerten/sanitaer.pdf foto.jpg mein.hausplan node_modules/x; do
  if git check-ignore -q "$probe" 2>/dev/null; then JA "$probe wird ignoriert"
  else NEIN "$probe wird NICHT ignoriert"; fi
done

echo
echo "=== 4. Keine Projektdaten versehentlich versioniert ==="
treffer=$(git ls-files | grep -Ei '\.(pdf|jpe?g|heic|hausplan)$' | grep -v '^public/' || true)
if [ -z "$treffer" ]; then JA "keine Plaene, Fotos oder Offerten im Repo"
else NEIN "diese Dateien liegen im Repo und gehoeren dort nicht hin:"; echo "$treffer" | sed 's/^/            /'; fi

echo
echo "=== 5. Git-Zustand ==="
git rev-parse --is-inside-work-tree >/dev/null 2>&1 && JA "Git-Repository erkannt" || NEIN "kein Git-Repository"
zweig=$(git branch --show-current 2>/dev/null)
[ "$zweig" = "main" ] && JA "Zweig ist main" || HM "Zweig ist '$zweig', erwartet 'main'"
git remote get-url origin >/dev/null 2>&1 \
  && JA "Remote origin: $(git remote get-url origin)" || NEIN "kein Remote origin gesetzt"
if [ -z "$(git status --porcelain)" ]; then JA "keine ungespeicherten Aenderungen"
else HM "es gibt ungespeicherte Aenderungen (git status ansehen)"; fi

echo
echo "=== 6. Werkzeuge ==="
if command -v node >/dev/null; then
  v=$(node --version); JA "Node $v"
  major=$(echo "$v" | sed 's/v\([0-9]*\).*/\1/')
  [ "$major" -ge 22 ] 2>/dev/null || HM "Node $v ist aelter als 22"
else NEIN "node nicht gefunden"; fi
command -v npm >/dev/null && JA "npm $(npm --version)" || NEIN "npm nicht gefunden"
command -v git >/dev/null && JA "git vorhanden" || NEIN "git nicht gefunden"
if command -v claude >/dev/null; then JA "Claude Code: $(claude --version 2>&1 | head -1)"
else NEIN "claude nicht gefunden - 'npm install -g @anthropic-ai/claude-code' ausfuehren"; fi

echo
echo "=== 7. Repository-Sichtbarkeit ==="
if command -v gh >/dev/null; then
  sicht=$(gh repo view --json visibility -q .visibility 2>/dev/null)
  case "$sicht" in
    PUBLIC) JA "Repository ist oeffentlich (noetig fuer GitHub Pages im Free-Plan)";;
    PRIVATE|INTERNAL) HM "Repository ist $sicht - GitHub Pages braucht im Free-Plan PUBLIC";;
    *) HM "Sichtbarkeit nicht ermittelbar - auf github.com nachsehen";;
  esac
else HM "gh nicht verfuegbar - Sichtbarkeit auf github.com pruefen"; fi

echo
echo "=========================================="
echo "  $ok in Ordnung, $warn Hinweise, $err Fehler"
[ "$err" -eq 0 ] && echo "  Einrichtung ist startklar." || echo "  Bitte die Fehler oben beheben."
echo "=========================================="
