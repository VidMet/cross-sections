export function drawDemoProfile() {
const svg =
document.getElementById(
"profileSvg"
);
svg.innerHTML = "";

let content = "";

for(let x=100;x<=1000;x+=100){

content += `
<line
x1="${x}"
y1="50"
x2="${x}"
y2="450"
stroke="#eeeeee"
/>
`;
}

for(let y=100;y<=450;y+=50){

content += `
<line
x1="50"
y1="${y}"
x2="1000"
y2="${y}"
stroke="#eeeeee"
/>
`;
}

content += `
<line
x1="50"
y1="50"
x2="50"
y2="450"
stroke="#666666"
stroke-width="2"
/>

<line
x1="50"
y1="450"
x2="1000"
y2="450"
stroke="#666666"
stroke-width="2"
/>
`;

content += `
<polyline
points="
100,360
200,330
350,310
500,290
650,295
800,330
950,380
"
fill="none"
stroke="black"
stroke-width="3"
/>
`;

svg.innerHTML =
content;
}