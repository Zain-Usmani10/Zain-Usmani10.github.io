/* Interstellar live demos.
   One mission model drives two screens, as in the real project:
     - the laptop's 3D view, which only knows what the board reported (and estimates during blackout)
     - the FPGA's own VGA cockpit, which always shows the truth
   Plus a free-roam solar system. Three.js r147 is loaded lazily when the section comes near. */
(function(){
'use strict';
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const $=s=>document.querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const THREE_URL='https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js';
const OC_URL='https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js';
const load=src=>new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s)});
let threeP=null;const getThree=()=>threeP||(threeP=load(THREE_URL).then(()=>load(OC_URL)).then(()=>window.THREE));

/* ================= mission model ================= */
const TRIP=163, D0=Date.UTC(2026,10,15);
const CD=500, FL=1500, TAIL=300;          // ticks at 100 Hz (flight compressed to 15 s for the page)
const BO_A=.25, BO_B=.85;                 // blackout window, fraction of flight
const M={phase:'IDLE',start:0,tick:0,f:0,burns:0,copies:[1,1,1],faults:0,safe:false,fuel:1,
         sw0:false,sw1:false,events:[],seen:null,link:'ok',syncAt:0};
const listeners=[];
function snapshot(){return{phase:M.phase,f:M.f,burns:M.burns,faults:M.faults,safe:M.safe,fuel:M.fuel,tick:M.tick}}
function reset(){Object.assign(M,{phase:'IDLE',start:0,tick:0,f:0,burns:0,copies:[1,1,1],faults:0,safe:false,fuel:1,sw0:false,sw1:false,events:[],link:'ok',syncAt:0});M.seen=snapshot();ui()}
function launch(){if(M.phase!=='IDLE')return;document.querySelector('#dl3d .orbit-hint')?.classList.add('gone');M.phase='LOADED';M.start=performance.now();M.events=[];ui()}
function inBlackout(){return M.phase==='RUNNING'&&M.f>BO_A&&M.f<BO_B}
function step(now){
  if(M.phase==='IDLE'){M.seen=snapshot();return}
  const ms=now-M.start;
  if(ms<500)M.phase='LOADED';else if(ms<1000)M.phase='ARMED';
  else{
    const t=Math.floor((ms-1000)/10);M.tick=t;
    if(t<CD){M.phase='COUNTDOWN'}
    else{
      const ft=t-CD;M.f=Math.max(0,ft/FL);
      if(M.burns===0){M.burns=1;M.fuel=.32;M.phase='RUNNING';
        if(M.sw0&&!M.faults){M.faults++;note('SW0: copy B corrupted, outvoted')}}
      if(M.sw1&&!M.safe&&M.burns<2){M.safe=true;M.faults++;note('SW1: no two copies agree, SAFE latched')}
      if(M.f>=1&&M.burns===1&&!M.safe){M.burns=2;M.fuel=.07;M.phase='COMPLETE';note('Capture burn fired at Mars')}
      if(M.safe&&M.f>=1.2&&M.phase!=='SAFE'){M.phase='SAFE'}
    }
  }
  const lost=inBlackout();
  if(lost&&M.link==='ok'){M.link='lost'}
  if(!lost&&M.link==='lost'){M.link='ok';M.syncAt=now}
  if(M.link==='ok')M.seen=snapshot();
}
function note(t){M.events.push({t,lost:M.link==='lost'})}
function flip(which){
  if(which==='sw0'){M.sw0=!M.sw0;if(M.sw0){M.copies[1]=0;if(['RUNNING','COUNTDOWN','ARMED'].includes(M.phase)){M.faults++;note('SW0: copy B corrupted, outvoted')}}else M.copies[1]=1}
  if(which==='sw1'){M.sw1=!M.sw1;if(M.sw1){M.copies=[1,0,2];if(M.phase==='RUNNING'&&M.burns<2){M.safe=true;M.faults++;note('SW1: no two copies agree, SAFE latched')}}else M.copies=[1,M.sw0?0:1,1]}
  ui();
}
function ui(){listeners.forEach(f=>f())}
M.seen=snapshot();

/* ================= controls + timeline ================= */
function bindControls(){
  const bL=$('#dLaunch'),b0=$('#dSw0'),b1=$('#dSw1'),bR=$('#dReset'),bar=$('#dBar'),fill=$('#dFill'),
        stEl=$('#dState'),banner=$('#dBanner'),hDate=$('#dDate'),hLink=$('#dLink'),hLinkT=$('#dLinkT'),hDays=$('#dDays');
  bL.addEventListener('click',launch);bR.addEventListener('click',reset);
  b0.addEventListener('click',()=>flip('sw0'));b1.addEventListener('click',()=>flip('sw1'));
  listeners.push(()=>{bL.disabled=M.phase!=='IDLE';b0.setAttribute('aria-pressed',M.sw0);b1.setAttribute('aria-pressed',M.sw1)});
  let lastBanner='';
  return function(now){
    // timeline: countdown (5 s) + flight (15 s)
    const tot=CD+FL, t=M.phase==='IDLE'?0:clamp(M.tick,0,tot+TAIL);
    fill.style.transform=`scaleX(${clamp(t/tot,0,1)})`;
    const S=M.seen||snapshot(), lost=M.link==='lost';
    // what the laptop believes
    let est=S.f;if(lost){est=clamp(M.f,0,1)} // extrapolated at 100 ticks/s from last telemetry
    const days=Math.round(clamp(lost?est:S.f,0,1)*TRIP);
    hDate.textContent=new Date(D0+days*864e5).toISOString().slice(0,10)+(lost?' · estimate':'');
    hDays.textContent=M.phase==='IDLE'||M.phase==='LOADED'||M.phase==='ARMED'?'—':M.phase==='COUNTDOWN'?`T−${Math.ceil((CD-M.tick)/100)}`:`${Math.max(0,TRIP-days)} d to arrival`;
    hLink.className='link '+(lost?'lost':(now-M.syncAt<2500&&M.syncAt?'sync':''));
    hLinkT.textContent=lost?'FPGA · link inactive':'FPGA · link active';
    let label={IDLE:'Docked at Earth',LOADED:'Plan uploaded',ARMED:'Armed',COUNTDOWN:'Countdown',RUNNING:'In flight',COMPLETE:'Arrived at Mars',SAFE:'Board in SAFE mode'}[lost?'RUNNING':M.phase];
    stEl.textContent=label;
    let b='';
    if(lost)b='<b>Contact lost</b>No telemetry. The dashed path is an estimate only; the board keeps flying.';
    else if(M.syncAt&&now-M.syncAt<4200){
      const ev=M.events.filter(e=>e.lost).map(e=>e.t);
      b='<b>Contact restored</b>'+(ev.length?'While out of contact: '+ev.join('; ')+'.':'Board record matches the estimate.')}
    else if(M.phase==='SAFE'||(M.safe&&M.f>=1))b='<b>No capture burn</b>The board latched SAFE, so the shuttle sails past Mars.';
    if(b!==lastBanner){banner.innerHTML=b;banner.classList.toggle('on',!!b);lastBanner=b}
  };
}

/* ================= FPGA VGA cockpit (320x240, 12-bit palette, 5x7 font) ================= */
const FONT={'A':[14,17,17,31,17,17,17],'B':[30,17,17,30,17,17,30],'C':[14,17,16,16,16,17,14],'D':[30,17,17,17,17,17,30],'E':[31,16,16,30,16,16,31],'F':[31,16,16,30,16,16,16],'G':[14,17,16,23,17,17,15],'H':[17,17,17,31,17,17,17],'I':[14,4,4,4,4,4,14],'J':[7,2,2,2,2,18,12],'K':[17,18,20,24,20,18,17],'L':[16,16,16,16,16,16,31],'M':[17,27,21,21,17,17,17],'N':[17,17,25,21,19,17,17],'O':[14,17,17,17,17,17,14],'P':[30,17,17,30,16,16,16],'Q':[14,17,17,17,21,18,13],'R':[30,17,17,30,20,18,17],'S':[15,16,16,14,1,1,30],'T':[31,4,4,4,4,4,4],'U':[17,17,17,17,17,17,14],'V':[17,17,17,17,17,10,4],'W':[17,17,17,21,21,21,10],'X':[17,17,10,4,10,17,17],'Y':[17,17,17,10,4,4,4],'Z':[31,1,2,4,8,16,31],
 '0':[14,17,19,21,25,17,14],'1':[4,12,4,4,4,4,14],'2':[14,17,1,2,4,8,31],'3':[31,2,4,2,1,17,14],'4':[2,6,10,18,31,2,2],'5':[31,16,30,1,1,17,14],'6':[6,8,16,30,17,17,14],'7':[31,1,2,4,8,8,8],'8':[14,17,17,14,17,17,14],'9':[14,17,17,15,1,2,12],
 ':':[0,12,12,0,12,12,0],'-':[0,0,0,31,0,0,0],'.':[0,0,0,0,0,12,12],'/':[0,1,2,4,8,16,0],'+':[0,4,4,31,4,4,0],'>':[8,4,2,1,2,4,8],' ':[0,0,0,0,0,0,0]};
function vga(cv){
  const c=cv.getContext('2d'),W=320,H=240;
  const C={bg:'#000',sky1:'#001',sky2:'#002',sky3:'#113',line:'#0bf',text:'#8fe',dim:'#077',strut:'#88a',hdr:'#fff',
           p1:'#055',p2:'#077',p3:'#0aa',p4:'#0cc',m1:'#610',m2:'#a30',m3:'#d63',m4:'#f96',dash:'#003',ok:'#0f6',bad:'#f33',warn:'#fd0',grey:'#888'};
  const txt=(s,x,y,col,sc=1)=>{c.fillStyle=col;let cx=x;for(const ch of s){const g=FONT[ch]||FONT[' '];
      for(let r=0;r<7;r++)for(let b=0;b<5;b++)if(g[r]>>(4-b)&1)c.fillRect(cx+b*sc,y+r*sc,sc,sc);cx+=6*sc}};
  const rnd=(i)=>{const x=Math.sin(i*127.1)*43758.5453;return x-Math.floor(x)};
  const stars=Array.from({length:70},(_,i)=>[rnd(i)*W,16+rnd(i+99)*150,rnd(i+7)]);
  function planet(cy,r,cols,dots){
    for(let k=0;k<cols.length;k++){c.fillStyle=cols[k];c.beginPath();c.arc(160,cy,r-k*7,Math.PI,2*Math.PI);c.fill()}
    c.fillStyle='#bff';
    if(dots)for(let row=0;row<6;row++){const yy=cy-r+10+row*9;for(let x=0;x<W;x+=12+row*2){const dx=x-160,inside=dx*dx+(yy-cy)*(yy-cy)<(r-4)*(r-4);if(inside)c.fillRect(x+(row%2)*6,yy,1,1)}}
    c.strokeStyle=cols===MARS?'#fb8':'#5ff';c.lineWidth=1;c.beginPath();c.arc(160,cy,r,Math.PI*1.04,Math.PI*1.96);c.stroke();
  }
  const EARTH=[C.p1,C.p2,C.p3,C.p2],MARS=[C.m1,C.m2,C.m3,C.m2];
  return function draw(now){
    const ph=M.phase,f=clamp(M.f,0,1.2),t=now/1000;
    c.fillStyle=C.bg;c.fillRect(0,0,W,H);
    // sky bands (dithered 12-bit look)
    for(let y=16;y<170;y++){c.fillStyle=y<70?C.sky1:y<120?C.sky2:C.sky3;c.fillRect(0,y,W,1)}
    // stars: stream outward in flight
    const v=ph==='RUNNING'?1:ph==='SAFE'?0.5:0;
    c.fillStyle='#fff';
    for(const s of stars){let y=s[1];if(v){y=16+((s[1]-16)+t*40*(.4+s[2])*v)%154}c.fillRect(s[0]|0,y|0,1,s[2]>.8&&v?2:1)}
    // planets: Earth sinks after launch, Mars rises near arrival
    const alt=ph==='COUNTDOWN'||ph==='IDLE'||ph==='LOADED'||ph==='ARMED'?0:clamp(f/.2,0,1);
    if(alt<1)planet(330+alt*190,190,EARTH,true);
    if(f>.78){const k=clamp((f-.78)/.22,0,1);const pastX=M.safe?clamp((f-1)/.2,0,1)*260:0;
      c.save();c.translate(-pastX,0);planet(440-k*160,170,MARS,false);c.restore()}
    // launch tower + shuttle on pad
    const lift=ph==='COUNTDOWN'?0:alt;
    if(alt<1){const gy=158+alt*190;
      c.fillStyle=C.strut;c.fillRect(176,gy-58,2,58);for(let y=gy-58;y<gy;y+=6){c.fillRect(176,y,10,1)}c.fillRect(186,gy-58,1,58);
      c.fillRect(150,gy-40,26,2);}
    if(ph!=='COMPLETE'&&ph!=='SAFE'){const sy=158-lift*120-(ph==='RUNNING'?(f*400):0);
      if(sy>8){c.fillStyle='#ddd';c.fillRect(160,sy-26,6,22);c.fillStyle='#fff';c.fillRect(161,sy-31,4,5);c.fillRect(162,sy-34,2,3);
        c.fillStyle='#e73';c.fillRect(160,sy-10,6,2);c.fillStyle=C.grey;c.fillRect(157,sy-6,3,4);c.fillRect(166,sy-6,3,4);
        if(ph==='RUNNING'&&f<.08||ph==='COUNTDOWN'&&M.tick>CD-40){c.fillStyle=(t*20|0)%2?'#fd0':'#f80';c.fillRect(161,sy-4,4,6+((t*30|0)%3))}}}
    if(ph==='COMPLETE'){const a=t*1.2;c.fillStyle='#fff';c.fillRect(160+Math.cos(a)*70|0,250-90-10+Math.sin(a)*12|0,3,2)}
    // window struts
    c.strokeStyle=C.strut;c.lineWidth=3;c.beginPath();c.moveTo(70,16);c.lineTo(46,170);c.moveTo(250,16);c.lineTo(274,170);c.stroke();
    // header
    c.fillStyle=C.bg;c.fillRect(0,0,W,16);
    const lost=M.link==='lost';
    const hdr={IDLE:'DOCKED',LOADED:'PLAN LOADED',ARMED:'ARMED',COUNTDOWN:'COUNTDOWN',RUNNING:'IN FLIGHT',COMPLETE:'CAPTURED',SAFE:'SAFE MODE'}[ph];
    txt(hdr,6,5,M.safe?C.warn:C.hdr);txt('INTERSTELLAR',196,5,C.hdr);
    c.fillStyle=M.faults?(M.safe?C.bad:C.warn):C.grey;c.fillRect(276,4,8,8);
    c.fillStyle=lost?'#300':C.ok;c.fillRect(290,4,8,8);if(lost){c.fillStyle=C.bad;c.fillRect(291,5,6,6);c.fillStyle='#300';c.fillRect(292,6,4,4)}
    c.fillStyle=C.line;c.fillRect(0,16,W,1);
    // dashboard
    c.fillStyle=C.dash;c.fillRect(0,170,W,70);c.fillStyle=C.line;c.fillRect(0,170,W,1);
    const box=(x,y,w,h)=>{c.strokeStyle=C.line;c.lineWidth=1;c.strokeRect(x+.5,y+.5,w,h)};
    box(6,178,74,54);txt('FUEL',12,183,C.text);
    const cells=Math.round(M.fuel*24);for(let i=0;i<24;i++){const cx=12+(i%8)*8,cy=196+Math.floor(i/8)*10;c.fillStyle=i<cells?C.line:'#012';c.fillRect(cx,cy,6,7)}
    box(88,178,146,54);
    const st={IDLE:'IDLE',LOADED:'LOADED',ARMED:'ARMED',COUNTDOWN:'ARMED',RUNNING:'RUNNING',COMPLETE:'COMPLETE',SAFE:'SAFE'}[ph];
    txt('STATUS '+st,94,184,M.safe?C.warn:C.text);
    let l2='NO PLAN LOADED';
    if(ph==='LOADED'||ph==='ARMED')l2='PLAN 28 BYTES OK';
    if(ph==='COUNTDOWN')l2='T-'+Math.max(0,Math.ceil((CD-M.tick)/100));
    if(ph==='RUNNING'||ph==='SAFE'){const d=TRIP-Math.floor(clamp(M.f,0,1)*TRIP);l2='DAYS '+String(d).padStart(3,'0')+' BURNS '+M.burns}
    if(ph==='COMPLETE')l2='ARRIVED DAYS 000';
    txt(l2,94,198,C.text);
    txt(lost?'LINK LOST':'LINK OK',94,212,lost?C.warn:C.text);
    if(M.faults)txt('FAULTS '+M.faults,170,212,M.safe?C.bad:C.warn);
    box(242,178,72,54);
    // TMR copies A B C
    ['A','B','C'].forEach((n,i)=>{const ok=M.sw1?false:M.copies[i]===1;c.fillStyle=M.sw1?(i===0?C.ok:C.bad):ok?C.ok:C.bad;c.fillRect(248+i*22,184,16,8);txt(n,253+i*22,194,C.dim)});
    // burn record
    c.fillStyle=M.burns>=1?C.warn:'#012';c.fillRect(248,206,30,6);c.fillStyle=M.burns>=2?C.warn:'#012';c.fillRect(282,206,26,6);
    // tick counter in binary (12 LSBs)
    const tk=M.phase==='IDLE'?0:M.tick;for(let b=0;b<12;b++){c.fillStyle=(tk>>(11-b))&1?C.line:'#012';c.fillRect(248+b*5,220,4,6)}
  };
}

/* ================= shared three helpers ================= */
function makeStars(THREE,n,r){
  const g=new THREE.BufferGeometry(),p=new Float32Array(n*3);
  for(let i=0;i<n;i++){const u=Math.random()*2-1,a=Math.random()*Math.PI*2,s=Math.sqrt(1-u*u);p[i*3]=r*s*Math.cos(a);p[i*3+1]=r*u;p[i*3+2]=r*s*Math.sin(a)}
  g.setAttribute('position',new THREE.BufferAttribute(p,3));
  return new THREE.Points(g,new THREE.PointsMaterial({color:0xcfd8ff,size:1.1,sizeAttenuation:false,transparent:true,opacity:.75}));
}
function glowTex(THREE,inner,outer){
  const cv=document.createElement('canvas');cv.width=cv.height=128;const c=cv.getContext('2d');
  const g=c.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,inner);g.addColorStop(.25,outer);g.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=g;c.fillRect(0,0,128,128);const t=new THREE.CanvasTexture(cv);return t;
}
function texLoader(THREE){const L=new THREE.TextureLoader();return n=>{const t=L.load('assets/tex/'+n);t.encoding=THREE.sRGBEncoding;t.anisotropy=4;return t}}
function sizer(R,cam,box){
  const fit=()=>{const w=box.clientWidth,h=box.clientHeight;if(!w||!h)return;R.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix()};
  new ResizeObserver(fit).observe(box);fit();
}
function visible(el){let v=false;new IntersectionObserver(es=>{v=es[0].isIntersecting}).observe(el);return()=>v}
function hint(box){
  const h=box.querySelector('.orbit-hint');if(!h)return;
  const off=()=>{h.classList.add('gone');['pointerdown','wheel','touchstart'].forEach(e=>box.removeEventListener(e,off))};
  ['pointerdown','wheel','touchstart'].forEach(e=>box.addEventListener(e,off,{passive:true}));
}
function shuttle(THREE){
  const g=new THREE.Group();
  const metal=new THREE.MeshStandardMaterial({color:0xd9dde4,metalness:.65,roughness:.32});
  const body=new THREE.Mesh(new THREE.CylinderGeometry(.22,.26,1.3,24),metal);g.add(body);
  const nose=new THREE.Mesh(new THREE.ConeGeometry(.22,.55,24),metal);nose.position.y=.92;g.add(nose);
  const band=new THREE.Mesh(new THREE.CylinderGeometry(.268,.268,.12,24),new THREE.MeshStandardMaterial({color:0xe07a3a,roughness:.5}));band.position.y=-.3;g.add(band);
  const finM=new THREE.MeshStandardMaterial({color:0x8a93a6,metalness:.4,roughness:.5});
  for(let i=0;i<3;i++){const fin=new THREE.Mesh(new THREE.BoxGeometry(.04,.38,.32),finM);const a=i*Math.PI*2/3;fin.position.set(Math.cos(a)*.3,-.5,Math.sin(a)*.3);fin.rotation.y=-a;g.add(fin)}
  const flame=new THREE.Mesh(new THREE.ConeGeometry(.17,.9,16),new THREE.MeshBasicMaterial({color:0xffb347,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));
  flame.rotation.x=Math.PI;flame.position.y=-1.1;flame.visible=false;g.add(flame);g.userData.flame=flame;
  return g;
}

/* ================= 3D launch view (laptop) ================= */
function launchView(THREE){
  const box=$('#dl3d'),cv=box.querySelector('canvas'),tex=texLoader(THREE);
  const R=new THREE.WebGLRenderer({canvas:cv,antialias:true});R.setPixelRatio(Math.min(devicePixelRatio,2));R.outputEncoding=THREE.sRGBEncoding;
  const S=new THREE.Scene();S.background=new THREE.Color(0x070b16);
  const cam=new THREE.PerspectiveCamera(42,1,.1,3000);
  const ctl=new THREE.OrbitControls(cam,cv);ctl.enableDamping=true;ctl.dampingFactor=.08;ctl.minDistance=2.5;ctl.maxDistance=400;
  sizer(R,cam,box);hint(box);
  S.add(new THREE.AmbientLight(0x50618a,.55));
  const sun=new THREE.DirectionalLight(0xfff1dd,1.45);sun.position.set(-80,40,70);S.add(sun);
  S.add(makeStars(THREE,1600,900));
  const earth=new THREE.Mesh(new THREE.SphereGeometry(10,72,48),new THREE.MeshStandardMaterial({map:tex('earth.jpg'),roughness:.9}));
  earth.rotation.y=-1.2;S.add(earth);
  const atmo=new THREE.Mesh(new THREE.SphereGeometry(10.45,48,32),new THREE.MeshBasicMaterial({color:0x6aa4e8,transparent:true,opacity:.09,side:THREE.BackSide}));S.add(atmo);
  const MP=new THREE.Vector3(110,46,-150);
  const mars=new THREE.Mesh(new THREE.SphereGeometry(5,48,32),new THREE.MeshStandardMaterial({map:tex('mars.jpg'),roughness:.95}));mars.position.copy(MP);S.add(mars);
  // pad on the surface
  const n=new THREE.Vector3(0,.6,.8).normalize(),padPos=n.clone().multiplyScalar(10);
  const pad=new THREE.Group();pad.position.copy(padPos);pad.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),n);pad.scale.setScalar(.55);S.add(pad);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(1.25,1.4,.22,6),new THREE.MeshStandardMaterial({color:0x7c8598,metalness:.3,roughness:.6}));base.position.y=.05;pad.add(base);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.32,.035,8,48),new THREE.MeshBasicMaterial({color:0x7fe0d0}));ring.rotation.x=Math.PI/2;ring.position.y=.17;pad.add(ring);
  const stM=new THREE.MeshStandardMaterial({color:0x2a3350,roughness:.7});
  const station=new THREE.Mesh(new THREE.BoxGeometry(.9,.7,.9),stM);station.position.set(-2.4,.3,.2);pad.add(station);
  const dome=new THREE.Mesh(new THREE.SphereGeometry(.42,24,12,0,Math.PI*2,0,Math.PI/2),new THREE.MeshStandardMaterial({color:0xc9ced8,metalness:.5,roughness:.3}));dome.position.set(-2.4,.65,.2);pad.add(dome);
  const tower=new THREE.Mesh(new THREE.BoxGeometry(.12,2.4,.12),new THREE.MeshStandardMaterial({color:0x8a93a6}));tower.position.set(.75,1.2,0);pad.add(tower);
  const ship=shuttle(THREE);ship.scale.setScalar(.62);S.add(ship);
  const p0=padPos.clone().add(n.clone().multiplyScalar(.62));
  const toM=MP.clone().sub(p0).normalize();
  const capDir=new THREE.Vector3(-1,.25,.7).normalize();
  const curve=new THREE.CubicBezierCurve3(p0,p0.clone().add(n.clone().multiplyScalar(34)),MP.clone().add(capDir.clone().multiplyScalar(46)).add(new THREE.Vector3(0,12,0)),MP.clone().add(capDir.clone().multiplyScalar(8)));
  const NP=400,pts=curve.getSpacedPoints(NP);
  const lineGeo=()=>new THREE.BufferGeometry().setFromPoints(pts);
  const path=new THREE.Line(lineGeo(),new THREE.LineDashedMaterial({color:0x3b4a74,dashSize:.9,gapSize:1.1}));path.computeLineDistances();S.add(path);
  const flown=new THREE.Line(lineGeo(),new THREE.LineBasicMaterial({color:0xf2c46d}));flown.geometry.setDrawRange(0,0);S.add(flown);
  const ghost=new THREE.Line(lineGeo(),new THREE.LineDashedMaterial({color:0x9fd8ff,dashSize:1.6,gapSize:1.4}));ghost.computeLineDistances();ghost.geometry.setDrawRange(0,0);S.add(ghost);
  const ghostShip=new THREE.Mesh(new THREE.SphereGeometry(.35,16,12),new THREE.MeshBasicMaterial({color:0x9fd8ff,transparent:true,opacity:.6,wireframe:true}));ghostShip.visible=false;S.add(ghostShip);
  // ease: slow lift-off, cruise, slow capture
  const sAt=f=>{f=clamp(f,0,1);const a=.08;return f<a?Math.pow(f/a,2)*a*.5:(a*.5+(f-a)*(1-a*.5)/(1-a))};
  const up=new THREE.Vector3(0,1,0),tmp=new THREE.Vector3(),q=new THREE.Quaternion();
  function placeShip(f,obj){
    if(f<=0){obj.position.copy(p0);obj.quaternion.setFromUnitVectors(up,n);return}
    if(f<=1){const s=sAt(f),p=curve.getPointAt(s),tg=curve.getTangentAt(s);obj.position.copy(p);q.setFromUnitVectors(up,tg);obj.quaternion.slerp(q,obj===ship?.25:1);return}
    if(!M.safe){ // parking orbit around Mars
      const a=(f-1)*9,r=8,ax=capDir.clone(),side=new THREE.Vector3().crossVectors(capDir,up).normalize();
      obj.position.copy(MP).addScaledVector(ax,r*Math.cos(a)).addScaledVector(side,r*Math.sin(a));
      tmp.copy(ax).multiplyScalar(-Math.sin(a)).addScaledVector(side,Math.cos(a));q.setFromUnitVectors(up,tmp);obj.quaternion.slerp(q,.2);
    }else{const tg=curve.getTangentAt(1);obj.position.copy(curve.getPointAt(1)).addScaledVector(tg,(f-1)*160);q.setFromUnitVectors(up,tg);obj.quaternion.slerp(q,.2)}
  }
  // camera: start framed on the pad, then chase unless the viewer takes over
  const homeT=padPos.clone().add(n.clone().multiplyScalar(1.1)),homeC=padPos.clone().add(n.clone().multiplyScalar(2.4)).add(new THREE.Vector3(6.2,0,0)).add(new THREE.Vector3(0,.8,-.6).multiplyScalar(-1.2));
  cam.position.copy(homeC);ctl.target.copy(homeT);
  let user=false;ctl.addEventListener('start',()=>{user=true});
  listeners.push(()=>{if(M.phase==='IDLE'){user=false;cam.position.copy(homeC);ctl.target.copy(homeT);placeShip(0,ship)}});
  placeShip(0,ship);
  const isVis=visible(box),desC=new THREE.Vector3(),desT=new THREE.Vector3();
  return function(now){
    if(!isVis())return;
    const ph=M.phase,lost=M.link==='lost',S0=M.seen||snapshot();
    const fTrue=ph==='COUNTDOWN'||ph==='IDLE'||ph==='LOADED'||ph==='ARMED'?0:M.f;
    const fSeen=lost?S0.f:fTrue;                      // laptop only draws confirmed board state…
    const fEst=lost?clamp(M.f,0,1):fTrue;             // …plus a labelled estimate during blackout
    placeShip(fSeen,ship);
    const burning=(ph==='RUNNING'&&fTrue<.09)||(ph==='COUNTDOWN'&&M.tick>CD-30)||(fTrue>.97&&fTrue<1.02&&!M.safe&&M.burns>=1);
    const fl=ship.userData.flame;fl.visible=burning&&!lost;if(fl.visible)fl.scale.set(1,.8+Math.random()*.5,1);
    const iS=Math.round(sAt(Math.min(fSeen,1))*NP),iE=Math.round(sAt(Math.min(fEst,1))*NP);
    flown.geometry.setDrawRange(0,fSeen>0?iS+1:0);
    ghost.geometry.setDrawRange(iS,lost?Math.max(0,iE-iS+1):0);
    ghostShip.visible=lost;if(lost)placeShip(fEst,ghostShip);
    atmo.rotation.y+=.0004;mars.rotation.y+=.001;earth.rotation.y+=ph==='IDLE'?0:.0002;
    // camera follow
    const focus=lost?ghostShip.position:ship.position;
    if(ph!=='IDLE'&&ph!=='LOADED'&&ph!=='ARMED'&&ph!=='COUNTDOWN'){
      if(!user){
        if(fSeen<1||M.safe){desT.copy(focus);desC.copy(focus).addScaledVector(toM,-13).add(tmp.set(0,4.5,0)).addScaledVector(n,2)}
        else{desT.copy(MP);desC.copy(MP).add(tmp.set(-14,9,22))}
        ctl.target.lerp(desT,.06);cam.position.lerp(desC,.035);
      }else{tmp.copy(focus).sub(ctl.target).multiplyScalar(.08);ctl.target.add(tmp);cam.position.add(tmp)}
    }
    ctl.update();R.render(S,cam);
  };
}

/* ================= free-roam solar system ================= */
function solarView(THREE){
  const box=$('#dsolar'),cv=box.querySelector('canvas'),tex=texLoader(THREE),lab=$('#dsolarLabels');
  const R=new THREE.WebGLRenderer({canvas:cv,antialias:true});R.setPixelRatio(Math.min(devicePixelRatio,2));R.outputEncoding=THREE.sRGBEncoding;
  const S=new THREE.Scene();S.background=new THREE.Color(0x060912);
  const cam=new THREE.PerspectiveCamera(45,1,.1,4000);cam.position.set(0,46,78);
  const ctl=new THREE.OrbitControls(cam,cv);ctl.enableDamping=true;ctl.dampingFactor=.07;ctl.minDistance=3;ctl.maxDistance=420;ctl.screenSpacePanning=true;
  sizer(R,cam,box);hint(box);
  S.add(makeStars(THREE,2400,1400));
  S.add(new THREE.AmbientLight(0x404a66,.35));
  const light=new THREE.PointLight(0xfff0d8,2.1,0,0);S.add(light);
  const sun=new THREE.Mesh(new THREE.SphereGeometry(4,48,32),new THREE.MeshBasicMaterial({map:tex('sun.jpg')}));S.add(sun);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex(THREE,'rgba(255,236,190,.95)','rgba(255,170,80,.35)'),blending:THREE.AdditiveBlending,depthWrite:false}));glow.scale.set(17,17,1);S.add(glow);
  // mean orbital elements (deg, deg/day, AU): approximate positions for today's date
  const days=(Date.now()-Date.UTC(2000,0,1,12))/864e5;
  const P=[['Mercury','mercury.jpg',.387,252.25,4.09233,.35],['Venus','venus.jpg',.723,181.98,1.60213,.62],['Earth','earth.jpg',1,100.46,.985609,.66],
           ['Mars','mars.jpg',1.524,355.45,.524033,.46],['Jupiter','jupiter.jpg',5.203,34.40,.083091,1.9],['Saturn','saturn.jpg',9.537,49.94,.033460,1.6]];
  const rOf=a=>15*Math.pow(a,.62);
  const bodies={Sun:{mesh:sun,r:4}};
  P.forEach(([name,map,a,L0,nd,rad])=>{
    const r=rOf(a),L=(L0+nd*days)*Math.PI/180;
    const orbit=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({length:256},(_,i)=>{const t=i/256*Math.PI*2;return new THREE.Vector3(Math.cos(t)*r,0,-Math.sin(t)*r)})),
      new THREE.LineBasicMaterial({color:0x2d3a5f,transparent:true,opacity:.8}));S.add(orbit);
    const m=new THREE.Mesh(new THREE.SphereGeometry(rad,40,28),new THREE.MeshStandardMaterial({map:tex(map),roughness:.95}));
    m.position.set(Math.cos(L)*r,0,-Math.sin(L)*r);S.add(m);
    if(name==='Saturn'){const rg=new THREE.Mesh(new THREE.RingGeometry(rad*1.3,rad*2.3,64),new THREE.MeshBasicMaterial({color:0xd8c9a3,transparent:true,opacity:.45,side:THREE.DoubleSide}));rg.rotation.x=-Math.PI/2+.45;m.add(rg)}
    bodies[name]={mesh:m,r:rad,L,R:r};
  });
  // illustrative Earth -> Mars transfer (half ellipse, periapsis at Earth)
  const E=bodies.Earth,Mr=bodies.Mars.R,a=(E.R+Mr)/2,c0=(Mr-E.R)/2,b=Math.sqrt(E.R*Mr);
  const tp=Array.from({length:200},(_,i)=>{const t=i/199*Math.PI;const x=-c0+a*Math.cos(t),y=b*Math.sin(t);const ang=E.L;return new THREE.Vector3(x*Math.cos(ang)-y*Math.sin(ang),0,-(x*Math.sin(ang)+y*Math.cos(ang)))});
  const tline=new THREE.Line(new THREE.BufferGeometry().setFromPoints(tp),new THREE.LineDashedMaterial({color:0xf2c46d,dashSize:.8,gapSize:.7}));tline.computeLineDistances();S.add(tline);
  const dot=new THREE.Mesh(new THREE.SphereGeometry(.22,12,8),new THREE.MeshBasicMaterial({color:0xffd98a}));S.add(dot);
  // HTML labels
  const tags={};Object.keys(bodies).forEach(k=>{const s=document.createElement('span');s.textContent=k;lab.appendChild(s);tags[k]=s});
  // fly-to buttons
  let fly=null;
  document.querySelectorAll('#dsolarBar button').forEach(btn=>btn.addEventListener('click',()=>{
    const k=btn.dataset.p;document.querySelectorAll('#dsolarBar button').forEach(x=>x.setAttribute('aria-pressed',x===btn));
    if(k==='Overview'){fly={t:new THREE.Vector3(0,0,0),c:new THREE.Vector3(0,46,78)};return}
    const B=bodies[k],p=B.mesh.position.clone(),d=Math.max(4,B.r*6);
    fly={t:p,c:p.clone().add(new THREE.Vector3(d*.6,d*.45,d))};
    box.querySelector('.orbit-hint')?.classList.add('gone');
  }));
  ctl.addEventListener('start',()=>{fly=null});
  const isVis=visible(box),v=new THREE.Vector3();
  return function(now){
    if(!isVis())return;
    const t=now/1000;
    Object.values(bodies).forEach(B=>{B.mesh.rotation.y+=.002});
    const k=(t*.06)%1;dot.position.copy(tp[Math.floor(k*199)]);
    if(fly){ctl.target.lerp(fly.t,.07);cam.position.lerp(fly.c,.05);if(cam.position.distanceTo(fly.c)<.05)fly=null}
    ctl.update();R.render(S,cam);
    const w=box.clientWidth,h=box.clientHeight;
    Object.entries(bodies).forEach(([k,B])=>{v.copy(B.mesh.position);v.y+=B.r*1.6;v.project(cam);const el=tags[k];
      if(v.z>1){el.style.opacity=0;return}el.style.opacity=1;el.style.transform=`translate(${(v.x*.5+.5)*w}px,${(-v.y*.5+.5)*h}px) translate(-50%,-100%)`});
  };
}

/* ================= boot ================= */
function boot(){
  const root=$('#interstellar');if(!root)return;
  const vcv=$('#dVga');if(!vcv)return;
  const drawVga=vga(vcv),ctlTick=bindControls();
  const loops=[(n)=>{step(n);ctlTick(n);drawVga(n)}];
  const vgaVis=visible(vcv);
  let running=false;
  function loop(now){loops.forEach((f,i)=>{if(i===0&&!vgaVis()&&M.phase==='IDLE')return;f(now)});requestAnimationFrame(loop)}
  const start=()=>{if(running)return;running=true;requestAnimationFrame(loop);
    getThree().then(THREE=>{
      try{loops.push(launchView(THREE))}catch(e){fail('#dl3d',e)}
      try{loops.push(solarView(THREE))}catch(e){fail('#dsolar',e)}
    }).catch(e=>{fail('#dl3d',e);fail('#dsolar',e)});
  };
  new IntersectionObserver((es,o)=>{if(es[0].isIntersecting){start();o.disconnect()}},{rootMargin:'900px 0px'}).observe(root);
  reset();
}
function fail(sel,e){const b=$(sel);if(b)b.classList.add('nogl');console.warn('3D demo unavailable',e)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
