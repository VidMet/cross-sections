export let currentProfile = {
id: null,
name: "",
length: 0
};
export function setProfile(profile) {
currentProfile = profile;
}
export function clearProfile() {
currentProfile = {
id: null,
name: "",
length: 0
};
}
export function stationToPercent(
station,
length
) {
if(length <= 0)
return 0;
return station / length;
}