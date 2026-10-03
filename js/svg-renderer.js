const SVG_NS = "http://www.w3.org/2000/svg";
const VIEW = { width: 1200, height: 700, left: 95, top: 95, plotWidth: 1060, plotHeight: 520 };

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

export function renderProfileShell(svg, profile) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const view = viewport(profile);
    svg.setAttribute("viewBox", `0 0 ${view.width} ${view.height}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    svg.appendChild(element("rect", { width: view.width, height: view.height, fill: "white" }));
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

    svg.appendChild(element("g", { id: "geometryLayer" }));
    const markerLayer = element("g", { id: "alignmentLayer" });
    svg.appendChild(markerLayer);
    const centerX = view.x(0);
    const centerY = view.y(profile.centerElevation);
    markerLayer.appendChild(element("circle", {
        cx: centerX, cy: centerY, r: 8, fill: "red", stroke: "#111827", "stroke-width": 3
    }));

    const labels = element("g", { id: "labelLayer" });
    svg.appendChild(labels);
    text(labels, view.left, 38, `Tverrprofil ved stasjon ${Number(profile.station).toFixed(3)}`, { size: 22, weight: 600 });
    text(labels, view.left, 66,
        `${profile.alignmentName} | Referansekote ${Number(profile.centerElevation).toFixed(3)} m | Snittbredde ${Number(profile.sectionWidth).toFixed(1)} m`,
        { size: 13 });
    text(labels, view.left + view.plotWidth, view.top - 18,
        `v${profile.version} - første IFC-snitt`, { anchor: "end", size: 12 });
    text(labels, view.left + view.plotWidth / 2, view.height - 28,
        "Offset fra referanselinje (m)", { anchor: "middle", size: 14, weight: 600 });
}

function cssColor(color) {
    if (!color) return "#334155";
    const scale = value => Math.max(0, Math.min(255, Math.round(Number(value ?? 0) * 255)));
    return `rgb(${scale(color.x ?? color.r)},${scale(color.y ?? color.g)},${scale(color.z ?? color.b)})`;
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

    for (const [key, objectSegments] of grouped) {
        const group = element("g", {
            "data-object-key": key,
            "data-global-id": objectSegments[0].globalId || "",
            "data-class": objectSegments[0].className || ""
        });
        const stroke = cssColor(objectSegments[0].color);
        for (const segment of objectSegments) {
            group.appendChild(element("line", {
                x1: view.x(segment.start.offset),
                y1: view.y(segment.start.elevation),
                x2: view.x(segment.end.offset),
                y2: view.y(segment.end.elevation),
                stroke,
                "stroke-width": 1.6,
                "stroke-linecap": "round",
                "vector-effect": "non-scaling-stroke"
            }));
        }
        layer.appendChild(group);
    }
}

export function renderGeometryDiagnostic(svg, data) {
    const old = svg.querySelector("#diagnosticLayer");
    if (old) old.remove();
    const group = element("g", { id: "diagnosticLayer" });
    svg.appendChild(group);
    group.appendChild(element("rect", {
        x: 785, y: 112, width: 355, height: 245, rx: 8,
        fill: "white", "fill-opacity": 0.95, stroke: "#94a3b8"
    }));
    text(group, 801, 139, "IFC-snitt", { size: 15, weight: 600 });
    const rows = [
        `Synlige Viewer-modeller: ${data.viewerCount}`,
        `IFC-kilder klare: ${data.ifcProvidersReady}`,
        `Bounding-box-kandidater: ${data.candidateCount}`,
        `Kandidater koblet til IFC: ${data.linkedCandidateCount}`,
        `Mesh behandlet: ${data.meshesProcessed}`,
        `Trekanter testet: ${data.trianglesTested}`,
        `Skjæringssegmenter: ${data.segmentCount}`,
        `Objekter tegnet: ${data.objectsDrawn}`
    ];
    rows.forEach((row, index) => text(group, 801, 165 + index * 21, row, { size: 12 }));
}
