CrossSectionViewer v0.6.7.3 CENTERLINE_CORRIDOR_FILTER
Grunnlag: v0.6.7.2

Virkemåte:
1. Brukeren velger IFCALIGNMENT.
2. Oppdater synlige modeller henter stasjonsreferentene.
3. Synlige objektbokser testes mot hvert senterlinjesegment med valgt korridorbredde.
4. Bare synlige IFC-modeller med minst ett objekt innenfor korridoren lastes ned og dekodes.
5. Modeller utenfor korridoren registreres i diagnostikken, men dekodes ikke.

Standard korridorbredde er 100 meter på hver side. Geometrikildelisten er lukket som standard.
Diagnostikk: window.__crossSectionOriginalIfcDownloadDiagnostic
