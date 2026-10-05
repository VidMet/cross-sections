export const LOCAL_TRB_INSTANCE_VERSION = "0.6.5g-local-instance-mapping";
function check(o,s,t,l){if(!Number.isInteger(o)||o<0||o+s>t)throw new RangeError(`${l}: offset ${o}, size ${s}, total ${t}`)}
function u16(v,o,l="u16"){check(o,2,v.byteLength,l);return v.getUint16(o,true)}
function i32(v,o,l="i32"){check(o,4,v.byteLength,l);return v.getInt32(o,true)}
function u32(v,o,l="u32"){check(o,4,v.byteLength,l);return v.getUint32(o,true)}
function f32(v,o,l="f32"){check(o,4,v.byteLength,l);return v.getFloat32(o,true)}
function table(v,o,l){check(o,4,v.byteLength,l);const d=i32(v,o,`${l}.distance`),vt=o-d;check(vt,4,v.byteLength,`${l}.vtable`);const vl=u16(v,vt),ol=u16(v,vt+2);if(vl<4||vl>1024||ol<4||ol>4096)throw new RangeError(`${l}: implausible table`);return{tableOffset:o,vtableOffset:vt,vtableLength:vl,objectLength:ol,fieldCount:Math.floor((vl-4)/2)}}
function addr(v,t,i){const s=t.vtableOffset+4+i*2;if(s+2>t.vtableOffset+t.vtableLength)return null;const r=u16(v,s);return r?t.tableOffset+r:null}
function indirect(v,a,l){if(a==null)return null;const x=a+u32(v,a,l);check(x,4,v.byteLength,l);return x}
function subtable(v,t,i,l){const x=indirect(v,addr(v,t,i),l);return x==null?null:table(v,x,l)}
function vector(v,t,i,l){const x=indirect(v,addr(v,t,i),l);if(x==null)return null;return{targetOffset:x,dataOffset:x+4,length:u32(v,x,`${l}.length`)}}
function bytes(v,offset,length){check(offset,length,v.byteLength,"bytes");return Array.from(new Uint8Array(v.buffer,offset,length))}
function uints(v,offset,count,max=32){const a=[];for(let i=0;i<Math.min(count,max);i++)a.push(u32(v,offset+i*4));return a}
function floats(v,offset,count,max=32){const a=[];for(let i=0;i<Math.min(count,max);i++)a.push(Number(f32(v,offset+i*4).toFixed(6)));return a}
function records(v,vec,stride,max=12){const output=[];const count=Math.min(vec.length,max);for(let i=0;i<count;i++){const o=vec.dataOffset+i*stride;if(o+stride>v.byteLength)break;output.push({index:i,offset:o,bytes:bytes(v,o,Math.min(stride,32)),uint32:uints(v,o,Math.floor(stride/4),8),float32:floats(v,o,Math.floor(stride/4),8)})}return output}
function vectorDiagnostic(v,vec,index){return{fieldIndex:index,length:vec.length,dataOffset:vec.dataOffset,byteSample:bytes(v,vec.dataOffset,Math.min(64,v.byteLength-vec.dataOffset)),uint32Sample:uints(v,vec.dataOffset,vec.length),float32Sample:floats(v,vec.dataOffset,vec.length)}}
export class TrimBimInstanceReader{
 static open(b){return new TrimBimInstanceReader(b)}
 constructor(b){this.buffer=b;this.view=new DataView(b);this.bytes=new Uint8Array(b);this.root=table(this.view,u32(this.view,0),"root");this.header={identifier:String.fromCharCode(...this.bytes.slice(4,8)),byteLength:this.bytes.length}}
 diagnostic(){const v=this.view,entities=subtable(v,this.root,0,"ModelEntities"),pool=subtable(v,this.root,1,"InstancePoolCandidate");const entityVector=vector(v,entities,0,"ModelEntities.entities"),guidVector=vector(v,entities,2,"ModelEntities.guid_identifiers"),classVector=vector(v,entities,6,"ModelEntities.entity_classes");const vectors=[];for(let i=0;i<pool.fieldCount;i++){try{const x=vector(v,pool,i,`InstancePool.field${i}`);if(x)vectors.push(vectorDiagnostic(v,x,i))}catch{}}
 const perEntity=vectors.filter(x=>x.length===entityVector.length).map(x=>x.fieldIndex);
 const repeatedLengths={};for(const x of vectors)repeatedLengths[x.length]=(repeatedLengths[x.length]||[]).concat(x.fieldIndex);
 const field0=vector(v,pool,0,"InstancePool.field0");
 return{readerVersion:LOCAL_TRB_INSTANCE_VERSION,header:this.header,verifiedCounts:{entityCount:entityVector.length,guidCount:guidVector.length,classCount:classVector.length},instancePoolCandidate:{rootField:1,fieldCount:pool.fieldCount,vectors,perEntityVectorFields:perEntity,repeatedLengthGroups:Object.entries(repeatedLengths).filter(([,a])=>a.length>1).map(([length,fields])=>({length:Number(length),fields}))},field0RecordCandidates:[4,8,12,16,20,24,32,48,64].map(stride=>({stride,records:records(v,field0,stride)})),mappingStatus:{entityParallelFieldFound:perEntity.includes(0),entityInstanceLinksDecoded:false,geometryIndicesDecoded:false,transformIndicesDecoded:false,materialIndicesDecoded:false},note:"Field 0 is confirmed parallel to the 29 entities. Record layouts are shown under several candidate strides; no semantic field names are assigned until values can be validated against Viewer IDs and pool bounds."}}
}
