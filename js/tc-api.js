export async function connectTC() {
try {
if (
window.TrimbleConnectWorkspace
) {
await TrimbleConnectWorkspace
.connect(
window.parent,
() => {}
);
setStatus(
"Tilkoblet Trimble Connect"
);
}
else {
setStatus(
"Demo-modus"
);
}
}
catch(err) {
console.error(err);
setStatus(
"Demo-modus"
);
}
}
export function setStatus(
text
) {
document
.getElementById(
"status"
)
.textContent =
text;
}