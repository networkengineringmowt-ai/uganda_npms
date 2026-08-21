const n=new Map;function o(r){let t=r;return n.has(t)||n.set(t,fetch(t).then(e=>{if(!e.ok)throw new Error(`HTTP ${e.status}`);return e.json()})),n.get(t)}export{o as f};
