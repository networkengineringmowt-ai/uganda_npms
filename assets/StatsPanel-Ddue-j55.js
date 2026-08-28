import{j as e}from"./index-CoVX1Pd1.js";import{r as a}from"./vendor-recharts-DPon-GFW.js";import{C as p}from"./chart-column-CLcWKpYi.js";import{c as n}from"./log-out-DdLrOQFr.js";/**
 * @license lucide-react v0.469.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const g=n("ChevronDown",[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]]);/**
 * @license lucide-react v0.469.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const b=n("ChevronUp",[["path",{d:"m18 15-6-6-6 6",key:"153udz"}]]);/**
 * @license lucide-react v0.469.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u=n("TrendingUp",[["polyline",{points:"22 7 13.5 15.5 8.5 10.5 2 17",key:"126l90"}],["polyline",{points:"16 7 22 7 22 13",key:"kwv8wd"}]]);function j({title:d,descriptive:l,inferential:i,defaultOpen:c=!0}){const[s,x]=a.useState(c),[r,o]=a.useState("descriptive"),t=!!i;return e.jsxs("div",{style:{marginTop:10,border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,overflow:"hidden"},children:[e.jsxs("button",{onClick:()=>x(f=>!f),style:{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 10px",background:"rgba(255,255,255,0.03)",border:"none",cursor:"pointer",color:"#cbd5e1",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:.4},children:[e.jsxs("span",{style:{display:"flex",alignItems:"center",gap:6},children:[e.jsx(p,{size:13,style:{color:"#4d9fff"}}),d," — Statistics"]}),s?e.jsx(b,{size:14}):e.jsx(g,{size:14})]}),s&&e.jsxs("div",{style:{padding:"8px 10px 10px"},children:[t&&e.jsxs("div",{style:{display:"flex",gap:6,marginBottom:6},children:[e.jsxs("button",{onClick:()=>o("descriptive"),style:{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:999,border:`1px solid ${r==="descriptive"?"rgba(77,159,255,0.5)":"rgba(255,255,255,0.1)"}`,background:r==="descriptive"?"rgba(77,159,255,0.15)":"transparent",color:r==="descriptive"?"#4d9fff":"#94a3b8",cursor:"pointer",display:"flex",alignItems:"center",gap:4},children:[e.jsx(p,{size:11})," Descriptive"]}),e.jsxs("button",{onClick:()=>o("inferential"),style:{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:999,border:`1px solid ${r==="inferential"?"rgba(185,166,255,0.5)":"rgba(255,255,255,0.1)"}`,background:r==="inferential"?"rgba(185,166,255,0.15)":"transparent",color:r==="inferential"?"#b9a6ff":"#94a3b8",cursor:"pointer",display:"flex",alignItems:"center",gap:4},children:[e.jsx(u,{size:11})," Inferential"]})]}),(!t||r==="descriptive")&&l,t&&r==="inferential"&&i]})]})}export{j as S,u as T};
