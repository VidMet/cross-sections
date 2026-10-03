import { transformPoint } from "./mesh-normalizer.js";

const EPSILON = 1e-7;

const AXIS_MAPPINGS = [
    { name: "XYZ", axes: [0, 1, 2], signs: [1, 1, 1] },
    { name: "X-Y-Z", axes: [0, 1, 2], signs: [1, -1, -1] },
    { name: "-XY-Z", axes: [0, 1, 2], signs: [-1, 1, -1] },
    { name: "-X-YZ", axes: [0, 1, 2], signs: [-1, -1, 1] },
    { name: "XZY", axes: [0, 2, 1], signs: [1, 1, -1] },
    { name: "XZ-Y", axes: [0, 2, 1], signs: [1, -1, 1] },
    { name: "-XZY", axes: [0, 2, 1], signs: [-1, 1, 1] },
    { name: "-XZ-Y", axes: [0, 2, 1], signs: [-1, -1, -1] },
    { name: "YXZ", axes: [1, 0, 2], signs: [1, 1, -1] },
    { name: "YX-Z", axes: [1, 0, 2], signs: [1, -1, 1] },
    { name: "Y-XZ", axes: [1, 0, 2], signs: [-1, 1, 1] },
    { name: "Y-X-Z", axes: [1, 0, 2], signs: [-1, -1, -1] },
    { name: "YZX", axes: [1, 2, 0], signs: [1, 1, 1] },
    { name: "YZ-X", axes: [1, 2, 0], signs: [1, -1, -1] },
    { name: "-YZX", axes: [1, 2, 0], signs: [-1, 1, -1] },
    { name: "-YZ-X", axes: [1, 2, 0], signs: [-1, -1, 1] },
    { name: "ZXY", axes: [2, 0, 1], signs: [1, 1, 1] },
    { name: "ZX-Y", axes: [2, 0, 1], signs: [1, -1, -1] },
    { name: "Z-XY", axes: [2, 0, 1], signs: [-1, 1, -1] },
    { name: "Z-X-Y", axes: [2, 0, 1], signs: [-1, -1, 1] },
    { name: "ZYX", axes: [2, 1, 0], signs: [1, 1, -1] },
    { name: "ZY-X", axes: [2, 1, 0], signs: [1, -1, 1] },
    { name: "Z-YX", axes: [2, 1, 0], signs: [-1, 1, 1] },
    { name: "Z-Y-X", axes: [2, 1, 0], signs: [-1, -1, -1] }
];

function distanceToPlane(point, plane) {
    return (
        (point.x - plane.origin.x) * plane.normal.x +
        (point.y - plane.origin.y) * plane.normal.y +
        (point.z - plane.origin.z) * plane.normal.z
    );
}

function interpolate(a, b, distanceA, distanceB) {
    const denominator = distanceA - distanceB;
    const ratio = Math.abs(denominator) < EPSILON ? 0 : distanceA / denominator;
    return {
        x: a.x + (b.x - a.x) * ratio,
        y: a.y + (b.y - a.y) * ratio,
        z: a.z + (b.z - a.z) * ratio
    };
}

function triangleIntersection(a, b, c, plane) {
    const points = [a, b, c];
    const distances = points.map(point => distanceToPlane(point, plane));
    const intersections = [];

    for (let edge = 0; edge < 3; edge += 1) {
        const next = (edge + 1) % 3;
        const d1 = distances[edge];
        const d2 = distances[next];
        if (Math.abs(d1) <= EPSILON) intersections.push(points[edge]);
        if ((d1 < -EPSILON && d2 > EPSILON) || (d1 > EPSILON && d2 < -EPSILON)) {
            intersections.push(interpolate(points[edge], points[next], d1, d2));
        }
    }

    const unique = [];
    for (const point of intersections) {
        if (!unique.some(existing =>
            Math.abs(existing.x - point.x) < EPSILON &&
            Math.abs(existing.y - point.y) < EPSILON &&
            Math.abs(existing.z - point.z) < EPSILON
        )) unique.push(point);
    }
    return unique.length >= 2 ? [unique[0], unique[1]] : null;
}

function toProfilePoint(point, frame) {
    const dx = point.x - frame.position.x;
    const dy = point.y - frame.position.y;
    return {
        offset: dx * frame.horizontalNormal.x + dy * frame.horizontalNormal.y,
        elevation: point.z
    };
}

function collectWorldBounds(meshes) {
    const bounds = {
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity]
    };
    let pointCount = 0;

    for (const mesh of meshes || []) {
        for (let index = 0; index + 2 < mesh.positions.length; index += 3) {
            const point = transformPoint(
                mesh.transform,
                mesh.positions[index],
                mesh.positions[index + 1],
                mesh.positions[index + 2]
            );
            const values = [point.x, point.y, point.z];
            for (let axis = 0; axis < 3; axis += 1) {
                bounds.min[axis] = Math.min(bounds.min[axis], values[axis]);
                bounds.max[axis] = Math.max(bounds.max[axis], values[axis]);
            }
            pointCount += 1;
        }
    }

    if (!pointCount) return null;
    return {
        min: bounds.min,
        max: bounds.max,
        center: bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2),
        size: bounds.min.map((value, axis) => bounds.max[axis] - value),
        pointCount
    };
}

function mappedSize(bounds, mapping) {
    return mapping.axes.map((sourceAxis, targetAxis) =>
        bounds.size[sourceAxis] * Math.abs(mapping.signs[targetAxis])
    );
}

function mapPoint(point, sourceCenter, frame, mapping) {
    const source = [point.x, point.y, point.z];
    const mapped = mapping.axes.map((sourceAxis, targetAxis) =>
        (source[sourceAxis] - sourceCenter[sourceAxis]) * mapping.signs[targetAxis]
    );
    return {
        x: frame.position.x + mapped[0],
        y: frame.position.y + mapped[1],
        z: frame.position.z + mapped[2]
    };
}

function segmentSpan(segments) {
    if (!segments.length) {
        return { horizontal: 0, vertical: 0 };
    }
    const offsets = [];
    const elevations = [];
    for (const segment of segments) {
        offsets.push(segment.start.offset, segment.end.offset);
        elevations.push(segment.start.elevation, segment.end.elevation);
    }
    return {
        horizontal: Math.max(...offsets) - Math.min(...offsets),
        vertical: Math.max(...elevations) - Math.min(...elevations)
    };
}

function evaluateMapping(meshes, frame, options, mapping, bounds) {
    const halfWidth = (options.sectionWidth || 50) / 2;
    const minimumLength = options.minimumSegmentLength || 0.001;
    const plane = { origin: frame.position, normal: frame.horizontalTangent };
    const segments = [];
    let trianglesTested = 0;
    let minimumAbsolutePlaneDistance = Infinity;

    for (const mesh of meshes) {
        const { positions, indices, transform } = mesh;
        if (!positions || !indices || indices.length < 3) continue;

        for (let index = 0; index + 2 < indices.length; index += 3) {
            trianglesTested += 1;
            const vertexIndices = [indices[index], indices[index + 1], indices[index + 2]];
            const points = vertexIndices.map(vertexIndex => {
                const offset = vertexIndex * 3;
                const world = transformPoint(
                    transform,
                    positions[offset],
                    positions[offset + 1],
                    positions[offset + 2]
                );
                return mapPoint(world, bounds.center, frame, mapping);
            });

            for (const point of points) {
                minimumAbsolutePlaneDistance = Math.min(
                    minimumAbsolutePlaneDistance,
                    Math.abs(distanceToPlane(point, plane))
                );
            }

            const hit = triangleIntersection(points[0], points[1], points[2], plane);
            if (!hit) continue;
            const start = toProfilePoint(hit[0], frame);
            const end = toProfilePoint(hit[1], frame);
            if (Math.abs(start.offset) > halfWidth && Math.abs(end.offset) > halfWidth) continue;
            const length = Math.hypot(
                end.offset - start.offset,
                end.elevation - start.elevation
            );
            if (length < minimumLength) continue;

            segments.push({
                sourceId: mesh.sourceId,
                entityId: mesh.entityId,
                globalId: mesh.globalId,
                className: mesh.className,
                name: mesh.name,
                color: mesh.color,
                start,
                end
            });
        }
    }

    const span = segmentSpan(segments);
    const size = mappedSize(bounds, mapping);
    const horizontalPreference = Math.min(span.horizontal, options.sectionWidth || 50);
    const verticalPenalty = Math.max(0, span.vertical - 20) * 5;
    const narrowPenalty = span.horizontal < 1 ? 1000 : 0;
    const score =
        segments.length * 2 +
        horizontalPreference * 20 -
        span.vertical * 3 -
        verticalPenalty -
        narrowPenalty;

    return {
        mapping: mapping.name,
        axes: [...mapping.axes],
        signs: [...mapping.signs],
        mappedSize: { x: size[0], y: size[1], z: size[2] },
        segments,
        segmentCount: segments.length,
        objectsDrawn: new Set(segments.map(segment =>
            `${segment.sourceId}:${segment.entityId}`
        )).size,
        trianglesTested,
        minimumAbsolutePlaneDistance:
            Number.isFinite(minimumAbsolutePlaneDistance)
                ? minimumAbsolutePlaneDistance
                : null,
        horizontalSpan: span.horizontal,
        verticalSpan: span.vertical,
        score
    };
}

export function intersectMeshes(meshes, frame, options = {}) {
    const bounds = collectWorldBounds(meshes);
    if (!bounds) {
        return {
            segments: [],
            trianglesTested: 0,
            meshesProcessed: 0,
            objectsDrawn: 0,
            axisDiagnostic: {
                selectedMapping: null,
                reason: "Ingen meshpunkter tilgjengelig",
                candidates: []
            }
        };
    }

    const results = AXIS_MAPPINGS.map(mapping =>
        evaluateMapping(meshes, frame, options, mapping, bounds)
    );
    results.sort((a, b) => b.score - a.score);

    const selected = results[0];
    const diagnosticCandidates = results.map(result => ({
        mapping: result.mapping,
        axes: result.axes,
        signs: result.signs,
        mappedSize: result.mappedSize,
        segmentCount: result.segmentCount,
        objectsDrawn: result.objectsDrawn,
        horizontalSpan: result.horizontalSpan,
        verticalSpan: result.verticalSpan,
        minimumAbsolutePlaneDistance: result.minimumAbsolutePlaneDistance,
        score: result.score
    }));

    const axisDiagnostic = {
        selectedMapping: selected.mapping,
        sourceBounds: {
            min: { x: bounds.min[0], y: bounds.min[1], z: bounds.min[2] },
            max: { x: bounds.max[0], y: bounds.max[1], z: bounds.max[2] },
            center: { x: bounds.center[0], y: bounds.center[1], z: bounds.center[2] },
            size: { x: bounds.size[0], y: bounds.size[1], z: bounds.size[2] },
            pointCount: bounds.pointCount
        },
        sectionOrigin: { ...frame.position },
        sectionNormal: { ...frame.horizontalTangent },
        selectionRule:
            "Maksimer skjæringssegmenter og horisontal profilbredde, med straff for smal eller urimelig høy profil.",
        candidates: diagnosticCandidates
    };

    console.log("===== IFC-AKSE- OG MATRISEDIAGNOSE =====");
    console.dir(axisDiagnostic);

    return {
        segments: selected.segments,
        trianglesTested: selected.trianglesTested,
        meshesProcessed: meshes.length,
        objectsDrawn: selected.objectsDrawn,
        minimumAbsolutePlaneDistance: selected.minimumAbsolutePlaneDistance,
        selectedAxisMapping: selected.mapping,
        axisDiagnostic
    };
}
