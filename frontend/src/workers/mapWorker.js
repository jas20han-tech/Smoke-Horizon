/**
 * mapWorker.js - runs PIP + dot-grid build off the main thread.
 * Posts back an ImageBitmap of the fully-rendered static dot layer.
 */

const SOURCE_STATES  = new Set(["Punjab","Haryana"]);
const RECEPTOR_STATE = new Set(["NCT of Delhi","Delhi","NCT Of Delhi"]);
const TRANSIT_STATES = new Set(["Uttar Pradesh","Rajasthan","Himachal Pradesh","Uttarakhand"]);

const VIEW = { lngMin:68, lngMax:97.5, latMin:8, latMax:37.5 };
const PAD  = 18;

function makeProj(w,h) {
  const aw=w-PAD*2, ah=h-PAD*2;
  const toMerc = lat => Math.log(Math.tan(Math.PI/4+(lat*Math.PI/180)/2));
  const mMin=toMerc(VIEW.latMin), mMax=toMerc(VIEW.latMax);
  return ([lng,lat]) => [
    PAD+((lng-VIEW.lngMin)/(VIEW.lngMax-VIEW.lngMin))*aw,
    PAD+(1-(toMerc(lat)-mMin)/(mMax-mMin))*ah
  ];
}

function pip([px,py],ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const[xi,yi]=ring[i],[xj,yj]=ring[j];
    if(((yi>py)!==(yj>py))&&(px<((xj-xi)*(py-yi))/(yj-yi)+xi))inside=!inside;
  }
  return inside;
}
function pipGeo([px,py],geo){
  if(!geo)return false;
  const ok=r=>pip([px,py],r);
  if(geo.type==="Polygon")return geo.coordinates.some(ok);
  if(geo.type==="MultiPolygon")return geo.coordinates.some(p=>p.some(ok));
  return false;
}
function projGeo(coords,proj){
  if(!Array.isArray(coords))return coords;
  if(typeof coords[0]==="number")return proj(coords);
  return coords.map(c=>projGeo(c,proj));
}
function segDist(px,py,x1,y1,x2,y2){
  const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy;
  if(!l2)return Math.hypot(px-x1,py-y1);
  const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/l2));
  return Math.hypot(px-(x1+t*dx),py-(y1+t*dy));
}
function hexToRgb(hex){
  const m=hex.replace("#","").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  return m?[parseInt(m[1],16),parseInt(m[2],16),parseInt(m[3],16)]:[128,128,128];
}

self.onmessage = async ({ data: { w, h, geoJSON, riskLevel, dpr } }) => {
  const W=Math.round(w*dpr), H=Math.round(h*dpr);
  const proj = makeProj(W,H);
  const STEP = Math.max(5, Math.round(6*dpr));
  const BORDER = STEP*0.88;

  // Project feature geometries
  const feats = geoJSON.features.map(f=>({
    name: f.properties.name,
    pGeo: f.geometry?{type:f.geometry.type,coordinates:projGeo(f.geometry.coordinates,proj)}:null
  }));

  // Border segments
  const segs=[];
  feats.forEach(f=>{
    if(!f.pGeo)return;
    const rings=f.pGeo.type==="Polygon"?f.pGeo.coordinates:f.pGeo.coordinates.flat(1);
    rings.forEach(ring=>{for(let i=0;i<ring.length-1;i++)segs.push([ring[i],ring[i+1]]);});
  });

  // Risk color
  const rcMap={High:"#E85D3D",Moderate:"#E8A33D",Low:"#1D9E75"};
  const riskRgb=hexToRgb(rcMap[riskLevel]||"#1D9E75");

  // Draw to OffscreenCanvas using ImageData for bulk writes
  const oc=new OffscreenCanvas(W,H);
  const ctx=oc.getContext("2d");
  const idata=ctx.createImageData(W,H);
  const buf=idata.data;

  // Background
  buf.fill(0);
  for(let i=3;i<buf.length;i+=4)buf[i]=255;
  // bg color #0A0C0F
  for(let i=0;i<buf.length;i+=4){buf[i]=10;buf[i+1]=12;buf[i+2]=15;}

  const DOT_R=Math.max(1,Math.round(1.1*dpr));

  for(let gx=STEP;gx<W-STEP;gx+=STEP){
    for(let gy=STEP;gy<H-STEP;gy+=STEP){
      let matchName=null;
      for(const f of feats){
        if(!f.pGeo)continue;
        if(pipGeo([gx,gy],f.pGeo)){matchName=f.name;break;}
      }
      if(!matchName)continue;

      // Border check - only test nearby segments (bbox cull)
      let nb=false;
      for(const[[x1,y1],[x2,y2]]of segs){
        const minX=Math.min(x1,x2)-BORDER,maxX=Math.max(x1,x2)+BORDER;
        const minY=Math.min(y1,y2)-BORDER,maxY=Math.max(y1,y2)+BORDER;
        if(gx<minX||gx>maxX||gy<minY||gy>maxY)continue;
        if(segDist(gx,gy,x1,y1,x2,y2)<BORDER){nb=true;break;}
      }

      let rgb;
      if(SOURCE_STATES.has(matchName))
        rgb=nb?[232,132,55]:[180,75,20];
      else if(RECEPTOR_STATE.has(matchName))
        rgb=nb?riskRgb:[Math.round(riskRgb[0]*.55),Math.round(riskRgb[1]*.55),Math.round(riskRgb[2]*.55)];
      else if(TRANSIT_STATES.has(matchName))
        rgb=nb?[74,96,112]:[38,52,68];
      else
        rgb=nb?[52,78,100]:[28,42,58];

      const r=nb?DOT_R+1:DOT_R;
      const r2=r*r;
      for(let dy=-r;dy<=r;dy++){
        for(let dx=-r;dx<=r;dx++){
          if(dx*dx+dy*dy>r2+.5)continue;
          const nx=gx+dx,ny=gy+dy;
          if(nx<0||ny<0||nx>=W||ny>=H)continue;
          const idx=(ny*W+nx)*4;
          buf[idx]=rgb[0];buf[idx+1]=rgb[1];buf[idx+2]=rgb[2];buf[idx+3]=255;
        }
      }
    }
  }

  ctx.putImageData(idata,0,0);
  const bmp=await createImageBitmap(oc);
  self.postMessage({bmp,w:W,h:H},[bmp]);
};
