import {
    VERSION,
    BUILD_DATE,
    APP_NAME
} from "./versions.js";

import {
    connectTC,
    getAPI,
    setStatus
} from "./tc-api.js";

import {
    clearProfileSvg,
    renderProfileShell
} from "./svg-renderer.js";

// =======================================================
// PROGRAMTILSTAND
// =======================================================

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
    sectionPlane: null
};

// =======================================================
// DOM
// =======================================================

const versionInfo = document.getElementById("versionInfo");
const buildInfo = document.getElementById("buildInfo");
const profileName = document.getElementById("profileName");
const profileId = document.getElementById("profileId");
const profileLength = document.getElementById("profileLength");
const stationInput = document.getElementById("stationInput");
const stationSlider = document.getElementById("stationSlider");
const stationLabel = document.getElementById("stationLabel");
const btnSelectProfile = document.getElementById("btnSelectProfile");
const btnGenerate = document.getElementById("btnGenerate");
const btnExportSvg = document.getElementById("btnExportSvg");
const btnExportPng = document.getElementById("btnExportPng");
const btnMinus10 = document.getElementById("minus10");
const btnMinus1 = document.getElementById("minus1");
const btnPlus1 = document.getElementById("plus1");
const btnPlus10 = document.getElementById("plus10");
const profileSvg = document.getElementById("profileSvg");
const sectionWidthInput = document.getElementById("sectionWidth");

const MARKER_ICON_URL = new URL(
    "../assets/station-marker.png",
    import.meta.url
).href;

// =======================================================
// FEILHÅNDTERING OG LOGGING
// =======================================================

window.addEventListener("error", function (event) {
    console.error(
        "GLOBAL JAVASCRIPT-FEIL:",
        event.error || event.message
    );

    setStatus("JavaScript-feil - se Console");
});

window.addEventListener("unhandledrejection", function (event) {
    console.error(
        "UHÅNDTERT PROMISE-FEIL:",
        event.reason
    );

    setStatus("Promise-feil - se Console");
});

function logSection(title) {
    console.log("===== " + title + " =====");
}

function jsonSafe(value) {
    return JSON.stringify(
        value,
        function (key, item) {
            return typeof item === "bigint"
                ? item.toString()
                : item;
        },
        2
    );
}

function logResult(title, value) {
    logSection(title);
    console.dir(value);

    try {
        console.log(jsonSafe(value));
    }
    catch (error) {
        console.warn(
            title + " kunne ikke serialiseres:",
            error
        );
    }
}

// =======================================================
// INITIALISERING
// =======================================================

function showVersion() {
    if (versionInfo) {
        versionInfo.innerText = "v" + VERSION;
    }

    if (buildInfo) {
        buildInfo.innerText = BUILD_DATE;
    }

    console.log("APP:", APP_NAME);
    console.log("VERSION:", VERSION);
    console.log("BUILD:", BUILD_DATE);
}

async function initialize() {
    logSection("START");
    showVersion();

    try {
        state.api = await connectTC();

        if (!state.api) {
            setStatus("Ingen Trimble API-forbindelse");
            return;
        }

        console.log("Trimble API:", state.api);
        console.log("API KEYS:", Object.keys(state.api));
        setStatus("Trimble API koblet");
    }
    catch (error) {
        console.error("INITIALISERINGSFEIL:", error);
        setStatus("Initialiseringsfeil");
    }

    logSection("INITIALISERING FERDIG");
}

// =======================================================
// ALIGNMENT OG STASJONSREFERENTER
// =======================================================

function getStationValue(object) {
    if (!object || object.class !== "IFCREFERENT") {
        return null;
    }

    const propertySets = Array.isArray(object.properties)
        ? object.properties
        : [];

    for (let i = 0; i < propertySets.length; i += 1) {
        const propertySet = propertySets[i];

        if (
            !propertySet ||
            propertySet.name !== "Pset_Stationing"
        ) {
            continue;
        }

        const properties = Array.isArray(propertySet.properties)
            ? propertySet.properties
            : [];

        for (let j = 0; j < properties.length; j += 1) {
            const property = properties[j];

            if (property && property.name === "Station") {
                const rawValue = Number(property.value);

                if (Number.isFinite(rawValue)) {
                    // Novapoint leverer verdien i mm i modellen som testes.
                    return rawValue / 1000;
                }
            }
        }
    }

    const fallback = Number(
        object.product && object.product.name
            ? object.product.name
            : NaN
    );

    return Number.isFinite(fallback)
        ? fallback
        : null;
}

function createAlignmentPoints(properties) {
    if (!Array.isArray(properties)) {
        return [];
    }

    return properties
        .filter(function (object) {
            return (
                object &&
                object.class === "IFCREFERENT" &&
                object.product &&
                object.product.objectType === "STATION" &&
                object.position
            );
        })
        .map(function (object) {
            return {
                id: Number(object.id),
                station: getStationValue(object),
                x: Number(object.position.x),
                y: Number(object.position.y),
                z: Number(object.position.z)
            };
        })
        .filter(function (point) {
            return (
                Number.isFinite(point.id) &&
                Number.isFinite(point.station) &&
                Number.isFinite(point.x) &&
                Number.isFinite(point.y) &&
                Number.isFinite(point.z)
            );
        })
        .sort(function (a, b) {
            return a.station - b.station;
        });
}

function normalizeVector(vector) {
    const length = Math.sqrt(
        vector.x * vector.x +
        vector.y * vector.y +
        vector.z * vector.z
    );

    if (!Number.isFinite(length) || length === 0) {
        return { x: 0, y: 0, z: 0 };
    }

    return {
        x: vector.x / length,
        y: vector.y / length,
        z: vector.z / length
    };
}

function findStationInterval(station) {
    const points = state.alignmentPoints;

    if (!Array.isArray(points) || points.length < 2) {
        return null;
    }

    if (station <= points[0].station) {
        return {
            start: points[0],
            end: points[1]
        };
    }

    const lastIndex = points.length - 1;

    if (station >= points[lastIndex].station) {
        return {
            start: points[lastIndex - 1],
            end: points[lastIndex]
        };
    }

    for (let i = 0; i < lastIndex; i += 1) {
        if (
            station >= points[i].station &&
            station <= points[i + 1].station
        ) {
            return {
                start: points[i],
                end: points[i + 1]
            };
        }
    }

    return null;
}

function evaluateStation(station) {
    const interval = findStationInterval(station);

    if (!interval) {
        return null;
    }

    const start = interval.start;
    const end = interval.end;
    const deltaStation = end.station - start.station;

    const rawRatio = deltaStation === 0
        ? 0
        : (station - start.station) / deltaStation;

    const ratio = Math.max(0, Math.min(1, rawRatio));

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

    const horizontalTangent = normalizeVector({
        x: tangent.x,
        y: tangent.y,
        z: 0
    });

    return {
        station: station,
        position: position,
        tangent: tangent,
        horizontalTangent: horizontalTangent,
        horizontalNormal: {
            x: -horizontalTangent.y,
            y: horizontalTangent.x,
            z: 0
        },
        startReferent: start,
        endReferent: end,
        ratio: ratio
    };
}

function configureStationControls() {
    const points = state.alignmentPoints;

    if (!Array.isArray(points) || points.length < 2) {
        state.alignmentLength = 0;

        if (profileLength) {
            profileLength.innerText = "Ikke beregnet";
        }

        return;
    }

    const firstStation = points[0].station;
    const lastStation = points[points.length - 1].station;

    state.alignmentLength = lastStation - firstStation;

    if (profileLength) {
        profileLength.innerText =
            state.alignmentLength.toFixed(3) + " m";
    }

    if (stationSlider) {
        stationSlider.min = String(firstStation);
        stationSlider.max = String(lastStation);
        stationSlider.step = "0.1";
    }

    if (stationInput) {
        stationInput.min = String(firstStation);
        stationInput.max = String(lastStation);
        stationInput.step = "0.1";
    }

    updateStation(firstStation, false);
}

// =======================================================
// SYNLIG STASJONSMARKØR
// =======================================================

async function removeStationMarker() {
    const api = getAPI();

    if (
        !api ||
        !api.viewer ||
        typeof api.viewer.removeIcon !== "function" ||
        !state.markerIcon
    ) {
        return;
    }

    try {
        await api.viewer.removeIcon(state.markerIcon);
    }
    catch (error) {
        console.warn(
            "Kunne ikke fjerne gammel stasjonsmarkør:",
            error
        );
    }
    finally {
        state.markerIcon = null;
    }
}

async function updateStationMarker(frame) {
    const api = getAPI();

    if (
        !frame ||
        !api ||
        !api.viewer ||
        typeof api.viewer.addIcon !== "function"
    ) {
        return;
    }

    const sequence = state.markerSequence + 1;
    state.markerSequence = sequence;

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
        if (
            typeof api.viewer.removeIcon === "function" &&
            state.markerIcon
        ) {
            await api.viewer.removeIcon(state.markerIcon);
        }

        if (sequence !== state.markerSequence) {
            return;
        }

        await api.viewer.addIcon(marker);

        if (sequence === state.markerSequence) {
            state.markerIcon = marker;
        }
    }
    catch (error) {
        console.error(
            "FEIL VED OPPDATERING AV STASJONSMARKØR:",
            error
        );

        setStatus("Markørfeil - se Console");
    }
}

function updateStation(value, shouldLog) {
    let station = Number(value);

    if (!Number.isFinite(station)) {
        station = 0;
    }

    const minimum = stationSlider
        ? Number(stationSlider.min || 0)
        : 0;

    const maximum = stationSlider
        ? Number(stationSlider.max || 0)
        : 0;

    station = Math.max(
        Number.isFinite(minimum) ? minimum : 0,
        Math.min(
            station,
            Number.isFinite(maximum) ? maximum : 0
        )
    );

    state.station = station;

    if (stationInput) {
        stationInput.value = station.toFixed(3);
    }

    if (stationSlider) {
        stationSlider.value = String(station);
    }

    if (stationLabel) {
        stationLabel.innerText = station.toFixed(3);
    }

    state.currentFrame = evaluateStation(station);
    updateStationMarker(state.currentFrame);

    if (shouldLog !== false && state.currentFrame) {
        console.log(
            "Stasjon " + station.toFixed(3),
            state.currentFrame
        );
    }
}

function moveStation(offset) {
    updateStation(state.station + offset, true);
}

// =======================================================
// SYNLIG SNITTPLAN
// =======================================================

async function removeGeneratedSectionPlane() {
    const api = getAPI();

    if (
        !api ||
        !api.viewer ||
        typeof api.viewer.removeSectionPlanes !== "function"
    ) {
        state.sectionPlaneIds = [];
        state.sectionPlane = null;
        return;
    }

    if (state.sectionPlaneIds.length === 0) {
        state.sectionPlane = null;
        return;
    }

    try {
        await api.viewer.removeSectionPlanes(
            state.sectionPlaneIds
        );
    }
    catch (error) {
        console.warn(
            "Kunne ikke fjerne tidligere snittplan:",
            error
        );
    }
    finally {
        state.sectionPlaneIds = [];
        state.sectionPlane = null;
    }
}

async function generateProfile() {
    if (!state.selectedObject) {
        alert("Velg en profileringslinje først.");
        return;
    }

    if (!state.currentFrame) {
        alert("Fant ingen stasjonsramme.");
        return;
    }

    const api = getAPI();

    if (
        !api ||
        !api.viewer ||
        typeof api.viewer.addSectionPlane !== "function"
    ) {
        alert("Viewer API støtter ikke addSectionPlane.");
        setStatus("Snittplan er ikke tilgjengelig");
        return;
    }

    const frame = state.currentFrame;
    const tangent = frame.horizontalTangent;

    if (
        !tangent ||
        !Number.isFinite(tangent.x) ||
        !Number.isFinite(tangent.y) ||
        (
            Math.abs(tangent.x) < 1e-9 &&
            Math.abs(tangent.y) < 1e-9
        )
    ) {
        alert("Kunne ikke beregne retning for snittplanet.");
        setStatus("Ugyldig retning for snittplan");
        return;
    }

    setStatus("Oppretter snittplan...");

    try {
        await removeGeneratedSectionPlane();

        const requestedPlane = {
            positionX: frame.position.x * 1000,
            positionY: frame.position.y * 1000,
            positionZ: frame.position.z * 1000,
            directionX: -tangent.x,
            directionY: -tangent.y,
            directionZ: 0,
            controlsVisible: true
        };

        const addedPlanes =
            await api.viewer.addSectionPlane(requestedPlane);

        const returnedPlanes = Array.isArray(addedPlanes)
            ? addedPlanes
            : [];

        state.sectionPlane = returnedPlanes.length > 0
            ? returnedPlanes[0]
            : requestedPlane;

        state.sectionPlaneIds = returnedPlanes
            .map(function (plane) {
                return Number(plane.id);
            })
            .filter(function (id) {
                return Number.isFinite(id);
            });

        logResult(
            "OPPRETTET SNITTPLAN",
            {
                station: frame.station,
                frame: frame,
                requestedPlane: requestedPlane,
                returnedPlanes: returnedPlanes,
                sectionPlaneIds: state.sectionPlaneIds
            }
        );

        const sectionWidth = sectionWidthInput
            ? Number(sectionWidthInput.value)
            : 50;

        const svgShell = renderProfileShell(
            profileSvg,
            {
                station: frame.station,
                alignmentName:
                    state.selectedObject &&
                    state.selectedObject.product
                        ? state.selectedObject.product.name
                        : "Profileringslinje",
                centerElevation: frame.position.z,
                sectionWidth:
                    Number.isFinite(sectionWidth) &&
                    sectionWidth > 0
                        ? sectionWidth
                        : 50,
                verticalBelow: 8,
                verticalAbove: 12
            }
        );

        logResult(
            "SVG-SKALL",
            svgShell
        );

        setStatus(
            "Snittplan og SVG-skall opprettet ved stasjon " +
            frame.station.toFixed(3)
        );
    }
    catch (error) {
        console.error(
            "FEIL VED OPPRETTELSE AV SNITTPLAN:",
            error
        );

        setStatus("Feil ved opprettelse av snittplan");

        alert(
            error && error.message
                ? error.message
                : String(error)
        );
    }
}

// =======================================================
// VALG AV PROFILERINGSLINJE
// =======================================================

function updateProfileUi(object, runtimeId) {
    const name =
        object && object.product && object.product.name
            ? object.product.name
            : "Ukjent profil";

    if (profileName) {
        profileName.value = name;
    }

    if (profileId) {
        profileId.innerText = String(runtimeId);
    }
}

async function selectProfile() {
    try {
        const api = getAPI();

        if (!api || !api.viewer) {
            alert("Viewer API er ikke tilgjengelig.");
            return;
        }

        setStatus("Leser valgt objekt...");

        await removeStationMarker();
        await removeGeneratedSectionPlane();
        clearProfileSvg(profileSvg);

        const selection = await api.viewer.getSelection();
        logResult("SELECTION", selection);

        if (!selection || selection.length === 0) {
            alert("Ingen objekter er valgt i modellen.");
            setStatus("Ingen objekter valgt");
            return;
        }

        if (selection.length > 1) {
            alert("Velg bare én profileringslinje.");
            setStatus("Flere objekter valgt");
            return;
        }

        const modelId = selection[0].modelId;
        const runtimeIds =
            selection[0].objectRuntimeIds || [];

        if (!modelId || runtimeIds.length === 0) {
            throw new Error(
                "Seleksjonen mangler modelId eller objectRuntimeIds."
            );
        }

        const selectedProperties =
            await api.viewer.getObjectProperties(
                modelId,
                runtimeIds
            );

        logResult("OBJECT PROPERTIES", selectedProperties);

        if (
            !selectedProperties ||
            selectedProperties.length === 0
        ) {
            throw new Error(
                "Fant ingen egenskaper for valgt objekt."
            );
        }

        const selectedObject = selectedProperties[0];
        const ifcClass = String(
            selectedObject.class || ""
        ).toUpperCase();

        if (ifcClass !== "IFCALIGNMENT") {
            alert("Valgt objekt er ikke IFCALIGNMENT.");
            setStatus("Valgt objekt er " + ifcClass);
            return;
        }

        state.modelId = modelId;
        state.runtimeIds = runtimeIds.slice();
        state.selectedObject = selectedObject;

        updateProfileUi(selectedObject, runtimeIds[0]);

        const recursiveChildren =
            await api.viewer.getHierarchyChildren(
                modelId,
                runtimeIds,
                undefined,
                true
            );

        logResult(
            "REKURSIVE HIERARKIBARN",
            recursiveChildren
        );

        const hierarchyIds = Array.isArray(recursiveChildren)
            ? recursiveChildren
                .map(function (item) {
                    return Number(item.id);
                })
                .filter(function (id) {
                    return Number.isFinite(id);
                })
            : [];

        if (hierarchyIds.length === 0) {
            throw new Error(
                "Fant ingen objekter i alignmenthierarkiet."
            );
        }

        const hierarchyProperties =
            await api.viewer.getObjectProperties(
                modelId,
                hierarchyIds
            );

        logResult(
            "EGENSKAPER FOR ALIGNMENTHIERARKIET",
            hierarchyProperties
        );

        state.alignmentPoints = createAlignmentPoints(
            hierarchyProperties
        );

        logResult(
            "STASJONSREFERENTER",
            state.alignmentPoints
        );

        configureStationControls();

        if (state.alignmentPoints.length < 2) {
            setStatus(
                "Profil valgt - fant ikke nok stasjonsreferenter"
            );
            return;
        }

        setStatus(
            "Profil valgt - " +
            state.alignmentPoints.length +
            " stasjonsreferenter, lengde " +
            state.alignmentLength.toFixed(3) +
            " m"
        );
    }
    catch (error) {
        console.error("FEIL VED PROFILVALG:", error);
        setStatus("Feil ved lesing av profil");

        alert(
            error && error.message
                ? error.message
                : String(error)
        );
    }
}

// =======================================================
// EKSPORT, FORELØPIG IKKE IMPLEMENTERT
// =======================================================

function exportSvg() {
    setStatus("SVG-eksport er ikke implementert ennå");
}

function exportPng() {
    setStatus("PNG-eksport er ikke implementert ennå");
}

// =======================================================
// HENDELSER
// =======================================================

function bindEvents() {
    if (btnSelectProfile) {
        btnSelectProfile.addEventListener(
            "click",
            selectProfile
        );
    }

    if (btnGenerate) {
        btnGenerate.addEventListener(
            "click",
            generateProfile
        );
    }

    if (btnExportSvg) {
        btnExportSvg.addEventListener(
            "click",
            exportSvg
        );
    }

    if (btnExportPng) {
        btnExportPng.addEventListener(
            "click",
            exportPng
        );
    }

    if (btnMinus10) {
        btnMinus10.addEventListener(
            "click",
            function () {
                moveStation(-10);
            }
        );
    }

    if (btnMinus1) {
        btnMinus1.addEventListener(
            "click",
            function () {
                moveStation(-1);
            }
        );
    }

    if (btnPlus1) {
        btnPlus1.addEventListener(
            "click",
            function () {
                moveStation(1);
            }
        );
    }

    if (btnPlus10) {
        btnPlus10.addEventListener(
            "click",
            function () {
                moveStation(10);
            }
        );
    }

    if (stationSlider) {
        stationSlider.addEventListener(
            "input",
            function (event) {
                updateStation(
                    event.target.value,
                    true
                );
            }
        );
    }

    if (stationInput) {
        stationInput.addEventListener(
            "change",
            function (event) {
                updateStation(
                    event.target.value,
                    true
                );
            }
        );
    }

    console.log("Events registrert");
}

window.addEventListener("beforeunload", function () {
    removeStationMarker();
    removeGeneratedSectionPlane();
});

showVersion();
bindEvents();
initialize();
