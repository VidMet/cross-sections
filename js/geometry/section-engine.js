import {
    transformPoint,
    calculateMeshBounds,
    translationMatrix
} from "./mesh-normalizer.js";

const EPSILON = 1e-7;

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

function intersectWithTransform(meshes, frame, options, worldTransform) {
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
            const offsets = [indices[index], indices[index + 1], indices[index + 2]].map(value => value * 3);
            const points = offsets.map(offset => {
                let point = transformPoint(
                    transform,
                    positions[offset],
                    positions[offset + 1],
                    positions[offset + 2]
                );
                if (worldTransform) {
                    point = transformPoint(worldTransform, point.x, point.y, point.z);
                }
                return point;
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

    return {
        segments,
        trianglesTested,
        meshesProcessed: meshes.length,
        objectsDrawn: new Set(segments.map(segment =>
            `${segment.sourceId}:${segment.entityId}`
        )).size,
        minimumAbsolutePlaneDistance:
            Number.isFinite(minimumAbsolutePlaneDistance)
                ? minimumAbsolutePlaneDistance
                : null
    };
}

export function intersectMeshes(meshes, frame, options = {}) {
    const ifcBoundsBefore = calculateMeshBounds(meshes);
    let result = intersectWithTransform(meshes, frame, options, null);
    let correctionMode = "none";
    let appliedTranslation = { x: 0, y: 0, z: 0 };
    let worldTransform = null;

    if (!result.segments.length && ifcBoundsBefore) {
        appliedTranslation = {
            x: frame.position.x - ifcBoundsBefore.center.x,
            y: frame.position.y - ifcBoundsBefore.center.y,
            z: frame.position.z - ifcBoundsBefore.center.z
        };
        worldTransform = translationMatrix(appliedTranslation);
        const corrected = intersectWithTransform(
            meshes,
            frame,
            options,
            worldTransform
        );
        if (corrected.segments.length) {
            result = corrected;
            correctionMode = "mesh-center-to-section-origin";
        }
    }

    const ifcBoundsAfter = calculateMeshBounds(meshes, worldTransform);
    const diagnostic = {
        sectionOrigin: { ...frame.position },
        sectionNormal: { ...frame.horizontalTangent },
        ifcBoundsBefore,
        ifcBoundsAfter,
        appliedTranslation,
        correctionMode,
        minimumAbsolutePlaneDistance: result.minimumAbsolutePlaneDistance,
        meshesProcessed: result.meshesProcessed,
        trianglesTested: result.trianglesTested,
        segmentCount: result.segments.length,
        objectsDrawn: result.objectsDrawn
    };

    console.log("===== IFC-KOORDINATDIAGNOSE =====");
    console.dir(diagnostic);

    return {
        ...result,
        coordinateDiagnostic: diagnostic
    };
}
