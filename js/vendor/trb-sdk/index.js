export const LOCAL_TRB_SDK_CAPABILITY_VERSION = "0.6.5c-local-capability-probe";

function ascii(bytes, start, length) {
    return String.fromCharCode(...bytes.slice(start, start + length));
}
function u32(view, offset) {
    if (offset < 0 || offset + 4 > view.byteLength) return null;
    return view.getUint32(offset, true);
}
function textWindows(bytes, limit = 40) {
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const text = decoder.decode(bytes);
    const matches = text.match(/[\x20-\x7e]{12,}/g) || [];
    return matches.slice(0, limit);
}
function countTokens(text, tokens) {
    const output = {};
    for (const token of tokens) {
        const pattern = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
        output[token] = (text.match(pattern) || []).length;
    }
    return output;
}
function extractJobXml(text) {
    const start = text.indexOf("<JOBFile");
    if (start < 0) return null;
    const end = text.indexOf("</JOBFile>", start);
    const value = text.slice(start, end >= 0 ? end + 10 : Math.min(text.length, start + 50000));
    const attr = name => value.match(new RegExp(`${name}="([^"]*)"`, "i"))?.[1] || null;
    return { length: value.length, jobName: attr("jobName"), version: attr("version"), product: attr("product"), productVersion: attr("productVersion"), timeStamp: attr("TimeStamp") };
}
export class TrimBimCapabilityReader {
    static open(arrayBuffer) {
        return new TrimBimCapabilityReader(arrayBuffer);
    }
    constructor(arrayBuffer) {
        this.buffer = arrayBuffer;
        this.bytes = new Uint8Array(arrayBuffer);
        this.view = new DataView(arrayBuffer);
        this.identifier = this.bytes.length >= 8 ? ascii(this.bytes, 4, 4) : "";
        this.version = /^TRB(\d)$/.test(this.identifier) ? Number(this.identifier.at(-1)) : null;
        this.rootTableOffset = u32(this.view, 0);
        this.header = { identifier: this.identifier, version: this.version, rootTableOffset: this.rootTableOffset, byteLength: this.bytes.length };
    }
    capabilityDiagnostic() {
        const root = this.rootTableOffset;
        const vtableDistance = Number.isInteger(root) && root + 4 <= this.bytes.length ? this.view.getInt32(root, true) : null;
        const vtableOffset = Number.isInteger(vtableDistance) ? root - vtableDistance : null;
        const vtableLength = Number.isInteger(vtableOffset) && vtableOffset >= 0 && vtableOffset + 2 <= this.bytes.length ? this.view.getUint16(vtableOffset, true) : null;
        const objectLength = Number.isInteger(vtableOffset) && vtableOffset >= 0 && vtableOffset + 4 <= this.bytes.length ? this.view.getUint16(vtableOffset + 2, true) : null;
        const fullText = new TextDecoder("utf-8", { fatal: false }).decode(this.bytes);
        const tokens = ["Triangle", "Triangulated", "Mesh", "BRep", "Polyline", "Geometry", "Material", "Texture", "Normal", "Vertex", "Index", "IfcGuid", "Vannflate", "Terreng"];
        return {
            sdkCapabilityVersion: LOCAL_TRB_SDK_CAPABILITY_VERSION,
            mode: "local-flatbuffers-capability-probe",
            header: this.header,
            flatBuffersRoot: { validRange: Number.isInteger(root) && root > 0 && root < this.bytes.length, rootTableOffset: root, vtableDistance, vtableOffset, vtableLength, objectLength },
            embeddedMetadata: { jobXml: extractJobXml(fullText) },
            tokenCounts: countTokens(fullText, tokens),
            printableStringSample: textWindows(this.bytes),
            apiSurface: { fullTrimBimReaderVendored: false, geometryTypeCountsAvailable: false, allInstancesAvailable: false, triangleDecodeAvailable: false },
            limitation: "Denne lokale modulen validerer TRB8/FlatBuffers-strukturen og kartlegger kapabilitet. Full oppstrøms TrimBimReader er ikke innebygd i denne diagnostikkpakken."
        };
    }
}
