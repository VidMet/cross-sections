import {
VERSION,
BUILD_DATE,
APP_NAME
}
from "./versions.js";

import {
connectTC,
setStatus
}
from "./tc-api.js";

import {
setProfile,
currentProfile
}
from "./profile-engine.js";

import {
drawDemoProfile
}
from "./svg-renderer.js";

import {
createMarker,
moveMarker,
markerState
}
from "./marker-engine.js";


// =====================================================
// DOM
// =====================================================

const profileName =
document.getElementById(
"profileName"
);

const profileId =
document.getElementById(
"profileId"
);

const profileLength =
document.getElementById(
"profileLength"
);

const stationInput =
document.getElementById(
"stationInput"
);

const stationSlider =
document.getElementById(
"stationSlider"
);

const stationLabel =
document.getElementById(
"stationLabel"
);

const versionInfo =
document.getElementById(
"versionInfo"
);

const buildInfo =
document.getElementById(
"buildInfo"
);

const btnSelectProfile =
document.getElementById(
"btnSelectProfile"
);

const btnGenerate =
document.getElementById(
"btnGenerate"
);

const btnExportSvg =
document.getElementById(
"btnExportSvg"
);

const btnExportPng =
document.getElementById(
"btnExportPng"
);

const btnMinus1 =
document.getElementById(
"minus1"
);

const btnPlus1 =
document.getElementById(
"plus1"
);

const btnMinus10 =
document.getElementById(
"minus10"
);

const btnPlus10 =
document.getElementById(
"plus10"
);


// =====================================================
// INITIALISERING
// =====================================================

async function initialize() {

versionInfo.innerText =
`Versjon ${VERSION}`;

buildInfo.innerText =
`Build ${BUILD_DATE}`;

await connectTC();

updateStation(0);

setStatus(
`${APP_NAME} klar`
);
}


// =====================================================
// STASJONERING
// =====================================================

function updateStation(
value
) {

const station =
Number(value);

stationInput.value =
station;

stationSlider.value =
station;

stationLabel.innerText =
station.toFixed(3);

moveMarker(
station
);

updateStatusBar();
}

function moveBy(
distance
) {

const current =
Number(
stationSlider.value
);

let next =
current + distance;

const max =
Number(
stationSlider.max
);

if (next < 0)
next = 0;

if (next > max)
next = max;

updateStation(
next
);
}


// =====================================================
// PROFILVALG
// =====================================================

function selectProfile() {

/*
V0.4

Her erstattes demoen
med faktisk valg
av objekt fra
Trimble Connect Viewer
*/

const profile = {

id: crypto.randomUUID(),

name: "E6_Hovedlinje",

length: 2500
};

setProfile(
profile
);

profileName.value =
profile.name;

profileId.innerText =
profile.id;

profileLength.innerText =
`${profile.length} m`;

stationSlider.max =
profile.length;

markerState.profileId =
profile.id;

createMarker();

setStatus(
"Profil valgt"
);

updateStatusBar();
}


// =====================================================
// PROFILGENERERING
// =====================================================

function generateProfile() {

if (
!currentProfile ||
!currentProfile.id
) {

alert(
"Velg en profileringslinje først."
);

return;
}

drawDemoProfile();

setStatus(
"Profil generert"
);
}


// =====================================================
// STATUS
// =====================================================

function updateStatusBar() {

let statusText =
"";

statusText +=
`${APP_NAME}\n`;

statusText +=
`Versjon: ${VERSION}\n`;

if (
currentProfile &&
currentProfile.id
) {

statusText +=
`Profil: ${currentProfile.name}\n`;

statusText +=
`Stasjon: ${Number(
stationSlider.value
).toFixed(3)}`;
}

document
.getElementById(
"status"
)
.innerText =
statusText;
}


// =====================================================
// EKSPORT
// =====================================================

function exportSvg() {

alert(
"SVG-eksport kommer i v0.4"
);
}

function exportPng() {

alert(
"PNG-eksport kommer i v0.4"
);
}


// =====================================================
// EVENTS
// =====================================================

btnSelectProfile
.addEventListener(
"click",
selectProfile
);

btnGenerate
.addEventListener(
"click",
generateProfile
);

btnMinus1
.addEventListener(
"click",
() => moveBy(-1)
);

btnPlus1
.addEventListener(
"click",
() => moveBy(1)
);

btnMinus10
.addEventListener(
"click",
() => moveBy(-10)
);

btnPlus10
.addEventListener(
"click",
() => moveBy(10)
);

stationSlider
.addEventListener(
"input",
e => updateStation(
e.target.value
)
);

stationInput
.addEventListener(
"change",
e => updateStation(
e.target.value
)
);

btnExportSvg
.addEventListener(
"click",
exportSvg
);

btnExportPng
.addEventListener(
"click",
exportPng
);


// =====================================================
// START
// =====================================================

initialize();