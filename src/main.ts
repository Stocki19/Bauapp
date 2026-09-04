/**
 * Einstiegspunkt der App. Vorerst nur ein Lebenszeichen – hier wird später
 * der 2D-Editor aufgehängt.
 */
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Element #app fehlt in index.html.");
}
app.textContent = "Hausplaner – Gerüst steht";
