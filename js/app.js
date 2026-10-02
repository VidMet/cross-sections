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


// ====================================================
// INITIALISERING
// ====================================================

async function initialize() {

    document
        .getElementById(
            "versionInfo"
        )
        .innerText =
        `v${VERSION}`;

    document
        .getElementById(
            "buildInfo"
        )
        .innerText =
        BUILD_DATE;

    const api =
        await connectTC();

    console.log(
        "API:",
        api
    );

    setStatus(
        "Klar"
    );
}


// ====================================================
// TEST AV VALGT OBJEKT
// ====================================================

async function selectProfile() {

    try {

        const api =
            getAPI();

        console.log(
            "API ved valg:",
            api
        );

        if (!api) {

            alert(
                "Ingen API-forbindelse"
            );

            return;
        }

        console.log(
            "Alle API-funksjoner:",
            Object.keys(api)
        );

        alert(
            "Se Console-vinduet"
        );
    }
    catch (err) {

        console.error(
            err
        );

        alert(
            err.message
        );
    }
}


// ====================================================
// KNAPPER
// ====================================================

document
    .getElementById(
        "btnSelectProfile"
    )
    .addEventListener(
        "click",
        selectProfile
    );


// ====================================================
// START
// ====================================================

initialize();