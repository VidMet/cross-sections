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
// GLOBAL FEILHÅNDTERING
// =======================================================

window.addEventListener(
    "error",
    function (event) {

        console.error(
            "GLOBAL ERROR:",
            event.error
        );

        setStatus(
            "JS FEIL - se Console"
        );
    }
);

window.addEventListener(
    "unhandledrejection",
    function (event) {

        console.error(
            "PROMISE ERROR:",
            event.reason
        );

        setStatus(
            "PROMISE FEIL - se Console"
        );
    }
);


// =======================================================
// VERSJONSVISNING
// =======================================================

function initVersionInfo() {

    try {

        const versionElement =
            document.getElementById(
                "versionInfo"
            );

        const buildElement =
            document.getElementById(
                "buildInfo"
            );

        if (versionElement) {

            versionElement.innerText =
                `v${VERSION}`;
        }

        if (buildElement) {

            buildElement.innerText =
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
    catch (err) {

        console.error(
            "VERSJONSFEIL:",
            err
        );
    }
}


// =======================================================
// INITIALISERING
// =======================================================

async function initialize() {

    console.log(
        "========== START =========="
    );

    initVersionInfo();

    try {

        const api =
            await connectTC();

        console.log(
            "Trimble API:",
            api
        );

        if (!api) {

            console.warn(
                "Ingen API mottatt."
            );

            setStatus(
                "Ingen API-forbindelse"
            );

            return;
        }

        console.log(
            "API KEYS:"
        );

        console.log(
            Object.keys(api)
        );

        setStatus(
            "Trimble API koblet"
        );
    }
    catch (err) {

        console.error(
            "INITIALISERINGSFEIL:",
            err
        );

        setStatus(
            "Initialiseringsfeil"
        );
    }

    console.log(
        "========== FERDIG =========="
    );
}


// =======================================================
// PROFILVALG
// =======================================================

async function selectProfile() {

    console.log(
        "Velg profileringslinje trykket"
    );

    try {

        const api =
            getAPI();

        console.log(
            "API:",
            api
        );

        if (!api) {

            alert(
                "Ingen API tilgjengelig. Se Console."
            );

            return;
        }

        console.log(
            "API KEYS:"
        );

        console.log(
            Object.keys(api)
        );

        alert(
            "API dumpet til Console"
        );
    }
    catch (err) {

        console.error(
            "VELG PROFIL FEIL:",
            err
        );

        alert(
            err.message
        );
    }
}


// =======================================================
// GENERER PROFIL
// =======================================================

function generateProfile() {

    console.log(
        "Generer profil"
    );

    alert(
        "Ikke implementert ennå"
    );
}


// =======================================================
// EKSPORT
// =======================================================

function exportSvg() {

    console.log(
        "Eksporter SVG"
    );

    alert(
        "SVG eksport kommer senere"
    );
}

function exportPng() {

    console.log(
        "Eksporter PNG"
    );

    alert(
        "PNG eksport kommer senere"
    );
}


// =======================================================
// EVENTS
// =======================================================

function bindEvents() {

    document
        .getElementById(
            "btnSelectProfile"
        )
        ?.addEventListener(
            "click",
            selectProfile
        );

    document
        .getElementById(
            "btnGenerate"
        )
        ?.addEventListener(
            "click",
            generateProfile
        );

    document
        .getElementById(
            "btnExportSvg"
        )
        ?.addEventListener(
            "click",
            exportSvg
        );

    document
        .getElementById(
            "btnExportPng"
        )
        ?.addEventListener(
            "click",
            exportPng
        );

    console.log(
        "Events registrert"
    );
}


// =======================================================
// START
// =======================================================

bindEvents();

initialize();