import { IfcGeometryProvider } from "./ifc-geometry-provider.js";
import { TrbGeometryProvider } from "./trb-geometry-provider.js";
const ext=name=>(String(name||"").split(".").pop()||"").toLowerCase();
const base=name=>String(name||"").replace(/\.(ifc|trb|trimbim)$/i,"").toLowerCase();
export class GeometryRegistry {
    constructor(){this.providers=[];this.counter=1;}
    create(options){const extension=ext(options.name);const id=options.id||`source-${this.counter++}`;if(extension==="ifc")return new IfcGeometryProvider({...options,id});if(extension==="trb"||extension==="trimbim")return new TrbGeometryProvider({...options,id});return null;}
    syncViewerModels(models){
        const seen=new Set();
        for(const model of models){const modelId=String(model.modelId||model.id||model.fileId||model.versionId||"");const name=model.name||model.fileName||model.displayName||`${modelId}.unknown`;const extension=ext(name);if(!["ifc","trb","trimbim"].includes(extension))continue;const id=`viewer-${modelId}`;seen.add(id);let provider=this.providers.find(item=>item.id===id);if(!provider){provider=this.create({id,name,origin:"viewer",modelId,modelSpec:model});if(provider)this.providers.push(provider);}else{provider.modelSpec=model;provider.name=name;}}
        for(const provider of this.providers.filter(item=>item.origin==="viewer")){if(!seen.has(provider.id)&&!provider.file)this.remove(provider.id);}
    }
    async addLocalFiles(files,onProgress){const results=[];for(const file of Array.from(files||[])){let provider=this.providers.find(item=>base(item.name)===base(file.name)&&item.type===ext(file.name));if(!provider){provider=this.create({name:file.name,origin:"local",file});if(!provider)continue;this.providers.push(provider);}else{provider.attachFile(file);provider.origin=provider.origin==="viewer"?"viewer+local":"local";}onProgress?.(provider,"opening");await provider.open();onProgress?.(provider,provider.status);results.push(provider);}return results;}
    remove(id){const index=this.providers.findIndex(item=>item.id===id);if(index<0)return false;this.providers[index].close();this.providers.splice(index,1);return true;}
    clearLocal(){for(const provider of [...this.providers]){if(provider.origin==="local")this.remove(provider.id);else if(provider.origin==="viewer+local"){provider.file=null;provider.origin="viewer";provider.status="discovered";provider.entities=[];provider.meshes=[];}}}
    summaries(){return this.providers.map(item=>item.getSummary());}
    summary(){const sources=this.summaries();return{sourceCount:sources.length,viewerCount:sources.filter(x=>x.origin.includes("viewer")).length,localCount:sources.filter(x=>x.origin.includes("local")).length,ifcCount:sources.filter(x=>x.type==="ifc").length,trbCount:sources.filter(x=>x.type==="trb").length,readyCount:sources.filter(x=>x.status==="ready").length,totalEntities:sources.reduce((sum,x)=>sum+x.entityCount,0),sources};}
}
