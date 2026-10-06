import { getAPI } from "../tc-api.js";

const U16=(v,o)=>v.getUint16(o,true),U32=(v,o)=>v.getUint32(o,true),I32=(v,o)=>v.getInt32(o,true),F32=(v,o)=>v.getFloat32(o,true),F64=(v,o)=>v.getFloat64(o,true);
function ck(v,o,n,l){if(!Number.isInteger(o)||o<0||o+n>v.byteLength)throw new RangeError(`${l}: ${o}+${n}>${v.byteLength}`)}
function tab(v,o,l){ck(v,o,4,l);const q=o-I32(v,o);ck(v,q,4,l);const n=U16(v,q),z=U16(v,q+2);if(n<4||n>1024||z<4||z>4096)throw Error(`${l}: invalid table`);return{o,q,n,z}}
function fa(v,t,i){const s=t.q+4+i*2;if(s+2>t.q+t.n)return null;const r=U16(v,s);return r?t.o+r:null}
function child(v,t,i,l){const a=fa(v,t,i);return a==null?null:tab(v,a+U32(v,a),l)}
function vec(v,t,i,l){const a=fa(v,t,i);if(a==null)return null;const o=a+U32(v,a);ck(v,o,4,l);return{o:o+4,n:U32(v,o),header:o}}
function item(v,x,i,l){const o=x.o+i*4;return tab(v,o+U32(v,o),l)}
function p3(v,x,i){const o=x.o+i*12;return{x:F32(v,o),y:F32(v,o+4),z:F32(v,o+8)}}
function B(){return{min:{x:Infinity,y:Infinity,z:Infinity},max:{x:-Infinity,y:-Infinity,z:-Infinity}}}
function grow(b,p){b.min.x=Math.min(b.min.x,p.x);b.min.y=Math.min(b.min.y,p.y);b.min.z=Math.min(b.min.z,p.z);b.max.x=Math.max(b.max.x,p.x);b.max.y=Math.max(b.max.y,p.y);b.max.z=Math.max(b.max.z,p.z)}
function merge(b,a){if(a){grow(b,a.min);grow(b,a.max)}}
function finite(b){return b&&Object.values(b.min).every(Number.isFinite)&&Object.values(b.max).every(Number.isFinite)}
function cross(a,b){return{x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x}}
function dot(a,b){return a.x*b.x+a.y*b.y+a.z*b.z}
function len(a){return Math.hypot(a.x,a.y,a.z)}
function placement(v,o){const origin={x:F64(v,o),y:F64(v,o+8),z:F64(v,o+16)},xAxis={x:F32(v,o+24),y:F32(v,o+28),z:F32(v,o+32)},yAxis={x:F32(v,o+36),y:F32(v,o+40),z:F32(v,o+44)},zAxis=cross(xAxis,yAxis);return{origin,xAxis,yAxis,zAxis,quality:{xLength:len(xAxis),yLength:len(yAxis),zLength:len(zAxis),xyDot:dot(xAxis,yAxis),finite:[...Object.values(origin),...Object.values(xAxis),...Object.values(yAxis),...Object.values(zAxis)].every(Number.isFinite)}}}
function apply(t,p){return{x:t.origin.x+t.xAxis.x*p.x+t.yAxis.x*p.y+t.zAxis.x*p.z,y:t.origin.y+t.xAxis.y*p.x+t.yAxis.y*p.y+t.zAxis.y*p.z,z:t.origin.z+t.xAxis.z*p.x+t.yAxis.z*p.y+t.zAxis.z*p.z}}
function compose(a,b){return{origin:apply(a,b.origin),xAxis:{x:a.xAxis.x*b.xAxis.x+a.yAxis.x*b.xAxis.y+a.zAxis.x*b.xAxis.z,y:a.xAxis.y*b.xAxis.x+a.yAxis.y*b.xAxis.y+a.zAxis.y*b.xAxis.z,z:a.xAxis.z*b.xAxis.x+a.yAxis.z*b.xAxis.y+a.zAxis.z*b.xAxis.z},yAxis:{x:a.xAxis.x*b.yAxis.x+a.yAxis.x*b.yAxis.y+a.zAxis.x*b.yAxis.z,y:a.xAxis.y*b.yAxis.x+a.yAxis.y*b.yAxis.y+a.zAxis.y*b.yAxis.z,z:a.xAxis.z*b.yAxis.x+a.yAxis.z*b.yAxis.y+a.zAxis.z*b.yAxis.z},zAxis:{x:a.xAxis.x*b.zAxis.x+a.yAxis.x*b.zAxis.y+a.zAxis.x*b.zAxis.z,y:a.xAxis.y*b.zAxis.x+a.yAxis.y*b.zAxis.y+a.zAxis.y*b.zAxis.z,z:a.xAxis.z*b.zAxis.x+a.yAxis.z*b.zAxis.y+a.zAxis.z*b.zAxis.z}}}
function inverse(t){const x=t.xAxis,y=t.yAxis,z=t.zAxis,o=t.origin;return{origin:{x:-dot(x,o),y:-dot(y,o),z:-dot(z,o)},xAxis:{x:x.x,y:y.x,z:z.x},yAxis:{x:x.y,y:y.y,z:z.y},zAxis:{x:x.z,y:y.z,z:z.z}}}
function transformBox(t,b){const r=B();for(const x of[b.min.x,b.max.x])for(const y of[b.min.y,b.max.y])for(const z of[b.min.z,b.max.z])grow(r,apply(t,{x,y,z}));return r}
function meshBox(v,t,k){const tex=k==="TexturedTriangleMesh",tiny=k==="TriangleMesh8",P=vec(v,t,0,"positions"),V=vec(v,t,tex?3:2,"vertices"),b=B();let invalidPositionReferences=0;for(let i=0;i<V.n;i++){const packed=tiny?U16(v,V.o+i*2):U32(v,V.o+i*4),pi=tiny?(packed&255):(packed&65535);if(pi<P.n)grow(b,p3(v,P,pi));else invalidPositionReferences++}return finite(b)?{box:b,invalidPositionReferences,positionCount:P.n,vertexCount:V.n,vertexWordBytes:tiny?2:4,positionIndexBits:tiny?8:16}:null}
function err(a,b){return Math.max(Math.abs(a.min.x-b.min.x),Math.abs(a.min.y-b.min.y),Math.abs(a.min.z-b.min.z),Math.abs(a.max.x-b.max.x),Math.abs(a.max.y-b.max.y),Math.abs(a.max.z-b.max.z))}
function median(a){const s=a.filter(Number.isFinite).sort((x,y)=>x-y);if(!s.length)return null;const i=Math.floor(s.length/2);return s.length%2?s[i]:(s[i-1]+s[i])/2}

function triangleMesh(v,t,k){
  const textured=k==="TexturedTriangleMesh", tiny=k==="TriangleMesh8";
  const P=vec(v,t,0,"positions"), V=vec(v,t,textured?3:2,"vertices"), I=vec(v,t,textured?4:3,"indices");
  const vertexWordBytes=tiny?2:4,indexWordBytes=tiny?1:2;
  const vertices=new Array(V.n); let invalidPositionReferences=0;
  for(let i=0;i<V.n;i++){
    const packed=tiny?U16(v,V.o+i*2):U32(v,V.o+i*4);
    const pi=tiny?(packed&255):(packed&65535);
    if(pi<P.n) vertices[i]=p3(v,P,pi); else invalidPositionReferences++;
  }
  const indexAt=i=>indexWordBytes===1?v.getUint8(I.o+i):U16(v,I.o+i*2);
  let invalidVertexIndices=0,degenerateTriangles=0,validTriangles=0,maxIndex=-1;
  const localBox=B();
  for(const p of vertices)if(p)grow(localBox,p);
  for(let i=0;i+2<I.n;i+=3){
    const a=indexAt(i),b=indexAt(i+1),c=indexAt(i+2); maxIndex=Math.max(maxIndex,a,b,c);
    if(a>=vertices.length||b>=vertices.length||c>=vertices.length||!vertices[a]||!vertices[b]||!vertices[c]){invalidVertexIndices++;continue}
    const p=vertices[a],q=vertices[b],r=vertices[c];
    const ux=q.x-p.x,uy=q.y-p.y,uz=q.z-p.z,vx=r.x-p.x,vy=r.y-p.y,vz=r.z-p.z;
    const cx=uy*vz-uz*vy,cy=uz*vx-ux*vz,cz=ux*vy-uy*vx;
    if(cx*cx+cy*cy+cz*cz<=1e-20)degenerateTriangles++; else validTriangles++;
  }
  return {kind:k,positions:P.n,vertices:V.n,indices:I.n,triangleSlots:Math.floor(I.n/3),validTriangles,degenerateTriangles,invalidVertexIndices,invalidPositionReferences,maxIndex,vertexWordBytes,indexWordBytes,localBox,vertexPositions:vertices};
}
function decode(buffer){
 const v=new DataView(buffer),id=String.fromCharCode(...new Uint8Array(buffer).slice(4,8));if(id!=="TRB8")throw Error(`Expected TRB8, got ${id}`);
 const root=tab(v,U32(v,0),"root"),ME=child(v,root,0,"ModelEntities"),G=child(v,root,2,"Geometry"),E=vec(v,ME,0,"entities"),P=vec(v,G,0,"placements"),J=vec(v,G,4,"instances"),A=vec(v,G,7,"tm"),C8=vec(v,G,8,"tm8"),C=vec(v,G,9,"ttm");
 const pools=[{k:"TriangleMesh",x:A,s:0},{k:"TriangleMesh8",x:C8,s:A.n},{k:"TexturedTriangleMesh",x:C,s:A.n+C8.n}],meshes=new Map();
 for(const p of pools)for(let i=0;i<p.x.n;i++)meshes.set(p.s+i,triangleMesh(v,item(v,p.x,i,p.k),p.k));
 const entityT=Array.from({length:E.n},(_,i)=>placement(v,E.o+i*64+16)),entities=Array.from({length:E.n},(_,i)=>({entityIndex:i,worldBox:B(),instances:0,triangles:0,degenerateTriangles:0,invalidVertexIndices:0,invalidPositionReferences:0}));
 const rows=[];let badReferences=0;
 for(let i=0;i<J.n;i++){
   const o=J.o+i*20,placementIndex=U32(v,o),entityIndex=U32(v,o+4),geometryId=U32(v,o+8),geometryType=U32(v,o+12),materialOrTexture=U32(v,o+16),m=meshes.get(geometryId);
   if(entityIndex>=E.n||placementIndex>=P.n||!m){badReferences++;continue}
   const world=compose(entityT[entityIndex],placement(v,P.o+placementIndex*48)),worldBox=transformBox(world,m.localBox),e=entities[entityIndex];
   merge(e.worldBox,worldBox);e.instances++;e.triangles+=m.validTriangles;e.degenerateTriangles+=m.degenerateTriangles;e.invalidVertexIndices+=m.invalidVertexIndices;e.invalidPositionReferences+=m.invalidPositionReferences;
   rows.push({instanceIndex:i,entityIndex,geometryId,geometryType,materialOrTexture,meshKind:m.kind,positions:m.positions,vertices:m.vertices,indices:m.indices,triangleSlots:m.triangleSlots,validTriangles:m.validTriangles,degenerateTriangles:m.degenerateTriangles,invalidVertexIndices:m.invalidVertexIndices,invalidPositionReferences:m.invalidPositionReferences,maxIndex:m.maxIndex,vertexWordBytes:m.vertexWordBytes,indexWordBytes:m.indexWordBytes,worldBox});
 }
 const totals=rows.reduce((a,r)=>{a.instances++;a.triangleSlots+=r.triangleSlots;a.validTriangles+=r.validTriangles;a.degenerateTriangles+=r.degenerateTriangles;a.invalidVertexIndices+=r.invalidVertexIndices;a.invalidPositionReferences+=r.invalidPositionReferences;return a},{instances:0,triangleSlots:0,validTriangles:0,degenerateTriangles:0,invalidVertexIndices:0,invalidPositionReferences:0});
 const byKind={};for(const r of rows){const a=byKind[r.meshKind]??={instances:0,triangleSlots:0,validTriangles:0,degenerateTriangles:0,invalidVertexIndices:0,invalidPositionReferences:0};a.instances++;a.triangleSlots+=r.triangleSlots;a.validTriangles+=r.validTriangles;a.degenerateTriangles+=r.degenerateTriangles;a.invalidVertexIndices+=r.invalidVertexIndices;a.invalidPositionReferences+=r.invalidPositionReferences}
 return{header:{identifier:id,byteLength:buffer.byteLength},counts:{entities:E.n,placements:P.n,instances:J.n,badReferences},totals,byKind,entities,instances:rows};
}
const mid=m=>String(m?.modelId||m?.id||m?.fileId||m?.versionId||""),name=m=>String(m?.name||m?.fileName||m?.displayName||"");
export const DIAGNOSTIC_VERSION="0.6.5w-isolated-trb-triangle-buffers";
export async function runTrbTriangleBuffersDiagnostic(){
 const api=getAPI();if(!api?.viewer)throw Error("Trimble Connect API is not connected.");
 const[models,groups]=await Promise.all([api.viewer.getModels(),api.viewer.getObjects({}, {visible:true})]),visible=new Set((groups||[]).map(g=>String(g.modelId))),out=[];
 for(const m of(models||[]).filter(m=>visible.has(mid(m))&&/\.(trb|trimbim)$/i.test(name(m)))){
  const id=mid(m),loaded=await api.viewer.getLoadedModel(id),blob=loaded?.blob instanceof Blob?loaded.blob:m?.trbBlob instanceof Blob?m.trbBlob:null;
  if(!blob){out.push({modelId:id,name:name(m),error:"No TRB Blob available"});continue}
  try{const d=decode(await blob.arrayBuffer());out.push({modelId:id,name:name(m),diagnosticVersion:DIAGNOSTIC_VERSION,...d,validation:{allReferencesValid:d.counts.badReferences===0,allPositionReferencesValid:d.totals.invalidPositionReferences===0,allVertexIndicesValid:d.totals.invalidVertexIndices===0,allTriangleSlotsAccountedFor:d.totals.triangleSlots===d.totals.validTriangles+d.totals.degenerateTriangles},safety:{activeApplicationModified:false,geometryRegistryModified:false,trbProviderModified:false,sectionEngineModified:false,meshesEmittedToSectionEngine:false}})}catch(e){out.push({modelId:id,name:name(m),error:e?.message||String(e)})}
 }
 window.__crossSectionIsolatedTrbTriangleBuffers=out;console.log("===== ISOLATED TRB8-TRIANGLE-BUFFERS v0.6.5w =====");console.dir(out);return out;
}
window.runCrossSectionTrbTriangleBuffersDiagnostic=runTrbTriangleBuffersDiagnostic;
console.log("Isolated TRB triangle-buffers diagnostic loaded. Run: await runCrossSectionTrbTriangleBuffersDiagnostic()");
