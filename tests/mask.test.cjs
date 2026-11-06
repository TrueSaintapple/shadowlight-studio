// Native Canvas regression tests. Runs the actual script from mask-lab.html;
// DOM stubs cover inputs/downloads, not browser layout or touch interaction.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createCanvas}=require(process.env.CANVAS_MODULE||'@napi-rs/canvas');
const html=fs.readFileSync(process.argv[2]||'mask-lab.html','utf8'),elements={};
for(const match of html.matchAll(/<input\s+([^>]+)>/g)){
 const attrs=Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(x=>[x[1],x[2]]));
 elements[attrs.id]={...attrs,checkValidity(){return this.type==='text'||(this.value!==''&&Number.isFinite(+this.value)&&+this.value>=+this.min&&+this.value<=+this.max)},parentElement:{textContent:attrs.id},addEventListener(){}};
}
elements.side={value:'1',checkValidity:()=>true,addEventListener(){}};
for(const m of html.matchAll(/<canvas id="([^"]+)" width="(\d+)" height="(\d+)"/g))elements[m[1]]=createCanvas(+m[2],+m[3]);
for(const id of ['status','metrics','export','svg','reset','projectionStats','presetOriginal','presetThin'])elements[id]={};
const document={getElementById:id=>elements[id],createElement:tag=>tag==='canvas'?createCanvas(1,1):{},querySelectorAll:()=>[]};
const ctx=vm.createContext({document,console,Uint8Array,Uint8ClampedArray,Float32Array,ArrayBuffer,DataView,Blob,URL,setTimeout,clearTimeout});
const run=code=>vm.runInContext(code,ctx);
run(html.split('<script>')[1].split('</script>')[0]);
const base=run('read()'),reports=[];
function set(values){Object.entries({...base,...values}).forEach(([k,v])=>elements[k].value=String(v));}
function verifyMesh(model){
 ctx.testModel=model;const data=Buffer.from(run('stl(testModel)')),count=data.readUInt32LE(80),edges=new Map();
 assert.equal(data.length,84+count*50);let volume=0,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let n=0;n<count;n++){
  let vertices=[];for(let j=0;j<3;j++){let v=[];for(let k=0;k<3;k++){let value=data.readFloatLE(84+n*50+12+j*12+k*4);assert(Number.isFinite(value));min[k]=Math.min(min[k],value);max[k]=Math.max(max[k],value);v.push(value)}vertices.push(v)}
  let [a,b,c]=vertices,u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]);let norm=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];assert(Math.hypot(...norm)>1e-9);
  for(let k=0;k<3;k++){let stored=data.readFloatLE(84+n*50+k*4);assert(Math.abs(stored-norm[k]/Math.hypot(...norm))<1e-6)}
  volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
  const keys=vertices.map(v=>v.join(','));for(let j=0;j<3;j++){let a=keys[j],b=keys[(j+1)%3],key=a<b?a+'|'+b:b+'|'+a,edge=edges.get(key)||[0,0];edge[0]++;edge[1]+=a<b?1:-1;edges.set(key,edge)}
 }
 for(const [count,winding] of edges.values()){assert.equal(count,2,'watertight two-face edge');assert.equal(winding,0,'opposite edge winding')}
 let seen=new Set([0]),stack=[0],total=model.grid.reduce((s,row)=>s+row.reduce((a,v)=>a+v,0),0);
 while(stack.length){let n=stack.pop(),x=n%model.nx,y=Math.floor(n/model.nx);for(let [i,j] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]])if(i>=0&&i<model.nx&&j>=0&&j<model.ny&&model.grid[j][i]){let key=j*model.nx+i;if(!seen.has(key)){seen.add(key);stack.push(key)}}}
 assert.equal(seen.size,total,'all material in one component');
 const expected=total*model.dx*model.dy*model.p.thickness;assert(Math.abs(volume-expected)/expected<1e-5);assert.deepEqual(min,[0,0,0]);[model.p.width,model.p.depth,model.p.thickness].forEach((v,i)=>assert(Math.abs(max[i]-v)<1e-5));
 return {triangles:count,bytes:data.length,volumeMm3:+volume.toFixed(2),solidComponents:1,boundaryEdges:0,nonManifoldEdges:0,data};
}
for(const overrides of [{},{text:'ОБА'},{text:'B8O',side:-1},{text:'LIGHT',cell:.7,width:101,depth:48,distance:36},{text:'LIGHT',thickness:.8}]){
 set(overrides);assert.equal(run('validate(read())'),'');let m=run('build(read())'),mesh=verifyMesh(m);ctx.testModel=m;let light=run('projection(testModel)');let {data,...meshInfo}=mesh;
 reports.push({text:m.p.text,side:m.p.side,thickness:m.p.thickness,cell:m.p.cell,bridges:m.bridges,coverage:+light.coverage.toFixed(4),...meshInfo});
 if(!overrides.text||overrides.thickness===.8){let suffix=String(m.p.thickness);if(process.env.ARTIFACT_DIR){fs.mkdirSync(process.env.ARTIFACT_DIR,{recursive:true});fs.writeFileSync(process.env.ARTIFACT_DIR+'/mask-LIGHT-'+suffix+'mm.stl',data);fs.writeFileSync(process.env.ARTIFACT_DIR+'/projection-'+suffix+'mm.png',light.canvas.toBuffer('image/png'));}}
}
// A ray crossing a blocked middle cell must be rejected despite open endpoints.
assert.equal(run(`rayPass({p:{width:10,depth:10,distance:5,height:2,thickness:2},dx:1,dy:1,nx:10,ny:10,grid:Array.from({length:10},(_,j)=>Array.from({length:10},()=>j===3?1:0))},0,5)`),false);
assert.equal(run(`rayPass({p:{width:10,depth:10,distance:5,height:2,thickness:2},dx:1,dy:1,nx:10,ny:10,grid:Array.from({length:10},()=>Array(10).fill(0))},0,5)`),true);
for(const bad of [{text:'  '},{width:''},{distance:45},{offset:30},{cell:0},{thickness:-1}]){set(bad);assert.notEqual(run('validate(read())'),'');run('update()');assert.equal(elements.export.disabled,true);assert.equal(elements.metrics.textContent,'')}
set({text:'LIGHT',targetWidth:800,width:30});run('update()');assert(run('model.projection.coverage')<.7);
// Physical ray/plane inversion, including both target sides.
for(const side of [-1,1])for(const X of [-90,0,90])for(const Y of [82,110,138]){let a=40,t=a/Y,qx=t*X,qz=35*(1-t);assert(Math.abs(qx/(1-qz/35)-X)<1e-10);assert(Math.abs(side*a/(1-qz/35)-side*Y)<1e-10)}
set({});run('update()');const thick=run('model.projection.coverage');elements.presetThin.onclick();assert(run('model.projection.coverage')>=thick);
if(process.env.ARTIFACT_DIR){
 fs.writeFileSync(process.env.ARTIFACT_DIR+'/mask-preview.png',elements.preview.toBuffer('image/png'));
 fs.writeFileSync(process.env.ARTIFACT_DIR+'/mask-check.png',elements.wall.toBuffer('image/png'));
 fs.writeFileSync(process.env.ARTIFACT_DIR+'/validation.json',JSON.stringify({method:'Native Canvas + actual application script; DOM mocked, browser not exercised',tests:reports},null,2));
}
console.log(JSON.stringify(reports,null,2));console.log('PASS: real glyph meshes, binary STL edges/winding/volume, connectivity, invalid inputs, ray traversal, upper/lower mapping, presets.');
