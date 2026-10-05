export const LOCAL_TRB_MESH_POOLS_VERSION = "0.6.5k-local-mesh-pool-mapping";
const INSTANCE_SIZE = 20;
function check(o,s,t,l){if(!Number.isInteger(o)||o<0||o+s>t)throw new RangeError(`${l}: ${o}+${s}>${t}`)}
function u16(v,o){check(o,2,v.byteLength,"u16");return v.getUint16(o,true)}
function u32(v,o){check(o,4,v.byteLength,"u32");return v.getUint32(o,true)}
function i32(v,o){check(o,4,v.byteLength,"i32");return v.getInt32(o,true)}
function table(v,o,l){check(o,4,v.byteLength,l);const vt=o-i32(v,o);check(vt,4,v.byteLength,`${l}.vtable`);const vl=u16(v,vt),ol=u16(v,vt+2);if(vl<4||vl>1024||ol<4||ol>4096)throw new Error(`${l}: invalid table`);return{tableOffset:o,vtableOffset:vt,fieldCount:(vl-4)/2}}
function address(v,t,i){const s=t.vtableOffset+4+i*2;if(s+2>t.vtableOffset+4+t.fieldCount*2)return null;const r=u16(v,s);return r?t.tableOffset+r:null}
function child(v,t,i,l){const a=address(v,t,i);return a==null?null:table(v,a+u32(v,a),l)}
function vector(v,t,i,l){const a=address(v,t,i);if(a==null)return null;const x=a+u32(v,a);return{label:l,targetOffset:x,dataOffset:x+4,length:u32(v,x)}}
function offsetItemTable(v,vec,index,label){const slot=vec.dataOffset+index*4;check(slot,4,v.byteLength,label);return table(v,slot+u32(v,slot),label)}
function histogram(values){const m=new Map();for(const x of values)m.set(x,(m.get(x)||0)+1);return Array.from(m,([value,count])=>({value,count})).sort((a,b)=>a.value-b.value)}
function meshTableSummary(v,t,kind,index){const names=kind==="TexturedTriangleMesh"?["positions","normals","uvs","vertices","indices"]:["positions","normals","vertices","indices"];const fields=names.map((name,i)=>{const x=vector(v,t,i,`${kind}.${name}`);return{name,length:x?.length??0,dataOffset:x?.dataOffset??null}});return{index,kind,fields,positionCount:fields[0]?.length??0,normalCount:fields[1]?.length??0,uvCount:kind==="TexturedTriangleMesh"?(fields[2]?.length??0):0,vertexCount:fields[kind==="TexturedTriangleMesh"?3:2]?.length??0,indexCount:fields[kind==="TexturedTriangleMesh"?4:3]?.length??0}}
export class TrimBimMeshPoolReader{
 static open(buffer){return new TrimBimMeshPoolReader(buffer)}
 constructor(buffer){this.view=new DataView(buffer);this.bytes=new Uint8Array(buffer);this.root=table(this.view,u32(this.view,0),"root");this.header={identifier:String.fromCharCode(...this.bytes.slice(4,8)),byteLength:buffer.byteLength}}
 diagnostic(){const v=this.view,e=child(v,this.root,0,"ModelEntities"),g=child(v,this.root,2,"ModelGeometry"),entities=vector(v,e,0,"entities"),instances=vector(v,g,4,"instances"),triangleMeshes=vector(v,g,7,"triangleMeshes"),triangleMeshes8=vector(v,g,8,"triangleMeshes8"),textured=vector(v,g,9,"texturedTriangleMeshes");const instanceRecords=[];for(let i=0;i<instances.length;i++){const o=instances.dataOffset+i*INSTANCE_SIZE;instanceRecords.push({instanceIndex:i,instanceId:u32(v,o),entityIndex:u32(v,o+4),geometryId:u32(v,o+8),raw3:u32(v,o+12),raw4:u32(v,o+16)})}
 const pools=[
  {name:"TriangleMesh",globalStart:0,vector:triangleMeshes},
  {name:"TriangleMesh8",globalStart:triangleMeshes.length,vector:triangleMeshes8},
  {name:"TexturedTriangleMesh",globalStart:triangleMeshes.length+triangleMeshes8.length,vector:textured}
 ];
 const meshes=[];for(const pool of pools){for(let i=0;i<pool.vector.length;i++){const t=offsetItemTable(v,pool.vector,i,`${pool.name}[${i}]`);meshes.push({...meshTableSummary(v,t,pool.name,i),globalGeometryId:pool.globalStart+i})}}
 const mapped=instanceRecords.map(r=>{const p=pools.find(x=>r.geometryId>=x.globalStart&&r.geometryId<x.globalStart+x.vector.length);return{...r,pool:p?.name??null,poolIndex:p?r.geometryId-p.globalStart:null,validEntity:r.entityIndex<entities.length,validGeometry:Boolean(p)}});
 return{readerVersion:LOCAL_TRB_MESH_POOLS_VERSION,header:this.header,counts:{entityCount:entities.length,instanceCount:instances.length,triangleMeshCount:triangleMeshes.length,triangleMesh8Count:triangleMeshes8.length,texturedTriangleMeshCount:textured.length,totalMappedMeshes:meshes.length},poolRanges:pools.map(p=>({name:p.name,start:p.globalStart,endInclusive:p.globalStart+p.vector.length-1,count:p.vector.length})),instanceMapping:{sample:mapped.slice(0,60),entityHistogram:histogram(mapped.map(x=>x.entityIndex)),poolHistogram:histogram(mapped.map(x=>x.pool??"unmapped")),invalidEntityCount:mapped.filter(x=>!x.validEntity).length,invalidGeometryCount:mapped.filter(x=>!x.validGeometry).length},meshSummaries:meshes,validation:{allInstancesMapped:mapped.every(x=>x.validEntity&&x.validGeometry),meshPoolTotalMatchesInstances:meshes.length===instances.length,allIndexCountsDivisibleBy3:meshes.every(x=>x.indexCount%3===0),meshArraysDecoded:false,transformsDecoded:false},note:"Instance fields are mapped as instanceId, entityIndex and geometryId from their complete bounded sequences. Geometry IDs are validated against the three non-empty mesh pool ranges. Mesh table vector lengths are decoded; array payloads and transforms are not yet emitted."}}
}
