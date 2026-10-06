CrossSectionViewer v0.6.7.4 CORRIDOR_OBJECT_STREAMING
Grunnlag: v0.6.7.3

Hovedendringer:
- Objektbokser som treffer korridoren beholdes som runtime-ID-er.
- Runtime-ID-er konverteres til IFC GlobalId før nedlasting.
- GlobalId-er følger den nedlastede File-instansen inn i IFC-provideren.
- GetExpressIdFromGuid kobler GlobalId til ExpressId.
- StreamMeshes dekoder kun korridorobjektene, i puljer på 20.
- Event loop frigjøres mellom puljene.
- StreamAllMeshes brukes ikke.
- CloseModel frigjør WASM-modellen etter behandling.
- Import map tvinger app.js sine eldre imports til v0.6.7.4-modulene.

Diagnostikk:
window.__crossSectionOriginalIfcDownloadDiagnostic
Events:
cross-section-ifc-progress
cross-section-ifc-object-progress
