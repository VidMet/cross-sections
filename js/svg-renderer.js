const SVG_NS = "http://www.w3.org/2000/svg";
const VIEW = { width: 1200, height: 700, left: 95, top: 95, plotWidth: 1060, plotHeight: 520 };
const POINT_TOLERANCE = 0.003;
const DUPLICATE_TOLERANCE = 0.002;

function element(name, attributes = {}, value = null) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, item] of Object.entries(attributes)) node.setAttribute(key, String(item));
    if (value !== null) node.textContent = String(value);
    return node;
}

function text(group, x, y, value, options = {}) {
    const node = element("text", {
        x, y,
        fill: options.fill || "#334155",
        "font-family": "Segoe UI, Arial, sans-serif",
        "font-size": options.size || 13,
        "font-weight": options.weight || 400,
        "text-anchor": options.anchor || "start",
        "dominant-baseline": options.baseline || "auto"
    }, value);
    group.appendChild(node);
    return node;
}

function viewport(profile) {
    const sectionWidth = Number(profile.sectionWidth) || 50;
    const centerElevation = Number(profile.centerElevation) || 0;
    const minOffset = -sectionWidth / 2;
    const maxOffset = sectionWidth / 2;
    const minElevation = centerElevation - 8;
    const maxElevation = centerElevation + 12;
    return {
        ...VIEW,
        minOffset, maxOffset, minElevation, maxElevation,
        x: offset => VIEW.left + (offset - minOffset) * VIEW.plotWidth / (maxOffset - minOffset),
        y: elevation => VIEW.top + (maxElevation - elevation) * VIEW.plotHeight / (maxElevation - minElevation)
    };
}

function addPlotClip(svg, view) {
    const definitions = element("defs");
    const clip = element("clipPath", { id: "profilePlotClip", clipPathUnits: "userSpaceOnUse" });
    clip.appendChild(element("rect", {
        x: view.left,
        y: view.top,
        width: view.plotWidth,
        height: view.plotHeight
    }));
    definitions.appendChild(clip);
    svg.appendChild(definitions);
}

export function renderProfileShell(svg, profile) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const view = viewport(profile);
    svg.setAttribute("viewBox", `0 0 ${view.width} ${view.height}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.appendChild(element("rect", { width: view.width, height: view.height, fill: "white" }));
    addPlotClip(svg, view);
    svg.appendChild(element("rect", {
        x: view.left, y: view.top, width: view.plotWidth, height: view.plotHeight,
        fill: "#f8fafc", stroke: "#cbd5e1"
    }));
    const grid = element("g", { id: "gridLayer" });
    svg.appendChild(grid);
    const horizontalStep = Math.max(1, Math.round((view.maxOffset - view.minOffset) / 10));
    for (let offset = Math.ceil(view.minOffset / horizontalStep) * horizontalStep; offset <= view.maxOffset; offset += horizontalStep) {
        const x = view.x(offset);
        grid.appendChild(element("line", {
            x1: x, y1: view.top, x2: x, y2: view.top + view.plotHeight,
            stroke: Math.abs(offset) < 1e-9 ? "#64748b" : "#dbe4ee",
            "stroke-dasharray": Math.abs(offset) < 1e-9 ? "7 5" : "none"
        }));
        text(grid, x, view.top + view.plotHeight + 28, offset.toFixed(0), { anchor: "middle", size: 12 });
    }
    for (let elevation = Math.ceil(view.minElevation / 2) * 2; elevation <= view.maxElevation; elevation += 2) {
        const y = view.y(elevation);
        grid.appendChild(element("line", {
            x1: view.left, y1: y, x2: view.left + view.plotWidth, y2: y,
            stroke: "#dbe4ee"
        }));
        text(grid, view.left - 14, y, elevation.toFixed(0), { anchor: "end", baseline: "middle", size: 12 });
    }
    svg.appendChild(element("g", { id: "geometryLayer", "clip-path": "url(#profilePlotClip)" }));
    const markerLayer = element("g", { id: "alignmentLayer", "clip-path": "url(#profilePlotClip)" });
    svg.appendChild(markerLayer);
    markerLayer.appendChild(element("circle", {
        cx: view.x(0), cy: view.y(profile.centerElevation), r: 8,
        fill: "#ef4444", stroke: "#111827", "stroke-width": 3,
        "vector-effect": "non-scaling-stroke"
    }));
    const labels = element("g", { id: "labelLayer" });
    svg.appendChild(labels);
    text(labels, view.left, 38, `Tverrprofil ved stasjon ${Number(profile.station).toFixed(3)}`, { size: 22, weight: 600 });
    text(labels, view.left, 66,
        `${profile.alignmentName} | Referansekote ${Number(profile.centerElevation).toFixed(3)} m | Snittbredde ${Number(profile.sectionWidth).toFixed(1)} m`,
        { size: 13 });
    text(labels, view.left + view.plotWidth, view.top - 18,
        `v${profile.version} - renset IFC-snitt`, { anchor: "end", size: 12 });
    text(labels, view.left + view.plotWidth / 2, view.height - 28,
        "Offset fra referanselinje (m)", { anchor: "middle", size: 14, weight: 600 });
}

function cssColor(color) {
    if (!color) return "#334155";
    const scale = value => Math.max(0, Math.min(255, Math.round(Number(value ?? 0) * 255)));
    return `rgb(${scale(color.x ?? color.r)},${scale(color.y ?? color.g)},${scale(color.z ?? color.b)})`;
}

function pointDistance(a, b) {
    return Math.hypot(a.offset - b.offset, a.elevation - b.elevation);
}

function rounded(value, tolerance) {
    return Math.round(value / tolerance);
}

function pointKey(point, tolerance = DUPLICATE_TOLERANCE) {
    return `${rounded(point.offset, tolerance)}:${rounded(point.elevation, tolerance)}`;
}

function canonicalSegmentKey(segment) {
    const a = pointKey(segment.start);
    const b = pointKey(segment.end);
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function removeDuplicateSegments(segments) {
    const unique = new Map();
    for (const segment of segments) {
        const key = canonicalSegmentKey(segment);
        if (!unique.has(key)) unique.set(key, segment);
    }
    return Array.from(unique.values());
}

function reversePolyline(polyline) {
    return [...polyline].reverse();
}

function stitchSegments(segments) {
    const unused = segments.map(segment => ({ ...segment, used: false }));
    const polylines = [];
    for (const seed of unused) {
        if (seed.used) continue;
        seed.used = true;
        let points = [seed.start, seed.end];
        let changed = true;
        while (changed) {
            changed = false;
            for (const candidate of unused) {
                if (candidate.used) continue;
                const first = points[0];
                const last = points.at(-1);
                if (pointDistance(last, candidate.start) <= POINT_TOLERANCE) {
                    points.push(candidate.end); candidate.used = true; changed = true; break;
                }
                if (pointDistance(last, candidate.end) <= POINT_TOLERANCE) {
                    points.push(candidate.start); candidate.used = true; changed = true; break;
                }
                if (pointDistance(first, candidate.end) <= POINT_TOLERANCE) {
                    points.unshift(candidate.start); candidate.used = true; changed = true; break;
                }
                if (pointDistance(first, candidate.start) <= POINT_TOLERANCE) {
                    points.unshift(candidate.end); candidate.used = true; changed = true; break;
                }
            }
        }
        const cleaned = [];
        for (const point of points) {
            if (!cleaned.length || pointDistance(cleaned.at(-1), point) > 1e-6) cleaned.push(point);
        }
        if (cleaned.length >= 2) polylines.push(cleaned);
    }
    return polylines;
}

function simplifyCollinear(points) {
    if (points.length <= 2) return points;
    const result = [points[0]];
    for (let index = 1; index < points.length - 1; index += 1) {
        const a = result.at(-1);
        const b = points[index];
        const c = points[index + 1];
        const abx = b.offset - a.offset;
        const aby = b.elevation - a.elevation;
        const bcx = c.offset - b.offset;
        const bcy = c.elevation - b.elevation;
        const cross = Math.abs(abx * bcy - aby * bcx);
        const scale = Math.max(1e-9, Math.hypot(abx, aby) * Math.hypot(bcx, bcy));
        if (cross / scale > 1e-4) result.push(b);
    }
    result.push(points.at(-1));
    return result;
}

function cleanObjectSegments(segments) {
    const unique = removeDuplicateSegments(segments);
    const polylines = stitchSegments(unique).map(simplifyCollinear);
    return {
        rawCount: segments.length,
        uniqueCount: unique.length,
        duplicateCount: segments.length - unique.length,
        polylines
    };
}

function pathData(points, view) {
    return points.map((point, index) =>
        `${index ? "L" : "M"}${view.x(point.offset).toFixed(2)} ${view.y(point.elevation).toFixed(2)}`
    ).join(" ");
}

export function renderSectionSegments(svg, segments, profile) {
    const layer = svg.querySelector("#geometryLayer");
    if (!layer) return;
    layer.innerHTML = "";
    const view = viewport(profile);
    const grouped = new Map();
    for (const segment of segments || []) {
        const key = `${segment.sourceId}:${segment.entityId}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(segment);
    }
    const statistics = {
        rawSegments: (segments || []).length,
        uniqueSegments: 0,
        duplicatesRemoved: 0,
        polylinesDrawn: 0,
        objectsDrawn: grouped.size
    };
    for (const [key, objectSegments] of grouped) {
        const cleaned = cleanObjectSegments(objectSegments);
        statistics.uniqueSegments += cleaned.uniqueCount;
        statistics.duplicatesRemoved += cleaned.duplicateCount;
        statistics.polylinesDrawn += cleaned.polylines.length;
        const group = element("g", {
            "data-object-key": key,
            "data-global-id": objectSegments[0].globalId || "",
            "data-class": objectSegments[0].className || "",
            "data-name": objectSegments[0].name || ""
        });
        const stroke = cssColor(objectSegments[0].color);
        for (let index = 0; index < cleaned.polylines.length; index += 1) {
            const points = cleaned.polylines[index];
            const path = element("path", {
                d: pathData(points, view),
                fill: "none",
                stroke,
                "stroke-width": 1.55,
                "stroke-linecap": "round",
                "stroke-linejoin": "round",
                "vector-effect": "non-scaling-stroke",
                "data-polyline-index": index
            });
            path.appendChild(element("title", {},
                `${objectSegments[0].className || "IFC-objekt"}\n${objectSegments[0].name || ""}\n${objectSegments[0].globalId || ""}`
            ));
            group.appendChild(path);
        }
        layer.appendChild(group);
    }
    window.__crossSectionRenderStatistics = statistics;
    console.log("===== PROFILRENSING v0.5.5 =====");
    console.dir(statistics);
}

export function renderGeometryDiagnostic(svg, data) {
    const old = svg.querySelector("#diagnosticLayer");
    if (old) old.remove();
    const group = element("g", { id: "diagnosticLayer" });
    svg.appendChild(group);
    group.appendChild(element("rect", {
        x: 785, y: 112, width: 355, height: 266, rx: 8,
        fill: "white", "fill-opacity": 0.95, stroke: "#94a3b8"
    }));
    text(group, 801, 139, "IFC-snitt", { size: 15, weight: 600 });
    const cleaned = window.__crossSectionRenderStatistics || {};
    const rows = [
        `Synlige Viewer-modeller: ${data.viewerCount}`,
        `IFC-kilder klare: ${data.ifcProvidersReady}`,
        `Bounding-box-kandidater: ${data.candidateCount}`,
        `Kandidater koblet til IFC: ${data.linkedCandidateCount}`,
        `Mesh behandlet: ${data.meshesProcessed}`,
        `Trekanter testet: ${data.trianglesTested}`,
        `Rå segmenter: ${data.segmentCount}`,
        `Duplikater fjernet: ${cleaned.duplicatesRemoved ?? 0}`,
        `Polylinjer tegnet: ${cleaned.polylinesDrawn ?? 0}`,
        `Objekter tegnet: ${data.objectsDrawn}`
    ];
    rows.forEach((row, index) => text(group, 801, 165 + index * 20, row, { size: 12 }));
}
