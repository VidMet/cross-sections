import { GeometryProvider } from "./geometry-provider.js";
export class TrbGeometryProvider extends GeometryProvider {
    constructor(options) { super({ ...options, type:"trb" }); this.buffer=null; }
    async open() {
        if (!this.file) { this.status="discovered"; return this.getSummary(); }
        this.status="opening";
        try {
            this.buffer=await this.file.arrayBuffer();
            const bytes=new Uint8Array(this.buffer,0,Math.min(32,this.buffer.byteLength));
            const ascii=Array.from(bytes,v=>v>=32&&v<=126?String.fromCharCode(v):".").join("");
            this.metadata={identifier:ascii.match(/TRB\d/i)?.[0]||"TRB/FlatBuffers",byteLength:this.buffer.byteLength,geometryEngine:"Reservert for TRB SDK"};
            this.warnings=["TRB er registrert. Meshdekoding er ikke aktivert i v0.5.1."];
            this.status="ready";
        } catch(error){this.status="error";this.error=error.message||String(error);}
        return this.getSummary();
    }
    close(){super.close();this.buffer=null;}
}
