import { useRef, useEffect, useState, useCallback, useMemo } from "react";

const C = {
  bg:"#0A0C0F", amber:"#E8A33D", blue:"#4A8FE0", green:"#1D9E75",
  red:"#E85D3D", text:"#E8E6E0", muted:"#6B7280", border:"#1C2430",
  surface:"rgba(10,12,15,0.93)",
};
const riskCol = l => l==="High"?C.red:l==="Moderate"?C.amber:C.green;
const frpColor = frp => frp>300?C.red:frp>150?"#F07040":frp>60?C.amber:"#C07828";
const frpR = frp => Math.max(4,Math.min(14,3.5+Math.log(frp+1)*1.9));
const DPR = ()=>Math.min(2, window.devicePixelRatio||1);

const VIEW = {lngMin:68,lngMax:97.5,latMin:8,latMax:37.5};
const PAD  = 24;

function makeProj(W,H){
  const aw=W-PAD*2,ah=H-PAD*2;
  const m=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
  const m0=m(VIEW.latMin),m1=m(VIEW.latMax);
  return([lng,lat])=>[
    PAD+((lng-VIEW.lngMin)/(VIEW.lngMax-VIEW.lngMin))*aw,
    PAD+(1-(m(lat)-m0)/(m1-m0))*ah
  ];
}
function invProj(W,H,px,py){
  const aw=W-PAD*2,ah=H-PAD*2;
  const lng=VIEW.lngMin+((px-PAD)/aw)*(VIEW.lngMax-VIEW.lngMin);
  const m=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
  const mv=m(VIEW.latMin)+(1-(py-PAD)/ah)*(m(VIEW.latMax)-m(VIEW.latMin));
  return[lng,(2*Math.atan(Math.exp(mv))-Math.PI/2)*180/Math.PI];
}
function pip(px,py,ring){
  let ins=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const[xi,yi]=ring[i],[xj,yj]=ring[j];
    if(((yi>py)!==(yj>py))&&px<((xj-xi)*(py-yi))/(yj-yi)+xi)ins=!ins;
  }
  return ins;
}
function inGeo(px,py,geo){
  if(!geo)return false;
  const ok=r=>pip(px,py,r);
  if(geo.type==="Polygon")return geo.coordinates.some(ok);
  if(geo.type==="MultiPolygon")return geo.coordinates.some(p=>p.some(ok));
  return false;
}
function projGeo(coords,proj){
  if(typeof coords[0]==="number")return proj(coords);
  return coords.map(c=>projGeo(c,proj));
}
function segD(px,py,x1,y1,x2,y2){
  const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy;
  if(!l2)return Math.hypot(px-x1,py-y1);
  const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/l2));
  return Math.hypot(px-(x1+t*dx),py-(y1+t*dy));
}

function hexRgb(h){
  const m=h.replace("#","").match(/([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  return m?[parseInt(m[1],16),parseInt(m[2],16),parseInt(m[3],16)]:[80,80,80];
}

const SRC=new Set(["Punjab","Haryana"]);
const REC=new Set(["Delhi"]);
const TRN=new Set(["Uttar Pradesh","Rajasthan","Himachal Pradesh","Uttarakhand","Uttaranchal","Jammu and Kashmir"]);

const CITIES=[
  {name:"Chandigarh",lng:76.78,lat:30.73,role:"source"},
  {name:"Amritsar",lng:74.87,lat:31.63,role:"source"},
  {name:"Ludhiana",lng:75.85,lat:30.90,role:"source"},
  {name:"Patiala",lng:76.38,lat:30.34,role:"source"},
  {name:"Hisar",lng:75.72,lat:29.15,role:"source"},
  {name:"Panipat",lng:76.96,lat:29.39,role:"source"},
  {name:"Jaipur",lng:75.79,lat:26.92,role:"transit"},
  {name:"Lucknow",lng:80.95,lat:26.85,role:"transit"},
  {name:"Agra",lng:78.02,lat:27.18,role:"transit"},
  {name:"Shimla",lng:77.17,lat:31.10,role:"transit"},
  {name:"Dehradun",lng:78.03,lat:30.32,role:"transit"},
];

// Graticule (lat/lng grid) drawn under the state fills
function drawGraticule(ctx,proj,W,H){
  ctx.save();
  ctx.font="600 8px 'JetBrains Mono',monospace";
  ctx.textAlign="center";ctx.textBaseline="middle";
  const lngStep=5,latStep=5;
  ctx.strokeStyle="rgba(140,190,235,0.16)";
  ctx.fillStyle="rgba(180,215,245,0.55)";
  for(let lng=Math.ceil(VIEW.lngMin/lngStep)*lngStep;lng<=VIEW.lngMax;lng+=lngStep){
    const x=proj([lng,VIEW.latMax])[0];
    if(x<PAD||x>W-PAD)continue;
    ctx.beginPath();ctx.moveTo(x,PAD);ctx.lineTo(x,H-PAD);ctx.stroke();
    ctx.fillText(`${lng}°E`,Math.min(W-14,Math.max(14,x)),H-PAD+10);
  }
  for(let lat=Math.ceil(VIEW.latMin/latStep)*latStep;lat<=VIEW.latMax;lat+=latStep){
    const y=proj([VIEW.lngMin,lat])[1];
    if(y<PAD||y>H-PAD)continue;
    ctx.beginPath();ctx.moveTo(PAD,y);ctx.lineTo(W-PAD,y);ctx.stroke();
    ctx.fillText(`${lat}°N`,PAD+13,y);
  }
  ctx.restore();
}

// Draw glowing wireframe for the country silhouette
function strokeRings(ctx,feats,ringOf){
  ctx.save();
  ctx.lineJoin="round";ctx.lineCap="round";
  feats.forEach(f=>{
    if(!f.pg)return;
    const rings=ringOf(f.pg);
    rings.forEach(ring=>{
      if(ring.length<3)return;
      ctx.beginPath();ctx.moveTo(ring[0][0],ring[0][1]);
      for(let i=1;i<ring.length;i++)ctx.lineTo(ring[i][0],ring[i][1]);
      ctx.closePath();ctx.stroke();
    });
  });
  ctx.restore();
}

function buildStaticCanvas(W,H,geoData,riskLevel,dpr=1){
  const PW=Math.round(W*dpr),PH=Math.round(H*dpr);
  const oc=document.createElement("canvas");
  oc.width=PW;oc.height=PH;
  const ctx=oc.getContext("2d");
  ctx.scale(dpr,dpr);
  const proj=makeProj(W,H);
  const STEP=6,BORD=STEP*0.9;
  const rc=riskCol(riskLevel),rcRgb=hexRgb(rc);
  const feats=geoData.features.map(f=>({
    name:f.properties.name,
    pg:f.geometry?{type:f.geometry.type,coordinates:projGeo(f.geometry.coordinates,proj)}:null,
  }));
  const ringOf=pg=>pg.type==="Polygon"?pg.coordinates:pg.coordinates.flat(1);
  const segs=[];
  feats.forEach(f=>{
    if(!f.pg)return;
    ringOf(f.pg).forEach(ring=>{
      for(let i=0;i<ring.length-1;i++){
        const[x1,y1]=ring[i],[x2,y2]=ring[i+1];
        segs.push({x1,y1,x2,y2,
          minX:Math.min(x1,x2)-BORD,maxX:Math.max(x1,x2)+BORD,
          minY:Math.min(y1,y2)-BORD,maxY:Math.max(y1,y2)+BORD});
      }
    });
  });

  // Ocean background: vertical gradient so the sea has depth
  const id=ctx.createImageData(PW,PH),buf=id.data;
  const gTop=[15,20,28],gBot=[7,9,13];
  for(let y=0;y<PH;y++){
    const f=y/PH;
    const r=Math.round(gTop[0]+(gBot[0]-gTop[0])*f);
    const g=Math.round(gTop[1]+(gBot[1]-gTop[1])*f);
    const b=Math.round(gTop[2]+(gBot[2]-gTop[2])*f);
    for(let x=0;x<PW;x++){
      const idx=(y*PW+x)*4;
      buf[idx]=r;buf[idx+1]=g;buf[idx+2]=b;buf[idx+3]=255;
    }
  }
  // Landmass stipple fill (brighter, higher contrast)
  for(let gx=STEP;gx<W-STEP;gx+=STEP){
    for(let gy=STEP;gy<H-STEP;gy+=STEP){
      let name=null;
      for(const f of feats){if(f.pg&&inGeo(gx,gy,f.pg)){name=f.name;break;}}
      if(!name)continue;
      let nb=false;
      for(const s of segs){
        if(gx<s.minX||gx>s.maxX||gy<s.minY||gy>s.maxY)continue;
        if(segD(gx,gy,s.x1,s.y1,s.x2,s.y2)<BORD){nb=true;break;}
      }
      let r,g,b;
      if(SRC.has(name))      [r,g,b]=nb?[246,158,68]:[208,98,30];
      else if(REC.has(name)) [r,g,b]=nb?rcRgb:rcRgb.map(v=>Math.round(v*.62));
      else if(TRN.has(name)) [r,g,b]=nb?[96,122,142]:[56,72,94];
      else                   [r,g,b]=nb?[70,102,128]:[38,58,80];
      const x0=gx*dpr,y0=gy*dpr;
      const dr=nb?Math.max(1,Math.round(1.5*dpr)):Math.max(1,Math.round(dpr)),dr2=dr*dr;
      for(let dy=-dr;dy<=dr;dy++)for(let dx=-dr;dx<=dr;dx++){
        if(dx*dx+dy*dy>dr2+.5)continue;
        const nx=x0+dx,ny=y0+dy;
        if(nx<0||ny<0||nx>=PW||ny>=PH)continue;
        const idx=(ny*PW+nx)*4;
        buf[idx]=r;buf[idx+1]=g;buf[idx+2]=b;buf[idx+3]=255;
      }
    }
  }
  ctx.putImageData(id,0,0);

  // Soft radial glow so the landmass pops against the ocean
  const haze=ctx.createRadialGradient(W/2,H/2,60,W/2,H/2,Math.max(W,H)*0.72);
  haze.addColorStop(0,"rgba(90,150,215,0.08)");haze.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=haze;ctx.fillRect(0,0,W,H);

  // Graticule grid (lat/lng) over the landmass
  drawGraticule(ctx,proj,W,H);

  // Glowing coastline - soft neon pass then crisp border
  ctx.save();
  ctx.strokeStyle="rgba(100,185,250,0.25)";ctx.lineWidth=3.5;
  ctx.shadowColor="rgba(100,185,250,0.95)";ctx.shadowBlur=16;
  strokeRings(ctx,feats,ringOf);
  ctx.restore();
  ctx.save();
  ctx.lineJoin="round";ctx.lineCap="round";
  feats.forEach(f=>{
    if(!f.pg)return;
    ringOf(f.pg).forEach(ring=>{
      if(ring.length<3)return;
      ctx.beginPath();ctx.moveTo(ring[0][0],ring[0][1]);
      for(let i=1;i<ring.length;i++)ctx.lineTo(ring[i][0],ring[i][1]);
      ctx.closePath();
      ctx.strokeStyle=SRC.has(f.name)?"#E07020":REC.has(f.name)?rc+"AA":"#3A5068";
      ctx.lineWidth=SRC.has(f.name)||REC.has(f.name)?1:0.6;
      ctx.stroke();
    });
  });
  ctx.restore();

  // City markers + labels (brighter, with dark glow for legibility)
  ctx.save();
  CITIES.forEach(ct=>{
    const[x,y]=proj([ct.lng,ct.lat]);
    const col=ct.role==="source"?C.amber:C.blue;
    ctx.save();
    ctx.shadowColor=col;ctx.shadowBlur=9;
    ctx.beginPath();ctx.arc(x,y,ct.role==="source"?2.4:2,0,Math.PI*2);
    ctx.fillStyle=col;ctx.fill();
    ctx.beginPath();ctx.arc(x,y,ct.role==="source"?5.5:4.8,0,Math.PI*2);
    ctx.fillStyle=col+"28";ctx.fill();
    ctx.restore();
    ctx.font="600 8px 'JetBrains Mono',monospace";
    ctx.textAlign="left";ctx.textBaseline="alphabetic";
    ctx.shadowColor="rgba(0,0,0,0.95)";ctx.shadowBlur=4;
    ctx.fillStyle=ct.role==="transit"?"#A9C0D4":col;
    ctx.globalAlpha=.92;
    ctx.fillText(ct.name.toUpperCase(),x+5,y+3);
  });
  ctx.restore();

  // Region labels - centered with glow
  const lbl=(p,t,col,sz)=>{
    const[x,y]=proj(p);
    ctx.save();
    ctx.font=`700 ${sz}px 'JetBrains Mono',monospace`;
    ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.shadowColor="rgba(0,0,0,0.92)";ctx.shadowBlur=5;
    ctx.fillStyle=col;ctx.globalAlpha=.95;
    ctx.fillText(t,x,y);
    ctx.restore();
  };
  lbl([75.0,31.9],"PUNJAB",C.amber,11);
  lbl([75.8,29.1],"HARYANA",C.blue,11);
  lbl([76.8,28.15],"DELHI-NCR",rc,11);
  lbl([80.2,26.5],"UTTAR PRADESH","#5A7894",9);
  lbl([73.5,26.0],"RAJASTHAN","#5A7894",9);
  lbl([74.8,33.9],"J&K","#5A7894",8);
  lbl([77.4,33.8],"HIMACHAL","#5A7894",8);

  // Inner vignette for depth
  const vg=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.35,W/2,H/2,Math.max(W,H)*0.72);
  vg.addColorStop(0,"rgba(0,0,0,0)");vg.addColorStop(1,"rgba(0,0,0,0.4)");
  ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);
  return oc;
}

export default function MapView({
  fires,particles,windSpeed,windDirection,
  onAddFire,onClearFires,riskLevel,smokePm25,
  isConfidenceDegraded,
  onSelectCluster,selectedClusterId,
  currentHour, timelineStart, timelineLen,
}){
  const canvasRef=useRef(null),wrapRef=useRef(null),rafRef=useRef(null);
  const staticRef=useRef(null),staticKey=useRef("");
  const lastClick=useRef(0);

  const[geoData,setGeoData]=useState(null);
  const[size,setSize]=useState({w:800,h:600});
  const[ready,setReady]=useState(false);
  const[building,setBuilding]=useState(false);
  const[tooltip,setTooltip]=useState(null);
  const[spawnMode,setSpawnMode]=useState(false);
  const[legendOpen,setLegendOpen]=useState(false);
  const customFireCount = (fires||[]).filter(f=>f.is_custom).length;

  // Fire replay: each fire lights on the map once the scrubber reaches the
  // timeline hour in which it was acquired by satellite.
  const hourInfo = useMemo(()=>{
    const HOUR=3600000;
    const tl0=timelineStart||0, tlen=timelineLen||1;
    return (fires||[]).map(fire=>{
      let ign=0;
      const t=new Date(fire.acq_time).getTime();
      if(!Number.isNaN(t))ign=Math.floor((t-tl0)/HOUR);
      if(ign<0)ign=0;
      else if(ign>=tlen)ign=tlen-1;
      return{fire,ign};
    });
  },[fires,timelineStart,timelineLen]);
  const hour=Math.floor(currentHour||0);
  const firesLit=hourInfo.filter(h=>hour>=h.ign).length;

  useEffect(()=>{
    import("../data/india-fast.json").then(m=>setGeoData(m.default)).catch(console.error);
  },[]);

  useEffect(()=>{
    const el=wrapRef.current;if(!el)return;
    let t;
    const ro=new ResizeObserver(([e])=>{
      const{width:w,height:h}=e.contentRect;
      clearTimeout(t);t=setTimeout(()=>setSize({w:Math.round(w)||800,h:Math.round(h)||600}),120);
    });
    ro.observe(el);
    const r=el.getBoundingClientRect();
    if(r.width>0)setSize({w:Math.round(r.width),h:Math.round(r.height)});
    return()=>{ro.disconnect();clearTimeout(t);};
  },[]);

  const proj=useMemo(()=>makeProj(size.w,size.h),[size.w,size.h]);

  useEffect(()=>{
    const onKey=e=>{if(e.key==="Escape")setSpawnMode(false);};
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[]);

  useEffect(()=>{
    if(!geoData||size.w<50)return;
    const dpr=DPR();
    const key=`${size.w}x${size.h}x${riskLevel}x${dpr}`;
    if(staticKey.current===key)return;
    staticKey.current=key;
    setReady(false);setBuilding(true);
    const id=setTimeout(()=>{
      staticRef.current=buildStaticCanvas(size.w,size.h,geoData,riskLevel,dpr);
      setBuilding(false);setReady(true);
    },0);
    return()=>clearTimeout(id);
  },[geoData,size.w,size.h,riskLevel]);

  // Wind particle system - client-side, driven by windSpeed/windDirection
  const windParticlesRef = useRef([]);
  useEffect(()=>{
    // Seed 140 wind streaks distributed across India's bounding box
    windParticlesRef.current = Array.from({length:140},(_,i)=>({
      id:i,
      lng: 69 + Math.random()*27,
      lat: 9 + Math.random()*28,
      age: Math.random(), // 0-1 lifecycle position
      speed: 0.3 + Math.random()*0.55,
      drift: (Math.random()-0.5)*0.9,     // lateral meander phase
      wob: 0.6 + Math.random()*1.1,       // curve frequency
      amp: 0.2 + Math.random()*0.7,       // curve amplitude
    }));
  },[]);

  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const ctx=canvas.getContext("2d");
    const ARC=4000;let start=null,last=0;

    // Wind direction in radians (meteorological: 0=N, 90=E → convert to math angle)
    // met direction is where wind comes FROM, we want where it goes TO
    const windRad = ()=>(windDirection+180)*Math.PI/180;
    // degrees per second of travel at windSpeed km/h
    // 1 degree ≈ 111 km at equator
    const degPerMs = (windSpeed/111)/3600000;

    const loop=ts=>{
      rafRef.current=requestAnimationFrame(loop);
      if(document.hidden||!ready||!staticRef.current)return;
      if(ts-last<33)return;
      const dt=ts-last;last=ts;
      if(!start)start=ts;
      const arcT=((ts-start)%ARC)/ARC;
      const rc=riskCol(riskLevel);
      const dpr=DPR();
      const PW=Math.round(size.w*dpr),PH=Math.round(size.h*dpr);
      if(canvas.width!==PW||canvas.height!==PH){canvas.width=PW;canvas.height=PH;}
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.clearRect(0,0,size.w,size.h);
      ctx.drawImage(staticRef.current,0,0,size.w,size.h);

      // ── Source-corridor heat glow (Punjab/Haryana) ──────────
      const srcPulse=(Math.sin(ts/950)+1)/2;
      const[sgx,sgy]=proj([75.7,30.9]);
      const sgrad=ctx.createRadialGradient(sgx,sgy,6,sgx,sgy,120);
      sgrad.addColorStop(0,`rgba(232,163,61,${0.05+srcPulse*0.08})`);
      sgrad.addColorStop(1,"rgba(232,163,61,0)");
      ctx.beginPath();ctx.arc(sgx,sgy,120,0,Math.PI*2);ctx.fillStyle=sgrad;ctx.fill();

      // ── PM2.5 heat halo over Delhi ───────────────────────────
      const pm=Math.max(0,smokePm25||0);
      if(pm>1){
        const[dx0,dy0]=proj([77.209,28.614]);
        const haloR=Math.min(170,28+Math.sqrt(pm)*9)+(Math.sin(ts/800)*5);
        const pa=Math.min(.32,0.06+Math.sqrt(pm)*0.028);
        const hg=ctx.createRadialGradient(dx0,dy0,0,dx0,dy0,haloR);
        hg.addColorStop(0,`rgba(255,180,90,${pa})`);
        hg.addColorStop(.55,`rgba(210,90,60,${pa*.6})`);
        hg.addColorStop(1,"rgba(210,90,60,0)");
        ctx.beginPath();ctx.arc(dx0,dy0,haloR,0,Math.PI*2);ctx.fillStyle=hg;ctx.fill();
        ctx.save();
        ctx.strokeStyle="rgba(255,185,100,0.18)";
        for(let k=1;k<=2;k++){
          const pr=((ts/2000)+k/2)%1;
          ctx.globalAlpha=(1-pr)*0.5;
          ctx.beginPath();ctx.arc(dx0,dy0,haloR*pr,0,Math.PI*2);ctx.stroke();
        }
        ctx.restore();
      }

      // ── Wind particle trails ─────────────────────────────────
      const wr=windRad();
      const dBase=degPerMs*dt*60; // advance per frame
      const dLng0=Math.sin(wr)*dBase;
      const dLat0=Math.cos(wr)*dBase;
      windParticlesRef.current = windParticlesRef.current.map(p=>{
        let {lng,lat,age,speed,drift,wob,amp}=p;
        // Curving streamline: lateral meander perpendicular to flow
        const curve=Math.sin(lat*wob+ts*0.0004+drift)*amp;
        lng += dLng0*speed - Math.cos(wr)*dBase*speed*curve;
        lat += dLat0*speed + Math.sin(wr)*dBase*speed*curve;
        age += dt/4200;
        // Reset when particle exits India bbox or completes lifecycle
        if(age>1||lng<68||lng>98||lat<8||lat>38){
          lng=69+Math.random()*27;lat=9+Math.random()*28;age=0;
        }
        return{...p,lng,lat,age};
      });

      // Draw wind streaks
      ctx.save();
      windParticlesRef.current.forEach(p=>{
        const[px,py]=proj([p.lng,p.lat]);
        if(px<0||py<0||px>size.w||py>size.h)return;
        const alpha=Math.sin(p.age*Math.PI)*0.28; // fade in/out
        const len=9+p.speed*8;
        // Trail direction: opposite of wind travel (where it came from)
        const tx=Math.sin(wr)*len, ty=Math.cos(wr)*len;
        const g=ctx.createLinearGradient(px,py,px-tx,py-ty);
        g.addColorStop(0,`rgba(96,168,240,${alpha})`);
        g.addColorStop(.7,`rgba(74,112,150,${alpha*.6})`);
        g.addColorStop(1,"rgba(74,112,150,0)");
        ctx.lineWidth=1.2;
        ctx.strokeStyle=g;
        ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px-tx,py-ty);ctx.stroke();
        // Head dot
        ctx.beginPath();ctx.arc(px,py,1.4,0,Math.PI*2);
        ctx.fillStyle=`rgba(130,190,250,${Math.min(0.75,alpha*1.7)})`;ctx.fill();
        // Arrowheads on some particles
        if(p.age>0.45&&p.age<0.8){
          const hx=tx*0.32, hy=ty*0.32;
          const b1x=ty*2.1,b1y=-tx*2.1,b2x=-ty*2.1,b2y=tx*2.1;
          ctx.strokeStyle=`rgba(130,190,250,${alpha})`;ctx.lineWidth=1;
          ctx.beginPath();
          ctx.moveTo(px+hx+b1x,py+hy+b1y);
          ctx.lineTo(px+tx*0.62,py+ty*0.62);
          ctx.lineTo(px+hx+b2x,py+hy+b2y);
          ctx.stroke();
        }
      });
      ctx.restore();

      // ── Smoke plume particles from API ───────────────────────
      const sa=isConfidenceDegraded?.08:.18;
      (particles||[]).forEach(p=>{
        const[px,py]=proj([p.lon,p.lat]);
        const r=Math.max(10,Math.min(28,10+p.age*4));
        const a=Math.min(sa,p.density*.26);if(a<.01)return;
        // Soft outer halo
        const og=ctx.createRadialGradient(px,py,0,px,py,r*1.9);
        og.addColorStop(0,`rgba(120,150,200,${a*0.35})`);
        og.addColorStop(1,"rgba(120,150,200,0)");
        ctx.beginPath();ctx.arc(px,py,r*1.9,0,Math.PI*2);ctx.fillStyle=og;ctx.fill();
        // Hazy smoke blob
        const g=ctx.createRadialGradient(px,py,0,px,py,r);
        g.addColorStop(0,`rgba(200,155,90,${a*0.7})`);
        g.addColorStop(0.4,`rgba(96,165,235,${a})`);
        g.addColorStop(1,"rgba(96,165,235,0)");
        ctx.beginPath();ctx.arc(px,py,r,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();
        // Small wisp lines emanating in wind direction
        ctx.save();ctx.globalAlpha=a*0.55;
        for(let i=0;i<4;i++){
          const wobble=Math.sin(ts/650+i*1.7+p.lat*4)*0.12;
          const angle=wr+(i-1.5)*0.28+wobble;
          const wlen=r*(0.6+i*0.16);
          ctx.beginPath();
          ctx.moveTo(px,py);
          ctx.quadraticCurveTo(
            px+Math.sin(angle)*wlen*0.6,py-Math.cos(angle)*wlen*0.6,
            px+Math.sin(angle+wobble)*wlen,py-Math.cos(angle+wobble)*wlen);
          ctx.strokeStyle=`rgba(200,175,110,0.45)`;ctx.lineWidth=0.9;ctx.stroke();
        }
        ctx.restore();
      });

      // ── Transport arc ────────────────────────────────────────
      const wp=[proj([75.34,31.1]),proj([76.09,29.65]),proj([77.209,28.614])];
      const cp=proj([76.15,30.2]); // curve control point
      const quad=(p0,p1,p2,t)=>[
        (1-t)*(1-t)*p0[0]+2*(1-t)*t*p1[0]+t*t*p2[0],
        (1-t)*(1-t)*p0[1]+2*(1-t)*t*p1[1]+t*t*p2[1],
      ];
      ctx.save();
      // Soft gradient corridor band
      const cg=ctx.createLinearGradient(...wp[0],...wp[2]);
      cg.addColorStop(0,"rgba(232,163,61,0.0)");
      cg.addColorStop(.45,"rgba(232,163,61,0.16)");
      cg.addColorStop(1,"rgba(74,143,224,0.16)");
      ctx.strokeStyle=cg;ctx.lineWidth=30;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(...wp[0]);ctx.quadraticCurveTo(...cp,...wp[2]);ctx.stroke();
      // Dashed centerline
      ctx.setLineDash([5,5]);ctx.lineWidth=1.3;
      ctx.strokeStyle="rgba(255,190,90,0.65)";
      ctx.beginPath();ctx.moveTo(...wp[0]);ctx.quadraticCurveTo(...cp,...wp[2]);ctx.stroke();
      ctx.restore();
      // Travelling pulse along the curve
      const pulseT=arcT<.5?arcT*2:(1-arcT)*2;
      const[pax,pay]=quad(wp[0],cp,wp[2],pulseT);
      const dc=arcT<.5?C.amber:C.blue;
      ctx.save();ctx.shadowColor=dc;ctx.shadowBlur=14;
      ctx.beginPath();ctx.arc(pax,pay,5,0,Math.PI*2);ctx.fillStyle=dc;ctx.fill();
      ctx.beginPath();ctx.arc(pax,pay,11,0,Math.PI*2);
      ctx.fillStyle=dc+"44";ctx.fill();
      ctx.restore();

      // ── Fire markers - light up as playback reaches acquisition time ──
      hourInfo.forEach(({fire,ign})=>{
        if(hour<ign)return; // not yet detected - hidden until scrubber reaches it
        const age=Math.max(0,(currentHour||0)-ign);
        const burn=Math.max(0.2,1-age/40); // fresh = raging, old = smolder
        const[fx,fy]=proj([fire.longitude,fire.latitude]);
        const r=frpR(fire.frp),col=frpColor(fire.frp);
        const pulse=(Math.sin(ts/900+fire.id*1.7)+1)/2;
        const sel=fire.id===selectedClusterId;
        const flash=hour===ign?Math.max(0,1-((currentHour||0)-ign)):0;
        // Expanding pulse rings - stronger while burning fresh
        ctx.save();
        for(let k=0;k<2;k++){
          const pr=((ts/1500)+k/2+fire.id*0.07)%1;
          const rr=r*(1+pr*3.2);
          ctx.globalAlpha=(1-pr)*0.4*burn;
          ctx.strokeStyle=col;
          ctx.lineWidth=sel?1.6:1;
          ctx.beginPath();ctx.arc(fx,fy,rr,0,Math.PI*2);ctx.stroke();
        }
        ctx.restore();
        // Ignition flash ring when playback first reaches this fire
        if(flash>0){
          ctx.save();
          ctx.globalAlpha=flash*0.85;
          ctx.strokeStyle="#FFF3C8";
          ctx.lineWidth=1.6;
          ctx.beginPath();ctx.arc(fx,fy,r*(1.7+flash*2.6),0,Math.PI*2);ctx.stroke();
          ctx.restore();
        }
        // Rising ember sparks - visible proof the fire is burning
        if(burn>0.45){
          ctx.save();
          for(let k=0;k<3;k++){
            const ph=((ts/520+k*0.33+fire.id*0.13)%1);
            const ex=fx+Math.sin(ph*6+fire.id*0.9)*r*0.7;
            const ey=fy-ph*r*3.2;
            const ea=(1-ph)*burn*0.9;
            if(ea<=0)continue;
            ctx.globalAlpha=ea;
            ctx.fillStyle=k%2?"#FFB45C":"#E85D3D";
            ctx.beginPath();ctx.arc(ex,ey,Math.max(0.6,(1-ph)*1.5),0,Math.PI*2);ctx.fill();
          }
          ctx.restore();
        }
        // Smoke wisp above fire - smoldering fires wisp less
        ctx.save();ctx.globalAlpha=0.35*burn;
        for(let i=0;i<4;i++){
          const wispX=fx+Math.sin(ts/700+i*2.1)*r*1.2;
          const wispH=r*(1.6+i*0.42);
          const g=ctx.createLinearGradient(wispX,fy,wispX+Math.sin(wr)*wispH*0.3,fy-wispH);
          g.addColorStop(0,col+"88");g.addColorStop(1,col+"00");
          ctx.beginPath();ctx.moveTo(wispX,fy);
          ctx.quadraticCurveTo(wispX+Math.sin(wr)*wispH*0.5,fy-wispH*0.5,
            wispX+Math.sin(wr)*wispH,fy-wispH);
          ctx.strokeStyle=g;ctx.lineWidth=1.5;ctx.stroke();
        }
        ctx.restore();
        // Breathing halo - flares on ignition, dims as it smolders
        const glowR=r*(2.4+pulse*1.4+flash*3);
        const glowCol=burn>0.55?col:"#8A3B22";
        const g=ctx.createRadialGradient(fx,fy,0,fx,fy,glowR);
        g.addColorStop(0,`${glowCol}${sel?"88":"55"}`);g.addColorStop(1,glowCol+"00");
        ctx.beginPath();ctx.arc(fx,fy,glowR,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();
        // Flame core - flickers, cools to ember as it ages
        ctx.save();
        const flick=(Math.sin(ts/120+fire.id*2.3)+1)/2;
        ctx.shadowColor=burn>0.55?col:"#7A2E16";
        ctx.shadowBlur=(sel?16:8)+pulse*6+flash*10;
        ctx.beginPath();ctx.arc(fx,fy,r*(0.85+flick*0.3),0,Math.PI*2);ctx.fillStyle=col;ctx.fill();
        if(burn>0.55){
          const core=ctx.createRadialGradient(fx-r*0.25,fy-r*0.25,0,fx,fy,r);
          core.addColorStop(0,`rgba(255,243,200,${0.7+flick*0.3})`);core.addColorStop(1,col);
          ctx.beginPath();ctx.arc(fx,fy,r*0.55,0,Math.PI*2);ctx.fillStyle=core;ctx.fill();
        }
        if(sel){ctx.strokeStyle="#fff";ctx.lineWidth=1.8;ctx.beginPath();ctx.arc(fx,fy,r+1.5,0,Math.PI*2);ctx.stroke();}
        ctx.restore();
        // Custom fire dashed ring
        if(fire.is_custom){
          ctx.save();ctx.setLineDash([2,2]);ctx.strokeStyle=col+"AA";ctx.lineWidth=1;
          ctx.beginPath();ctx.arc(fx,fy,r+5,0,Math.PI*2);ctx.stroke();ctx.restore();
        }
        // FRP label on selected fire with burn age
        if(sel){
          ctx.save();ctx.font="700 9px 'JetBrains Mono',monospace";
          ctx.fillStyle="#000";ctx.globalAlpha=.5;
          ctx.fillText(`${fire.frp} MW · +${Math.round(age)}h`,fx+2,fy-r-6);
          ctx.globalAlpha=.9;ctx.fillStyle=col;
          ctx.fillText(`${fire.frp} MW · +${Math.round(age)}h`,fx+1,fy-r-7);
          ctx.restore();
        }
      });

      // ── Delhi receptor ring ──────────────────────────────────
      const[dx,dy]=proj([77.209,28.614]);
      const dpulse=(Math.sin(ts/700)+1)/2;
      // Rotating radar-scan tick
      ctx.save();
      const scan=((ts/2400)%1)*Math.PI*2;
      ctx.strokeStyle=rc+"66";ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(dx,dy);ctx.lineTo(dx+Math.cos(scan)*20,dy+Math.sin(scan)*20);ctx.stroke();
      ctx.restore();
      ctx.save();ctx.shadowColor=rc;ctx.shadowBlur=12+dpulse*6;
      ctx.beginPath();ctx.arc(dx,dy,14,0,Math.PI*2);
      ctx.strokeStyle=rc+"DD";ctx.lineWidth=1.8;
      if(riskLevel==="High")ctx.setLineDash([3,2]);
      ctx.stroke();
      ctx.globalAlpha=dpulse*0.4;
      ctx.beginPath();ctx.arc(dx,dy,22+dpulse*8,0,Math.PI*2);
      ctx.strokeStyle=rc+"77";ctx.lineWidth=1.2;
      if(riskLevel==="High")ctx.setLineDash([3,2]);
      ctx.stroke();
      ctx.restore();
      ctx.save();ctx.shadowColor=rc;ctx.shadowBlur=8;
      ctx.beginPath();ctx.arc(dx,dy,4.5,0,Math.PI*2);ctx.fillStyle=rc;ctx.fill();ctx.restore();
      // PM2.5 readout beside the ring
      ctx.save();ctx.font="700 8.5px 'JetBrains Mono',monospace";
      const pmLabel=smokePm25!=null?`${smokePm25.toFixed(1)} µg/m³`:"--";
      ctx.shadowColor="rgba(0,0,0,0.9)";ctx.shadowBlur=4;
      ctx.fillStyle=rc;ctx.globalAlpha=.95;ctx.fillText(pmLabel,dx+2,dy-20);
      ctx.restore();

      // ── Scale bar ────────────────────────────────────────────
      const midLat=(VIEW.latMin+VIEW.latMax)/2;
      const kmPerPx=(VIEW.lngMax-VIEW.lngMin)*111.32*Math.cos(midLat*Math.PI/180)/(size.w-2*PAD);
      let scaleKm=1000;
      if(kmPerPx*420<100)scaleKm=100;else if(kmPerPx*420<250)scaleKm=200;else if(kmPerPx*420<550)scaleKm=500;
      const sbw=scaleKm/kmPerPx,sby=size.h-18,sbx=size.w-sbw-60;
      ctx.save();
      ctx.shadowColor="rgba(0,0,0,0.8)";ctx.shadowBlur=3;
      ctx.strokeStyle="rgba(200,225,250,0.8)";ctx.fillStyle="rgba(200,225,250,0.9)";
      ctx.lineWidth=1.2;ctx.font="700 8.5px 'JetBrains Mono',monospace";ctx.textAlign="left";
      ctx.beginPath();ctx.moveTo(sbx,sby);ctx.lineTo(sbx+sbw,sby);ctx.stroke();
      ctx.beginPath();ctx.moveTo(sbx,sby-4);ctx.lineTo(sbx,sby+4);ctx.stroke();
      ctx.beginPath();ctx.moveTo(sbx+sbw,sby-4);ctx.lineTo(sbx+sbw,sby+4);ctx.stroke();
      ctx.fillText(`${scaleKm} km`,sbx,sby-6);
      ctx.restore();

      // ── Compass rose ─────────────────────────────────────────
      const ccx=size.w-42,ccy=size.h-62,CR=25;
      ctx.save();
      ctx.shadowColor="rgba(0,0,0,0.6)";ctx.shadowBlur=5;
      ctx.fillStyle="rgba(8,11,16,0.55)";
      ctx.beginPath();ctx.arc(ccx,ccy,CR+7,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle="rgba(160,200,240,0.6)";ctx.lineWidth=1.2;
      ctx.beginPath();ctx.arc(ccx,ccy,CR,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle="rgba(160,200,240,0.3)";
      ctx.beginPath();ctx.arc(ccx,ccy,CR-6,0,Math.PI*2);ctx.stroke();
      ctx.textAlign="center";ctx.font="700 9px 'JetBrains Mono',monospace";
      ctx.fillStyle="rgba(200,225,250,0.85)";
      ctx.fillText("N",ccx,ccy-CR-4);ctx.fillText("S",ccx,ccy+CR+11);
      ctx.fillText("E",ccx+CR+8,ccy+3.5);ctx.fillText("W",ccx-CR-8,ccy+3.5);
      for(let a=0;a<360;a+=15){
        const inner=a%90===0?CR-9:CR-4;
        ctx.strokeStyle="rgba(160,200,240,0.5)";
        ctx.beginPath();
        ctx.moveTo(ccx+Math.sin(a*Math.PI/180)*(inner-4),ccy-Math.cos(a*Math.PI/180)*(inner-4));
        ctx.lineTo(ccx+Math.sin(a*Math.PI/180)*inner,ccy-Math.cos(a*Math.PI/180)*inner);
        ctx.stroke();
      }
      // Wind direction needle (points toward where wind comes FROM)
      ctx.translate(ccx,ccy);
      ctx.rotate(windDirection*Math.PI/180);
      ctx.strokeStyle=C.amber;ctx.fillStyle=C.amber;
      ctx.lineWidth=1.8;
      ctx.beginPath();ctx.moveTo(0,5);ctx.lineTo(0,-CR+8);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,-CR+6);ctx.lineTo(-4,-CR+15);ctx.lineTo(4,-CR+15);ctx.closePath();ctx.fill();
      ctx.rotate(-windDirection*Math.PI/180);
      ctx.fillStyle="rgba(200,225,250,0.5)";ctx.font="700 7.5px 'JetBrains Mono',monospace";
      ctx.fillText("WIND",0,CR+20);
      ctx.restore();

      // Spawn mode border
      if(spawnMode){
        ctx.save();ctx.strokeStyle=C.amber+"88";ctx.lineWidth=1;ctx.setLineDash([4,3]);
        ctx.strokeRect(2,2,size.w-4,size.h-4);ctx.restore();
      }
    };
    rafRef.current=requestAnimationFrame(loop);
    return()=>cancelAnimationFrame(rafRef.current);
  },[ready,size.w,size.h,proj,fires,particles,riskLevel,isConfidenceDegraded,
     selectedClusterId,spawnMode,windSpeed,windDirection,smokePm25,
     hourInfo,currentHour,hour,firesLit]);

  const handleClick=useCallback(e=>{
    const rect=canvasRef.current?.getBoundingClientRect();if(!rect)return;
    // Use rect dimensions directly - canvas is stretched to fill via CSS
    // so map CSS pixels to canvas logical pixels
    const cx=(e.clientX-rect.left)*(size.w/rect.width);
    const cy=(e.clientY-rect.top)*(size.h/rect.height);
    if(hourInfo.length&&onSelectCluster&&!spawnMode){
      let best=null,bestD=24;
      hourInfo.forEach(({fire,ign})=>{
        if(hour<ign)return; // only lit fires are interactive
        const[fx,fy]=proj([fire.longitude,fire.latitude]);
        const d=Math.hypot(cx-fx,cy-fy);
        if(d<bestD){bestD=d;best=fire;}
      });
      if(best){onSelectCluster(best);return;}
    }
    if(spawnMode&&onAddFire){
      const[lng,lat]=invProj(size.w,size.h,cx,cy);
      if(lng>=68&&lng<=97&&lat>=8&&lat<=37){onAddFire(lat,lng);setSpawnMode(false);}
      return;
    }
    const now=Date.now();
    if(now-lastClick.current<350&&onAddFire){
      const[lng,lat]=invProj(size.w,size.h,cx,cy);
      if(lng>=68&&lng<=97&&lat>=8&&lat<=37)onAddFire(lat,lng);
    }
    lastClick.current=now;
  },[hourInfo,hour,onSelectCluster,onAddFire,proj,size,spawnMode]);

  const handleMouseMove=useCallback(e=>{
    const rect=canvasRef.current?.getBoundingClientRect();if(!rect)return;
    const cx=(e.clientX-rect.left)*(size.w/rect.width);
    const cy=(e.clientY-rect.top)*(size.h/rect.height);
    if(hourInfo.length){
      for(const{fire,ign}of hourInfo){
        if(hour<ign)continue; // only lit fires show tooltips
        const[fx,fy]=proj([fire.longitude,fire.latitude]);
        if(Math.hypot(cx-fx,cy-fy)<frpR(fire.frp)+8){
          const acq=new Date(fire.acq_time);
          const acqTxt=Number.isNaN(acq.getTime())
            ?"unknown"
            :acq.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
          setTooltip({x:e.clientX-rect.left,y:e.clientY-rect.top,
            text:`FRP: ${fire.frp} MW · acq ${acqTxt}`,
            sub:fire.is_custom?"Custom fire":"NASA FIRMS"});
          return;
        }
      }
    }
    setTooltip(null);
  },[hourInfo,hour,proj,size]);

  const rc=riskCol(riskLevel);
  return(
    <div ref={wrapRef} style={{position:"relative",width:"100%",height:"100%",
      background:C.bg,overflow:"hidden"}}
      onClick={handleClick} onMouseMove={handleMouseMove}
      onMouseLeave={()=>setTooltip(null)}>
      <canvas ref={canvasRef} width={size.w} height={size.h}
        style={{display:"block",width:"100%",height:"100%",cursor:spawnMode?"crosshair":"default"}}/>
      {building&&(
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",
          alignItems:"center",justifyContent:"center",gap:12,background:"rgba(8,10,14,0.8)",
          backdropFilter:"blur(2px)",zIndex:30,animation:"shFade .2s ease"}}>
          <div style={{width:150,height:3,background:C.border,borderRadius:3,overflow:"hidden"}}>
            <div style={{height:"100%",background:`linear-gradient(90deg,${C.amber},${C.blue})`,borderRadius:3,
              animation:"mbar 1.1s ease-in-out infinite alternate",width:"45%"}}/>
          </div>
          <span style={{color:C.amber,fontFamily:"JetBrains Mono,monospace",
            fontSize:9,letterSpacing:"0.14em",opacity:.7}}>RENDERING MAP…</span>
        </div>
      )}
      {tooltip&&(
        <div style={{position:"absolute",left:tooltip.x+12,top:tooltip.y-34,
          background:"rgba(10,12,15,0.95)",border:`1px solid ${C.amber}55`,borderRadius:4,
          padding:"5px 10px",fontFamily:"JetBrains Mono,monospace",fontSize:10,
          color:C.amber,pointerEvents:"none",zIndex:20,boxShadow:"0 3px 14px rgba(0,0,0,0.5)",
          animation:"shFade .18s ease"}}>
          {tooltip.text}
          {tooltip.sub&&<div style={{color:C.muted,fontSize:8.5,letterSpacing:"0.05em"}}>{tooltip.sub}</div>}
        </div>
      )}
      {/* Map title badge */}
      <div style={{position:"absolute",top:12,left:"50%",transform:"translateX(-50%)",zIndex:10,
        background:"rgba(10,12,15,0.85)",backdropFilter:"blur(5px)",border:`1px solid ${C.border}`,borderRadius:4,
        padding:"5px 14px",fontSize:8.5,color:C.muted,letterSpacing:"0.18em",
        fontFamily:"JetBrains Mono,monospace",display:"flex",alignItems:"center",gap:7,whiteSpace:"nowrap",
        boxShadow:"0 2px 12px rgba(0,0,0,0.4)"}}>
        <span style={{width:6,height:6,borderRadius:"50%",background:rc,boxShadow:`0 0 7px ${rc}`,
          display:"inline-block",animation:"shPulse 2s ease-in-out infinite"}}/>
        SMOKE HORIZON <span style={{color:C.border}}>·</span> REGIONAL TRANSPORT
      </div>
      {onAddFire&&(
        <div style={{position:"absolute",top:12,left:12,zIndex:10,display:"flex",flexDirection:"column",gap:5}}>
          <div style={{display:"flex",gap:5}}>
            <button onClick={e=>{e.stopPropagation();setSpawnMode(m=>!m);}}
              title={spawnMode?"Click map to place · ESC to cancel":"Enable fire placement"}
              className={`sh-map-btn${spawnMode?" active":""}`}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 2c1 2 2 3.5 2 5.5 0 2.5-1.5 4.5-4 4.5s-4-2-4-4.5c0-2 1-3.5 2-5.5z"/>
                <path d="M17.5 12c1.5 1.5 2.5 3 2.5 5 0 3.5-3 6.5-6.5 6.5-3.5 0-6.5-3-6.5-6.5 0-2 1-3.5 2.5-5"/>
              </svg>
              {spawnMode?"CLICK TO PLACE  ✕":"+ SPAWN FIRE"}
            </button>
            {customFireCount>0&&onClearFires&&(
              <button onClick={e=>{e.stopPropagation();onClearFires();}}
                title="Remove all custom fires"
                className="sh-map-btn sh-map-btn-danger">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                CLEAR {customFireCount}
              </button>
            )}
          </div>
          {spawnMode&&(
            <div style={{padding:"3px 9px",background:"rgba(232,163,61,0.10)",
              border:"1px solid rgba(232,163,61,0.3)",borderRadius:4,
              fontFamily:"JetBrains Mono,monospace",fontSize:8,color:C.amber,letterSpacing:"0.05em",
              animation:"shFade .18s ease"}}>
              Click map · ESC to cancel
            </div>
          )}
        </div>
      )}
      {/* Wind widget */}
      <div style={{position:"absolute",top:12,right:12,zIndex:10,background:"rgba(10,12,15,0.88)",
        backdropFilter:"blur(6px)",border:`1px solid ${C.border}`,borderRadius:6,padding:"7px 12px",
        display:"flex",alignItems:"center",gap:11,fontFamily:"JetBrains Mono,monospace",
        boxShadow:"0 4px 18px rgba(0,0,0,0.45)"}}>
        <div style={{transform:`rotate(${(windDirection+180)%360}deg)`,width:30,height:30,
          display:"flex",alignItems:"center",justifyContent:"center",
          border:`2px solid ${C.blue}`,borderRadius:"50%",
          transition:"transform 0.35s cubic-bezier(0.34,1.56,0.64,1)",
          boxShadow:`0 0 10px rgba(74,143,224,0.35)`}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke={C.blue} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <polyline points="19 12 12 19 5 12"/>
          </svg>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:1}}>
          <div style={{fontSize:7.5,color:C.muted,textTransform:"uppercase",letterSpacing:"0.14em"}}>Wind vector</div>
          <div style={{fontSize:12,fontWeight:"bold",color:C.text}}>
            {windSpeed.toFixed(1)} km/h{" "}
            <span style={{color:C.blue,fontSize:9}}>{windDirection.toFixed(0)}°</span>
          </div>
        </div>
      </div>
      {/* Legend panel: collapsible so it never hides the map */}
      {legendOpen?(
        <div style={{position:"absolute",bottom:12,left:12,zIndex:10,background:"rgba(10,12,15,0.92)",
          backdropFilter:"blur(6px)",border:`1px solid ${C.border}`,borderRadius:6,padding:"9px 12px",fontSize:9,
          color:C.muted,fontFamily:"JetBrains Mono,monospace",display:"flex",flexDirection:"column",gap:5,minWidth:184,
          boxShadow:"0 4px 18px rgba(0,0,0,0.45)",animation:"shFade .2s ease"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,fontSize:8,letterSpacing:"0.16em",color:C.text,fontWeight:700}}>
              <span style={{width:3,height:10,background:C.amber,display:"inline-block"}}/>
              MAP LEGEND
            </div>
            <button onClick={()=>setLegendOpen(false)} title="Collapse legend"
              className="sh-map-btn" style={{padding:"2px 6px",fontSize:8}}>
              ✕ HIDE
            </button>
          </div>
          <div style={{height:1,background:C.border}}/>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:C.amber,boxShadow:"0 0 8px rgba(232,163,61,0.9)",display:"inline-block",flexShrink:0}}/>
            Fire cluster <span style={{color:C.muted}}>(size ∝ FRP)</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:"#8A3B22",boxShadow:"0 0 6px rgba(138,59,34,0.8)",display:"inline-block",flexShrink:0}}/>
            Ember <span style={{color:C.muted}}>(smoldering)</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:C.blue,opacity:.7,display:"inline-block",flexShrink:0}}/>
            Smoke plume
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{width:12,height:2,background:"rgba(96,168,240,0.9)",display:"inline-block",flexShrink:0}}/>
            Wind streamlines
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{width:16,height:2,background:"linear-gradient(90deg,#E8A33D,#4A8FE0)",display:"inline-block",flexShrink:0}}/>
            Transport corridor
          </div>
          <div style={{height:1,background:C.border}}/>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:rc,boxShadow:`0 0 8px ${rc}`,display:"inline-block",flexShrink:0}}/>
            Delhi risk: <strong style={{color:rc}}>{riskLevel}</strong>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:"rgba(255,180,90,0.7)",boxShadow:"0 0 8px rgba(255,180,90,0.8)",display:"inline-block",flexShrink:0}}/>
            PM2.5 heat halo {smokePm25!=null&&<strong style={{color:rc,marginLeft:3}}>{smokePm25.toFixed(1)} µg/m³</strong>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:"#A9C0D4",display:"inline-block",flexShrink:0}}/>
            Major cities
          </div>
          <div style={{color:C.text3,fontSize:8,lineHeight:1.5,opacity:.9}}>
            Scrub the timeline: fires light as satellite scans detect them.
          </div>
          {isConfidenceDegraded&&<div style={{color:C.amber,opacity:.85}}>⚠ Confidence degraded</div>}
        </div>
      ):(
        <button onClick={()=>setLegendOpen(true)} title="Show map legend"
          className="sh-map-btn" style={{position:"absolute",bottom:12,left:12,zIndex:10}}>
          <span style={{width:3,height:10,background:C.amber,display:"inline-block",borderRadius:1}}/>
          MAP LEGEND <span style={{color:C.amber}}>▸</span>
        </button>
      )}
      {/* Fire replay HUD */}
      {(fires||[]).length>0&&(
        <div style={{position:"absolute",right:12,bottom:96,zIndex:10,background:"rgba(10,12,15,0.9)",
          backdropFilter:"blur(6px)",border:`1px solid ${C.border}`,borderRadius:6,padding:"7px 10px",
          display:"flex",flexDirection:"column",gap:4,fontFamily:"JetBrains Mono,monospace",minWidth:138,
          boxShadow:"0 4px 18px rgba(0,0,0,0.45)",animation:"shFade .25s ease"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:8,
            letterSpacing:"0.14em",textTransform:"uppercase",color:C.muted}}>
            <span style={{display:"flex",alignItems:"center",gap:5,color:C.amber,fontWeight:700}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:C.amber,
                boxShadow:`0 0 6px ${C.amber}`,animation:"shPulse 1.2s ease-in-out infinite",
                display:"inline-block"}}/>
              Fire replay
            </span>
            <span style={{color:C.text,fontWeight:700}}>{firesLit}/{fires.length}</span>
          </div>
          <div style={{height:4,background:C.border,borderRadius:2,overflow:"hidden"}}>
            <div style={{height:"100%",
              width:`${timelineLen>1?Math.min(100,(currentHour||0)/(timelineLen-1)*100):0}%`,
              background:"linear-gradient(90deg,#E8A33D,#E85D3D)",borderRadius:2,
              transition:"width .1s linear"}}/>
          </div>
        </div>
      )}
      {isConfidenceDegraded&&(
        <div style={{position:"absolute",top:44,left:"50%",transform:"translateX(-50%)",zIndex:10,
          background:"rgba(232,163,61,0.10)",border:"1px solid rgba(232,163,61,0.35)",
          borderRadius:4,padding:"4px 10px",fontSize:9,color:C.amber,
          fontFamily:"JetBrains Mono,monospace",display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap",
          animation:"shFade .25s ease"}}>
          ⚠ Cloud cover · satellite confidence degraded
        </div>
      )}
      <style>{`
@keyframes mbar{from{margin-left:0}to{margin-left:55%}}
@keyframes shFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes shPulse{0%,100%{opacity:.5}50%{opacity:1}}
.sh-map-btn{display:flex;align-items:center;gap:6px;padding:6px 12px;background:rgba(10,12,15,0.92);border:1px solid #1C2430;border-radius:4px;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;letter-spacing:0.07em;color:#6B7280;transition:all .18s ease;white-space:nowrap;backdrop-filter:blur(4px);box-shadow:0 2px 10px rgba(0,0,0,0.35)}
.sh-map-btn:hover{color:#E8A33D;border-color:rgba(232,163,61,0.6);background:rgba(232,163,61,0.10);transform:translateY(-1px)}
.sh-map-btn.active{color:#E8A33D;border-color:#E8A33D;background:rgba(232,163,61,0.16);box-shadow:0 0 12px rgba(232,163,61,0.25)}
.sh-map-btn-danger{color:#E85D3D;border-color:rgba(232,93,61,0.4);background:rgba(232,93,61,0.10)}
.sh-map-btn-danger:hover{color:#F07040;border-color:rgba(232,93,61,0.7);background:rgba(232,93,61,0.18);transform:translateY(-1px)}
`}</style>
    </div>
  );
}
