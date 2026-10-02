import {
    VERSION,
    BUILD_DATE,
    APP_NAME
}
from "./versions.js";

import {
    connectTC,
    getAPI,
    setStatus
}
from "./tc-api.js";


// =======================================================
// APPLIKASJONSTILSTAND
// =======================================================

const appState = {

    api: null,

    modelId: null,

    runtimeIds: [],

    externalIds: [],

    selectedObject: null,

    objectPosition: null,

    hierarchyChildren: [],

    hierarchyParents: [],

    hierarchyTree: [],

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
// GLOBAL FEILHÅNDTERING
// =======================================================

window.addEventListener(
    "error",
    event => {

        console.error(
            "GLOBAL JAVASCRIPT-FEIL:",
            event.error || event.message
        );

        setStatus(
            "JavaScript-feil – se Console"
        );
    }
);

window.addEventListener(
    "unhandledrejection",
    event => {

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
// HJELPEFUNKSJONER
// =======================================================

function printSection(title) {

    console.log(
        `===== ${title} =====`
    );
}


function safeJson(value) {

    return JSON.stringify(
        value,
        (key, item) => {

            if (typeof item === "bigint") {

                return item.toString();
            }

            return item;
        },
        2
    );
}


function printResult(title, value) {

    printSection(title);

    console.dir(value);

    try {

        console.log(
            safeJson(value)
        );
    }
    catch (error) {

        console.warn(
            `${title} kunne ikke serialiseres:`,
            error
        );
    }
}


async function runApiTest(
    title,
    callback
) {

    try {

        const result =
            await callback();

        printResult(
            title,
            result
        );

        return result;
    }
    catch (error) {

        console.warn(
            `${title} FEILET:`,
            error
        );

        return null;
    }
}


function getFirstObject(
    value
) {

    if (
        Array.isArray(value) &&
        value.length > 0
    ) {

        return value[0];
    }

    return null;
}


// =======================================================
// VERSJON
// =======================================================

function initializeVersionInfo() {

    if (versionInfo) {

        versionInfo.innerText =
            `v${VERSION}`;
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

    printSection(
        "START"
    );

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
            "API-nøkler:",
            Object.keys(appState.api)
        );

        console.log(
            "Viewer-metoder:",
            Object.keys(
                appState.api.viewer || {}
            )
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

    printSection(
        "INITIALISERING FERDIG"
    );
}


// =======================================================
// UI FOR VALGT PROFIL
// =======================================================

function updateProfileUi(
    objectData,
    runtimeId
) {

    const name =
        objectData?.product?.name ||
        objectData?.name ||
        "Ukjent profil";

    const objectType =
        objectData?.product?.objectType ||
        objectData?.class ||
        "Ukjent objekttype";

    if (profileName) {

        profileName.value =
            name;
    }

    if (profileId) {

        profileId.innerText =
            runtimeId;
    }

    /*
        HTML-en har foreløpig bare feltene
        ID og Lengde.

        Inntil profileType legges til i HTML,
        brukes profileLength til å vise type.
    */

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

        profileLength.innerText =
            objectType;
    }

    console.log(
        "Valgt alignment:",
        name
    );

    console.log(
        "IFC-klasse:",
        objectData?.class
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
// TEST: EKSTERN OBJEKT-ID
// =======================================================

async function testExternalObjectIds(
    api,
    modelId,
    runtimeIds
) {

    if (
        typeof api.viewer
            .convertToObjectIds !== "function"
    ) {

        console.warn(
            "convertToObjectIds finnes ikke."
        );

        return null;
    }

    const result =
        await runApiTest(
            "EKSTERNE OBJEKT-ID-ER",
            () =>
                api.viewer
                    .convertToObjectIds(
                        modelId,
                        runtimeIds
                    )
        );

    if (Array.isArray(result)) {

        appState.externalIds =
            result;
    }

    return result;
}


// =======================================================
// TEST: OBJEKTPOSISJON
// =======================================================

async function testObjectPositions(
    api,
    modelId,
    runtimeIds
) {

    if (
        typeof api.viewer
            .getObjectPositions !== "function"
    ) {

        console.warn(
            "getObjectPositions finnes ikke."
        );

        return null;
    }

    const result =
        await runApiTest(
            "OBJEKTPOSISJONER",
            () =>
                api.viewer
                    .getObjectPositions(
                        modelId,
                        runtimeIds
                    )
        );

    const first =
        getFirstObject(result);

    if (first?.position) {

        appState.objectPosition = {

            id:
                first.id,

            x:
                first.position.x,

            y:
                first.position.y,

            z:
                first.position.z
        };

        console.log(
            "Alignmentens objektanker:",
            appState.objectPosition
        );
    }

    return result;
}


// =======================================================
// TEST: GET OBJECTS
// =======================================================

async function testObjects(
    api,
    modelId,
    runtimeIds
) {

    if (
        typeof api.viewer
            .getObjects !== "function"
    ) {

        console.warn(
            "getObjects finnes ikke."
        );

        return null;
    }

    /*
        Vi avgrenser søket til valgt modell og
        valgte RuntimeId-er.

        recursive = true gjør det mulig å se om
        Trimble returnerer relaterte underobjekter.
    */

    const selector = {

        modelObjectIds: [
            {
                modelId:
                    modelId,

                objectRuntimeIds:
                    runtimeIds,

                recursive:
                    true
            }
        ]
    };

    console.log(
        "getObjects selector:",
        selector
    );

    return await runApiTest(
        "GET OBJECTS – VALGT OBJEKT",
        () =>
            api.viewer.getObjects(
                selector
            )
    );
}


// =======================================================
// TEST: DIREKTE HIERARKIBARN
// =======================================================

async function testDirectChildren(
    api,
    modelId,
    runtimeIds
) {

    if (
        typeof api.viewer
            .getHierarchyChildren !==
        "function"
    ) {

        console.warn(
            "getHierarchyChildren finnes ikke."
        );

        return null;
    }

    const result =
        await runApiTest(
            "DIREKTE HIERARKIBARN",
            () =>
                api.viewer
                    .getHierarchyChildren(
                        modelId,
                        runtimeIds
                    )
        );

    if (Array.isArray(result)) {

        appState.hierarchyChildren =
            result;
    }

    return result;
}


// =======================================================
// TEST: REKURSIVT HIERARKI
// =======================================================

async function testRecursiveChildren(
    api,
    modelId,
    runtimeIds
) {

    if (
        typeof api.viewer
            .getHierarchyChildren !==
        "function"
    ) {

        return null;
    }

    /*
        Tredje parameter er hierarchyType.

        undefined gjør at Workspace API bruker
        standard hierarkitype.

        Fjerde parameter true betyr rekursivt.
    */

    const result =
        await runApiTest(
            "REKURSIVT HIERARKI",
            () =>
                api.viewer
                    .getHierarchyChildren(
                        modelId,
                        runtimeIds,
                        undefined,
                        true
                    )
        );

    if (Array.isArray(result)) {

        appState.hierarchyTree =
            result;
    }

    return result;
}


// =======================================================
// TEST: HIERARKIFORELDRE
// =======================================================

async function testHierarchyParents(
    api,
    modelId,
    runtimeIds
) {

    if (
        typeof api.viewer
            .getHierarchyParents !==
        "function"
    ) {

        console.warn(
            "getHierarchyParents finnes ikke."
        );

        return null;
    }

    const result =
        await runApiTest(
            "HIERARKIFORELDRE",
            () =>
                api.viewer
                    .getHierarchyParents(
                        modelId,
                        runtimeIds,
                        undefined,
                        true,
                        false
                    )
        );

    if (Array.isArray(result)) {

        appState.hierarchyParents =
            result;
    }

    return result;
}


// =======================================================
// TEST: GET ENTITIES
// =======================================================

async function testEntities(
    api,
    modelId,
    runtimeIds
) {

    if (
        typeof api.viewer
            .getEntities !== "function"
    ) {

        console.log(
            "getEntities er ikke tilgjengelig " +
            "i denne ViewerAPI-versjonen."
        );

        return null;
    }

    /*
        Metoden finnes i API-instansen hos deg,
        men parameterformatet må verifiseres.

        Første forsøk bruker modell-ID og
        RuntimeId-er.
    */

    return await runApiTest(
        "GET ENTITIES",
        () =>
            api.viewer.getEntities(
                modelId,
                runtimeIds
            )
    );
}


// =======================================================
// ANALYSE AV HIERARKIRESULTATER
// =======================================================

function summarizeHierarchy(
    directChildren,
    recursiveChildren,
    parents
) {

    printSection(
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

    const combined = [

        ...(Array.isArray(directChildren)
            ? directChildren
            : []),

        ...(Array.isArray(recursiveChildren)
            ? recursiveChildren
            : [])
    ];

    const interestingTerms = [

        "IFCALIGNMENT",

        "ALIGNMENT",

        "HORIZONTAL",

        "VERTICAL",

        "SEGMENT",

        "CURVE"
    ];

    const possibleSegments =
        combined.filter(item => {

            let text = "";

            try {

                text =
                    safeJson(item)
                        .toUpperCase();
            }
            catch {

                text =
                    String(item)
                        .toUpperCase();
            }

            return interestingTerms.some(
                term =>
                    text.includes(term)
            );
        });

    printResult(
        "MULIGE ALIGNMENTSEGMENTER",
        possibleSegments
    );

    return possibleSegments;
}


// =======================================================
// VELG PROFILERINGSLINJE
// =======================================================

async function selectProfile() {

    try {

        const api =
            getAPI();

        if (!api?.viewer) {

            setStatus(
                "Viewer API er ikke tilgjengelig"
            );

            return;
        }

        setStatus(
            "Leser valgt objekt..."
        );

        const selection =
            await api.viewer
                .getSelection();

        printResult(
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
                "Seleksjonen mangler modelId " +
                "eller objectRuntimeIds."
            );
        }

        appState.modelId =
            modelId;

        appState.runtimeIds =
            [...runtimeIds];

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

        printResult(
            "OBJECT PROPERTIES",
            properties
        );

        if (
            !properties ||
            properties.length === 0
        ) {

            alert(
                "Fant ingen egenskaper for " +
                "det valgte objektet."
            );

            setStatus(
                "Objektet mangler egenskaper"
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
                "Valgt objekt er ikke " +
                "IFCALIGNMENT:",
                ifcClass
            );

            setStatus(
                `Valgt objekt er ${ifcClass}`
            );
        }
        else {

            setStatus(
                "IfcAlignment valgt – tester hierarki..."
            );
        }

        /*
            Testene kjøres sekvensielt.

            Dette gir ryddigere Console-utskrift
            og reduserer risikoen for at flere
            tunge Viewer-kall kolliderer.
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

   