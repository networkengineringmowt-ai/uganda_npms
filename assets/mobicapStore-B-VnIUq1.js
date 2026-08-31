import{c as u}from"./log-out-DdLrOQFr.js";/**
 * @license lucide-react v0.469.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=u("CircleCheck",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]]);/**
 * @license lucide-react v0.469.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const m=u("X",[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]]),l="NPMS_MOBICAP",c="surveys",p=1;function i(){return new Promise((r,e)=>{const t=indexedDB.open(l,p);t.onupgradeneeded=()=>{const a=t.result;if(!a.objectStoreNames.contains(c)){const o=a.createObjectStore(c,{keyPath:"id"});o.createIndex("status","status"),o.createIndex("updatedAt","updatedAt")}},t.onsuccess=()=>r(t.result),t.onerror=()=>e(t.error)})}async function d(r,e){const t=await i();return new Promise((a,o)=>{const s=t.transaction(c,r),n=e(s.objectStore(c));n.onsuccess=()=>a(n.result),n.onerror=()=>o(n.error),s.oncomplete=()=>t.close(),s.onerror=()=>o(s.error)})}const S=async()=>(await d("readonly",e=>e.getAll())).sort((e,t)=>t.updatedAt.localeCompare(e.updatedAt)),b=async r=>{const e={...r,updatedAt:new Date().toISOString()};return await d("readwrite",t=>t.put(e)),e},A=async r=>{await d("readwrite",e=>e.delete(r))},k=async r=>{const e=await i();await new Promise((t,a)=>{const o=e.transaction(c,"readwrite"),s=o.objectStore(c);s.clear(),r.forEach(n=>s.put(n)),o.oncomplete=()=>{e.close(),t()},o.onerror=()=>a(o.error)})};export{w as C,m as X,A as d,S as l,k as r,b as s};
