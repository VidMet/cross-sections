import { GeometryProvider } from "./geometry-provider.js";

const IFC_ENTITY_PATTERN = /^#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(/gm;

export class IfcGeometryProvider extends GeometryProvider {
    constructor(file, sourceIndex) {
        super(file, sourceIndex);
        this.type = "ifc";
        this.schema = null;
    }

    async open() {
        this.status = "opening";
        try {
            const text = await this.file.text();
            if (!text.includes("ISO-10303-21")) {
                throw new Error("Filen ser ikke ut som en IFC-SPF-fil.");
            }

            const schemaMatch = text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i);
            this.schema = schemaMatch ? schemaMatch[1] : "Ukjent IFC-schema";

            const classCounts = {};
            const entities = [];
            let match;
            IFC_ENTITY_PATTERN.lastIndex = 0;

            while ((match = IFC_ENTITY_PATTERN.exec(text)) !== null) {
                const expressId = Number(match[1]);
                const className = match[2];
                classCounts[className] = (classCounts[className] || 0) + 1;
                entities.push({
                    sourceId: this.id,
                    sourceType: this.type,
                    sourceFile: this.file.name,
                    expressId,
                    className,
                    globalId: null,
                    name: null,
                    meshRefs: []
                });
            }

            this.entities = entities;
            this.metadata = {
                schema: this.schema,
                classCount: Object.keys(classCounts).length,
                classCounts,
                parser: "IFC metadata adapter",
                geometryEngine: "Ikke aktivert i v0.5.0"
            };
            this.warnings.push(
                "IFC-filen er registrert og indeksert. Tessellering med web-ifc/IfcOpenShell kommer i neste geometritrinn."
            );
            this.status = "ready";
            return this.getSummary();
        } catch (error) {
            this.status = "error";
            this.error = error.message || String(error);
            throw error;
        }
    }
}
