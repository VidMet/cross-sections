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

const appState = {
    api: null,
    modelId: null,
    runtimeIds: [],
    selectedObject: null,
    hierarchyProperties: [],
    alignmentPoints: [],
    alignmentLength: 0,
    station: 0,
    currentFrame: null,
    markerId: 930170,
    markerIcon: null,
    markerUpdateSequence: 0
};

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

const MARKER_ICON_URL = new URL(
    "../assets/station-marker.svg",
    import.meta.url
).href;


window.addEventListener("error", function (event) {
    console.error("GLOBAL JAVASCRIPT-FEIL:", event.error || event.message);
    setStatus("JavaScript-feil - se Console");
});

window.addEventListener("unhandledrejection", function (event) {
    console.error("UHANDTERT PROMISE-FEIL:", event.reason);
    setStatus("Promise-feil - se Console");
});

function logSection(title) {
    console.log("===== " + title + " =====");
}

function makeJsonSafe(value) {
    return JSON.stringify(
        value,
        function (key, item) {
            return typeof item === "bigint" ? item.toString() : item;
        },
        2
    );
}

function logResult(title, value) {
    logSection(title);
    console.dir(value);

    try {
        console.log(makeJsonSafe(value));
    }
    catch (error) {
        console.warn(title + " kunne ikke konverteres til JSON:", error);
    }
}

async function runTest(title, callback) {
    try {
        const result = await callback();
        logResult(title, result);
        return result;
    }
    catch (error) {
        console.warn(title + " FEILET:", error);
        return null;
    }
}

function initializeVersionInfo() {
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
    initializeVersionInfo();

    try {
        appState.api = await connectTC();
        console.log("Trimble API:", appState.api);

        if (!appState.api) {
            setStatus("Ingen Trimble API-forbindelse");
            return;
        }

        console.log("API KEYS:", Object.keys(appState.api));
        setStatus("Trimble API koblet");
    }
    catch (error) {
        console.error("INITIALISERINGSFEIL:", error);
        setStatus("Initialiseringsfeil");
    }

    logSection("INITIALISERING FERDIG");
}

function updateProfileUi(selectedObject, runtimeId) {
    const objectName =
        selectedObject &&
        selectedObject.product &&
        selectedObject.product.name
            ? selectedObject.product.name
            : "Ukjent profil";

    const objectType =
        selectedObject &&
        selectedObject.product &&
        selectedObject.product.objectType
            ? selectedObject.product.objectType
            : (
                selectedObject && selectedObject.class
                    ? selectedObject.class
                    : "Ukjent objekttype"
            );

    if (profileName) {
        profileName.value = objectName;
    }

    if (profileId) {
        profileId.innerText = String(runtimeId);
    }

    const profileType = document.getElementById("profileType");

    if (profileType) {
        profileType.innerText = objectType;
    }

    console.log("Valgt alignment:", objectName);
    console.log("IFC-klasse:", selectedObject.class);
    console.log("Objekttype:", objectType);
    console.log("RuntimeId:", runtimeId);
}

function getStationValue(object) {
    if (!object || object.class !== "IFCREFERENT") {
        return null;
    }

    const propertySets = Array.isArray(object.properties)
        ? object.properties
        : [];

    for (let i = 0; i < propertySets.length; i += 1) {
        const propertySet = propertySets[i];

        if (!propertySet || propertySet.name !== "Pset_Stationing") {
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
                    return rawValue / 1000;
                }
            }
        }
    }

    const nameValue = Number(
        object.product && object.product.name
            ? object.product.name
            : NaN
    );

    return Number.isFinite(nameValue)
        ? nameValue
        : null;
}

function createAlignmentPoints(hierarchyProperties) {
    if (!Array.isArray(hierarchyProperties)) {
        return [];
    }

    return hierarchyProperties
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

function configureStationControls(points) {
    if (!Array.isArray(points) || points.length < 2) {
        appState.alignmentLength = 0;

        if (profileLength) {
            profileLength.innerText = "Ikke beregnet";
        }

        return;
    }

    const firstStation = points[0].station;
    const lastStation = points[points.length - 1].station;
    const alignmentLength = lastStation - firstStation;

    appState.alignmentLength = alignmentLength;

    if (profileLength) {
        profileLength.innerText = alignmentLength.toFixed(3) + " m";
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

    console.log("Startstasjon:", firstStation);
    console.log("Sluttstasjon:", lastStation);
    console.log("Alignmentlengde:", alignmentLength);
}

function findStationInterval(station) {
    const points = appState.alignmentPoints;

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

function normalizeVector(vector) {
    const length = Math.sqrt(
        vector.x * vector.x +
        vector.y * vector.y +
        vector.z * vector.z
    );

    if (!Number.isFinite(length) || length === 0) {
        return {
            x: 0,
            y: 0,
            z: 0
        };
    }

    return {
        x: vector.x / length,
        y: vector.y / length,
        z: vector.z / length
    };
}

function evaluateStation(station) {
    const interval = findStationInterval(station);

    if (!interval) {
        return null;
    }

    const start = interval.start;
    const end = interval.end;
    const deltaStation = end.station - start.station;

    const ratio = deltaStation === 0
        ? 0
        : (station - start.station) / deltaStation;

    const clampedRatio = Math.max(0, Math.min(1, ratio));

    const position = {
        x: start.x + (end.x - start.x) * clampedRatio,
        y: start.y + (end.y - start.y) * clampedRatio,
        z: start.z + (end.z - start.z) * clampedRatio
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

    const horizontalNormal = {
        x: -horizontalTangent.y,
        y: horizontalTangent.x,
        z: 0
    };

    return {
        station: station,
        position: position,
        tangent: tangent,
        horizontalTangent: horizontalTangent,
        horizontalNormal: horizontalNormal,
        startReferent: start,
        endReferent: end,
        ratio: clampedRatio
    };
}

async function removeStationMarker() {
    const api = getAPI();

    if (
        !api ||
        !api.viewer ||
        typeof api.viewer.removeIcon !== "function" ||
        !appState.markerIcon
    ) {
        return;
    }

    try {
        await api.viewer.removeIcon(appState.markerIcon);
    }
    catch (error) {
        console.warn("Kunne ikke fjerne gammel stasjonsmarkor:", error);
    }
    finally {
        appState.markerIcon = null;
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

    const updateSequence = appState.markerUpdateSequence + 1;
    appState.markerUpdateSequence = updateSequence;

    const marker = {
        id: appState.markerId,
        position: {
            x: frame.position.x,
            y: frame.position.y,
            z: frame.position.z + 1.5
        },
        iconPath: MARKER_ICON_URL,
        size: 48
    };

    try {
        if (
            typeof api.viewer.removeIcon === "function" &&
            appState.markerIcon
        ) {
            await api.viewer.removeIcon(appState.markerIcon);
        }

        if (updateSequence !== appState.markerUpdateSequence) {
            return;
        }

        await api.viewer.addIcon(marker);

        if (updateSequence === appState.markerUpdateSequence) {
            appState.markerIcon = marker;
        }
    }
    catch (error) {
        console.error("FEIL VED OPPDATERING AV STASJONSMARKOR:", error);
        setStatus("Markorfeil - se Console");
    }
}

function scheduleStationMarkerUpdate(frame) {
    if (!frame) {
        return;
    }

    updateStationMarker(frame);
}

function logCurrentFrame(frame) {
    if (!frame) {
        return;
    }

    console.log(
        "Stasjon " + frame.station.toFixed(3),
        {
            position: frame.position,
            tangent: frame.tangent,
            horizontalNormal: frame.horizontalNormal,
            interval: [
                frame.startReferent.station,
                frame.endReferent.station
            ],
            ratio: frame.ratio
        }
    );
}

function updateStation(value, shouldLog) {
    let station = Number(value);

    if (!Number.isFinite(station)) {
        station = 0;
    }

    let minimum = 0;
    let maximum = 0;

    if (stationSlider) {
        minimum = Number(stationSlider.min || 0);
        maximum = Number(stationSlider.max || 0);
    }

    if (!Number.isFinite(minimum)) {
        minimum = 0;
    }

    if (!Number.isFinite(maximum)) {
        maximum = minimum;
    }

    station = Math.max(minimum, Math.min(station, maximum));
    appState.station = station;

    if (stationInput) {
        stationInput.value = station.toFixed(3);
    }

    if (stationSlider) {
        stationSlider.value = String(station);
    }

    if (stationLabel) {
        stationLabel.innerText = station.toFixed(3);
    }

    appState.currentFrame = evaluateStation(station);

    scheduleStationMarkerUpdate(appState.currentFrame);

    if (shouldLog !== false) {
        logCurrentFrame(appState.currentFrame);
    }

    return appState.currentFrame;
}

function moveStation(offset) {
    updateStation(appState.station + offset, true);
}

async function inspectAlignmentHierarchy(api, modelId, recursiveChildren) {
    if (!Array.isArray(recursiveChildren)) {
        return null;
    }

    const hierarchyIds = recursiveChildren
        .map(function (item) {
            return Number(item.id);
        })
        .filter(function (id) {
            return Number.isFinite(id);
        });

    if (hierarchyIds.length === 0) {
        console.warn("Fant ingen RuntimeId-er i alignmenthierarkiet.");
        return null;
    }

    console.log("Hierarki-ID-er som undersokes:", hierarchyIds);

    const childProperties = await api.viewer.getObjectProperties(
        modelId,
        hierarchyIds
    );

    logResult(
        "EGENSKAPER FOR HELE ALIGNMENTHIERARKIET",
        childProperties
    );

    appState.hierarchyProperties = Array.isArray(childProperties)
        ? childProperties
        : [];

    appState.alignmentPoints = createAlignmentPoints(
        appState.hierarchyProperties
    );

    logResult(
        "STASJONSREFERENTER",
        appState.alignmentPoints
    );

    configureStationControls(appState.alignmentPoints);

    return {
        ids: hierarchyIds,
        properties: appState.hierarchyProperties,
        alignmentPoints: appState.alignmentPoints
    };
}

async function testExternalObjectIds(api, modelId, runtimeIds) {
    if (
        !api.viewer ||
        typeof api.viewer.convertToObjectIds !== "function"
    ) {
        return null;
    }

    return runTest(
        "EKSTERNE OBJEKT-ID-ER",
        function () {
            return api.viewer.convertToObjectIds(
                modelId,
                runtimeIds
            );
        }
    );
}

async function testObjectPositions(api, modelId, runtimeIds) {
    if (
        !api.viewer ||
        typeof api.viewer.getObjectPositions !== "function"
    ) {
        return null;
    }

    return runTest(
        "OBJEKTPOSISJONER",
        function () {
            return api.viewer.getObjectPositions(
                modelId,
                runtimeIds
            );
        }
    );
}

async function testObjects(api, modelId, runtimeIds) {
    if (
        !api.viewer ||
        typeof api.viewer.getObjects !== "function"
    ) {
        return null;
    }

    const selector = {
        modelObjectIds: [
            {
                modelId: modelId,
                objectRuntimeIds: runtimeIds,
                recursive: true
            }
        ]
    };

    return runTest(
        "GETOBJECTS",
        function () {
            return api.viewer.getObjects(selector);
        }
    );
}

async function testHierarchyChildren(api, modelId, runtimeIds, recursive) {
    if (
        !api.viewer ||
        typeof api.viewer.getHierarchyChildren !== "function"
    ) {
        return null;
    }

    return runTest(
        recursive
            ? "REKURSIVE HIERARKIBARN"
            : "DIREKTE HIERARKIBARN",
        function () {
            return api.viewer.getHierarchyChildren(
                modelId,
                runtimeIds,
                undefined,
                recursive
            );
        }
    );
}

async function testHierarchyParents(api, modelId, runtimeIds) {
    if (
        !api.viewer ||
        typeof api.viewer.getHierarchyParents !== "function"
    ) {
        return null;
    }

    return runTest(
        "HIERARKIFORELDRE",
        function () {
            return api.viewer.getHierarchyParents(
                modelId,
                runtimeIds,
                undefined,
                true,
                false
            );
        }
    );
}

async function selectProfile() {
    try {
        const api = getAPI();

        if (!api || !api.viewer) {
            setStatus("Viewer API er ikke tilgjengelig");
            alert("Viewer API er ikke tilgjengelig.");
            return;
        }

        setStatus("Leser valgt objekt...");

        await removeStationMarker();

        const selection = await api.viewer.getSelection();
        logResult("SELECTION", selection);

        if (!selection || selection.length === 0) {
            alert("Ingen objekter er valgt i modellen.");
            setStatus("Ingen objekter valgt");
            return;
        }

        if (selection.length > 1) {
            alert("Velg bare en profileringslinje.");
            setStatus("Flere objekter valgt");
            return;
        }

        const modelId = selection[0].modelId;
        const runtimeIds = selection[0].objectRuntimeIds || [];

        if (!modelId || runtimeIds.length === 0) {
            throw new Error(
                "Seleksjonen inneholder ikke modelId og objectRuntimeIds."
            );
        }

        appState.modelId = modelId;
        appState.runtimeIds = runtimeIds.slice();

        const properties = await api.viewer.getObjectProperties(
            modelId,
            runtimeIds
        );

        logResult("OBJECT PROPERTIES", properties);

        if (!properties || properties.length === 0) {
            alert("Fant ingen egenskaper for objektet.");
            setStatus("Ingen objektegenskaper");
            return;
        }

        const selectedObject = properties[0];
        appState.selectedObject = selectedObject;

        updateProfileUi(selectedObject, runtimeIds[0]);

        const ifcClass = String(selectedObject.class || "").toUpperCase();

        if (ifcClass !== "IFCALIGNMENT") {
            setStatus("Valgt objekt er " + ifcClass);
            alert("Valgt objekt er ikke IFCALIGNMENT.");
            return;
        }

        setStatus("IfcAlignment valgt - leser stasjonsreferenter");

        await testExternalObjectIds(api, modelId, runtimeIds);
        await testObjectPositions(api, modelId, runtimeIds);
        await testObjects(api, modelId, runtimeIds);

        await testHierarchyChildren(
            api,
            modelId,
            runtimeIds,
            false
        );

        const recursiveChildren = await testHierarchyChildren(
            api,
            modelId,
            runtimeIds,
            true
        );

        await testHierarchyParents(api, modelId, runtimeIds);

        const inspection = await inspectAlignmentHierarchy(
            api,
            modelId,
            recursiveChildren
        );

        if (
            inspection &&
            inspection.alignmentPoints &&
            inspection.alignmentPoints.length >= 2
        ) {
            setStatus(
                "Profil valgt - " +
                inspection.alignmentPoints.length +
                " stasjonsreferenter, lengde " +
                appState.alignmentLength.toFixed(3) +
                " m"
            );
        }
        else {
            setStatus(
                "Profil valgt - fant ikke nok stasjonsreferenter"
            );
        }

        logSection("PROFILTEST FERDIG");
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

function generateProfile() {
    if (!appState.selectedObject) {
        alert("Velg en profileringslinje forst.");
        return;
    }

    if (!appState.currentFrame) {
        alert("Fant ingen stasjonsramme.");
        return;
    }

    logResult(
        "AKTIV STASJONSRAMME",
        appState.currentFrame
    );

    setStatus(
        "Stasjon " +
        appState.currentFrame.station.toFixed(3) +
        " beregnet - tverrprofilmotor er neste steg"
    );
}

function exportSvg() {
    setStatus("SVG-eksport er ikke implementert enna");
}

function exportPng() {
    setStatus("PNG-eksport er ikke implementert enna");
}

function bindEvents() {
    if (btnSelectProfile) {
        btnSelectProfile.addEventListener("click", selectProfile);
    }

    if (btnGenerate) {
        btnGenerate.addEventListener("click", generateProfile);
    }

    if (btnExportSvg) {
        btnExportSvg.addEventListener("click", exportSvg);
    }

    if (btnExportPng) {
        btnExportPng.addEventListener("click", exportPng);
    }

    if (btnMinus10) {
        btnMinus10.addEventListener("click", function () {
            moveStation(-10);
        });
    }

    if (btnMinus1) {
        btnMinus1.addEventListener("click", function () {
            moveStation(-1);
        });
    }

    if (btnPlus1) {
        btnPlus1.addEventListener("click", function () {
            moveStation(1);
        });
    }

    if (btnPlus10) {
        btnPlus10.addEventListener("click", function () {
            moveStation(10);
        });
    }

    if (stationSlider) {
        stationSlider.addEventListener("input", function (event) {
            updateStation(event.target.value, true);
        });
    }

    if (stationInput) {
        stationInput.addEventListener("change", function (event) {
            updateStation(event.target.value, true);
        });
    }

    console.log("Events registrert");
}

window.addEventListener("beforeunload", function () {
    removeStationMarker();
});

initializeVersionInfo();
bindEvents();
initialize();
