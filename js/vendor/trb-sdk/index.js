export const LOCAL_TRB_STRUCTURE_VERSION = "0.6.5d-local-flatbuffers-structure";

function inRange(offset, size, total) {
    return Number.isInteger(offset) && offset >= 0 && offset + size <= total;
}
function u16(view, offset) {
    return inRange(offset, 2, view.byteLength) ? view.getUint16(offset, true) : null;
}
function i32(view, offset) {
    return inRange(offset, 4, view.byteLength) ? view.getInt32(offset, true) : null;
}
function u32(view, offset) {
    return inRange(offset, 4, view.byteLength) ? view.getUint32(offset, true) : null;
}
function identifier(bytes) {
    return bytes.length >= 8 ? String.fromCharCode(...bytes.slice(4, 8)) : "";
}
function tableInfo(view, tableOffset) {
    if (!inRange(tableOffset, 4, view.byteLength)) return null;
    const distance = i32(view, tableOffset);
    const vtableOffset = tableOffset - distance;
    if (!inRange(vtableOffset, 4, view.byteLength)) return null;
    const vtableLength = u16(view, vtableOffset);
    const objectLength = u16(view, vtableOffset + 2);
    if (!vtableLength || vtableLength < 4 || vtableLength > 4096 || !objectLength) return null;
    const fieldCount = Math.floor((vtableLength - 4) / 2);
    const fields = [];
    for (let index = 0; index < fieldCount; index += 1) {
        const relativeOffset = u16(view, vtableOffset + 4 + index * 2) || 0;
        fields.push({ index, relativeOffset, absoluteOffset: relativeOffset ? tableOffset + relativeOffset : null });
    }
    return { tableOffset, vtableDistance: distance, vtableOffset, vtableLength, objectLength, fieldCount, fields };
}
function inspectReferencedValue(view, field) {
    if (!field.absoluteOffset || !inRange(field.absoluteOffset, 4, view.byteLength)) return { ...field, present: false };
    const rawUint32 = u32(view, field.absoluteOffset);
    const targetOffset = field.absoluteOffset + rawUint32;
    const candidate = { ...field, present: true, rawUint32, relativeTarget: rawUint32, targetOffset, targetInRange: inRange(targetOffset, 4, view.byteLength) };
    if (!candidate.targetInRange) return candidate;
    const length = u32(view, targetOffset);
    candidate.candidateVectorLength = length;
    candidate.vectorDataOffset = targetOffset + 4;
    candidate.vectorFitsByte = Number.isInteger(length) && length <= view.byteLength - candidate.vectorDataOffset;
    candidate.vectorFitsUint32 = Number.isInteger(length) && length <= Math.floor((view.byteLength - candidate.vectorDataOffset) / 4);
    candidate.vectorFitsFloat64 = Number.isInteger(length) && length <= Math.floor((view.byteLength - candidate.vectorDataOffset) / 8);
    const nested = tableInfo(view, targetOffset);
    if (nested) candidate.candidateTable = { vtableLength: nested.vtableLength, objectLength: nested.objectLength, fieldCount: nested.fieldCount };
    return candidate;
}
function scanTables(view, maximum = 2000) {
    const output = [];
    const seen = new Set();
    for (let offset = 8; offset + 8 <= view.byteLength && output.length < maximum; offset += 4) {
        const info = tableInfo(view, offset);
        if (!info || seen.has(info.vtableOffset)) continue;
        seen.add(info.vtableOffset);
        output.push({ tableOffset: offset, vtableOffset: info.vtableOffset, vtableLength: info.vtableLength, objectLength: info.objectLength, fieldCount: info.fieldCount });
    }
    const shapes = {};
    for (const item of output) {
        const key = `${item.vtableLength}:${item.objectLength}:${item.fieldCount}`;
        shapes[key] = (shapes[key] || 0) + 1;
    }
    return { sampledTableCount: output.length, distinctTableShapes: Object.keys(shapes).length, tableShapeCounts: shapes, firstTables: output.slice(0, 100) };
}
function stringStats(bytes) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const strings = text.match(/[\x20-\x7e]{8,}/g) || [];
    const counts = {};
    for (const value of strings) {
        const sample = value.slice(0, 120);
        counts[sample] = (counts[sample] || 0) + 1;
    }
    return { printableStringCount: strings.length, uniqueStringCount: Object.keys(counts).length, firstStrings: Object.keys(counts).slice(0, 100) };
}
export class TrimBimStructureReader {
    static open(arrayBuffer) { return new TrimBimStructureReader(arrayBuffer); }
    constructor(arrayBuffer) {
        this.buffer = arrayBuffer;
        this.bytes = new Uint8Array(arrayBuffer);
        this.view = new DataView(arrayBuffer);
        this.rootOffset = u32(this.view, 0);
        this.header = { identifier: identifier(this.bytes), version: Number(identifier(this.bytes).replace("TRB", "")) || null, rootTableOffset: this.rootOffset, byteLength: this.bytes.length };
    }
    structureDiagnostic() {
        const root = tableInfo(this.view, this.rootOffset);
        return {
            readerVersion: LOCAL_TRB_STRUCTURE_VERSION,
            header: this.header,
            rootTable: root ? {
                tableOffset: root.tableOffset,
                vtableOffset: root.vtableOffset,
                vtableLength: root.vtableLength,
                objectLength: root.objectLength,
                fieldCount: root.fieldCount,
                fields: root.fields.map(field => inspectReferencedValue(this.view, field))
            } : null,
            genericTableScan: scanTables(this.view),
            strings: stringStats(this.bytes),
            semanticLabelsAvailable: false,
            geometryArraysDecoded: false,
            note: "Felt og tabeller kartlegges strukturelt uten å tilordne udokumenterte semantiske navn."
        };
    }
}
