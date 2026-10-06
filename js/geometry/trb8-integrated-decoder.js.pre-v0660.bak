

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


function decodeMesh(v,t,k){
 const textured=k==="TexturedTriangleMesh",tiny=k==="TriangleMesh8",P=vec(v,t,0,"positions"),V=vec(v,t,textured?3:2,"vertices"),I=vec(v,t,textured?4:3,"indices"),vertexWordBytes=tiny?2:4,indexWordBytes=tiny?1:2,vertices=new Array(V.n);let invalidPositionReferences=0;
 for(let i=0;i<V.n;i++){const packed=tiny?U16(v,V.o+i*2):U32(v,V.o+i*4),pi=tiny?(packed&255):(packed&65535);if(pi<P.n)vertices[i]=p3(v,P,pi);else invalidPositionReferences++}
 return{kind:k,vertices,indexCount:I.n,indexAt:i=>indexWordBytes===1?v.getUint8(I.o+i):U16(v,I.o+i*2),invalidPositionReferences};
}
function dot3(a,b){return a.x*b.x+a.y*b.y+(a.z||0)*(b.z||0)}
function signedDistance(p,plane){return dot3({x:p.x-plane.origin.x,y:p.y-plane.origin.y,z:p.z-plane.origin.z},plane.normal)}
function lerpPlane(a,b,sa,sb){const t=sa/(sa-sb);return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t}}
function intersectTriangle(a,b,c,plane,eps=1e-9){const pts=[],arr=[[a,signedDistance(a,plane)],[b,signedDistance(b,plane)],[c,signedDistance(c,plane)]];for(const[p,s]of arr)if(Math.abs(s)<=eps)pts.push(p);for(let i=0;i<3;i++){const[p,s]=arr[i],[q,t]=arr[(i+1)%3];if((s>eps&&t<-eps)||(s<-eps&&t>eps))pts.push(lerpPlane(p,q,s,t))}const unique=[];for(const p of pts)if(!unique.some(q=>Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)<=1e-7))unique.push(p);return unique.length>=2?[unique[0],unique[1]]:null}
function parse(buffer){const v=new DataView(buffer),id=String.fromCharCode(...new Uint8Array(buffer).slice(4,8));if(id!=="TRB8")throw Error(`Expected TRB8, got ${id}`);const root=tab(v,U32(v,0),"root"),ME=child(v,root,0,"ModelEntities"),G=child(v,root,2,"Geometry"),E=vec(v,ME,0,"entities"),P=vec(v,G,0,"placements"),J=vec(v,G,4,"instances"),A=vec(v,G,7,"tm"),C8=vec(v,G,8,"tm8"),C=vec(v,G,9,"ttm"),pools=[{k:"TriangleMesh",x:A,s:0},{k:"TriangleMesh8",x:C8,s:A.n},{k:"TexturedTriangleMesh",x:C,s:A.n+C8.n}],meshes=new Map();for(const p of pools)for(let i=0;i<p.x.n;i++)meshes.set(p.s+i,decodeMesh(v,item(v,p.x,i,p.k),p.k));const entityT=Array.from({length:E.n},(_,i)=>placement(v,E.o+i*64+16)),instances=[];let badReferences=0,worldBox=B();for(let i=0;i<J.n;i++){const o=J.o+i*20,pi=U32(v,o),ei=U32(v,o+4),gi=U32(v,o+8),m=meshes.get(gi);if(ei>=E.n||pi>=P.n||!m){badReferences++;continue}const world=compose(entityT[ei],placement(v,P.o+pi*48));instances.push({instanceIndex:i,entityIndex:ei,geometryId:gi,mesh:m,world});for(const p of m.vertices)if(p)grow(worldBox,apply(world,p))}return{header:{identifier:id,byteLength:buffer.byteLength},counts:{entities:E.n,placements:P.n,instances:J.n,badReferences},instances,worldBox}}

export const TRB8_INTEGRATED_DECODER_VERSION = "0.6.6.0-geometry-registry-integration";
const IDENTITY=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
export function decodeTrb8Meshes(buffer,{sourceId="trb",entityIds=[]}={}){
  const d=parse(buffer), meshes=[], byEntity=new Map();
  for(const ins of d.instances){
    const m=ins.mesh, positions=new Float64Array(m.vertices.length*3);
    for(let i=0;i<m.vertices.length;i++){
      const p=m.vertices[i]; if(!p) continue; const w=apply(ins.world,p);
      positions[i*3]=w.x;positions[i*3+1]=w.y;positions[i*3+2]=w.z;
    }
    const IndexType=m.vertices.length<256?Uint8Array:m.vertices.length<65536?Uint16Array:Uint32Array;
    const indices=new IndexType(m.indexCount);for(let i=0;i<m.indexCount;i++)indices[i]=m.indexAt(i);
    const globalId=entityIds[ins.entityIndex]||`trb-entity-${ins.entityIndex}`;
    const mesh={sourceId,entityId:ins.entityIndex,globalId,className:"TRB8",name:`TRB entity ${ins.entityIndex}`,color:"#7b61ff",positions,indices,transform:IDENTITY,meshKind:m.kind,instanceIndex:ins.instanceIndex,geometryId:ins.geometryId};
    meshes.push(mesh);if(!byEntity.has(globalId))byEntity.set(globalId,[]);byEntity.get(globalId).push(mesh);
  }
  return{header:d.header,counts:d.counts,meshes,byEntity,worldBox:d.worldBox};
}
