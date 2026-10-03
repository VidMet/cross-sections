export function identityMatrix() {
    return new Float64Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    ]);
}

export function toMatrix4(value) {
    if (!value) return identityMatrix();
    const source = value.elements || value;
    if (!source || source.length !== 16) return identityMatrix();
    return new Float64Array(source);
}

export function transformPoint(matrix, x, y, z) {
    return {
        x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
        y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
        z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
    };
}

export function normalizeIfcGeometry({
    sourceId,
    expressId,
    globalId,
    className,
    name,
    vertexData,
    indexData,
    transform,
    color
}) {
    const stride = vertexData.length % 6 === 0 ? 6 : 3;
    const positions = new Float64Array((vertexData.length / stride) * 3);

    for (let source = 0, target = 0; source < vertexData.length; source += stride) {
        positions[target++] = vertexData[source];
        positions[target++] = vertexData[source + 1];
        positions[target++] = vertexData[source + 2];
    }

    return {
        sourceId,
        sourceType: "ifc",
        entityId: expressId,
        globalId: globalId || null,
        className: className || "IFCPRODUCT",
        name: name || "",
        positions,
        indices: new Uint32Array(indexData),
        transform: toMatrix4(transform),
        color: color || null
    };
}
