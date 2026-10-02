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


// =======================================================
// TILSTAND
// =======================================================

const appState = {
    api: null,
    modelId: null,
    runtimeIds: [],
    selectedObject: null,
    objectPosition: null,
    externalObjectIds: [],
    station: 0
};


// =======================================================
// DOM-ELEMENTER
// =======================================================

const versionInfo =
    document.getElementById("versionInfo");

const buildInfo =
    document.getElementById("buildInfo");

const profileName =
    document.getElementById("profileName");

const profileId =
    document.getElementById("profileId");

const profileLength =
    document.getElementById("profileLength");

const stationInput =
    document.getElementById("stationInput");

const stationSlider =
    document.getElementById("stationSlider");

const stationLabel =
    document.getElementById("stationLabel");

const btnSelectProfile =
    document.getElementById("btnSelectProfile");

const btnGenerate =
    document.getElementById("btnGenerate");

const btnExportSvg =
    document.getElementById("btnExportSvg");

const btnExportPng =
    document.getElementById("btnExportPng");

const btnMinus10 =
    document.getElementById("minus10");

const btnMinus1 =
    document.getElementById("minus1");

const btnPlus1 =
    document.getElementById("plus1");

const btnPlus10 =
    document.getElementById("plus10");


// =======================================================
// FEILHÅNDTERING
// =======================================================

window.addEventListener("error", function (event) {

    console.error(
        "GLOBAL JAVASCRIPT-FEIL:",
        event.error || event.message
    );

    setStatus(
        "JavaScript-feil – se Console"
    );
});


window.addEventListener(
    "unhandledrejection",
    function (event) {

        console.error(
            "UHÅNDTERT PROMISE-FEIL:",
            event.reason
        );

        setStatus(
            "Promise-feil – se Console"
        );
    }
);


// =======================================================
// LOGGING
// =======================================================

function logSection(title) {

    console.log(
        "===== " + title + " ====="
    );
}


function makeJsonSafe(value) {

    return JSON.stringify(
        value,
        function (key, item) {

            if (typeof item === "bigint") {
                return item.toString();
            }

            return item;
        },
        2
    );
}


function logResult(title, value) {

    logSection(title);

    console.dir(value);

    try {

        console.log(
            makeJsonSafe(value)
        );
    }
    catch (error) {

        console.warn(
            title +
            " kunne ikke konverteres til JSON:",
            error
        );
    }
}


async function runTest(title, callback) {

    try {

        const result =
            await callback();

        logResult(
            title,
            result
        );

        return result;
    }
    catch (error) {

        console.warn(
            title + " FEILET:",
            error
        );

        return null;
    }
}


// =======================================================
// VERSJONSVISNING
// =======================================================

function initializeVersionInfo() {

    if (versionInfo) {

        versionInfo.innerText =
            "v" + VERSION;
    }

    if (buildInfo) {

        buildInfo.innerText =
            BUILD_DATE;
    }

    console.log(
        "APP:",
        APP_NAME
    );

    console.log(
        "VERSION:",
        VERSION
    );

    console.log(
        "BUILD:",
        BUILD_DATE
    );
}


// =======================================================
// INITIALISERING
// =======================================================

async function initialize() {

    logSection(
        "START"
    );

    /*
        Denne kjøres før Trimble-tilkoblingen.

        Dermed skal versjonen vises selv om
        Workspace API-tilkoblingen feiler.
    */

    initializeVersionInfo();

    try {

        appState.api =
            await connectTC();

        console.log(
            "Trimble API:",
            appState.api
        );

        if (!appState.api) {

            setStatus(
                "Ingen Trimble API-forbindelse"
            );

            return;
        }

        console.log(
            "API KEYS:",
            Object.keys(appState.api)
        );

        setStatus(
            "Trimble API koblet"
        );
    }
    catch (error) {

        console.error(
            "INITIALISERINGSFEIL:",
            error
        );

        setStatus(
            "Initialiseringsfeil"
        );
    }

    logSection(
        "INITIALISERING FERDIG"
    );
}


// =======================================================
// OPPDATER VALGT PROFIL I UI
// =======================================================

function updateProfileUi(
    selectedObject,
    runtimeId
) {

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
                selectedObject &&
                selectedObject.class
                    ? selectedObject.class
                    : "Ukjent objekttype"
            );

    if (profileName) {

        profileName.value =
            objectName;
    }

    if (profileId) {

        profileId.innerText =
            String(runtimeId);
    }

    const profileType =
        document.getElementById(
            "profileType"
        );

    if (profileType) {

        profileType.innerText =
            objectType;

        if (profileLength) {

            profileLength.innerText =
                "Ikke beregnet";
        }
    }
    else if (profileLength) {

        /*
            Dagens HTML har ikke eget Type-felt.

            Derfor vises objekttypen midlertidig
            i feltet som er merket Lengde.
        */

        profileLength.innerText =
            objectType;
    }

    console.log(
        "Valgt alignment:",
        objectName
    );

    console.log(
        "IFC-klasse:",
        selectedObject.class
    );

    console.log(
        "Objekttype:",
        objectType
    );

    console.log(
        "RuntimeId:",
        runtimeId
    );
}


// =======================================================
// TEST AV EKSTERN OBJEKT-ID
// =======================================================

async function testExternalObjectIds(
    api,
    modelId,
    runtimeIds
) {

    if (
        !api.viewer ||
        typeof api.viewer.convertToObjectIds !==
            "function"
    ) {

        console.warn(
            "convertToObjectIds er ikke tilgjengelig."
        );

        return null;
    }

    const result =
        await runTest(
            "EKSTERNE OBJEKT-ID-ER",
            function () {

                return api.viewer
                    .convertToObjectIds(
                        modelId,
                        runtimeIds
                    );
            }
        );

    if (Array.isArray(result)) {

        appState.externalObjectIds =
            result;
    }

    return result;
}


// =======================================================
// TEST AV OBJEKTPOSISJON
// =======================================================

async function testObjectPositions(
    api,
    modelId,
    runtimeIds
) {

    if (
        !api.viewer ||
        typeof api.viewer.getObjectPositions !==
            "function"
    ) {

        console.warn(
            "getObjectPositions er ikke tilgjengelig."
        );

        return null;
    }

    const result =
        await runTest(
            "OBJEKTPOSISJONER",
            function () {

                return api.viewer
                    .getObjectPositions(
                        modelId,
                        runtimeIds
                    );
            }
        );

    if (
        Array.isArray(result) &&
        result.length > 0 &&
        result[0].position
    ) {

        appState.objectPosition = {
            id: result[0].id,
            x: result[0].position.x,
            y: result[0].position.y,
            z: result[0].position.z
        };

        console.log(
            "Objektanker:",
            appState.objectPosition
        );
    }

    return result;
}


// =======================================================
// TEST AV GETOBJECTS
// =======================================================

async function testObjects(
    api,
    modelId,
    runtimeIds
) {

    if (
        !api.viewer ||
        typeof api.viewer.getObjects !==
            "function"
    ) {

        console.warn(
            "getObjects er ikke tilgjengelig."
        );

        return null;
    }

    /*
        ObjectSelector inneholder en liste med
        ModelObjectIds.

        ModelObjectIds inneholder modelId,
        objectRuntimeIds og recursive.
    */

    const selector = {

        modelObjectIds: [
            {
                modelId: modelId,
                objectRuntimeIds: runtimeIds,
                recursive: true
            }
        ]
    };

    console.log(
        "getObjects selector:",
        selector
    );

    return await runTest(
        "GETOBJECTS",
        function () {

            return api.viewer
                .getObjects(
                    selector
                );
        }
    );
}


// =======================================================
// TEST AV DIREKTE HIERARKIBARN
// =======================================================

async function testDirectChildren(
    api,
    modelId,
    runtimeIds
) {

    if (
        !api.viewer ||
        typeof api.viewer
            .getHierarchyChildren !==
            "function"
    ) {

        console.warn(
            "getHierarchyChildren er ikke tilgjengelig."
        );

        return null;
    }

    return await runTest(
        "DIREKTE HIERARKIBARN",
        function () {

            return api.viewer
                .getHierarchyChildren(
                    modelId,
                    runtimeIds
                );
        }
    );
}


// =======================================================
// TEST AV REKURSIVE HIERARKIBARN
// =======================================================

async function testRecursiveChildren(
    api,
    modelId,
    runtimeIds
) {

    if (
        !api.viewer ||
        typeof api.viewer
            .getHierarchyChildren !==
            "function"
    ) {

        return null;
    }

    /*
        undefined:
        bruk standard hierarkitype.

        true:
        hent hele undertreet rekursivt.
    */

    return await runTest(
        "REKURSIVE HIERARKIBARN",
        function () {

            return api.viewer
                .getHierarchyChildren(
                    modelId,
                    runtimeIds,
                    undefined,
                    true
                );
        }
    );
}


// =======================================================
// TEST AV HIERARKIFORELDRE
// =======================================================

async function testHierarchyParents(
    api,
    modelId,
    runtimeIds
) {

    if (
        !api.viewer ||
        typeof api.viewer
            .getHierarchyParents !==
            "function"
    ) {

        console.warn(
            "getHierarchyParents er ikke tilgjengelig."
        );

        return null;
    }

    return await runTest(
        "HIERARKIFORELDRE",
        function () {

            return api.viewer
                .getHierarchyParents(
                    modelId,
                    runtimeIds,
                    undefined,
                    true,
                    false
                );
        }
    );
}


// =======================================================
// OPPSUMMERING AV HIERARKI
// =======================================================

function summarizeHierarchy(
    directChildren,
    recursiveChildren,
    parents
) {

    logSection(
        "HIERARKIOPPSUMMERING"
    );

    console.log(
        "Direkte barn:",
        Array.isArray(directChildren)
            ? directChildren.length
            : "Ingen resultat"
    );

    console.log(
        "Rekursive barn:",
        Array.isArray(recursiveChildren)
            ? recursiveChildren.length
            : "Ingen resultat"
    );

    console.log(
        "Foreldre:",
        Array.isArray(parents)
            ? parents.length
            : "Ingen resultat"
    );

    const allChildren = [];

    if (Array.isArray(directChildren)) {

        allChildren.push.apply(
            allChildren,
            directChildren
        );
    }

    if (Array.isArray(recursiveChildren)) {

        allChildren.push.apply(
            allChildren,
            recursiveChildren
        );
    }

    const relevantWords = [
        "IFCALIGNMENT",
        "ALIGNMENT",
        "HORIZONTAL",
        "VERTICAL",
        "SEGMENT",
        "CURVE"
    ];

    const possibleSegments =
        allChildren.filter(
            function (item) {

                let text = "";

                try {

                    text =
                        makeJsonSafe(item)
                            .toUpperCase();
                }
                catch (error) {

                    text =
                        String(item)
                            .toUpperCase();
                }

                return relevantWords.some(
                    function (word) {

                        return text.includes(
                            word
                        );
                    }
                );
            }
        );

    logResult(
        "MULIGE ALIGNMENTSEGMENTER",
        possibleSegments
    );

    return possibleSegments;
}


async function inspectAlignmentHierarchy(
    api,
    modelId,
    recursiveChildren
) {
    const hierarchyIds = recursiveChildren
        .map(item => Number(item.id))
        .filter(id => Number.isFinite(id));

    if (hierarchyIds.length === 0) {
        console.warn(
            "Fant ingen RuntimeId-er i alignmenthierarkiet."
        );

        return null;
    }

    console.log(
        "Hierarki-ID-er som undersøkes:",
        hierarchyIds
    );

    const childProperties =
        await api.viewer.getObjectProperties(
            modelId,
            hierarchyIds
        );

    logResult(
        "EGENSKAPER FOR HELE ALIGNMENTHIERARKIET",
        childProperties
    );

    const childPositions =
        await api.viewer.getObjectPositions(
            modelId,
            hierarchyIds
        );

    logResult(
        "POSISJONER FOR HELE ALIGNMENTHIERARKIET",
        childPositions
    );

    const summary =
        childProperties.map(object => ({
            id: object.id,
            class: object.class || "",
            name:
                object.product?.name || "",
            objectType:
                object.product?.objectType || "",
            position:
                object.position || null,
            propertySetCount:
                Array.isArray(object.properties)
                    ? object.properties.length
                    : 0
        }));

    console.table(summary);

    return {
        ids: hierarchyIds,
        properties: childProperties,
        positions: childPositions,
        summary: summary
    };
}


// =======================================================
// VELG PROFILERINGSLINJE
// =======================================================

async function selectProfile() {

    try {

        const api =
            getAPI();

        if (
            !api ||
            !api.viewer
        ) {

            setStatus(
                "Viewer API er ikke tilgjengelig"
            );

            alert(
                "Viewer API er ikke tilgjengelig."
            );

            return;
        }

        setStatus(
            "Leser valgt objekt..."
        );

        const selection =
            await api.viewer
                .getSelection();

        logResult(
            "SELECTION",
            selection
        );

        if (
            !selection ||
            selection.length === 0
        ) {

            alert(
                "Ingen objekter er valgt i modellen."
            );

            setStatus(
                "Ingen objekter valgt"
            );

            return;
        }

        if (selection.length > 1) {

            alert(
                "Velg bare én profileringslinje."
            );

            setStatus(
                "Flere objekter valgt"
            );

            return;
        }

        const modelId =
            selection[0].modelId;

        const runtimeIds =
            selection[0]
                .objectRuntimeIds || [];

        if (
            !modelId ||
            runtimeIds.length === 0
        ) {

            throw new Error(
                "Seleksjonen inneholder ikke " +
                "modelId og objectRuntimeIds."
            );
        }

        appState.modelId =
            modelId;

        appState.runtimeIds =
            runtimeIds.slice();

        console.log(
            "MODEL ID:",
            modelId
        );

        console.log(
            "RUNTIME IDS:",
            runtimeIds
        );

        const properties =
            await api.viewer
                .getObjectProperties(
                    modelId,
                    runtimeIds
                );

        logResult(
            "OBJECT PROPERTIES",
            properties
        );

        if (
            !properties ||
            properties.length === 0
        ) {

            alert(
                "Fant ingen egenskaper for objektet."
            );

            setStatus(
                "Ingen objektegenskaper"
            );

            return;
        }

        const selectedObject =
            properties[0];

        appState.selectedObject =
            selectedObject;

        updateProfileUi(
            selectedObject,
            runtimeIds[0]
        );

        const ifcClass =
            String(
                selectedObject.class || ""
            ).toUpperCase();

        if (
            ifcClass &&
            ifcClass !== "IFCALIGNMENT"
        ) {

            console.warn(
                "Valgt objekt er ikke IFCALIGNMENT:",
                ifcClass
            );

            setStatus(
                "Valgt objekt er " +
                ifcClass
            );
        }
        else {

            setStatus(
                "IfcAlignment valgt – tester hierarki"
            );
        }

        /*
            Testene kjøres sekvensielt.

            En feil i én test blir håndtert av
            runTest og stopper ikke neste test.
        */

        await testExternalObjectIds(
            api,
            modelId,
            runtimeIds
        );

        await testObjectPositions(
            api,
            modelId,
            runtimeIds
        );

        await testObjects(
            api,
            modelId,
            runtimeIds
        );

        const directChildren =
            await testDirectChildren(
                api,
                modelId,
                runtimeIds
            );

        const recursiveChildren =
            await testRecursiveChildren(
                api,
                modelId,
                runtimeIds
            );

        const hierarchyInspection =
            await inspectAlignmentHierarchy(
                api,
                modelId,
                recursiveChildren
            );

        const parents =
            await testHierarchyParents(
                api,
                modelId,
                runtimeIds
            );

        const possibleSegments =
            summarizeHierarchy(
                directChildren,
                recursiveChildren,
                parents
            );

        if (
            possibleSegments.length > 0
        ) {

            setStatus(
                "Profil valgt – fant " +
                possibleSegments.length +
                " mulige segmenter"
            );
        }
        else {

            setStatus(
                "Profil valgt – ingen segmenter " +
                "funnet i standardhierarkiet"
            );
        }

        logSection(
            "PROFILTEST FERDIG"
        );
    }
    catch (error) {

        console.error(
            "FEIL VED PROFILVALG:",
            error
        );

        setStatus(
            "Feil ved lesing av profil"
        );

        alert(
            error &&
            error.message
                ? error.message
                : String(error)
        );
    }
}


// =======================================================
// STASJONERING
// =======================================================

function updateStation(value) {

    let station =
        Number(value);

    if (!Number.isFinite(station)) {

        station = 0;
    }

    let maximum =
        0;

    if (stationSlider) {

        maximum =
            Number(
                stationSlider.max
            );
    }

    if (!Number.isFinite(maximum)) {

        maximum = 0;
    }

    station =
        Math.max(
            0,
            Math.min(
                station,
                maximum
            )
        );

    appState.station =
        station;

    if (stationInput) {

        stationInput.value =
            String(station);
    }

    if (stationSlider) {

        stationSlider.value =
            String(station);
    }

    if (stationLabel) {

        stationLabel.innerText =
            station.toFixed(3);
    }
}


function moveStation(offset) {

    updateStation(
        appState.station +
        offset
    );
}


// =======================================================
// GENERERING OG EKSPORT
// =======================================================

function generateProfile() {

    if (!appState.selectedObject) {

        alert(
            "Velg en profileringslinje først."
        );

        return;
    }

    console.log(
        "Generer profil ved stasjon:",
        appState.station
    );

    setStatus(
        "Tverrprofilmotor er ikke implementert ennå"
    );
}


function exportSvg() {

    setStatus(
        "SVG-eksport er ikke implementert ennå"
    );
}


function exportPng() {

    setStatus(
        "PNG-eksport er ikke implementert ennå"
    );
}


// =======================================================
// EVENTS
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
                    event.target.value
                );
            }
        );
    }

    if (stationInput) {

        stationInput.addEventListener(
            "change",
            function (event) {

                updateStation(
                    event.target.value
                );
            }
        );
    }

    console.log(
        "Events registrert"
    );
}


// =======================================================
// START
// =======================================================

initializeVersionInfo();

bindEvents();

initialize();