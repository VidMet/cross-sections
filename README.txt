CrossSectionViewer v0.6.7 UI_AND_LOADING_STABILIZATION
Grunnlag: v0.6.6.2

Kopier hele innholdet i denne pakken til prosjektmappen og overskriv eksisterende filer.

Endrede filer:
- index.html
- style.css
- js/versions.js
- js/original-ifc-download.js
- js/geometry/geometry-registry.js

Ny fil:
- js/ui-loading-stabilizer.js

Hovedendringer:
- Feil isoleres per IFC- eller TRB-modell.
- En modellfeil stopper ikke resten av lastingen.
- Timeout på Viewer-kall, nedlasting og dekoding.
- Separate errorStage-verdier i diagnostikken.
- Responsiv UI-status og låsing kun av oppdateringsknappen under aktiv modelloppdatering.
- Cache-busting til v0.6.7 fra index.html og geometry-registry.js.
- IFC-modeller med provider-feil beholdes med konkret feiltrinn og feilmelding.
