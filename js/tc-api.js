let API=null;
export async function connectTC(){if(API)return API;if(!window.TrimbleConnectWorkspace)throw new Error("Trimble Connect Workspace API er ikke lastet.");API=await window.TrimbleConnectWorkspace.connect(window.parent,(event,data)=>window.dispatchEvent(new CustomEvent("tc-workspace-event",{detail:{event,data}})));return API;}
export function getAPI(){return API;}
export function setStatus(text){const el=document.getElementById("status");if(el)el.textContent=text;}
