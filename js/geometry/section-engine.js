import { transformPoint } from "./mesh-normalizer.js";

export const SECTION_ENGINE_VERSION = "0.5.4g-locked-per-model";
const EPSILON = 1e-7;
const transformLocks = new Map();

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

function modelKey(mesh) {
    return String(mesh?.sourceId || "ukjent-modell");
}

function groupByModel(meshes) {
    const groups = new Map();
    for (const mesh of meshes || []) {
        const key = modelKey(mesh);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(mesh);
    }
    return groups;
}

function collectBounds(meshes) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let pointCount = 0;
    for (const mesh of meshes || []) {
        for (let index = 0; index + 2 < mesh.positions.length; index += 3) {
            const point = transformPoint(mesh.transform, mesh.positions[index], mesh.positions[index + 1], mesh.positions[index + 2]);
            const values = [point.x, point.y, point.z];
            for (let axis = 0; axis < 3; axis += 1) {
                min[axis] = Math.min(min[axis], values[axis]);
                max[axis] = Math.max(max[axis], values[axis]);
            }
            pointCount += 1;
        }
    }
    if (!pointCount) return null;
    return {
        min,
        max,
        center: min.map((value, axis) => (value + max[axis]) / 2),
        size: min.map((value, axis) => max[axis] - value),
        pointCount
    };
}

function mapPoint(point, lock) {
    const source = [point.x, point.y, point.z];
    const mapped = lock.mapping.axes.map((sourceAxis, targetAxis) =>
        (source[sourceAxis] - lock.sourceCenter[sourceAxis]) * lock.mapping.signs[targetAxis]
    );
    return {
        x: lock.targetOrigin.x + mapped[0],
        y: lock.targetOrigin.y + mapped[1],
        z: lock.targetOrigin.z + mapped[2]
    };
}

function distanceToPlane(point, plane) {
    return (point.x-plane.origin.x)*plane.normal.x + (point.y-plane.origin.y)*plane.normal.y + (point.z-plane.origin.z)*plane.normal.z;
}

function interpolate(a, b, da, db) {
    const denominator = da - db;
    const ratio = Math.abs(denominator) < EPSILON ? 0 : da / denominator;
    return { x:a.x+(b.x-a.x)*ratio, y:a.y+(b.y-a.y)*ratio, z:a.z+(b.z-a.z)*ratio };
}

function triangleIntersection(a, b, c, plane) {
    const points = [a,b,c];
    const distances = points.map(point => distanceToPlane(point, plane));
    const hits = [];
    for (let edge=0; edge<3; edge+=1) {
        const next=(edge+1)%3, d1=distances[edge], d2=distances[next];
        if (Math.abs(d1)<=EPSILON) hits.push(points[edge]);
        if ((d1 < -EPSILON && d2 > EPSILON) || (d1 > EPSILON && d2 < -EPSILON)) hits.push(interpolate(points[edge], points[next], d1, d2));
    }
    const unique=[];
    for (const point of hits) if (!unique.some(existing => Math.abs(existing.x-point.x)<EPSILON && Math.abs(existing.y-point.y)<EPSILON && Math.abs(existing.z-point.z)<EPSILON)) unique.push(point);
    return unique.length >= 2 ? [unique[0], unique[1]] : null;
}

function toProfilePoint(point, frame) {
    const dx=point.x-frame.position.x, dy=point.y-frame.position.y;
    return { offset:dx*frame.horizontalNormal.x+dy*frame.horizontalNormal.y, elevation:point.z };
}

function segmentMetrics(segments) {
    if (!segments.length) return { horizontalSpan:0, verticalSpan:0, totalLength:0, longestSegment:0, horizontalRatio:0, verticalRatio:0 };
    const offsets=[], elevations=[];
    let totalLength=0, longestSegment=0, horizontalLength=0, verticalLength=0;
    for (const segment of segments) {
        const dx=segment.end.offset-segment.start.offset, dz=segment.end.elevation-segment.start.elevation;
        const length=Math.hypot(dx,dz), angle=Math.atan2(Math.abs(dz),Math.abs(dx||EPSILON))*180/Math.PI;
        totalLength+=length; longestSegment=Math.max(longestSegment,length);
        if(angle<=15) horizontalLength+=length;
        if(angle>=75) verticalLength+=length;
        offsets.push(segment.start.offset,segment.end.offset); elevations.push(segment.start.elevation,segment.end.elevation);
    }
    return {
        horizontalSpan:Math.max(...offsets)-Math.min(...offsets),
        verticalSpan:Math.max(...elevations)-Math.min(...elevations),
        totalLength,
        longestSegment,
        horizontalRatio:totalLength?horizontalLength/totalLength:0,
        verticalRatio:totalLength?verticalLength/totalLength:0
    };
}

function intersectModel(meshes, frame, options, lock) {
    const halfWidth=(options.sectionWidth||50)/2, minimumLength=options.minimumSegmentLength||0.001;
    const plane={origin:frame.position,normal:frame.horizontalTangent};
    const segments=[];
    let trianglesTested=0, minimumAbsolutePlaneDistance=Infinity;
    for (const mesh of meshes) {
        const {positions,indices,transform}=mesh;
        if(!positions||!indices||indices.length<3) continue;
        for(let index=0;index+2<indices.length;index+=3){
            trianglesTested+=1;
            const points=[indices[index],indices[index+1],indices[index+2]].map(vertexIndex=>{
                const offset=vertexIndex*3;
                const world=transformPoint(transform,positions[offset],positions[offset+1],positions[offset+2]);
                return mapPoint(world,lock);
            });
            for(const point of points) minimumAbsolutePlaneDistance=Math.min(minimumAbsolutePlaneDistance,Math.abs(distanceToPlane(point,plane)));
            const hit=triangleIntersection(points[0],points[1],points[2],plane);
            if(!hit) continue;
            const start=toProfilePoint(hit[0],frame), end=toProfilePoint(hit[1],frame);
            if(Math.abs(start.offset)>halfWidth&&Math.abs(end.offset)>halfWidth) continue;
            if(Math.hypot(end.offset-start.offset,end.elevation-start.elevation)<minimumLength) continue;
            segments.push({sourceId:mesh.sourceId,entityId:mesh.entityId,globalId:mesh.globalId,className:mesh.className,name:mesh.name,color:mesh.color,start,end});
        }
    }
    const metrics=segmentMetrics(segments);
    return {
        segments,
        trianglesTested,
        minimumAbsolutePlaneDistance:Number.isFinite(minimumAbsolutePlaneDistance)?minimumAbsolutePlaneDistance:null,
        objectsDrawn:new Set(segments.map(segment=>`${segment.sourceId}:${segment.entityId}`)).size,
        ...metrics
    };
}

function scoreResult(result, sectionWidth) {
    const horizontalPreference=Math.min(result.horizontalSpan,sectionWidth||50);
    const verticalPenalty=Math.max(0,result.verticalSpan-20)*5;
    const narrowPenalty=result.horizontalSpan<1?1000:0;
    return result.segments.length*2+horizontalPreference*20-result.verticalSpan*3-verticalPenalty-narrowPenalty;
}

function createLock(modelId, meshes, frame, options) {
    const bounds=collectBounds(meshes);
    if(!bounds) return null;
    const candidates=AXIS_MAPPINGS.map(mapping=>{
        const lock={modelId,mapping,sourceCenter:[...bounds.center],targetOrigin:{...frame.position},lockedAtStation:frame.station};
        const result=intersectModel(meshes,frame,options,lock);
        return {mapping,score:scoreResult(result,options.sectionWidth),result};
    }).sort((a,b)=>b.score-a.score);
    const selected=candidates[0];
    const lock={
        modelId,
        mapping:selected.mapping,
        sourceCenter:[...bounds.center],
        targetOrigin:{...frame.position},
        lockedAtStation:frame.station,
        initialMeshCount:meshes.length,
        sourceBounds:bounds,
        initialScore:selected.score,
        initialHorizontalSpan:selected.result.horizontalSpan,
        initialVerticalSpan:selected.result.verticalSpan
    };
    transformLocks.set(modelId,lock);
    return {lock,candidates:candidates.map(candidate=>({mapping:candidate.mapping.name,score:candidate.score,segmentCount:candidate.result.segments.length,horizontalSpan:candidate.result.horizontalSpan,verticalSpan:candidate.result.verticalSpan}))};
}

function diagnoseProfileType(segments, sectionWidth) {
    if(!segments.length) return {classification:"ingen-geometri",confidence:1,metrics:{}};
    const metrics=segmentMetrics(segments), objects=new Set(), offsets=[];
    for(const segment of segments){objects.add(`${segment.sourceId}:${segment.entityId}`);offsets.push(segment.start.offset,segment.end.offset);}
    const bilateral=Math.min(...offsets)<-0.25&&Math.max(...offsets)>0.25;
    const widthOccupancy=metrics.horizontalSpan/Math.max(1,sectionWidth||50);
    let crossScore=0,longitudinalScore=0;
    const indicators=[];
    if(bilateral){crossScore+=2;indicators.push("Geometri på begge sider av referanselinjen.");}else{longitudinalScore+=1;indicators.push("Geometri hovedsakelig på én side.");}
    if(objects.size>=3){crossScore+=2;indicators.push("Flere IFC-objekter bidrar.");}else{longitudinalScore+=1;indicators.push("Få IFC-objekter bidrar.");}
    if(widthOccupancy>=0.15&&widthOccupancy<=0.8)crossScore+=2;
    if(widthOccupancy>0.9){longitudinalScore+=3;indicators.push("Geometrien fyller nesten hele snittbredden.");}
    if(metrics.horizontalRatio>0.75&&metrics.verticalSpan<Math.max(2,metrics.horizontalSpan*0.2)){longitudinalScore+=3;indicators.push("Lang, slak linjeføring dominerer.");}
    if(metrics.verticalRatio>0.35)crossScore+=1;
    if(metrics.totalLength&&metrics.longestSegment/metrics.totalLength>0.45)longitudinalScore+=2;
    const difference=crossScore-longitudinalScore;
    return {
        classification:difference>=3?"sannsynlig-tverrprofil":difference<=-3?"sannsynlig-lengdeprofil":"uavklart",
        confidence:Math.min(1,Math.abs(difference)/Math.max(5,crossScore+longitudinalScore)),
        crossScore,longitudinalScore,indicators,
        metrics:{segmentCount:segments.length,objectCount:objects.size,horizontalSpan:metrics.horizontalSpan,verticalSpan:metrics.verticalSpan,widthOccupancy,horizontalLengthRatio:metrics.horizontalRatio,verticalLengthRatio:metrics.verticalRatio,bilateral}
    };
}

export function clearLockedTransforms(modelId=null){
    if(modelId===null) transformLocks.clear(); else transformLocks.delete(String(modelId));
}

export function getLockedTransforms(){
    return Array.from(transformLocks.values()).map(lock=>({modelId:lock.modelId,mapping:lock.mapping.name,lockedAtStation:lock.lockedAtStation,sourceCenter:[...lock.sourceCenter],targetOrigin:{...lock.targetOrigin},initialMeshCount:lock.initialMeshCount}));
}

export function intersectMeshes(meshes, frame, options={}) {
    const groups=groupByModel(meshes), allSegments=[], modelDiagnostics=[];
    let trianglesTested=0, objectsDrawn=0, firstMapping=null;
    for(const [modelId,modelMeshes] of groups){
        let lock=transformLocks.get(modelId), calibration=null, lockCreated=false;
        if(!lock){calibration=createLock(modelId,modelMeshes,frame,options);lock=calibration?.lock;lockCreated=true;}
        if(!lock)continue;
        const result=intersectModel(modelMeshes,frame,options,lock);
        allSegments.push(...result.segments);trianglesTested+=result.trianglesTested;objectsDrawn+=result.objectsDrawn;
        if(!firstMapping)firstMapping=lock.mapping.name;
        modelDiagnostics.push({modelId,lockCreated,mapping:lock.mapping.name,lockedAtStation:lock.lockedAtStation,currentStation:frame.station,sourceCenter:[...lock.sourceCenter],targetOrigin:{...lock.targetOrigin},meshCount:modelMeshes.length,segmentCount:result.segments.length,objectsDrawn:result.objectsDrawn,horizontalSpan:result.horizontalSpan,verticalSpan:result.verticalSpan,minimumAbsolutePlaneDistance:result.minimumAbsolutePlaneDistance,calibrationCandidates:calibration?.candidates||null});
    }
    const profileTypeDiagnostic=diagnoseProfileType(allSegments,options.sectionWidth||50);
    const transformLockDiagnostic={lockCount:transformLocks.size,models:modelDiagnostics,rule:"Aksekartlegging, kildesenter og mål-origo velges én gang per sourceId og gjenbrukes ved alle senere stasjoner i samme økt."};
    console.log("===== LÅST TRANSFORMASJON PER MODELL =====");console.dir(transformLockDiagnostic);
    console.log("===== TVERRPROFIL ELLER LENGDEPROFIL =====");console.dir(profileTypeDiagnostic);
    return {segments:allSegments,trianglesTested,meshesProcessed:meshes.length,objectsDrawn:new Set(allSegments.map(segment=>`${segment.sourceId}:${segment.entityId}`)).size,selectedAxisMapping:firstMapping,profileTypeDiagnostic,transformLockDiagnostic};
}
