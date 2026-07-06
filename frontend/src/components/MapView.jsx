import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";

const C = {
  bg:"#0A0C0F", amber:"#E8A33D", blue:"#4A8FE0", green:"#1D9E75",
  red:"#E85D3D", text:"#E8E6E0", muted:"#6B7280", border:"#1C2430",
  surface:"rgba(10,12,15,0.93)",
};
const riskCol = l => l==="High"?C.red:l==="Moderate"?C.amber:C.green;
const frpColor = frp => frp>300?C.red:frp>150?"#F07040":frp>60?C.amber:"#C07828";
const frpR = frp => Math.max(4,Math.min(14,3.5+Math.log(frp+1)*1.9));

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
const TRN=new Set(["Uttar Pradesh","Rajasthan","Himachal Pradesh","Uttarakhand"]);

function buildStaticCanvas(W,H,geoData,riskLevel){
  const oc=document.createElement("canvas");
  oc.width=W;oc.height=H;
  const ctx=oc.getContext("2d");
  ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,H);
  const proj=makeProj(W,H);
  const STEP=6,BORD=STEP*0.9;
  const rc=riskCol(riskLevel),rcRgb=hexRgb(rc);
  const feats=geoData.features.map(f=>({
    name:f.properties.name,
    pg:f.geometry?{type:f.geometry.type,coordinates:projGeo(f.geometry.coordinates,proj)}:null,
  }));
  const segs=[];
  feats.forEach(f=>{
    if(!f.pg)return;
    const rings=f.pg.type==="Polygon"?f.pg.coordinates:f.pg.coordinates.flat(1);
    rings.forEach(ring=>{
      for(let i=0;i<ring.length-1;i++){
        const[x1,y1]=ring[i],[x2,y2]=ring[i+1];
        segs.push({x1,y1,x2,y2,
          minX:Math.min(x1,x2)-BORD,maxX:Math.max(x1,x2)+BORD,
          minY:Math.min(y1,y2)-BORD,maxY:Math.max(y1,y2)+BORD});
      }
    });
  });
  const id=ctx.createImageData(W,H),buf=id.data;
  for(let i=0;i<buf.length;i+=4){buf[i]=10;buf[i+1]=12;buf[i+2]=15;buf[i+3]=255;}
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
      if(SRC.has(name))      [r,g,b]=nb?[232,132,55]:[180,75,20];
      else if(REC.has(name)) [r,g,b]=nb?rcRgb:rcRgb.map(v=>Math.round(v*.45));
      else if(TRN.has(name)) [r,g,b]=nb?[74,96,112]:[38,52,68];
      else                   [r,g,b]=nb?[52,78,100]:[28,42,58];
      const dr=nb?2:1,dr2=dr*dr;
      for(let dy=-dr;dy<=dr;dy++)for(let dx=-dr;dx<=dr;dx++){
        if(dx*dx+dy*dy>dr2+.5)continue;
        const nx=gx+dx,ny=gy+dy;
        if(nx<0||ny<0||nx>=W||ny>=H)continue;
        const idx=(ny*W+nx)*4;
        buf[idx]=r;buf[idx+1]=g;buf[idx+2]=b;buf[idx+3]=255;
      }
    }
  }
  ctx.putImageData(id,0,0);
  ctx.save();
  feats.forEach(f=>{
    if(!f.pg)return;
    const rings=f.pg.type==="Polygon"?f.pg.coordinates:f.pg.coordinates.flat(1);
    rings.forEach(ring=>{
      if(ring.length<3)return;
      ctx.beginPath();ctx.moveTo(ring[0][0],ring[0][1]);
      for(let i=1;i<ring.length;i++)ctx.lineTo(ring[i][0],ring[i][1]);
      ctx.closePath();
      ctx.strokeStyle=SRC.has(f.name)?"#B85820":REC.has(f.name)?rc+"88":"#263545";
      ctx.lineWidth=SRC.has(f.name)||REC.has(f.name)?0.8:0.5;
      ctx.stroke();
    });
  });
  ctx.restore();
  const lbl=(p,t,col,sz)=>{
    const[x,y]=proj(p);
    ctx.save();ctx.font=`700 ${sz}px 'JetBrains Mono',monospace`;
    ctx.fillStyle="#000";ctx.globalAlpha=.55;ctx.fillText(t,x+1,y+1);
    ctx.fillStyle=col;ctx.globalAlpha=.88;ctx.fillText(t,x,y);ctx.restore();
  };
  lbl([75.0,31.9],"PUNJAB",C.amber,9);
  lbl([75.8,29.1],"HARYANA",C.blue,9);
  lbl([76.8,28.15],"DELHI-NCR",rc,9);
  lbl([80.0,26.5],"UTTAR PRADESH","#405870",8);
  lbl([73.5,26.0],"RAJASTHAN","#405870",8);
  return oc;
}

export default function MapView({
  fires,particles,windSpeed,windDirection,
  onAddFire,onClearFires,flyTarget,riskLevel,smokePm25,
  isConfidenceDegraded,showConnectingArc=false,
  onSelectCluster,selectedClusterId,
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
  const customFireCount = (fires||[]).filter(f=>f.is_custom).length;

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
    const key=`${size.w}x${size.h}x${riskLevel}`;
    if(staticKey.current===key)return;
    staticKey.current=key;
    setReady(false);setBuilding(true);
    const id=setTimeout(()=>{
      staticRef.current=buildStaticCanvas(size.w,size.h,geoData,riskLevel);
      setBuilding(false);setReady(true);
    },0);
    return()=>clearTimeout(id);
  },[geoData,size.w,size.h,riskLevel]);

  // Wind particle system — client-side, driven by windSpeed/windDirection
  const windParticlesRef = useRef([]);
  useEffect(()=>{
    // Seed 60 wind streaks distributed across India's bounding box
    windParticlesRef.current = Array.from({length:60},(_,i)=>({
      id:i,
      // Random start inside India bbox (rough)
      lng: 70 + Math.random()*26,
      lat: 10 + Math.random()*26,
      age: Math.random(), // 0-1 lifecycle position
      speed: 0.3 + Math.random()*0.5,
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
      if(ts-last<50)return;
      const dt=ts-last;last=ts;
      if(!start)start=ts;
      const arcT=((ts-start)%ARC)/ARC;
      const rc=riskCol(riskLevel);
      if(canvas.width!==size.w||canvas.height!==size.h){canvas.width=size.w;canvas.height=size.h;}
      ctx.clearRect(0,0,size.w,size.h);
      ctx.drawImage(staticRef.current,0,0,size.w,size.h);

      // ── Wind particle trails ─────────────────────────────────
      const wr=windRad();
      const dLng = Math.sin(wr)*degPerMs*dt*60; // advance per frame
      const dLat = Math.cos(wr)*degPerMs*dt*60;
      windParticlesRef.current = windParticlesRef.current.map(p=>{
        let {lng,lat,age,speed}=p;
        lng += dLng*speed;
        lat += dLat*speed;
        age += dt/4000;
        // Reset when particle exits India bbox or completes lifecycle
        if(age>1||lng<68||lng>98||lat<8||lat>38){
          lng=70+Math.random()*26;lat=10+Math.random()*26;age=0;
        }
        return{...p,lng,lat,age};
      });

      // Draw wind streaks
      ctx.save();
      windParticlesRef.current.forEach(p=>{
        const[px,py]=proj([p.lng,p.lat]);
        if(px<0||py<0||px>size.w||py>size.h)return;
        const alpha=Math.sin(p.age*Math.PI)*0.25; // fade in/out
        const len=8+p.speed*6;
        // Trail direction: opposite of wind travel (where it came from)
        const tx=Math.sin(wr)*len, ty=Math.cos(wr)*len;
        const g=ctx.createLinearGradient(px,py,px-tx,py-ty);
        g.addColorStop(0,`rgba(61,90,115,${alpha})`);
        g.addColorStop(1,"rgba(61,90,115,0)");
        ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px-tx,py-ty);
        ctx.strokeStyle=g;ctx.lineWidth=1;ctx.stroke();
        // Head dot
        ctx.beginPath();ctx.arc(px,py,1,0,Math.PI*2);
        ctx.fillStyle=`rgba(74,143,224,${alpha*1.5})`;ctx.fill();
      });
      ctx.restore();

      // ── Smoke plume particles from API ───────────────────────
      const sa=isConfidenceDegraded?.08:.18;
      (particles||[]).forEach(p=>{
        const[px,py]=proj([p.lon,p.lat]);
        const r=Math.max(10,Math.min(28,10+p.age*4));
        const a=Math.min(sa,p.density*.22);if(a<.01)return;
        // Hazy smoke blob
        const g=ctx.createRadialGradient(px,py,0,px,py,r);
        g.addColorStop(0,`rgba(180,140,80,${a*0.6})`);
        g.addColorStop(0.4,`rgba(74,143,224,${a})`);
        g.addColorStop(1,"rgba(74,143,224,0)");
        ctx.beginPath();ctx.arc(px,py,r,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();
        // Small wisp lines emanating in wind direction
        ctx.save();ctx.globalAlpha=a*0.5;
        for(let i=0;i<3;i++){
          const angle=wr+(i-1)*0.3;
          const wlen=r*0.7;
          ctx.beginPath();
          ctx.moveTo(px,py);
          ctx.lineTo(px+Math.sin(angle)*wlen,py-Math.cos(angle)*wlen);
          ctx.strokeStyle=`rgba(180,160,100,0.4)`;ctx.lineWidth=0.8;ctx.stroke();
        }
        ctx.restore();
      });

      // ── Transport arc ────────────────────────────────────────
      const wp=[proj([75.34,31.1]),proj([76.09,29.65]),proj([77.209,28.614])];
      ctx.save();ctx.setLineDash([5,4]);ctx.lineWidth=1.5;
      ctx.strokeStyle=C.amber+"BB";
      ctx.beginPath();ctx.moveTo(...wp[0]);ctx.lineTo(...wp[1]);ctx.stroke();
      ctx.strokeStyle=C.blue+"BB";
      ctx.beginPath();ctx.moveTo(...wp[1]);ctx.lineTo(...wp[2]);ctx.stroke();
      ctx.restore();
      const seg=arcT<.5?0:1,st=arcT<.5?arcT*2:(arcT-.5)*2;
      const ax=wp[seg][0]+(wp[seg+1][0]-wp[seg][0])*st;
      const ay=wp[seg][1]+(wp[seg+1][1]-wp[seg][1])*st;
      const dc=seg===0?C.amber:C.blue;
      ctx.save();ctx.shadowColor=dc;ctx.shadowBlur=8;
      ctx.beginPath();ctx.arc(ax,ay,5,0,Math.PI*2);ctx.fillStyle=dc;ctx.fill();ctx.restore();

      // ── Fire markers ─────────────────────────────────────────
      (fires||[]).forEach(fire=>{
        const[fx,fy]=proj([fire.longitude,fire.latitude]);
        const r=frpR(fire.frp),col=frpColor(fire.frp);
        // Smoke wisp above fire
        ctx.save();ctx.globalAlpha=0.35;
        for(let i=0;i<4;i++){
          const wispX=fx+(Math.random()-0.5)*r*2;
          const wispH=r*(1.5+i*0.4);
          const g=ctx.createLinearGradient(wispX,fy,wispX+Math.sin(wr)*wispH*0.3,fy-wispH);
          g.addColorStop(0,col+"88");g.addColorStop(1,col+"00");
          ctx.beginPath();ctx.moveTo(wispX,fy);
          ctx.quadraticCurveTo(wispX+Math.sin(wr)*wispH*0.5,fy-wispH*0.5,
            wispX+Math.sin(wr)*wispH,fy-wispH);
          ctx.strokeStyle=g;ctx.lineWidth=1.5;ctx.stroke();
        }
        ctx.restore();
        // Halo
        const g=ctx.createRadialGradient(fx,fy,0,fx,fy,r*3.5);
        g.addColorStop(0,col+"55");g.addColorStop(1,col+"00");
        ctx.beginPath();ctx.arc(fx,fy,r*3.5,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();
        // Core
        ctx.save();ctx.shadowColor=col;ctx.shadowBlur=fire.id===selectedClusterId?14:7;
        ctx.beginPath();ctx.arc(fx,fy,r,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();
        if(fire.id===selectedClusterId){ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke();}
        ctx.restore();
        // Custom fire dashed ring
        if(fire.is_custom){
          ctx.save();ctx.setLineDash([2,2]);ctx.strokeStyle=col+"AA";ctx.lineWidth=1;
          ctx.beginPath();ctx.arc(fx,fy,r+4,0,Math.PI*2);ctx.stroke();ctx.restore();
        }
      });

      // ── Delhi receptor ring ──────────────────────────────────
      const[dx,dy]=proj([77.209,28.614]);
      ctx.save();ctx.shadowColor=rc;ctx.shadowBlur=10;
      ctx.beginPath();ctx.arc(dx,dy,13,0,Math.PI*2);
      ctx.strokeStyle=rc+"CC";ctx.lineWidth=1.5;
      if(riskLevel==="High")ctx.setLineDash([3,2]);
      ctx.stroke();
      ctx.beginPath();ctx.arc(dx,dy,4,0,Math.PI*2);ctx.fillStyle=rc;ctx.fill();
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
     selectedClusterId,spawnMode,windSpeed,windDirection]);

  const handleClick=useCallback(e=>{
    const rect=canvasRef.current?.getBoundingClientRect();if(!rect)return;
    // Use rect dimensions directly — canvas is stretched to fill via CSS
    // so map CSS pixels to canvas logical pixels
    const cx=(e.clientX-rect.left)*(size.w/rect.width);
    const cy=(e.clientY-rect.top)*(size.h/rect.height);
    if(fires&&onSelectCluster&&!spawnMode){
      let best=null,bestD=24;
      fires.forEach(f=>{
        const[fx,fy]=proj([f.longitude,f.latitude]);
        const d=Math.hypot(cx-fx,cy-fy);
        if(d<bestD){bestD=d;best=f;}
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
  },[fires,onSelectCluster,onAddFire,proj,size,spawnMode]);

  const handleMouseMove=useCallback(e=>{
    const rect=canvasRef.current?.getBoundingClientRect();if(!rect)return;
    const cx=(e.clientX-rect.left)*(size.w/rect.width);
    const cy=(e.clientY-rect.top)*(size.h/rect.height);
    if(fires){
      for(const f of fires){
        const[fx,fy]=proj([f.longitude,f.latitude]);
        if(Math.hypot(cx-fx,cy-fy)<frpR(f.frp)+8){
          setTooltip({x:e.clientX-rect.left,y:e.clientY-rect.top,
            text:`FRP: ${f.frp} MW`,sub:f.is_custom?"Custom fire":"NASA FIRMS"});
          return;
        }
      }
    }
    setTooltip(null);
  },[fires,proj,size]);

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
          alignItems:"center",justifyContent:"center",gap:10,background:"rgba(10,12,15,0.75)"}}>
          <div style={{width:140,height:2,background:C.border,borderRadius:2,overflow:"hidden"}}>
            <div style={{height:"100%",background:C.amber,borderRadius:2,
              animation:"mbar 1.1s ease-in-out infinite alternate",width:"45%"}}/>
          </div>
          <span style={{color:C.amber,fontFamily:"JetBrains Mono,monospace",
            fontSize:9,letterSpacing:"0.12em",opacity:.65}}>RENDERING MAP…</span>
        </div>
      )}
      {tooltip&&(
        <div style={{position:"absolute",left:tooltip.x+12,top:tooltip.y-32,
          background:C.surface,border:`1px solid ${C.border}`,borderRadius:3,
          padding:"4px 9px",fontFamily:"JetBrains Mono,monospace",fontSize:10,
          color:C.amber,pointerEvents:"none",zIndex:20}}>
          {tooltip.text}
          {tooltip.sub&&<div style={{color:C.muted,fontSize:9}}>{tooltip.sub}</div>}
        </div>
      )}
      {onAddFire&&(
        <div style={{position:"absolute",top:12,left:12,zIndex:10,display:"flex",flexDirection:"column",gap:5}}>
          <div style={{display:"flex",gap:5}}>
            <button onClick={e=>{e.stopPropagation();setSpawnMode(m=>!m);}}
              title={spawnMode?"Click map to place · ESC to cancel":"Enable fire placement"}
              style={{display:"flex",alignItems:"center",gap:6,padding:"5px 11px",
                background:spawnMode?"rgba(232,163,61,0.15)":C.surface,
                border:`1px solid ${spawnMode?C.amber:C.border}`,borderRadius:3,cursor:"pointer",
                fontFamily:"JetBrains Mono,monospace",fontSize:9,fontWeight:700,
                letterSpacing:"0.07em",color:spawnMode?C.amber:C.muted,
                transition:"all 0.15s",whiteSpace:"nowrap"}}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 2c1 2 2 3.5 2 5.5 0 2.5-1.5 4.5-4 4.5s-4-2-4-4.5c0-2 1-3.5 2-5.5z"/>
                <path d="M17.5 12c1.5 1.5 2.5 3 2.5 5 0 3.5-3 6.5-6.5 6.5-3.5 0-6.5-3-6.5-6.5 0-2 1-3.5 2.5-5"/>
              </svg>
              {spawnMode?"CLICK TO PLACE  ✕":"+ SPAWN FIRE"}
            </button>
            {customFireCount>0&&onClearFires&&(
              <button onClick={e=>{e.stopPropagation();onClearFires();}}
                title="Remove all custom fires"
                style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",
                  background:"rgba(232,93,61,0.10)",
                  border:"1px solid rgba(232,93,61,0.4)",borderRadius:3,cursor:"pointer",
                  fontFamily:"JetBrains Mono,monospace",fontSize:9,fontWeight:700,
                  letterSpacing:"0.07em",color:"#E85D3D",transition:"all 0.15s",whiteSpace:"nowrap"}}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                CLEAR {customFireCount}
              </button>
            )}
          </div>
          {spawnMode&&(
            <div style={{padding:"3px 8px",background:"rgba(232,163,61,0.08)",
              border:"1px solid rgba(232,163,61,0.2)",borderRadius:3,
              fontFamily:"JetBrains Mono,monospace",fontSize:8,color:C.amber,letterSpacing:"0.04em"}}>
              Click map · ESC to cancel
            </div>
          )}
        </div>
      )}
      <div style={{position:"absolute",top:12,right:12,zIndex:10,background:C.surface,
        border:`1px solid ${C.border}`,borderRadius:5,padding:"7px 12px",
        display:"flex",alignItems:"center",gap:10}}>
        <div style={{transform:`rotate(${(windDirection+180)%360}deg)`,width:28,height:28,
          display:"flex",alignItems:"center",justifyContent:"center",
          border:`2px solid ${C.blue}`,borderRadius:"50%",transition:"transform 0.2s linear"}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke={C.blue} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <polyline points="19 12 12 19 5 12"/>
          </svg>
        </div>
        <div>
          <div style={{fontSize:8,color:C.muted,textTransform:"uppercase",letterSpacing:"0.06em"}}>Wind</div>
          <div style={{fontSize:11,fontWeight:"bold",color:C.text,fontFamily:"JetBrains Mono,monospace"}}>
            {windSpeed.toFixed(1)} km/h{" "}
            <span style={{color:C.blue,fontSize:9}}>{windDirection.toFixed(0)}°</span>
          </div>
        </div>
      </div>
      <div style={{position:"absolute",bottom:12,left:12,zIndex:10,background:C.surface,
        border:`1px solid ${C.border}`,borderRadius:4,padding:"6px 10px",fontSize:9,
        color:C.muted,fontFamily:"JetBrains Mono,monospace",display:"flex",flexDirection:"column",gap:4}}>
        {[[C.amber,"Fire cluster (size ∝ FRP)",1],[C.blue,"Smoke plume",.6]].map(([c,t,o])=>(
          <div key={t} style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:c,display:"inline-block",opacity:o||1,flexShrink:0}}/>
            {t}
          </div>
        ))}
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{width:6,height:6,borderRadius:"50%",background:rc,display:"inline-block",flexShrink:0}}/>
          Delhi risk: <strong style={{color:rc,marginLeft:3}}>{riskLevel}</strong>
        </div>
        {isConfidenceDegraded&&<div style={{color:C.amber,opacity:.8}}>⚠ Confidence degraded</div>}
      </div>
      {isConfidenceDegraded&&(
        <div style={{position:"absolute",top:12,left:"50%",transform:"translateX(-50%)",zIndex:10,
          background:"rgba(232,163,61,0.07)",border:"1px solid rgba(232,163,61,0.25)",
          borderRadius:3,padding:"4px 9px",fontSize:9,color:C.amber,
          fontFamily:"JetBrains Mono,monospace",display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}>
          ⚠ Cloud cover · satellite confidence degraded
        </div>
      )}
      <style>{`@keyframes mbar{from{margin-left:0}to{margin-left:55%}}`}</style>
    </div>
  );
}
