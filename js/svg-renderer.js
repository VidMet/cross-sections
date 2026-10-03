const SVG_NS = "http://www.w3.org/2000/svg";
const el = (name, attrs = {}, text = null) => {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text !== null) node.textContent = String(text);
    return node;
};
const text = (group, x, y, value, options = {}) => {
    const node = el("text", {
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
};
function niceStep(raw) {
    const power = Math.pow(10, Math.floor(Math.log10(raw)));
    const normalized = raw / power;
    return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * power;
}
export function clearProfileSvg(svg) {
    if (svg) while (svg.firstChild) svg.removeChild(svg.firstChild);
}
export function renderProfileShell(svg, data) {
    if (!svg) throw new Error("Fant ikke profileSvg.");
    const width = 1200, height = 700;
    const margin = { left: 95, right: 45, top: 95, bottom: 85 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const sectionWidth = Math.max(1, Number(data.sectionWidth || 50));
    const centerElevation = Number(data.centerElevation || 0);
    const minOffset = -sectionWidth / 2, maxOffset = sectionWidth / 2;
    const minElevation = centerElevation - Number(data.verticalBelow || 8);
    const maxElevation = centerElevation + Number(data.verticalAbove || 12);
    const sx = offset => margin.left + (offset - minOffset) * plotWidth / (maxOffset - minOffset);
    const sy = elevation => margin.top + (maxElevation - elevation) * plotHeight / (maxElevation - minElevation);
    clearProfileSvg(svg);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    const background = el("g", { id: "backgroundLayer" });
    const grid = el("g", { id: "gridLayer" });
    const axes = el("g", { id: "axisLayer" });
    const geometry = el("g", { id: "geometryLayer" });
    const alignment = el("g", { id: "alignmentLayer" });
    const labels = el("g", { id: "labelLayer" });
    [background, grid, axes, geometry, alignment, labels].forEach(layer => svg.appendChild(layer));
    background.appendChild(el("rect", { x: 0, y: 0, width, height, fill: "#fff" }));
    background.appendChild(el("rect", {
        x: margin.left, y: margin.top, width: plotWidth, height: plotHeight,
        fill: "#f8fafc", stroke: "#cbd5e1", "stroke-width": 1
    }));
    const hStep = niceStep(sectionWidth / 10);
    const vStep = niceStep((maxElevation - minElevation) / 10);
    for (let offset = Math.ceil(minOffset / hStep) * hStep; offset <= maxOffset + 1e-6; offset += hStep) {
        const x = sx(offset), center = Math.abs(offset) < 1e-6;
        grid.appendChild(el("line", {
            x1: x, y1: margin.top, x2: x, y2: margin.top + plotHeight,
            stroke: center ? "#64748b" : "#dbe4ee", "stroke-width": center ? 1.4 : 1,
            "stroke-dasharray": center ? "7 5" : "none"
        }));
        text(labels, x, margin.top + plotHeight + 28, offset.toFixed(hStep < 1 ? 1 : 0), { anchor: "middle", size: 12 });
    }
    for (let elevation = Math.ceil(minElevation / vStep) * vStep; elevation <= maxElevation + 1e-6; elevation += vStep) {
        const y = sy(elevation);
        grid.appendChild(el("line", {
            x1: margin.left, y1: y, x2: margin.left + plotWidth, y2: y,
            stroke: "#dbe4ee", "stroke-width": 1
        }));
        text(labels, margin.left - 14, y, elevation.toFixed(vStep < 1 ? 1 : 0), {
            anchor: "end", baseline: "middle", size: 12
        });
    }
    axes.appendChild(el("line", {
        x1: margin.left, y1: margin.top + plotHeight, x2: margin.left + plotWidth,
        y2: margin.top + plotHeight, stroke: "#334155", "stroke-width": 2
    }));
    axes.appendChild(el("line", {
        x1: margin.left, y1: margin.top, x2: margin.left,
        y2: margin.top + plotHeight, stroke: "#334155", "stroke-width": 2
    }));
    const cx = sx(0), cy = sy(centerElevation);
    alignment.appendChild(el("circle", {
        cx, cy, r: 8, fill: "#ff0000", stroke: "#111827", "stroke-width": 3
    }));
    alignment.appendChild(el("line", { x1: cx - 18, y1: cy, x2: cx + 18, y2: cy, stroke: "#111827", "stroke-width": 2 }));
    alignment.appendChild(el("line", { x1: cx, y1: cy - 18, x2: cx, y2: cy + 18, stroke: "#111827", "stroke-width": 2 }));
    text(labels, margin.left, 38, "Tverrprofil ved stasjon " + Number(data.station).toFixed(3), {
        size: 22, weight: 600, fill: "#0f172a"
    });
    text(labels, margin.left, 66,
        `${data.alignmentName || "Profileringslinje"} | Referansekote ${centerElevation.toFixed(3)} m | Snittbredde ${sectionWidth.toFixed(1)} m`,
        { size: 13, fill: "#475569" });
    text(labels, margin.left + plotWidth, margin.top - 18,
        `SVG-skall v${data.version || "0.4.3"} - bounding-box-diagnose aktiv`,
        { anchor: "end", size: 12, fill: "#64748b" });
    text(labels, margin.left + plotWidth / 2, height - 28, "Offset fra referanselinje (m)", {
        anchor: "middle", size: 14, weight: 600
    });
    const yLabel = text(labels, 28, margin.top + plotHeight / 2, "Kote (m)", {
        anchor: "middle", size: 14, weight: 600
    });
    yLabel.setAttribute("transform", `rotate(-90 28 ${margin.top + plotHeight / 2})`);
    text(labels, cx + 15, cy - 18, "Referanselinje", { size: 12, weight: 600, fill: "#111827" });
    return { minOffset, maxOffset, minElevation, maxElevation, horizontalStep: hStep, verticalStep: vStep };
}
export function renderGeometryDiagnostic(svg, diagnostic) {
    if (!svg || !diagnostic) return;
    svg.querySelector("#diagnosticLayer")?.remove();
    const layer = el("g", { id: "diagnosticLayer" });
    svg.appendChild(layer);
    const x = 805, y = 112, width = 335, height = 205;
    layer.appendChild(el("rect", {
        x, y, width, height, rx: 8, fill: "#fff", "fill-opacity": 0.94,
        stroke: "#94a3b8", "stroke-width": 1
    }));
    text(layer, x + 16, y + 27, "Geometridiagnose", { size: 15, weight: 600, fill: "#0f172a" });
    const rows = [
        "Objekter funnet: " + diagnostic.totalObjects,
        "Objekter undersøkt: " + diagnostic.inspectedObjects,
        "Bounding boxes: " + diagnostic.boundingBoxes,
        "Bounding-box-kandidater: " + diagnostic.boundingBoxCandidateCount,
        "Valgte kandidater: " + diagnostic.candidateCount,
        "getEntities tilgjengelig: " + (diagnostic.getEntitiesDiagnostic?.available ? "ja" : "nei"),
        "Langsgående toleranse: ±" + Number(diagnostic.longitudinalTolerance).toFixed(2) + " m"
    ];
    rows.forEach((row, index) => text(layer, x + 16, y + 53 + index * 18, row, { size: 12 }));
    if (diagnostic.warnings?.length) {
        text(layer, x + 16, y + height - 12, "Advarsel: se Console", {
            size: 11, weight: 600, fill: "#b45309"
        });
    }
}
