import{VERSION,BUILD_DATE,APP_NAME}from"./versions.js";import{connectTC,getAPI,setStatus}from"./tc-api.js";import{GeometryRegistry}from"./geometry/geometry-registry.js";import{renderProfileShell,renderGeometryDiagnostic,renderSectionSegments}from"./svg-renderer.js";import{intersectMeshes}from"./geometry/section-engine.js";
const R=new GeometryRegistry(),S={points:[],selected:null,station:0,frame:null,marker:null,planeIds:[]},$=id=>document.getElementById(id),markerUrl=new URL("../assets/station-marker.png",import.meta.url).href,refresh={timer:null,inProgress:false,pending:false,lastSignature:null,retried:false};
const DEBOUNCE_MS=500;function log(n,v){console.log(`===== ${n} =====`);console.dir(v);}function renderSources(){const box=$("geometrySourceList"),sum=R.summary();box.innerHTML="";for(const s of sum.sources){const row=document.createElement("div");row.className=`geometry-source geometry-source-${s.status}`;row.innerHTML=`<div class="geometry-source-main"></div><div class="geometry-source-details"></div>`;row.children[0].textContent=s.name;row.children[1].textContent=`${s.type.toUpperCase()} · ${s.origin} · ${s.status}`;const b=document.createElement("button");b.className="geometry-source-remove";b.textContent="Fjern";b.onclick=()=>{R.remove(s.id);renderSources();};row.appendChild(b);box.appendChild(row);}$("geometrySourceSummary").textContent=`${sum.sourceCount} kilder · ${sum.viewerCount} fra visning · ${sum.localCount} lokale · ${sum.ifcCount} IFC + ${sum.trbCount} TRB`;}
function eventName(d){const e=d?.event;return typeof e==="string"?e:String(e?.type||e?.name||e?.event||e?.action||"");}function relevant(d){if(d?.data?.origin?.isSelf||d?.origin?.isSelf)return false;return["modelstatechanged","modelreset"].includes(eventName(d).replace(/[^a-z0-9]/gi,"").toLowerCase());}function schedule(reason){clearTimeout(refresh.timer);refresh.timer=setTimeout(()=>{refresh.timer=null;discover({reason});},DEBOUNCE_MS);}function signature(models,ids){return[...Array.from(ids).map(x=>`v:${x}`),...models.map(m=>`${m.modelId||m.id||m.fileId||m.versionId}:${m.name||m.fileName||m.displayName||""}`)].sort().join("|");}
async function discover({reason="manual",force=false}={}){const api=getAPI();if(!api?.viewer)return;if(refresh.inProgress){refresh.pending=true;return;}refresh.inProgress=true;refresh.pending=false;try{if(reason==="manual"||reason==="startup")setStatus("Henter synlige modeller...");const groups=await api.viewer.getObjects({}, {visible:true}),ids=new Set((groups||[]).filter(g=>g.modelId&&g.objects?.length).map(g=>String(g.modelId)));let all=typeof api.viewer.getModels==="function"?await api.viewer.getModels():typeof api.viewer.getModelFiles==="function"?await api.viewer.getModelFiles():[];if(!Array.isArray(all))all=[];const models=all.filter(m=>[m.modelId,m.id,m.fileId,m.versionId].filter(x=>x!=null).map(String).some(x=>ids.has(x))),sig=signature(models,ids);if(!force&&sig===refresh.lastSignature)return;refresh.lastSignature=sig;R.syncViewerModels(models);renderSources();const sum=R.summary();log("SYNLIGE MODELLER - OPPDATERT",{reason,visibleObjectGroupCount:ids.size,visibleModelCount:models.length,models:models.map(m=>({id:m.modelId||m.id||m.fileId||m.versionId,name:m.name||m.fileName||m.displayName}))});setStatus(`${sum.viewerCount} synlige IFC/TRB-modeller funnet`);if(reason==="startup"&&ids.size&&models.length===0&&!refresh.retried){refresh.retried=true;setTimeout(()=>discover({reason:"startup-retry",force:true}),1200);}}catch(e){console.error("FEIL VED MODELLHENTING",e);if(reason==="manual"||reason==="startup")setStatus("Kunne ikke hente synlige modeller");}finally{refresh.inProgress=false;if(refresh.pending){refresh.pending=false;schedule("pending");}}}
async function localFiles(e){
    const files=e.target.files;
    if(!files?.length)return;
    setStatus(`Åpner ${files.length} lokal(e) geometrifil(er)...`);
    await R.addLocalFiles(files,renderSources);
    renderSources();
    const errors=R.summary().sources.filter(source=>source.status==="error");
    if(errors.length){
        console.error("GEOMETRIKILDER MED FEIL:",errors);
        setStatus(`${errors.length} geometrikilde(r) feilet - se Console`);
    }else{
        const ready=R.summary().readyCount;
        setStatus(`${ready} geometrikilde(r) klare`);
    }
    e.target.value="";
}const norm=v=>{const n=Math.hypot(v.x,v.y,v.z);return n?{x:v.x/n,y:v.y/n,z:v.z/n}:{x:0,y:0,z:0};};function stationOf(o){for(const p of o.properties||[]){const v=(p.properties||[]).find(x=>x.name==="Station");if(p.name==="Pset_Stationing"&&Number.isFinite(+v?.value))return+v.value/1000;}return Number(o.product?.name);}function evaluate(st){const p=S.points;if(p.length<2)return null;let a=p[0],b=p[1];for(let i=0;i<p.length-1;i++)if(st>=p[i].station&&st<=p[i+1].station){a=p[i];b=p[i+1];break;}if(st>=p.at(-1).station){a=p.at(-2);b=p.at(-1);}const r=Math.max(0,Math.min(1,(st-a.station)/(b.station-a.station))),position={x:a.x+(b.x-a.x)*r,y:a.y+(b.y-a.y)*r,z:a.z+(b.z-a.z)*r},h=norm({x:b.x-a.x,y:b.y-a.y,z:0});return{station:st,position,horizontalTangent:h,horizontalNormal:{x:-h.y,y:h.x,z:0}};}async function mark(f){const api=getAPI();if(S.marker)try{await api.viewer.removeIcon(S.marker);}catch{}const icon={id:930170,position:{x:f.position.x,y:f.position.y,z:f.position.z+.2},iconPath:markerUrl,size:30};await api.viewer.addIcon(icon);S.marker=icon;}function setStation(v){const sl=$("stationSlider"),st=Math.max(+sl.min,Math.min(+sl.max,+v));S.station=st;$("stationInput").value=st.toFixed(3);sl.value=st;$("stationLabel").textContent=st.toFixed(3);S.frame=evaluate(st);if(S.frame)mark(S.frame);}
async function selectProfile(){try{const api=getAPI(),m=(await api.viewer.getSelection())?.[0];if(!m)throw Error("Ingen profileringslinje valgt");const obj=(await api.viewer.getObjectProperties(m.modelId,m.objectRuntimeIds))[0];if(String(obj.class).toUpperCase()!=="IFCALIGNMENT")throw Error("Valgt objekt er ikke IFCALIGNMENT");S.selected=obj;$("profileName").value=obj.product?.name||"Ukjent";$("profileId").textContent=m.objectRuntimeIds[0];const children=await api.viewer.getHierarchyChildren(m.modelId,m.objectRuntimeIds,undefined,true),props=await api.viewer.getObjectProperties(m.modelId,children.map(x=>+x.id));S.points=props.filter(o=>o.class==="IFCREFERENT"&&o.product?.objectType==="STATION").map(o=>({station:stationOf(o),x:+o.position.x,y:+o.position.y,z:+o.position.z})).filter(p=>Object.values(p).every(Number.isFinite)).sort((a,b)=>a.station-b.station);const first=S.points[0].station,last=S.points.at(-1).station;$("profileLength").textContent=(last-first).toFixed(3)+" m";$("stationSlider").min=first;$("stationSlider").max=last;$("stationInput").min=first;$("stationInput").max=last;setStation(first);setStatus("Profil valgt");}catch(e){alert(e.message);}}
async function candidates(api,frame,sectionWidth){
    const groups=await api.viewer.getObjects({}, {visible:true});
    const candidatesByModel=[];
    let totalObjects=0;
    let candidateCount=0;

    for(const group of groups){
        const runtimeIds=(group.objects||[]).map(object=>Number(object.id)).filter(Number.isFinite);
        totalObjects+=runtimeIds.length;
        const modelCandidates=[];

        for(let index=0;index<runtimeIds.length;index+=300){
            const batch=runtimeIds.slice(index,index+300);
            const boxes=await api.viewer.getObjectBoundingBoxes(group.modelId,batch);

            for(const item of boxes||[]){
                const box=item.boundingBox;
                if(!box)continue;
                const values=[];
                for(const x of[box.min.x,box.max.x]){
                    for(const y of[box.min.y,box.max.y]){
                        for(const z of[box.min.z,box.max.z]){
                            const dx=x-frame.position.x;
                            const dy=y-frame.position.y;
                            values.push({
                                offset:dx*frame.horizontalNormal.x+dy*frame.horizontalNormal.y,
                                longitudinal:dx*frame.horizontalTangent.x+dy*frame.horizontalTangent.y,
                                elevation:z
                            });
                        }
                    }
                }
                const minimum=key=>Math.min(...values.map(value=>value[key]));
                const maximum=key=>Math.max(...values.map(value=>value[key]));
                if(
                    minimum("longitudinal")<=1&&maximum("longitudinal")>=-1&&
                    minimum("offset")<=sectionWidth/2&&maximum("offset")>=-sectionWidth/2&&
                    minimum("elevation")<=frame.position.z+12&&maximum("elevation")>=frame.position.z-8
                ){
                    modelCandidates.push(Number(item.id));
                    candidateCount+=1;
                }
            }
        }

        if(modelCandidates.length){
            let externalIds=[];
            try{
                externalIds=await api.viewer.convertToObjectIds(group.modelId,modelCandidates);
            }catch(error){
                console.warn("Kunne ikke konvertere RuntimeIds til eksterne ID-er:",group.modelId,error);
            }
            candidatesByModel.push({
                modelId:String(group.modelId),
                runtimeIds:modelCandidates,
                externalIds:(externalIds||[]).map(String)
            });
        }
    }

    return{totalObjects,candidateCount,candidatesByModel};
}
async function generate(){
    if(!S.frame)return alert("Velg profileringslinje først");
    const api=getAPI();
    const frame=S.frame;
    const sectionWidth=Number($("sectionWidth").value)||50;

    try{
        setStatus("Oppretter snittplan og finner kandidater...");
        if(S.planeIds.length)await api.viewer.removeSectionPlanes(S.planeIds);
        const planes=await api.viewer.addSectionPlane({
            positionX:frame.position.x*1000,
            positionY:frame.position.y*1000,
            positionZ:frame.position.z*1000,
            directionX:-frame.horizontalTangent.x,
            directionY:-frame.horizontalTangent.y,
            directionZ:0,
            controlsVisible:true
        });
        S.planeIds=(planes||[]).map(plane=>Number(plane.id)).filter(Number.isFinite);

        const svg=$("profileSvg");
        const profileData={
            station:frame.station,
            alignmentName:S.selected.product?.name,
            centerElevation:frame.position.z,
            sectionWidth,
            version:VERSION
        };
        renderProfileShell(svg,profileData);

        const candidateResult=await candidates(api,frame,sectionWidth);
        const readyIfcProviders=R.providers.filter(provider=>
            provider.type==="ifc"&&provider.status==="ready"&&provider.file
        );
        const meshes=[];
        let linkedCandidateCount=0;

        for(const provider of readyIfcProviders){
            const viewerGroup=candidateResult.candidatesByModel.find(group=>
                String(group.modelId)===String(provider.modelId)
            );
            const externalIds=viewerGroup?.externalIds||[];
            const providerMeshes=externalIds.length
                ? provider.getMeshesForGlobalIds(externalIds)
                : provider.getAllMeshes();
            if(externalIds.length){
                linkedCandidateCount+=externalIds.filter(id=>provider.globalIdIndex.has(id)).length;
            }
            meshes.push(...providerMeshes);
        }

        const sectionResult=intersectMeshes(meshes,frame,{sectionWidth});
        renderSectionSegments(svg,sectionResult.segments,profileData);

        const diagnostics={
            ...candidateResult,
            ...R.summary(),
            ifcProvidersReady:readyIfcProviders.length,
            linkedCandidateCount,
            meshesProcessed:sectionResult.meshesProcessed,
            trianglesTested:sectionResult.trianglesTested,
            segmentCount:sectionResult.segments.length,
            objectsDrawn:sectionResult.objectsDrawn
        };
        renderGeometryDiagnostic(svg,diagnostics);
        console.log("===== IFC-SNITTRESULTAT =====");
        console.dir(diagnostics);
        setStatus(
            sectionResult.segments.length
                ? `${sectionResult.objectsDrawn} objekter tegnet, ${sectionResult.segments.length} segmenter`
                : readyIfcProviders.length
                    ? "Ingen IFC-geometri traff snittplanet - se Console"
                    : "Koble en lokal IFC-fil under Avansert for å tegne profilgeometri"
        );
    }catch(error){
        console.error("FEIL VED GENERERING AV IFC-SNITT:",error);
        setStatus("Feil ved generering - se Console");
        alert(error.message||String(error));
    }
}
function bind(){$("btnRefreshModels").onclick=()=>discover({reason:"manual",force:true});$("geometryFiles").onchange=localFiles;$("btnClearLocal").onclick=()=>{R.clearLocal();renderSources();};$("btnSelectProfile").onclick=selectProfile;$("btnGenerate").onclick=generate;$("minus10").onclick=()=>setStation(S.station-10);$("minus1").onclick=()=>setStation(S.station-1);$("plus1").onclick=()=>setStation(S.station+1);$("plus10").onclick=()=>setStation(S.station+10);$("stationSlider").oninput=e=>setStation(e.target.value);$("stationInput").onchange=e=>setStation(e.target.value);}async function init(){$("versionInfo").textContent="v"+VERSION;$("buildInfo").textContent=BUILD_DATE;bind();renderSources();await connectTC();await discover({reason:"startup",force:true});window.addEventListener("tc-workspace-event",e=>{if(relevant(e.detail))schedule(eventName(e.detail));});console.log(APP_NAME,VERSION);}init();
