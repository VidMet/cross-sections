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

export function translationMatrix(translation) {
    const matrix = identityMatrix();
    matrix[12] = Number(translation?.x || 0);
    matrix[13] = Number(translation?.y || 0);
    matrix[14] = Number(translation?.z || 0);
    return matrix;
}

export function calculateMeshBounds(meshes, extraTransform = null) {
    const bounds = {
        min: { x: Infinity, y: Infinity, z: Infinity },
        max: { x: -Infinity, y: -Infinity, z: -Infinity }
    };
    let pointCount = 0;

    for (const mesh of meshes || []) {
        for (let index = 0; index + 2 < mesh.positions.length; index += 3) {
            let point = transformPoint(
                mesh.transform,
                mesh.positions[index],
                mesh.positions[index + 1],
                mesh.positions[index + 2]
            );
            if (extraTransform) {
                point = transformPoint(extraTransform, point.x, point.y, point.z);
            }
            bounds.min.x = Math.min(bounds.min.x, point.x);
            bounds.min.y = Math.min(bounds.min.y, point.y);
            bounds.min.z = Math.min(bounds.min.z, point.z);
            bounds.max.x = Math.max(bounds.max.x, point.x);
            bounds.max.y = Math.max(bounds.max.y, point.y);
            bounds.max.z = Math.max(bounds.max.z, point.z);
            pointCount += 1;
        }
    }

    if (!pointCount) return null;
    return {
        ...bounds,
        center: {
            x: (bounds.min.x + bounds.max.x) / 2,
            y: (bounds.min.y + bounds.max.y) / 2,
            z: (bounds.min.z + bounds.max.z) / 2
        },
        size: {
            x: bounds.max.x - bounds.min.x,
            y: bounds.max.y - bounds.min.y,
            z: bounds.max.z - bounds.min.z
        },
        pointCount
    };
}
