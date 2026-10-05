export const LOCAL_TRB_SCHEMA_VERSION = "0.6.5e-local-schema-mapping";

function check(offset, size, total, label) {
    if (!Number.isInteger(offset) || offset < 0 || offset + size > total) {
        throw new RangeError(`${label}: offset ${offset}, size ${size}, total ${total}`);
    }
}
function u16(view, offset, label = "u16") { check(offset, 2, view.byteLength, label); return view.getUint16(offset, true); }
function i32(view, offset, label = "i32") { check(offset, 4, view.byteLength, label); return view.getInt32(offset, true); }
function u32(view, offset, label = "u32") { check(offset, 4, view.byteLength, label); return view.getUint32(offset, true); }
function identifier(bytes) { return bytes.length >= 8 ? String.fromCharCode(...bytes.slice(4, 8)) : ""; }
function tableInfo(view, tableOffset, label = "table") {
    check(tableOffset, 4, view.byteLength, label);
    const distance = i32(view, tableOffset, `${label}.vtableDistance`);
    const vtableOffset = tableOffset - distance;
    check(vtableOffset, 4, view.byteLength, `${label}.vtable`);
    const vtableLength = u16(view, vtableOffset, `${label}.vtableLength`);
    const objectLength = u16(view, vtableOffset + 2, `${label}.objectLength`);
    if (vtableLength < 4 || vtableLength > 1024 || objectLength < 4 || objectLength > 4096) throw new RangeError(`${label}: implausible table layout`);
    return { tableOffset, vtableOffset, vtableLength, objectLength, fieldCount: Math.floor((vtableLength - 4) / 2) };
}
function fieldAddress(view, table, fieldIndex) {
    const slot = table.vtableOffset + 4 + fieldIndex * 2;
    if (slot + 2 > table.vtableOffset + table.vtableLength) return null;
    const relativeOffset = u16(view, slot, `field[${fieldIndex}]`);
    return relativeOffset ? table.tableOffset + relativeOffset : null;
}
function indirect(view, address, label) {
    if (address == null) return null;
    const relative = u32(view, address, `${label}.relativeOffset`);
    const target = address + relative;
    check(target, 4, view.byteLength, `${label}.target`);
    return target;
}
function tableField(view, table, fieldIndex, label) {
    const address = fieldAddress(view, table, fieldIndex);
    const target = indirect(view, address, label);
    return target == null ? null : tableInfo(view, target, label);
}
function vectorField(view, table, fieldIndex, label) {
    const address = fieldAddress(view, table, fieldIndex);
    const target = indirect(view, address, label);
    if (target == null) return null;
    const length = u32(view, target, `${label}.length`);
    const dataOffset = target + 4;
    check(dataOffset, 0, view.byteLength, `${label}.data`);
    return { targetOffset: target, dataOffset, length };
}
function stringAtVectorIndex(view, vector, index) {
    const slot = vector.dataOffset + index * 4;
    check(slot, 4, view.byteLength, "stringVector.slot");
    const target = slot + u32(view, slot, "stringVector.relativeOffset");
    const length = u32(view, target, "string.length");
    check(target + 4, length, view.byteLength, "string.bytes");
    return new TextDecoder("utf-8").decode(new Uint8Array(view.buffer, target + 4, length));
}
function sampleStrings(view, vector, limit = 40) {
    if (!vector) return [];
    const output = [];
    for (let index = 0; index < Math.min(vector.length, limit); index += 1) {
        try { output.push(stringAtVectorIndex(view, vector, index)); }
        catch (error) { output.push(`[decode-error:${error.message}]`); break; }
    }
    return output;
}
const MODEL_ENTITIES_FIELDS = [
    { index: 0, name: "entities", type: "vector<Entity>" },
    { index: 1, name: "hierarchies", type: "vector<HierarchyNode>" },
    { index: 2, name: "guid_identifiers", type: "vector<Guid>" },
    { index: 3, name: "string_identifiers", type: "vector<string>" },
    { index: 4, name: "spatial_hash_identifiers", type: "vector<SpatialHash>" },
    { index: 5, name: "dwg_handle_identifiers", type: "vector<long>" },
    { index: 6, name: "entity_classes", type: "vector<string>" }
];
export class TrimBimSchemaReader {
    static open(arrayBuffer) { return new TrimBimSchemaReader(arrayBuffer); }
    constructor(arrayBuffer) {
        this.buffer = arrayBuffer;
        this.bytes = new Uint8Array(arrayBuffer);
        this.view = new DataView(arrayBuffer);
        this.rootOffset = u32(this.view, 0, "rootOffset");
        this.header = { identifier: identifier(this.bytes), version: Number(identifier(this.bytes).replace("TRB", "")) || null, rootTableOffset: this.rootOffset, byteLength: this.bytes.length };
        this.root = tableInfo(this.view, this.rootOffset, "TrimBimRoot");
    }
    schemaDiagnostic() {
        const rootFields = [];
        for (let index = 0; index < this.root.fieldCount; index += 1) {
            const address = fieldAddress(this.view, this.root, index);
            let targetOffset = null, targetTable = null;
            try {
                targetOffset = indirect(this.view, address, `root.field${index}`);
                if (targetOffset != null) targetTable = tableInfo(this.view, targetOffset, `root.field${index}.table`);
            } catch (_) { /* field may be scalar or vector */ }
            rootFields.push({ index, address, targetOffset, candidateTable: targetTable ? { fieldCount: targetTable.fieldCount, vtableLength: targetTable.vtableLength, objectLength: targetTable.objectLength } : null });
        }

        // Verified against trimbim-v8.fbs: root field 0 points to ModelEntities.
        const modelEntities = tableField(this.view, this.root, 0, "ModelEntities");
        const mappedFields = MODEL_ENTITIES_FIELDS.map(definition => {
            const vector = vectorField(this.view, modelEntities, definition.index, `ModelEntities.${definition.name}`);
            return { ...definition, present: Boolean(vector), length: vector?.length ?? 0, dataOffset: vector?.dataOffset ?? null };
        });
        const stringIdentifiers = vectorField(this.view, modelEntities, 3, "ModelEntities.string_identifiers");
        const entityClasses = vectorField(this.view, modelEntities, 6, "ModelEntities.entity_classes");
        return {
            readerVersion: LOCAL_TRB_SCHEMA_VERSION,
            header: this.header,
            rootTable: { fieldCount: this.root.fieldCount, vtableLength: this.root.vtableLength, objectLength: this.root.objectLength },
            rootFields,
            verifiedMappings: {
                rootField0: "ModelEntities",
                ModelEntities: {
                    table: { fieldCount: modelEntities.fieldCount, vtableLength: modelEntities.vtableLength, objectLength: modelEntities.objectLength },
                    fields: mappedFields,
                    entityCount: mappedFields[0]?.length ?? 0,
                    hierarchyCount: mappedFields[1]?.length ?? 0,
                    guidIdentifierCount: mappedFields[2]?.length ?? 0,
                    stringIdentifierCount: mappedFields[3]?.length ?? 0,
                    spatialHashIdentifierCount: mappedFields[4]?.length ?? 0,
                    dwgHandleIdentifierCount: mappedFields[5]?.length ?? 0,
                    entityClassCount: mappedFields[6]?.length ?? 0,
                    stringIdentifierSample: sampleStrings(this.view, stringIdentifiers),
                    entityClassSample: sampleStrings(this.view, entityClasses)
                }
            },
            unmappedRootFields: rootFields.slice(1).map(item => item.index),
            geometryTypeCountsDecoded: false,
            meshArraysDecoded: false,
            note: "v0.6.5e maps only schema fields verified from trimbim-v8.fbs. Root fields 1-5 remain intentionally unnamed until their declarations are verified."
        };
    }
}
