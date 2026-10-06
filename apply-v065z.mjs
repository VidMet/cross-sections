import fs from "node:fs";
import path from "node:path";

const candidates = [
  path.resolve("js/app.js"),
  path.resolve("app.js")
];
const appPath = candidates.find(fs.existsSync);
if (!appPath) throw new Error("Fant ikke js/app.js eller app.js i prosjektmappen.");

const original = fs.readFileSync(appPath, "utf8");
const exact = 'S.frame = evaluate(station); if (S.frame) mark(S.frame);';
const replacement = `S.frame = evaluate(station);
    if (S.frame) {
        window.__crossSectionCurrentFrame = structuredClone(S.frame);
        window.dispatchEvent(new CustomEvent("cross-section-frame-changed", {
            detail: structuredClone(S.frame)
        }));
        mark(S.frame);
    } else {
        window.__crossSectionCurrentFrame = null;
    }`;

if (original.includes('window.__crossSectionCurrentFrame = structuredClone(S.frame);')) {
  console.log("v0.6.5z er allerede installert i", appPath);
  process.exit(0);
}
if (!original.includes(exact)) {
  throw new Error("Forventet setStation-kode ble ikke funnet. Ingen fil er endret.");
}
const updated = original.replace(exact, replacement);
const backup = appPath + ".pre-v065z.bak";
fs.writeFileSync(backup, original, "utf8");
fs.writeFileSync(appPath, updated, "utf8");
console.log("Oppdatert:", appPath);
console.log("Sikkerhetskopi:", backup);
