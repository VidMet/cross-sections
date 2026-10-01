export const markerState = {
station: 0,
dragging: false,
objectId: null,
profileId: null,
worldX: 0,
worldY: 0,
worldZ: 0
};

export function createMarker() {
console.log(
"Marker opprettet"
);
}

export function moveMarker(
station
) {
markerState.station =
station;
console.log(
"Marker flyttet:",
station
);
}

export function removeMarker() {

console.log(
"Marker fjernet"
);
}