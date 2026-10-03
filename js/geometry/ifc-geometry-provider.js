import { GeometryProvider } from "./geometry-provider.js";
const ENTITY = /^#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(/gm;
export class IfcGeometryProvider extends GeometryProvider {
    constructor(options) { super({ ...options, type:"ifc" }); }
    async open() {
        if (!this.file) { this.status="discovered"; return this.getSummary(); }
        this.status="opening";
        try {
            const text=await this.file.text();
            if(!text.includes("ISO-10303-21")) throw new Error("Ikke gyldig IFC-SPF.");
            const schema=text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i)?.[1] || "Ukjent";
            const counts={}; let match; ENTITY.lastIndex=0;
            while((match=ENTITY.exec(text))!==null){const className=match[2];counts[className]=(counts[className]||0)+1;this.entities.push({sourceId:this.id,expressId:Number(match[1]),className});}
            this.metadata={schema,classCount:Object.keys(counts).length,classCounts:counts,geometryEngine:"Reservert for web-ifc/IfcOpenShell"};
            this.warnings=["IFC er indeksert. Meshdekoding er ikke aktivert i v0.5.1."];
            this.status="ready";
        } catch(error){this.status="error";this.error=error.message||String(error);}
        return this.getSummary();
    }
}
