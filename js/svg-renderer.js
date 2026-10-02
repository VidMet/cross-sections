const SVG_NS = "http://www.w3.org/2000/svg";

function createSvgElement(name, attributes, text) {
    const element = document.createElementNS(SVG_NS, name);

    Object.keys(attributes || {}).forEach(function (key) {
        element.setAttribute(key, String(attributes[key]));
    });

    if (text !== undefined && text !== null) {
        element.textContent = String(text);
    }

    return element;
}

function niceStep(rawStep) {
    if (!Number.isFinite(rawStep) || rawStep <= 0) {
        return 1;
    }

    const power = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const normalized = rawStep / power;

    let niceNormalized = 1;

    if (normalized <= 1) {
        niceNormalized = 1;
    }
    else if (normalized <= 2) {
        niceNormalized = 2;
    }
    else if (normalized <= 5) {
        niceNormalized = 5;
    }
    else {
        niceNormalized = 10;
    }

    return niceNormalized * power;
}

function decimalsForStep(step) {
    if (step >= 1) {
        return 0;
    }

    if (step >= 0.1) {
        return 1;
    }

    return 2;
}

function appendText(group, x, y, text, options) {
    const settings = options || {};

    const element = createSvgElement(
        "text",
        {
            x: x,
            y: y,
            fill: settings.fill || "#334155",
            "font-family": "Segoe UI, Arial, sans-serif",
            "font-size": settings.fontSize || 13,
            "font-weight": settings.fontWeight || 400,
            "text-anchor": settings.anchor || "start",
            "dominant-baseline": settings.baseline || "auto"
        },
        text
    );

    group.appendChild(element);
    return element;
}

export function clearProfileSvg(svgElement) {
    if (!svgElement) {
        return;
    }

    while (svgElement.firstChild) {
        svgElement.removeChild(svgElement.firstChild);
    }
}

export function renderProfileShell(svgElement, profileData) {
    if (!svgElement) {
        throw new Error("Fant ikke SVG-elementet profileSvg.");
    }

    const data = profileData || {};
    const station = Number(data.station || 0);
    const centerElevation = Number(data.centerElevation || 0);
    const sectionWidth = Math.max(1, Number(data.sectionWidth || 50));
    const verticalBelow = Math.max(1, Number(data.verticalBelow || 8));
    const verticalAbove = Math.max(1, Number(data.verticalAbove || 12));

    const viewWidth = 1200;
    const viewHeight = 700;

    const margin = {
        left: 95,
        right: 45,
        top: 95,
        bottom: 85
    };

    const plotWidth = viewWidth - margin.left - margin.right;
    const plotHeight = viewHeight - margin.top - margin.bottom;

    const minOffset = -sectionWidth / 2;
    const maxOffset = sectionWidth / 2;
    const minElevation = centerElevation - verticalBelow;
    const maxElevation = centerElevation + verticalAbove;

    const scaleX = plotWidth / (maxOffset - minOffset);
    const scaleY = plotHeight / (maxElevation - minElevation);

    function toScreenX(offset) {
        return margin.left + (offset - minOffset) * scaleX;
    }

    function toScreenY(elevation) {
        return margin.top + (maxElevation - elevation) * scaleY;
    }

    clearProfileSvg(svgElement);

    svgElement.setAttribute(
        "viewBox",
        "0 0 " + viewWidth + " " + viewHeight
    );
    svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svgElement.setAttribute("role", "img");
    svgElement.setAttribute(
        "aria-label",
        "Tverrprofil ved stasjon " + station.toFixed(3)
    );

    const backgroundLayer = createSvgElement("g", { id: "backgroundLayer" });
    const gridLayer = createSvgElement("g", { id: "gridLayer" });
    const axisLayer = createSvgElement("g", { id: "axisLayer" });
    const geometryLayer = createSvgElement("g", { id: "geometryLayer" });
    const alignmentLayer = createSvgElement("g", { id: "alignmentLayer" });
    const labelLayer = createSvgElement("g", { id: "labelLayer" });

    svgElement.appendChild(backgroundLayer);
    svgElement.appendChild(gridLayer);
    svgElement.appendChild(axisLayer);
    svgElement.appendChild(geometryLayer);
    svgElement.appendChild(alignmentLayer);
    svgElement.appendChild(labelLayer);

    backgroundLayer.appendChild(
        createSvgElement(
            "rect",
            {
                x: 0,
                y: 0,
                width: viewWidth,
                height: viewHeight,
                fill: "#ffffff"
            }
        )
    );

    backgroundLayer.appendChild(
        createSvgElement(
            "rect",
            {
                x: margin.left,
                y: margin.top,
                width: plotWidth,
                height: plotHeight,
                fill: "#f8fafc",
                stroke: "#cbd5e1",
                "stroke-width": 1
            }
        )
    );

    const horizontalStep = niceStep(sectionWidth / 10);
    const verticalRange = maxElevation - minElevation;
    const verticalStep = niceStep(verticalRange / 10);
    const horizontalDecimals = decimalsForStep(horizontalStep);
    const verticalDecimals = decimalsForStep(verticalStep);

    const firstOffset = Math.ceil(minOffset / horizontalStep) * horizontalStep;

    for (
        let offset = firstOffset;
        offset <= maxOffset + horizontalStep * 0.001;
        offset += horizontalStep
    ) {
        const x = toScreenX(offset);
        const isCenter = Math.abs(offset) < horizontalStep * 0.001;

        gridLayer.appendChild(
            createSvgElement(
                "line",
                {
                    x1: x,
                    y1: margin.top,
                    x2: x,
                    y2: margin.top + plotHeight,
                    stroke: isCenter ? "#64748b" : "#dbe4ee",
                    "stroke-width": isCenter ? 1.4 : 1,
                    "stroke-dasharray": isCenter ? "7 5" : "none"
                }
            )
        );

        appendText(
            labelLayer,
            x,
            margin.top + plotHeight + 28,
            offset.toFixed(horizontalDecimals),
            {
                anchor: "middle",
                fontSize: 12,
                fill: "#475569"
            }
        );
    }

    const firstElevation =
        Math.ceil(minElevation / verticalStep) * verticalStep;

    for (
        let elevation = firstElevation;
        elevation <= maxElevation + verticalStep * 0.001;
        elevation += verticalStep
    ) {
        const y = toScreenY(elevation);
        const isCenterElevation =
            Math.abs(elevation - centerElevation) < verticalStep * 0.001;

        gridLayer.appendChild(
            createSvgElement(
                "line",
                {
                    x1: margin.left,
                    y1: y,
                    x2: margin.left + plotWidth,
                    y2: y,
                    stroke: isCenterElevation ? "#94a3b8" : "#dbe4ee",
                    "stroke-width": isCenterElevation ? 1.3 : 1,
                    "stroke-dasharray": isCenterElevation ? "5 4" : "none"
                }
            )
        );

        appendText(
            labelLayer,
            margin.left - 14,
            y,
            elevation.toFixed(verticalDecimals),
            {
                anchor: "end",
                baseline: "middle",
                fontSize: 12,
                fill: "#475569"
            }
        );
    }

    axisLayer.appendChild(
        createSvgElement(
            "line",
            {
                x1: margin.left,
                y1: margin.top + plotHeight,
                x2: margin.left + plotWidth,
                y2: margin.top + plotHeight,
                stroke: "#334155",
                "stroke-width": 2
            }
        )
    );

    axisLayer.appendChild(
        createSvgElement(
            "line",
            {
                x1: margin.left,
                y1: margin.top,
                x2: margin.left,
                y2: margin.top + plotHeight,
                stroke: "#334155",
                "stroke-width": 2
            }
        )
    );

    const centerX = toScreenX(0);
    const centerY = toScreenY(centerElevation);

    alignmentLayer.appendChild(
        createSvgElement(
            "circle",
            {
                cx: centerX,
                cy: centerY,
                r: 8,
                fill: "#ffcc00",
                stroke: "#111827",
                "stroke-width": 3
            }
        )
    );

    alignmentLayer.appendChild(
        createSvgElement(
            "line",
            {
                x1: centerX - 18,
                y1: centerY,
                x2: centerX + 18,
                y2: centerY,
                stroke: "#111827",
                "stroke-width": 2
            }
        )
    );

    alignmentLayer.appendChild(
        createSvgElement(
            "line",
            {
                x1: centerX,
                y1: centerY - 18,
                x2: centerX,
                y2: centerY + 18,
                stroke: "#111827",
                "stroke-width": 2
            }
        )
    );

    appendText(
        labelLayer,
        margin.left,
        38,
        "Tverrprofil ved stasjon " + station.toFixed(3),
        {
            fontSize: 22,
            fontWeight: 600,
            fill: "#0f172a"
        }
    );

    appendText(
        labelLayer,
        margin.left,
        66,
        (data.alignmentName || "Profileringslinje") +
            "  |  Referansekote " +
            centerElevation.toFixed(3) +
            " m  |  Snittbredde " +
            sectionWidth.toFixed(1) +
            " m",
        {
            fontSize: 13,
            fill: "#475569"
        }
    );

    appendText(
        labelLayer,
        margin.left + plotWidth / 2,
        viewHeight - 28,
        "Offset fra referanselinje (m)",
        {
            anchor: "middle",
            fontSize: 14,
            fontWeight: 600,
            fill: "#334155"
        }
    );

    const elevationLabel = appendText(
        labelLayer,
        28,
        margin.top + plotHeight / 2,
        "Kote (m)",
        {
            anchor: "middle",
            fontSize: 14,
            fontWeight: 600,
            fill: "#334155"
        }
    );

    elevationLabel.setAttribute(
        "transform",
        "rotate(-90 28 " + (margin.top + plotHeight / 2) + ")"
    );

    appendText(
        labelLayer,
        centerX + 15,
        centerY - 18,
        "Referanselinje",
        {
            fontSize: 12,
            fontWeight: 600,
            fill: "#111827"
        }
    );

    appendText(
        labelLayer,
        margin.left + plotWidth,
        margin.top - 18,
        "SVG-skall v0.4.1 - modellgeometri kommer i neste trinn",
        {
            anchor: "end",
            fontSize: 12,
            fill: "#64748b"
        }
    );

    return {
        viewWidth: viewWidth,
        viewHeight: viewHeight,
        minOffset: minOffset,
        maxOffset: maxOffset,
        minElevation: minElevation,
        maxElevation: maxElevation,
        horizontalStep: horizontalStep,
        verticalStep: verticalStep
    };
}
