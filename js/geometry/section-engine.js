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


function diagnoseProfileType(result, sectionWidth) {
    const segments = result.segments || [];
    const width = Math.max(1, Number(sectionWidth) || 50);

    if (!segments.length) {
        return {
            classification: "ingen-geometri",
            confidence: 1,
            reason: "Ingen skjæringssegmenter å klassifisere.",
            metrics: {}
        };
    }

    let totalLength = 0;
    let longestSegment = 0;
    let nearHorizontalLength = 0;
    let nearVerticalLength = 0;
    let positiveOffsetPoints = 0;
    let negativeOffsetPoints = 0;
    const offsets = [];
    const elevations = [];
    const objectKeys = new Set();

    for (const segment of segments) {
        const dx = segment.end.offset - segment.start.offset;
        const dz = segment.end.elevation - segment.start.elevation;
        const length = Math.hypot(dx, dz);
        const absoluteAngle = Math.atan2(Math.abs(dz), Math.abs(dx || EPSILON)) * 180 / Math.PI;

        totalLength += length;
        longestSegment = Math.max(longestSegment, length);
        if (absoluteAngle <= 15) nearHorizontalLength += length;
        if (absoluteAngle >= 75) nearVerticalLength += length;

        for (const point of [segment.start, segment.end]) {
            offsets.push(point.offset);
            elevations.push(point.elevation);
            if (point.offset > 0.25) positiveOffsetPoints += 1;
            if (point.offset < -0.25) negativeOffsetPoints += 1;
        }

        objectKeys.add(`${segment.sourceId}:${segment.entityId}`);
    }

    const horizontalSpan = Math.max(...offsets) - Math.min(...offsets);
    const verticalSpan = Math.max(...elevations) - Math.min(...elevations);
    const widthOccupancy = horizontalSpan / width;
    const horizontalRatio = totalLength ? nearHorizontalLength / totalLength : 0;
    const verticalRatio = totalLength ? nearVerticalLength / totalLength : 0;
    const longestRatio = totalLength ? longestSegment / totalLength : 0;
    const bilateral = positiveOffsetPoints > 0 && negativeOffsetPoints > 0;

    let crossScore = 0;
    let longitudinalScore = 0;
    const indicators = [];

    if (bilateral) {
        crossScore += 2;
        indicators.push("Geometri finnes på begge sider av referanselinjen.");
    } else {
        longitudinalScore += 1;
        indicators.push("Geometrien ligger hovedsakelig på én side av referanselinjen.");
    }

    if (objectKeys.size >= 3) {
        crossScore += 2;
        indicators.push("Flere IFC-objekter bidrar til snittet.");
    } else {
        longitudinalScore += 1;
        indicators.push("Få IFC-objekter bidrar til snittet.");
    }

    if (widthOccupancy >= 0.15 && widthOccupancy <= 0.80) {
        crossScore += 2;
        indicators.push("Horisontal utstrekning er moderat i forhold til valgt snittbredde.");
    }
    if (widthOccupancy > 0.90) {
        longitudinalScore += 3;
        indicators.push("Geometrien fyller nesten hele valgt snittbredde.");
    }

    if (horizontalRatio > 0.75 && verticalSpan < Math.max(2, horizontalSpan * 0.20)) {
        longitudinalScore += 3;
        indicators.push("Resultatet domineres av en lang, slak linjeføring.");
    }

    if (verticalRatio > 0.35) {
        crossScore += 1;
        indicators.push("Resultatet inneholder tydelige vertikale eller bratte objektkanter.");
    }

    if (longestRatio > 0.45) {
        longitudinalScore += 2;
        indicators.push("Én sammenhengende linje dominerer total segmentlengde.");
    }

    if (verticalSpan > 0.25 && horizontalSpan > verticalSpan * 2) {
        crossScore += 1;
    }

    const difference = crossScore - longitudinalScore;
    let classification = "uavklart";
    if (difference >= 3) classification = "sannsynlig-tverrprofil";
    if (difference <= -3) classification = "sannsynlig-lengdeprofil";

    const confidence = Math.min(1, Math.abs(difference) / Math.max(5, crossScore + longitudinalScore));

    return {
        classification,
        confidence,
        crossScore,
        longitudinalScore,
        indicators,
        metrics: {
            segmentCount: segments.length,
            objectCount: objectKeys.size,
            horizontalSpan,
            verticalSpan,
            widthOccupancy,
            horizontalLengthRatio: horizontalRatio,
            verticalLengthRatio: verticalRatio,
            longestSegmentRatio: longestRatio,
            bilateral
        }
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

    const profileTypeDiagnostic = diagnoseProfileType(
        selected,
        options.sectionWidth || 50
    );

    console.log("===== IFC-AKSE- OG MATRISEDIAGNOSE =====");
    console.dir(axisDiagnostic);
    console.log("===== TVERRPROFIL ELLER LENGDEPROFIL =====");
    console.dir(profileTypeDiagnostic);

    return {
        segments: selected.segments,
        trianglesTested: selected.trianglesTested,
        meshesProcessed: meshes.length,
        objectsDrawn: selected.objectsDrawn,
        minimumAbsolutePlaneDistance: selected.minimumAbsolutePlaneDistance,
        selectedAxisMapping: selected.mapping,
        axisDiagnostic,
        profileTypeDiagnostic
    };
}
