import { VERSION, BUILD_DATE, APP_NAME } from "./versions.js";
import { connectTC, getAPI, setStatus } from "./tc-api.js";
import {
    clearProfileSvg,
    renderProfileShell,
    renderGeometryDiagnostic
} from "./svg-renderer.js";

const state = {
    api: null,
    modelId: null,
    runtimeIds: [],
    selectedObject: null,
    alignmentPoints: [],
    alignmentLength: 0,
    station: 0,
    currentFrame: null,
    markerId: 930170,
    markerIcon: null,
    markerSequence: 0,
    sectionPlaneIds: [],
    geometryDiagnostic: null
};

const $ = id => document.getElementById(id);
const versionInfo = $("versionInfo");
const buildInfo = $("buildInfo");
const profileName = $("profileName");
const profileId = $("profileId");
const profileLength = $("profileLength");
const stationInput = $("stationInput");
const stationSlider = $("stationSlider");
const stationLabel = $("stationLabel");
const sectionWidthInput = $("sectionWidth");
const profileSvg = $("profileSvg");
const MARKER_ICON_URL = new URL("../assets/station-marker.png", import.meta.url).href;

window.addEventListener("error", event => {
    console.error("GLOBAL JAVASCRIPT-FEIL:", event.error || event.message);
    setStatus("JavaScript-feil - se Console");
});

window.addEventListener("unhandledrejection", event => {
    console.error("UHÅNDTERT PROMISE-FEIL:", event.reason);
    setStatus("Promise-feil - se Console");
});

function logResult(title, value) {
    console.log("===== " + title + " =====");
    console.dir(value);
    try {
        console.log(JSON.stringify(value, (key, item) =>
            typeof item === "bigint" ? item.toString() : item, 2));
    } catch (error) {
        console.warn("Kunne ikke serialisere " + title + ":", error);
    }
}

function showVersion() {
    if (versionInfo) versionInfo.innerText = "v" + VERSION;
    if (buildInfo) buildInfo.innerText = BUILD_DATE;
    console.log("APP:", APP_NAME);
    console.log("VERSION:", VERSION);
    console.log("BUILD:", BUILD_DATE);
}

async function initialize() {
    console.log("===== START =====");
    showVersion();
    try {
        state.api = await connectTC();
        if (!state.api) throw new Error("Ingen API mottatt");
        console.log("Trimble API:", state.api);
        console.log("API KEYS:", Object.keys(state.api));
        setStatus("Trimble API koblet");
    } catch (error) {
        console.error("INITIALISERINGSFEIL:", error);
        setStatus("Initialiseringsfeil");
    }
}

function normalizeVector(v) {
    const length = Math.hypot(v.x, v.y, v.z);
    return length > 0
        ? { x: v.x / length, y: v.y / length, z: v.z / length }
        : { x: 0, y: 0, z: 0 };
}

function getStationValue(object) {
    const sets = Array.isArray(object.properties) ? object.properties : [];
    for (const set of sets) {
        if (set.name !== "Pset_Stationing") continue;
        const properties = Array.isArray(set.properties) ? set.properties : [];
        const station = properties.find(property => property.name === "Station");
        const value = station ? Number(station.value) : NaN;
        if (Number.isFinite(value)) return value / 1000;
    }
    const fallback = Number(object.product?.name);
    return Number.isFinite(fallback) ? fallback : null;
}

function createAlignmentPoints(properties) {
    return (Array.isArray(properties) ? properties : [])
        .filter(object =>
            object?.class === "IFCREFERENT" &&
            object?.product?.objectType === "STATION" &&
            object.position)
        .map(object => ({
            id: Number(object.id),
            station: getStationValue(object),
            x: Number(object.position.x),
            y: Number(object.position.y),
            z: Number(object.position.z)
        }))
        .filter(point => Object.values(point).every(Number.isFinite))
        .sort((a, b) => a.station - b.station);
}

function findStationInterval(station) {
    const points = state.alignmentPoints;
    if (points.length < 2) return null;
    if (station <= points[0].station) return { start: points[0], end: points[1] };
    if (station >= points.at(-1).station) {
        return { start: points.at(-2), end: points.at(-1) };
    }
    for (let i = 0; i < points.length - 1; i += 1) {
        if (station >= points[i].station && station <= points[i + 1].station) {
            return { start: points[i], end: points[i + 1] };
        }
    }
    return null;
}

function evaluateStation(station) {
    const interval = findStationInterval(station);
    if (!interval) return null;
    const { start, end } = interval;
    const delta = end.station - start.station;
    const ratio = delta === 0 ? 0 : Math.max(0, Math.min(1, (station - start.station) / delta));
    const position = {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
        z: start.z + (end.z - start.z) * ratio
    };
    const tangent = normalizeVector({
        x: end.x - start.x,
        y: end.y - start.y,
        z: end.z - start.z
    });
    const horizontalTangent = normalizeVector({ x: tangent.x, y: tangent.y, z: 0 });
    return {
        station,
        position,
        tangent,
        horizontalTangent,
        horizontalNormal: {
            x: -horizontalTangent.y,
            y: horizontalTangent.x,
            z: 0
        },
        startReferent: start,
        endReferent: end,
        ratio
    };
}

async function removeStationMarker() {
    const api = getAPI();
    if (!state.markerIcon || typeof api?.viewer?.removeIcon !== "function") return;
    try { await api.viewer.removeIcon(state.markerIcon); }
    catch (error) { console.warn("Kunne ikke fjerne markør:", error); }
    state.markerIcon = null;
}

async function updateStationMarker(frame) {
    const api = getAPI();
    if (!frame || typeof api?.viewer?.addIcon !== "function") return;
    const sequence = ++state.markerSequence;
    const marker = {
        id: state.markerId,
        position: {
            x: frame.position.x,
            y: frame.position.y,
            z: frame.position.z + 0.2
        },
        iconPath: MARKER_ICON_URL,
        size: 30
    };
    try {
        if (state.markerIcon && typeof api.viewer.removeIcon === "function") {
            await api.viewer.removeIcon(state.markerIcon);
        }
        if (sequence !== state.markerSequence) return;
        await api.viewer.addIcon(marker);
        if (sequence === state.markerSequence) state.markerIcon = marker;
    } catch (error) {
        console.error("MARKØRFEIL:", error);
        setStatus("Markørfeil - se Console");
    }
}

function updateStation(value, shouldLog = true) {
    const minimum = Number(stationSlider?.min || 0);
    const maximum = Number(stationSlider?.max || 0);
    let station = Number(value);
    if (!Number.isFinite(station)) station = minimum;
    station = Math.max(minimum, Math.min(maximum, station));
    state.station = station;
    if (stationInput) stationInput.value = station.toFixed(3);
    if (stationSlider) stationSlider.value = String(station);
    if (stationLabel) stationLabel.innerText = station.toFixed(3);
    state.currentFrame = evaluateStation(station);
    updateStationMarker(state.currentFrame);
    if (shouldLog && state.currentFrame) console.log("Stasjon " + station.toFixed(3), state.currentFrame);
}

function configureStationControls() {
    if (state.alignmentPoints.length < 2) return;
    const first = state.alignmentPoints[0].station;
    const last = state.alignmentPoints.at(-1).station;
    state.alignmentLength = last - first;
    if (profileLength) profileLength.innerText = state.alignmentLength.toFixed(3) + " m";
    if (stationSlider) Object.assign(stationSlider, { min: first, max: last, step: 0.1 });
    if (stationInput) Object.assign(stationInput, { min: first, max: last, step: 0.1 });
    updateStation(first, false);
}

async function removeGeneratedSectionPlane() {
    const api = getAPI();
    if (state.sectionPlaneIds.length && typeof api?.viewer?.removeSectionPlanes === "function") {
        try { await api.viewer.removeSectionPlanes(state.sectionPlaneIds); }
        catch (error) { console.warn("Kunne ikke fjerne snittplan:", error); }
    }
    state.sectionPlaneIds = [];
}

function chunkArray(values, size) {
    const chunks = [];
    for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
    return chunks;
}

function groupByModel(values) {
    const groups = new Map();
    for (const value of values) {
        if (!groups.has(value.modelId)) groups.set(value.modelId, []);
        groups.get(value.modelId).push(value);
    }
    return groups;
}

function flattenModelObjects(modelObjects) {
    const result = [];
    for (const model of Array.isArray(modelObjects) ? modelObjects : []) {
        for (const object of Array.isArray(model.objects) ? model.objects : []) {
            const runtimeId = Number(object.id);
            if (model.modelId && Number.isFinite(runtimeId)) {
                result.push({ modelId: model.modelId, runtimeId });
            }
        }
    }
    return result;
}

function projectPoint(point, frame) {
    const dx = Number(point.x) - frame.position.x;
    const dy = Number(point.y) - frame.position.y;
    const dz = Number(point.z) - frame.position.z;
    return {
        offset: dx * frame.horizontalNormal.x + dy * frame.horizontalNormal.y,
        longitudinal: dx * frame.horizontalTangent.x + dy * frame.horizontalTangent.y,
        elevation: Number(point.z),
        relativeElevation: dz
    };
}

function boxCandidate(modelId, item, frame) {
    const box = item?.boundingBox;
    if (!box?.min || !box?.max) return null;
    const corners = [];
    for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z]) corners.push(projectPoint({ x, y, z }, frame));
    const range = key => ({
        min: Math.min(...corners.map(point => point[key])),
        max: Math.max(...corners.map(point => point[key]))
    });
    const o = range("offset");
    const l = range("longitudinal");
    const e = range("elevation");
    return {
        modelId,
        runtimeId: Number(item.id),
        boundingBox: box,
        minOffset: o.min,
        maxOffset: o.max,
        minLongitudinal: l.min,
        maxLongitudinal: l.max,
        minElevation: e.min,
        maxElevation: e.max,
        crossesSectionPlane: l.min <= 0 && l.max >= 0
    };
}

async function getBoundingBoxes(api, objects, frame, warnings) {
    if (typeof api.viewer.getObjectBoundingBoxes !== "function") {
        warnings.push("getObjectBoundingBoxes er ikke tilgjengelig.");
        return [];
    }
    const byModel = groupByModel(objects);
    const result = [];
    for (const [modelId, modelObjects] of byModel) {
        for (const batch of chunkArray(modelObjects.map(o => o.runtimeId), 300)) {
            try {
                const boxes = await api.viewer.getObjectBoundingBoxes(modelId, batch);
                for (const item of Array.isArray(boxes) ? boxes : []) {
                    const candidate = boxCandidate(modelId, item, frame);
                    if (candidate) result.push(candidate);
                }
            } catch (error) {
                warnings.push("Bounding boxes feilet for " + modelId + ": " + error.message);
            }
        }
    }
    return result;
}

async function getCandidateProperties(api, candidates) {
    const byModel = groupByModel(candidates.slice(0, 200));
    const result = [];
    for (const [modelId, items] of byModel) {
        for (const batch of chunkArray(items.map(o => o.runtimeId), 200)) {
            try {
                const properties = await api.viewer.getObjectProperties(modelId, batch);
                for (const object of Array.isArray(properties) ? properties : []) {
                    result.push({
                        modelId,
                        runtimeId: Number(object.id),
                        className: object.class || "",
                        name: object.product?.name || "",
                        objectType: object.product?.objectType || "",
                        propertySetNames: (object.properties || []).map(set => set.name)
                    });
                }
            } catch (error) {
                console.warn("Egenskapsdiagnose feilet:", error);
            }
        }
    }
    return result;
}

const GEOMETRY_FIELD_PATTERN = /(?:geometry|geometries|representation|representations|mesh|vertex|vertices|triangle|triangles|face|faces|index|indices|point|points|coordinate|coordinates|position|positions|transform|matrix|curve|surface|solid|shape|primitive|normal|normals|buffer|buffers)/i;

function valueType(value) {
    if (value === null) return "null";
    if (ArrayBuffer.isView(value)) return value.constructor.name;
    if (Array.isArray(value)) return "Array";
    return typeof value === "object"
        ? value.constructor?.name || "Object"
        : typeof value;
}

function compactValue(value) {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") {
        return value.length > 160 ? value.slice(0, 157) + "..." : value;
    }
    if (["number", "boolean"].includes(typeof value)) return value;
    if (ArrayBuffer.isView(value)) {
        return {
            type: value.constructor.name,
            length: value.length,
            sample: Array.from(value.slice(0, 16))
        };
    }
    if (Array.isArray(value)) {
        return {
            type: "Array",
            length: value.length,
            sample: value.slice(0, 8).map(item =>
                typeof item === "object" && item !== null
                    ? { type: valueType(item), keys: Object.keys(item).slice(0, 12) }
                    : item)
        };
    }
    if (typeof value === "object") {
        return {
            type: valueType(value),
            keys: Object.keys(value).slice(0, 30)
        };
    }
    return String(value);
}

function scanGeometryFields(root, options = {}) {
    const maxDepth = options.maxDepth ?? 10;
    const maxHits = options.maxHits ?? 300;
    const hits = [];
    const visited = new WeakSet();

    function visit(value, path, depth) {
        if (hits.length >= maxHits || depth > maxDepth || value === null || value === undefined) return;
        if (typeof value !== "object") return;
        if (visited.has(value)) return;
        visited.add(value);

        const entries = Array.isArray(value)
            ? value.slice(0, 250).map((item, index) => [String(index), item])
            : Object.entries(value);

        for (const [key, child] of entries) {
            if (hits.length >= maxHits) break;
            const childPath = Array.isArray(value)
                ? `${path}[${key}]`
                : path ? `${path}.${key}` : key;

            if (GEOMETRY_FIELD_PATTERN.test(key)) {
                hits.push({
                    path: childPath,
                    field: key,
                    type: valueType(child),
                    summary: compactValue(child)
                });
            }

            visit(child, childPath, depth + 1);
        }
    }

    visit(root, "response", 0);
    return hits;
}

function summarizeEntityResponse(response) {
    const models = Array.isArray(response) ? response : [];
    return models.map(model => {
        const entities = Array.isArray(model.entityForModel)
            ? model.entityForModel
            : [];
        const classes = {};
        for (const entity of entities) {
            const className = entity?.class || "Ukjent";
            classes[className] = (classes[className] || 0) + 1;
        }
        return {
            modelId: model.modelId || "",
            versionId: model.versionId || "",
            entityCount: entities.length,
            classCount: Object.keys(classes).length,
            classes
        };
    });
}

async function runGeometryDiagnostic(api, frame, sectionWidth) {
    const diagnostic = {
        station: frame.station,
        sectionWidth,
        longitudinalTolerance: 1,
        verticalBelow: 8,
        verticalAbove: 12,
        viewerMethods: Object.keys(api.viewer).filter(name =>
            /(bound|box|entit|geometr|mesh|object|position|section|triangle|vertex)/i.test(name)).sort(),
        totalObjects: 0,
        inspectedObjects: 0,
        boundingBoxes: 0,
        boundingBoxCandidateCount: 0,
        candidateCount: 0,
        candidates: [],
        candidateProperties: [],
        entityResponseSummary: [],
        geometryFieldHits: [],
        geometryFieldHitCount: 0,
        geometryFieldScanTruncated: false,
        getEntitiesDiagnostic: {
            available: typeof api.viewer.getEntities === "function",
            attempted: false,
            error: null
        },
        warnings: []
    };

    try {
        const modelObjects = await api.viewer.getObjects({});
        const allObjects = flattenModelObjects(modelObjects);
        diagnostic.totalObjects = allObjects.length;
        const inspected = allObjects.slice(0, 15000);
        diagnostic.inspectedObjects = inspected.length;
        if (allObjects.length > inspected.length) diagnostic.warnings.push("Begrenset til 15000 objekter.");

        const boxes = await getBoundingBoxes(api, inspected, frame, diagnostic.warnings);
        diagnostic.boundingBoxes = boxes.length;
        const halfWidth = sectionWidth / 2;
        const minElevation = frame.position.z - diagnostic.verticalBelow;
        const maxElevation = frame.position.z + diagnostic.verticalAbove;
        diagnostic.candidates = boxes.filter(box =>
            box.minLongitudinal <= diagnostic.longitudinalTolerance &&
            box.maxLongitudinal >= -diagnostic.longitudinalTolerance &&
            box.minOffset <= halfWidth &&
            box.maxOffset >= -halfWidth &&
            box.minElevation <= maxElevation &&
            box.maxElevation >= minElevation);
        diagnostic.boundingBoxCandidateCount = diagnostic.candidates.length;
        diagnostic.candidateCount = diagnostic.candidates.length;
        diagnostic.candidateProperties = await getCandidateProperties(api, diagnostic.candidates);

        if (diagnostic.getEntitiesDiagnostic.available) {
            diagnostic.getEntitiesDiagnostic.attempted = true;
            try {
                const entityResponse = await api.viewer.getEntities();
                diagnostic.entityResponseSummary = summarizeEntityResponse(entityResponse);
                diagnostic.geometryFieldHits = scanGeometryFields(entityResponse, {
                    maxDepth: 12,
                    maxHits: 300
                });
                diagnostic.geometryFieldHitCount = diagnostic.geometryFieldHits.length;
                diagnostic.geometryFieldScanTruncated = diagnostic.geometryFieldHits.length >= 300;
            } catch (error) {
                diagnostic.getEntitiesDiagnostic.error = error.message || String(error);
            }
        }
    } catch (error) {
        diagnostic.warnings.push(error.message || String(error));
    }
    return diagnostic;
}

async function generateProfile() {
    if (!state.selectedObject || !state.currentFrame) {
        alert("Velg en profileringslinje først.");
        return;
    }
    const api = getAPI();
    const frame = state.currentFrame;
    const tangent = frame.horizontalTangent;
    try {
        setStatus("Oppretter snittplan...");
        await removeGeneratedSectionPlane();
        const planes = await api.viewer.addSectionPlane({
            positionX: frame.position.x * 1000,
            positionY: frame.position.y * 1000,
            positionZ: frame.position.z * 1000,
            directionX: -tangent.x,
            directionY: -tangent.y,
            directionZ: 0,
            controlsVisible: true
        });
        state.sectionPlaneIds = (Array.isArray(planes) ? planes : [])
            .map(plane => Number(plane.id)).filter(Number.isFinite);

        const widthValue = Number(sectionWidthInput?.value);
        const sectionWidth = Number.isFinite(widthValue) && widthValue > 0 ? widthValue : 50;
        renderProfileShell(profileSvg, {
            station: frame.station,
            alignmentName: state.selectedObject.product?.name || "Profileringslinje",
            centerElevation: frame.position.z,
            sectionWidth,
            verticalBelow: 8,
            verticalAbove: 12,
            version: VERSION
        });

        setStatus("Kjører geometridiagnose...");
        state.geometryDiagnostic = await runGeometryDiagnostic(api, frame, sectionWidth);
        renderGeometryDiagnostic(profileSvg, state.geometryDiagnostic);
        logResult("GEOMETRIDIAGNOSE - OPPSUMMERING", {
            station: state.geometryDiagnostic.station,
            totalObjects: state.geometryDiagnostic.totalObjects,
            inspectedObjects: state.geometryDiagnostic.inspectedObjects,
            boundingBoxes: state.geometryDiagnostic.boundingBoxes,
            boundingBoxCandidates: state.geometryDiagnostic.boundingBoxCandidateCount,
            geometryFieldHits: state.geometryDiagnostic.geometryFieldHitCount,
            scanTruncated: state.geometryDiagnostic.geometryFieldScanTruncated,
            warnings: state.geometryDiagnostic.warnings
        });
        logResult("ENTITY-RESPONS - KOMPAKT", state.geometryDiagnostic.entityResponseSummary);
        logResult("GEOMETRI- OG REPRESENTASJONSFELTER", state.geometryDiagnostic.geometryFieldHits);
        console.table(state.geometryDiagnostic.geometryFieldHits.map(hit => ({
            path: hit.path,
            field: hit.field,
            type: hit.type,
            summary: JSON.stringify(hit.summary)
        })));
        console.table(state.geometryDiagnostic.candidateProperties.slice(0, 50));
        setStatus("Snitt ved stasjon " + frame.station.toFixed(3) + " - " +
            state.geometryDiagnostic.candidateCount + " bounding-box-kandidater");
    } catch (error) {
        console.error("FEIL VED GENERERING:", error);
        setStatus("Feil ved generering - se Console");
        alert(error.message || String(error));
    }
}

async function selectProfile() {
    const api = getAPI();
    try {
        setStatus("Leser valgt objekt...");
        await removeStationMarker();
        await removeGeneratedSectionPlane();
        clearProfileSvg(profileSvg);
        const selection = await api.viewer.getSelection();
        logResult("SELECTION", selection);
        if (!selection?.length) throw new Error("Ingen objekter er valgt.");
        if (selection.length > 1) throw new Error("Velg bare én profileringslinje.");
        const { modelId, objectRuntimeIds = [] } = selection[0];
        if (!modelId || !objectRuntimeIds.length) throw new Error("Seleksjonen mangler objekt-ID.");
        const properties = await api.viewer.getObjectProperties(modelId, objectRuntimeIds);
        const selected = properties?.[0];
        if (String(selected?.class || "").toUpperCase() !== "IFCALIGNMENT") {
            throw new Error("Valgt objekt er ikke IFCALIGNMENT.");
        }
        state.modelId = modelId;
        state.runtimeIds = [...objectRuntimeIds];
        state.selectedObject = selected;
        if (profileName) profileName.value = selected.product?.name || "Ukjent profil";
        if (profileId) profileId.innerText = String(objectRuntimeIds[0]);
        const children = await api.viewer.getHierarchyChildren(modelId, objectRuntimeIds, undefined, true);
        const ids = (children || []).map(item => Number(item.id)).filter(Number.isFinite);
        const hierarchyProperties = await api.viewer.getObjectProperties(modelId, ids);
        state.alignmentPoints = createAlignmentPoints(hierarchyProperties);
        logResult("STASJONSREFERENTER", state.alignmentPoints);
        if (state.alignmentPoints.length < 2) throw new Error("Fant ikke nok stasjonsreferenter.");
        configureStationControls();
        setStatus("Profil valgt - " + state.alignmentPoints.length +
            " stasjonsreferenter, lengde " + state.alignmentLength.toFixed(3) + " m");
    } catch (error) {
        console.error("FEIL VED PROFILVALG:", error);
        setStatus("Feil ved profilvalg");
        alert(error.message || String(error));
    }
}

function bindEvents() {
    $("btnSelectProfile")?.addEventListener("click", selectProfile);
    $("btnGenerate")?.addEventListener("click", generateProfile);
    $("btnExportSvg")?.addEventListener("click", () => setStatus("SVG-eksport kommer senere"));
    $("btnExportPng")?.addEventListener("click", () => setStatus("PNG-eksport kommer senere"));
    $("minus10")?.addEventListener("click", () => updateStation(state.station - 10));
    $("minus1")?.addEventListener("click", () => updateStation(state.station - 1));
    $("plus1")?.addEventListener("click", () => updateStation(state.station + 1));
    $("plus10")?.addEventListener("click", () => updateStation(state.station + 10));
    stationSlider?.addEventListener("input", event => updateStation(event.target.value));
    stationInput?.addEventListener("change", event => updateStation(event.target.value));
    console.log("Events registrert");
}

window.addEventListener("beforeunload", () => {
    removeStationMarker();
    removeGeneratedSectionPlane();
});

showVersion();
bindEvents();
initialize();
