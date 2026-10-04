import { transformPoint } from "./mesh-normalizer.js";

export const SECTION_ENGINE_VERSION = "0.5.4h-viewer-ifc-calibration";
const EPSILON = 1e-7;
const calibrationLocks = new Map();
const AXIS_MAPPINGS = [
    { name: "XYZ", axes: [0,1,2], signs: [1,1,1] },
    { name: "X-Y-Z", axes: [0,1,2], signs: [1,-1,-1] },
    { name: "-XY-Z", axes: [0,1,2], signs: [-1,1,-1] },
    { name: "-X-YZ", axes: [0,1,2], signs: [-1,-1,1] },
    { name: "XZY", axes: [0,2,1], signs: [1,1,-1] },
    { name: "XZ-Y", axes: [0,2,1], signs: [1,-1,1] },
    { name: "-XZY", axes: [0,2,1], signs: [-1,1,1] },
    { name: "-XZ-Y", axes: [0,2,1], signs: [-1,-1,-1] },
    { name: "YXZ", axes: [1,0,2], signs: [1,1,-1] },
    { name: "YX-Z", axes: [1,0,2], signs: [1,-1,1] },
    { name: "Y-XZ", axes: [1,0,2], signs: [-1,1,1] },
    { name: "Y-X-Z", axes: [1,0,2], signs: [-1,-1,-1] },
    { name: "YZX", axes: [1,2,0], signs: [1,1,1] },
    { name: "YZ-X", axes: [1,2,0], signs: [1,-1,-1] },
    { name: "-YZX", axes: [1,2,0], signs: [-1,1,-1] },
    { name: "-YZ-X", axes: [1,2,0], signs: [-1,-1,1] },
    { name: "ZXY", axes: [2,0,1], signs: [1,1,1] },
    { name: "ZX-Y", axes: [2,0,1], signs: [1,-1,-1] },
    { name: "Z-XY", axes: [2,0,1], signs: [-1,1,-1] },
    { name: "Z-X-Y", axes: [2,0,1], signs: [-1,-1,1] },
    { name: "ZYX", axes: [2,1,0], signs: [1,1,-1] },
    { name: "ZY-X", axes: [2,1,0], signs: [1,-1,1] },
    { name: "Z-YX", axes: [2,1,0], signs: [-1,1,1] },
    { name: "Z-Y-X", axes: [2,1,0], signs: [-1,-1,-1] }
];
function groupBySource(meshes) {
    const groups = new Map();
    for (const mesh of meshes || []) {
        const key = String(mesh?.sourceId || "ukjent-modell");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(mesh);
    }
    return groups;
}
function mapArray(values, mapping) {
    return mapping.axes.map((sourceAxis, targetAxis) => values[sourceAxis] * mapping.signs[targetAxis]);
}
function mapWorldPoint(point, lock) {
    const mapped = mapArray([point.x, point.y, point.z], lock.mapping);
    return { x: mapped[0] + lock.translation.x, y: mapped[1] + lock.translation.y, z: mapped[2] + lock.translation.z };
}
function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a,b) => a-b);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle-1] + sorted[middle]) / 2;
}
function boxData(box) {
    if (!box?.min || !box?.max) return null;
    const min = [+box.min.x,+box.min.y,+box.min.z], max = [+box.max.x,+box.max.y,+box.max.z];
    return { min, max, center: min.map((v,i)=>(v+max[i])/2), size: min.map((v,i)=>max[i]-v) };
}
function meshBounds(meshes) {
    const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
    let count=0;
    for (const mesh of meshes || []) {
        for (let index=0; index+2<mesh.positions.length; index+=3) {
            const p=transformPoint(mesh.transform,mesh.positions[index],mesh.positions[index+1],mesh.positions[index+2]);
            const values=[p.x,p.y,p.z];
            for(let axis=0;axis<3;axis+=1){min[axis]=Math.min(min[axis],values[axis]);max[axis]=Math.max(max[axis],values[axis]);}
            count+=1;
        }
    }
    if(!count)return null;
    return {min,max,center:min.map((v,i)=>(v+max[i])/2),size:min.map((v,i)=>max[i]-v),pointCount:count};
}
function centerDistance(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);}
function relativeSizeError(a,b){
    let sum=0;
    for(let i=0;i<3;i+=1){const denominator=Math.max(0.05,Math.abs(b[i]));sum+=Math.abs(a[i]-b[i])/denominator;}
    return sum/3;
}
function prepareMatches(meshes, calibration) {
    const byGuid=new Map();
    for(const mesh of meshes){
        const key=String(mesh.globalId||"");
        if(!key)continue;
        if(!byGuid.has(key))byGuid.set(key,[]);
        byGuid.get(key).push(mesh);
    }
    const matches=[];
    for(const pair of calibration?.pairs||[]){
        const guid=String(pair.globalId||"");
        const sourceBounds=meshBounds(byGuid.get(guid)||[]);
        const viewerBounds=boxData(pair.viewerBox);
        if(sourceBounds&&viewerBounds)matches.push({globalId:guid,runtimeId:pair.runtimeId,sourceBounds,viewerBounds});
    }
    return matches;
}
function evaluateMapping(mapping,matches){
    const preliminary=matches.map(match=>{
        const mappedCenter=mapArray(match.sourceBounds.center,mapping);
        const mappedSize=mapping.axes.map(axis=>match.sourceBounds.size[axis]);
        return {match,mappedCenter,mappedSize,translation:match.viewerBounds.center.map((v,i)=>v-mappedCenter[i])};
    });
    const translation=[0,1,2].map(axis=>median(preliminary.map(item=>item.translation[axis])));
    const residuals=preliminary.map(item=>centerDistance(item.mappedCenter.map((v,i)=>v+translation[i]),item.match.viewerBounds.center));
    const sizeErrors=preliminary.map(item=>relativeSizeError(item.mappedSize,item.match.viewerBounds.size));
    const centerRms=Math.sqrt(residuals.reduce((sum,value)=>sum+value*value,0)/Math.max(1,residuals.length));
    const medianResidual=median(residuals);
    const meanSizeError=sizeErrors.reduce((sum,value)=>sum+value,0)/Math.max(1,sizeErrors.length);
    const score=centerRms + medianResidual + meanSizeError*10;
    return {mapping,translation:{x:translation[0],y:translation[1],z:translation[2]},pairCount:matches.length,centerRms,medianCenterResidual:medianResidual,meanRelativeSizeError:meanSizeError,score,residuals};
}
function calibrate(sourceId,meshes,calibration){
    const matches=prepareMatches(meshes,calibration);
    if(matches.length<2)return {lock:null,diagnostic:{sourceId,status:"insufficient-pairs",pairCount:matches.length,requiredPairCount:2,message:"Minst to sammenfallende GlobalId-bounding boxes kreves."}};
    const evaluated=AXIS_MAPPINGS.map(mapping=>evaluateMapping(mapping,matches)).sort((a,b)=>a.score-b.score);
    const best=evaluated[0];
    const lock={sourceId,mapping:best.mapping,translation:best.translation,pairCount:best.pairCount,centerRms:best.centerRms,meanRelativeSizeError:best.meanRelativeSizeError};
    calibrationLocks.set(sourceId,lock);
    return {lock,diagnostic:{sourceId,status:"calibrated",selectedMapping:best.mapping.name,translation:best.translation,pairCount:best.pairCount,centerRms:best.centerRms,medianCenterResidual:best.medianCenterResidual,meanRelativeSizeError:best.meanRelativeSizeError,candidates:evaluated.slice(0,8).map(item=>({mapping:item.mapping.name,score:item.score,centerRms:item.centerRms,medianCenterResidual:item.medianCenterResidual,meanRelativeSizeError:item.meanRelativeSizeError}))}};
}
function distanceToPlane(point,plane){return(point.x-plane.origin.x)*plane.normal.x+(point.y-plane.origin.y)*plane.normal.y+(point.z-plane.origin.z)*plane.normal.z;}
function interpolate(a,b,da,db){const d=da-db,t=Math.abs(d)<EPSILON?0:da/d;return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};}
function triangleIntersection(a,b,c,plane){
    const points=[a,b,c],distances=points.map(point=>distanceToPlane(point,plane)),hits=[];
    for(let edge=0;edge<3;edge+=1){const next=(edge+1)%3,d1=distances[edge],d2=distances[next];if(Math.abs(d1)<=EPSILON)hits.push(points[edge]);if((d1<-EPSILON&&d2>EPSILON)||(d1>EPSILON&&d2<-EPSILON))hits.push(interpolate(points[edge],points[next],d1,d2));}
    const unique=[];for(const point of hits)if(!unique.some(existing=>Math.abs(existing.x-point.x)<EPSILON&&Math.abs(existing.y-point.y)<EPSILON&&Math.abs(existing.z-point.z)<EPSILON))unique.push(point);
    return unique.length>=2?[unique[0],unique[1]]:null;
}
function toProfilePoint(point, frame) {
    const dx = point.x - frame.position.x;
    const dy = point.y - frame.position.y;

    return {
        offset: -(
            dx * frame.horizontalNormal.x +
            dy * frame.horizontalNormal.y
        ),

        elevation: point.z
    };
}
function segmentMetrics(segments){
    if(!segments.length)return{horizontalSpan:0,verticalSpan:0,totalLength:0,longestSegment:0,horizontalRatio:0,verticalRatio:0};
    const offsets=[],elevations=[];let totalLength=0,longestSegment=0,horizontalLength=0,verticalLength=0;
    for(const segment of segments){const dx=segment.end.offset-segment.start.offset,dz=segment.end.elevation-segment.start.elevation,length=Math.hypot(dx,dz),angle=Math.atan2(Math.abs(dz),Math.abs(dx||EPSILON))*180/Math.PI;totalLength+=length;longestSegment=Math.max(longestSegment,length);if(angle<=15)horizontalLength+=length;if(angle>=75)verticalLength+=length;offsets.push(segment.start.offset,segment.end.offset);elevations.push(segment.start.elevation,segment.end.elevation);}
    return{horizontalSpan:Math.max(...offsets)-Math.min(...offsets),verticalSpan:Math.max(...elevations)-Math.min(...elevations),totalLength,longestSegment,horizontalRatio:totalLength?horizontalLength/totalLength:0,verticalRatio:totalLength?verticalLength/totalLength:0};
}
function intersectModel(meshes,frame,options,lock){
    const halfWidth=(options.sectionWidth||50)/2,minimumLength=options.minimumSegmentLength||0.001,plane={origin:frame.position,normal:frame.horizontalTangent},segments=[];
    let trianglesTested=0,minimumAbsolutePlaneDistance=Infinity;
    for(const mesh of meshes){
        if(!mesh.positions||!mesh.indices||mesh.indices.length<3)continue;
        for(let index=0;index+2<mesh.indices.length;index+=3){
            trianglesTested+=1;
            const points=[mesh.indices[index],mesh.indices[index+1],mesh.indices[index+2]].map(vertexIndex=>{const offset=vertexIndex*3;const raw=transformPoint(mesh.transform,mesh.positions[offset],mesh.positions[offset+1],mesh.positions[offset+2]);return mapWorldPoint(raw,lock);});
            for(const point of points)minimumAbsolutePlaneDistance=Math.min(minimumAbsolutePlaneDistance,Math.abs(distanceToPlane(point,plane)));
            const hit=triangleIntersection(points[0],points[1],points[2],plane);if(!hit)continue;
            const start=toProfilePoint(hit[0],frame),end=toProfilePoint(hit[1],frame);
            if(Math.abs(start.offset)>halfWidth&&Math.abs(end.offset)>halfWidth)continue;
            if(Math.hypot(end.offset-start.offset,end.elevation-start.elevation)<minimumLength)continue;
            segments.push({sourceId:mesh.sourceId,entityId:mesh.entityId,globalId:mesh.globalId,className:mesh.className,name:mesh.name,color:mesh.color,start,end});
        }
    }
    const metrics=segmentMetrics(segments);
    return{segments,trianglesTested,minimumAbsolutePlaneDistance:Number.isFinite(minimumAbsolutePlaneDistance)?minimumAbsolutePlaneDistance:null,objectsDrawn:new Set(segments.map(segment=>`${segment.sourceId}:${segment.entityId}`)).size,...metrics};
}
function diagnoseProfileType(segments,sectionWidth){
    if(!segments.length)return{classification:"ingen-geometri",confidence:1,metrics:{}};
    const metrics=segmentMetrics(segments),objects=new Set(),offsets=[];for(const segment of segments){objects.add(`${segment.sourceId}:${segment.entityId}`);offsets.push(segment.start.offset,segment.end.offset);}
    const bilateral=Math.min(...offsets)<-0.25&&Math.max(...offsets)>0.25,widthOccupancy=metrics.horizontalSpan/Math.max(1,sectionWidth||50),aspectRatio=metrics.verticalSpan/Math.max(0.01,metrics.horizontalSpan);
    let crossScore=0,longitudinalScore=0;const indicators=[];
    if(bilateral){crossScore+=2;indicators.push("Geometri på begge sider av referanselinjen.");}else{longitudinalScore+=1;indicators.push("Geometri hovedsakelig på én side.");}
    if(objects.size>=3)crossScore+=2;else longitudinalScore+=1;
    if(widthOccupancy>=0.15&&widthOccupancy<=0.8)crossScore+=2;
    if(widthOccupancy>0.9)longitudinalScore+=3;
    if(metrics.horizontalRatio>0.75&&metrics.verticalSpan<Math.max(2,metrics.horizontalSpan*0.2))longitudinalScore+=3;
    if(aspectRatio>3){longitudinalScore+=5;indicators.push("Vertikal utstrekning er urimelig stor i forhold til profilbredden.");}
    const difference=crossScore-longitudinalScore;
    return{classification:difference>=3?"sannsynlig-tverrprofil":difference<=-3?"sannsynlig-feiltransformert-eller-lengdeprofil":"uavklart",confidence:Math.min(1,Math.abs(difference)/Math.max(5,crossScore+longitudinalScore)),crossScore,longitudinalScore,indicators,metrics:{segmentCount:segments.length,objectCount:objects.size,horizontalSpan:metrics.horizontalSpan,verticalSpan:metrics.verticalSpan,widthOccupancy,aspectRatio,horizontalLengthRatio:metrics.horizontalRatio,verticalLengthRatio:metrics.verticalRatio,bilateral}};
}
export function clearCalibrationLocks(sourceId=null){if(sourceId===null)calibrationLocks.clear();else calibrationLocks.delete(String(sourceId));}
export function intersectMeshes(meshes,frame,options={}){
    const groups=groupBySource(meshes),allSegments=[],modelDiagnostics=[];let trianglesTested=0,firstMapping=null;
    const calibrations=new Map((options.calibrations||[]).map(item=>[String(item.sourceId),item]));
    for(const[sourceId,sourceMeshes]of groups){
        let lock=calibrationLocks.get(sourceId),calibrationDiagnostic=null,lockCreated=false;
        if(!lock){const calibrated=calibrate(sourceId,sourceMeshes,calibrations.get(sourceId));lock=calibrated.lock;calibrationDiagnostic=calibrated.diagnostic;lockCreated=Boolean(lock);}
        else calibrationDiagnostic={sourceId,status:"reused",selectedMapping:lock.mapping.name,translation:lock.translation,pairCount:lock.pairCount,centerRms:lock.centerRms,meanRelativeSizeError:lock.meanRelativeSizeError};
        if(!lock){modelDiagnostics.push(calibrationDiagnostic);continue;}
        const result=intersectModel(sourceMeshes,frame,options,lock);allSegments.push(...result.segments);trianglesTested+=result.trianglesTested;if(!firstMapping)firstMapping=lock.mapping.name;
        modelDiagnostics.push({...calibrationDiagnostic,lockCreated,currentStation:frame.station,meshCount:sourceMeshes.length,segmentCount:result.segments.length,objectsDrawn:result.objectsDrawn,horizontalSpan:result.horizontalSpan,verticalSpan:result.verticalSpan,minimumAbsolutePlaneDistance:result.minimumAbsolutePlaneDistance});
    }
    const profileTypeDiagnostic=diagnoseProfileType(allSegments,options.sectionWidth||50);
    const calibrationDiagnostic={lockCount:calibrationLocks.size,models:modelDiagnostics,rule:"Aksekartlegging og translasjon bestemmes ved samsvar mellom Viewer- og IFC-bounding boxes for samme GlobalId."};
    console.log("===== VIEWER–IFC-KALIBRERING =====");console.dir(calibrationDiagnostic);
    console.log("===== TVERRPROFIL ELLER LENGDEPROFIL =====");console.dir(profileTypeDiagnostic);
    return{segments:allSegments,trianglesTested,meshesProcessed:meshes.length,objectsDrawn:new Set(allSegments.map(segment=>`${segment.sourceId}:${segment.entityId}`)).size,selectedAxisMapping:firstMapping,profileTypeDiagnostic,calibrationDiagnostic};
}
