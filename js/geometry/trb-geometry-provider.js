import { GeometryProvider } from "./geometry-provider.js";

export class TrbGeometryProvider extends GeometryProvider {
    constructor(file, sourceIndex) {
        super(file, sourceIndex);
        this.type = "trb";
        this.buffer = null;
    }

    async open() {
        this.status = "opening";
        try {
            this.buffer = await this.file.arrayBuffer();
            const bytes = new Uint8Array(this.buffer, 0, Math.min(32, this.buffer.byteLength));
            const ascii = Array.from(bytes)
                .map(value => value >= 32 && value <= 126 ? String.fromCharCode(value) : ".")
                .join("");

            const identifier = ascii.match(/TRB\d/i)?.[0] || "TRB/FlatBuffers";
            this.metadata = {
                identifier,
                byteLength: this.buffer.byteLength,
                headerBytes: Array.from(bytes),
                parser: "TrimBIM source adapter",
                geometryEngine: "TRB-leser ikke bundlet i v0.5.0"
            };
            this.warnings.push(
                "TRB-filen er registrert og tilgjengelig som ArrayBuffer. Full entitets- og trekantdekoding krever bundlet TRB-leser i neste geometritrinn."
            );
            this.status = "ready";
            return this.getSummary();
        } catch (error) {
            this.status = "error";
            this.error = error.message || String(error);
            throw error;
        }
    }

    close() {
        super.close();
        this.buffer = null;
    }
}
