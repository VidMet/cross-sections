CrossSectionViewer v0.6.7.5 GUID_FALLBACK_FIX

Endringer:
- Validerer og normaliserer IFC-GUID-er.
- Prøver GetExpressIdFromGuid først.
- Bygger en lett fallbackindeks fra IFC-linjenes egne GlobalId-er.
- Streamer bare løste ExpressId-er i puljer på 10.
- Null GUID-treff og null mesh blir skipped med warning i stedet for error.
- Delvise treff blir ready med warning.
