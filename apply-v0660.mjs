import fs from "node:fs";import path from "node:path";import { fileURLToPath } from "node:url";
const packageDir=path.dirname(fileURLToPath(import.meta.url));
const root=process.cwd(), appPaths=["js/app.js","app.js"], appRel=appPaths.find(p=>fs.existsSync(path.join(root,p)));if(!appRel)throw Error("Fant ikke js/app.js eller app.js");
for(const rel of ["js/geometry/trb-geometry-provider.js","js/geometry/trb8-integrated-decoder.js"]){const src=path.join(packageDir,rel),dst=path.join(root,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});if(fs.existsSync(dst))fs.copyFileSync(dst,dst+".pre-v0660.bak");fs.copyFileSync(src,dst)}
const registry=path.join(root,"js/geometry/geometry-registry.js");let r=fs.readFileSync(registry,"utf8");fs.writeFileSync(registry+".pre-v0660.bak",r);r=r.replace(/trb-geometry-provider\.js\?v=[^"']+/g,"trb-geometry-provider.js?v=0.6.6.0").replace(/0\.6\.5k-trb8-mesh-pool-mapping/g,"0.6.6.0-registry-integrated").replace(/ready-mesh-pools/g,"ready");fs.writeFileSync(registry,r);
const app=path.join(root,appRel);let a=fs.readFileSync(app,"utf8");fs.writeFileSync(app+".pre-v0660.bak",a);
if(!a.includes('provider.type === "trb" && provider.status === "ready"')){
 const anchor='const meshes = [], calibrations = []; let linkedCandidateCount = 0;';
 if(!a.includes(anchor))throw Error("Fant ikke integrasjonspunkt i app.js. Provider og registry er kopiert, men app.js er ikke endret.");
 a=a.replace(anchor,anchor+'\n        const readyTrbProviders = R.providers.filter(provider => provider.type === "trb" && provider.status === "ready");\n        for (const provider of readyTrbProviders) meshes.push(...provider.getAllMeshes());');
 a=a.replace('ifcProvidersReady: readyIfcProviders.length,','ifcProvidersReady: readyIfcProviders.length, trbProvidersReady: readyTrbProviders.length,');
}
a=a.replace(/geometry-registry\.js\?v=[^"']+/g,'geometry-registry.js?v=0.6.6.0');fs.writeFileSync(app,a);console.log("v0.6.6.0 installert kontrollert. Sikkerhetskopier er opprettet.");
