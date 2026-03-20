import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ── Simplex noise GLSL (from globe 15.html) ──
const NOISE_G = `vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}vec4 tIS(vec4 r){return 1.79284291400159-.85373472095314*r;}float snoise(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g,l.zxy);vec3 i2=max(g,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);vec4 norm=tIS(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}`;

const SHELL_FRAG = `${NOISE_G}
  uniform float uTime,uO,uS,uSp,uBr,uThresh;
  uniform vec3 uC1,uC2,uFlow;
  varying vec3 vW;
  void main(){
    vec3 d=normalize(vW);
    float t=uTime*uSp;
    vec3 sp=d*uS+t+uFlow;
    float n=snoise(sp)*.6+snoise(sp*2.5+t*1.3)*.3+snoise(sp*6.+t*.7)*.1;
    n=smoothstep(uThresh, uThresh+0.6, n);
    gl_FragColor=vec4(mix(uC1,uC2,n)*1.8*uBr, n*uO*uBr);
  }
`;

const GLOBE_FRAG = `
  uniform sampler2D uDayTex;
  uniform sampler2D uNightTex;
  uniform float     uSunLat;
  uniform float     uSunLon;
  uniform float     uTexReady;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  void main(){
    vec3 n = normalize(vNormal);
    float lon = (vUv.x - 0.5) * 6.28318530718;
    float lat = (vUv.y - 0.5) * 3.14159265359;
    float sunDot = sin(lat) * sin(uSunLat)
                 + cos(lat) * cos(uSunLat) * cos(lon - uSunLon);
    vec4 dayCol   = texture2D(uDayTex,   vUv);
    vec4 nightCol = texture2D(uNightTex, vUv);
    vec3 dayRgb = dayCol.rgb * 0.78;
    float dayLum = dot(dayRgb, vec3(0.299, 0.587, 0.114));
    dayRgb = mix(dayRgb, vec3(dayLum), 0.12);
    float blueDom = dayRgb.b - max(dayRgb.r, dayRgb.g);
    float oceanMask = clamp(blueDom * 8.0, 0.0, 1.0);
    vec3 oceanBoost = dayRgb + vec3(0.02, 0.06, 0.18) * oceanMask;
    dayRgb = mix(dayRgb, oceanBoost, 0.75);
    vec3 nightRgb = nightCol.rgb * 1.6;
    float dayMix = smoothstep(-0.08, 0.08, sunDot);
    float twi = clamp(1.0 - abs(sunDot / 0.10), 0.0, 1.0);
    twi = pow(twi, 1.8);
    vec3 twilightCol = vec3(1.0, 0.52, 0.12) * twi * 0.6;
    float polarBlend = smoothstep(0.62, 0.80, abs(lat) / 1.5708);
    float nightDark = smoothstep(-0.5, 0.1, sunDot) * 0.92 + 0.08;
    vec3 polarNightRgb = dayRgb * nightDark;
    float finalDayMix = max(dayMix, polarBlend);
    vec3 baseCol = mix(nightRgb, dayRgb, finalDayMix);
    baseCol = mix(baseCol, polarNightRgb, polarBlend);
    vec3 col = baseCol + twilightCol;
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float rim = 1.0 - max(dot(n, viewDir), 0.0);
    rim = pow(rim, 4.5);
    col += vec3(0.05, 0.16, 0.65) * rim * 0.45;
    gl_FragColor = vec4(col * uTexReady, 1.0);
  }
`;

export default function GlobeCanvas({ style, fullscreen = false }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const [hintVisible, setHintVisible] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── State object (replaces globals from the HTML version) ──
    const S = {
      renderer: null, sceneGlobe: null, sceneEffects: null, camera: null,
      bloomRT1: null, bloomRT2: null, bloomQuad: null,
      shellMats: [], shellMeshes: [],
      skyMat: null, pMat: null,
      globeMesh: null, glowMesh: null,
      shootingStars: [], nextStarTime: 0,
      nebFlowAccum: new THREE.Vector3(0, 0, 0),
      globeRotX: 0, globeRotY: 0,
      isDragging: false, prevX: 0, prevY: 0,
      velYaw: 0, velPitch: 0,
      lastTime: performance.now(),
      animFrameId: null,
      disposed: false,
      starPool: [], starPoolIdx: 0,
      wisps: [],
    };
    stateRef.current = S;

    const AUTO_SPIN = 0.0006;
    const bloomStrength = 0.22;

    // ── RENDERER ──
    S.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    S.renderer.setPixelRatio(Math.min(devicePixelRatio, 3));
    S.renderer.autoClear = false;

    S.sceneEffects = new THREE.Scene();
    S.sceneGlobe = new THREE.Scene();

    S.camera = new THREE.PerspectiveCamera(52, 1, 0.01, 500);
    S.camera.position.set(0, fullscreen ? -0.5 : -0.85, fullscreen ? 4.2 : 3.1);
    S.camera.lookAt(0, -0.1, 0);

    // ═══ ATMOSPHERE ═══
    S.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uBr: { value: 0.5 },
        uTop: { value: new THREE.Color(0x06091a) },
        uBot: { value: new THREE.Color(0x020308) }
      },
      vertexShader: `varying vec3 vP;void main(){vP=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform float uTime,uBr;uniform vec3 uTop,uBot;varying vec3 vP;void main(){
        vec3 d=normalize(vP);
        float t=smoothstep(-0.5,0.7,d.y);
        vec3 c=mix(uBot,uTop+sin(uTime*.07)*.025,t);
        vec3 mwAxis=normalize(vec3(0.4,0.8,0.4));
        float mwDot=abs(dot(d,mwAxis));
        float mwBand=exp(-mwDot*mwDot*18.0);
        vec3 mwCol=vec3(0.22,0.18,0.35)*mwBand*1.2;
        gl_FragColor=vec4((c*1.6+mwCol)*uBr,1.);
      }`
    });
    S.sceneEffects.add(new THREE.Mesh(new THREE.SphereGeometry(200, 32, 32), S.skyMat));

    // Nebula shells
    [
      { r: 6, o: .11, s: 10, sp: .013, c1: [.18, .12, .42], c2: [.45, .28, .72], thresh: 0.38 },
      { r: 18, o: .065, s: 3.5, sp: .006, c1: [.08, .08, .32], c2: [.28, .18, .52], thresh: 0.38 },
      { r: 50, o: .038, s: 1.2, sp: .003, c1: [.04, .04, .22], c2: [.18, .09, .38], thresh: 0.38 }
    ].forEach(L => {
      const m = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uO: { value: L.o }, uS: { value: L.s }, uSp: { value: L.sp },
          uC1: { value: new THREE.Color(...L.c1) }, uC2: { value: new THREE.Color(...L.c2) },
          uBr: { value: 1 }, uFlow: { value: new THREE.Vector3(0, 0, 0) }, uThresh: { value: L.thresh }
        },
        vertexShader: `varying vec3 vW;void main(){vW=normalize((modelMatrix*vec4(position,1.)).xyz);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: SHELL_FRAG,
        transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(L.r, 48, 48), m);
      S.sceneEffects.add(mesh);
      S.shellMats.push(m); S.shellMeshes.push(mesh);
    });

    // Star field
    const PC = 7000;
    const pp = new Float32Array(PC * 3), ps = new Float32Array(PC), pb = new Float32Array(PC);
    const CLUSTER_COUNT = 20, clusters = [];
    for (let i = 0; i < CLUSTER_COUNT; i++) {
      clusters.push({ t: Math.random() * Math.PI * 2, p: Math.acos(2 * Math.random() - 1), str: 0.3 + Math.random() * 0.7 });
    }
    for (let i = 0; i < PC; i++) {
      let t = Math.random() * Math.PI * 2, p2 = Math.acos(2 * Math.random() - 1);
      if (Math.random() < 0.55) {
        const cl = clusters[Math.floor(Math.random() * CLUSTER_COUNT)];
        const bl = 0.3 + Math.random() * 0.5;
        t += (cl.t - t) * bl * cl.str; p2 += (cl.p - p2) * bl * cl.str;
      }
      const r = 55 + Math.pow(Math.random(), .6) * 105;
      pp[i * 3] = r * Math.sin(p2) * Math.cos(t); pp[i * 3 + 1] = r * Math.sin(p2) * Math.sin(t); pp[i * 3 + 2] = r * Math.cos(p2);
      ps[i] = .3 + Math.random() * 2.2; pb[i] = .4 + Math.random() * .6;
    }
    const ph = new Float32Array(PC);
    for (let i = 0; i < PC; i++) ph[i] = Math.random();
    const pG = new THREE.BufferGeometry();
    pG.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
    pG.setAttribute('aSize', new THREE.Float32BufferAttribute(ps, 1));
    pG.setAttribute('aBr', new THREE.Float32BufferAttribute(pb, 1));
    pG.setAttribute('aPhase', new THREE.Float32BufferAttribute(ph, 1));
    S.pMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPR: { value: Math.min(devicePixelRatio, 3) }, uBr: { value: 0.55 } },
      vertexShader: [
        'attribute float aSize,aBr,aPhase;', 'uniform float uTime,uPR;', 'varying float vO,vB,vTwinkle;',
        'void main(){',
        '  vec4 mv=modelViewMatrix*vec4(position,1.);float d=-mv.z;',
        '  gl_PointSize=clamp(aSize*uPR*(300./d),.5,10.);',
        '  gl_Position=projectionMatrix*mv;',
        '  vO=smoothstep(170.,25.,d)*smoothstep(10.,25.,d);vB=aBr;',
        '  float spd=0.8+aBr*1.4;',
        '  vTwinkle=0.45+0.55*sin(uTime*spd+aPhase*6.2831);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform float uBr;', 'varying float vO,vB,vTwinkle;',
        'void main(){',
        '  float d=length(gl_PointCoord-.5);if(d>.5)discard;',
        '  float a=(1.-smoothstep(0.,.5,d))*vO*vTwinkle;',
        '  vec3 c=mix(vec3(.65,.78,1.),vec3(1.,.9,.82),vB)*1.4*vB;',
        '  gl_FragColor=vec4(c*uBr,a*uBr*0.85);',
        '}'
      ].join('\n'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    S.sceneEffects.add(new THREE.Points(pG, S.pMat));

    // Shooting stars pool
    const STAR_POOL = 12;
    for (let si = 0; si < STAR_POOL; si++) {
      const sg = new THREE.BufferGeometry();
      const sv = new Float32Array(6 * 3);
      sg.setAttribute('position', new THREE.BufferAttribute(sv, 3));
      const sw = new Float32Array([1, 1, 0, 0, 1, 0]);
      sg.setAttribute('aW', new THREE.BufferAttribute(sw, 1));
      const sm = new THREE.ShaderMaterial({
        uniforms: { uAlpha: { value: 0 } },
        vertexShader: `attribute float aW;varying float vW;void main(){vW=aW;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `uniform float uAlpha;varying float vW;void main(){float b=vW*vW;gl_FragColor=vec4(vec3(1.)*(0.9+b*.1),b*uAlpha);}`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
      });
      const smesh = new THREE.Mesh(sg, sm);
      smesh.visible = false;
      S.sceneEffects.add(smesh);
      S.starPool.push({ mesh: smesh, geo: sg, mat: sm, verts: sv });
    }
    S.nextStarTime = performance.now() + 500 + Math.random() * 1000;

    // Dust wisps
    for (let wi = 0; wi < 5; wi++) {
      const wTheta = Math.random() * Math.PI * 2;
      const wPhi = Math.acos(2 * Math.random() - 1);
      const wR = 15 + Math.random() * 20;
      const wx = wR * Math.sin(wPhi) * Math.cos(wTheta);
      const wy = wR * Math.sin(wPhi) * Math.sin(wTheta);
      const wz = wR * Math.cos(wPhi);
      const sz = (8 + Math.random() * 10).toFixed(1);
      const wispMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uOffset: { value: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10) },
          uAlpha: { value: 0.18 + Math.random() * 0.18 }
        },
        vertexShader: `
          varying vec2 vUv;
          void main(){
            vUv=uv;
            vec3 camRight=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
            vec3 camUp   =vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
            float sz=${sz};
            vec3 center=vec3(${wx.toFixed(2)},${wy.toFixed(2)},${wz.toFixed(2)});
            vec3 wp=center+(camRight*(uv.x-.5)+camUp*(uv.y-.5))*sz;
            gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.0);
          }`,
        fragmentShader: `${NOISE_G}
          uniform float uTime;
          uniform vec3 uOffset;
          uniform float uAlpha;
          varying vec2 vUv;
          void main(){
            vec2 uvc=vUv-.5;
            float vign=1.0-smoothstep(0.2,0.5,length(uvc));
            vec3 np=vec3(uvc*2.5,0.0)+uOffset+vec3(uTime*0.012,uTime*0.008,0.0);
            float n=snoise(np)*0.5+0.5;
            n=smoothstep(0.38,0.62,n);
            vec3 col=mix(vec3(0.08,0.06,0.18),vec3(0.15,0.12,0.28),n);
            gl_FragColor=vec4(col,n*vign*uAlpha);
          }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
      });
      const wispMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wispMat);
      S.sceneEffects.add(wispMesh);
      S.wisps.push(wispMat);
    }

    // Globe atmosphere glow
    const glowMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main(){
          vNormal   = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewDir  = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }`,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main(){
          float d = max(dot(vNormal, vViewDir), 0.0);
          float rim = 1.0 - d;
          // Soft outer glow — wide and gentle
          float glow = pow(rim, 3.0);
          // Fade out the very edge to kill the hard aliased line
          float edgeFade = smoothstep(1.0, 0.92, rim);
          vec3 col = mix(vec3(0.06, 0.22, 0.75), vec3(0.3, 0.65, 1.0), glow);
          float alpha = glow * 0.55 * edgeFade;
          gl_FragColor = vec4(col * 1.4, alpha);
        }`,
      transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.AdditiveBlending
    });
    S.glowMesh = new THREE.Mesh(new THREE.SphereGeometry(1.06, 128, 128), glowMat);
    S.sceneEffects.add(S.glowMesh);

    // Atmosphere halo billboard
    const haloMat = new THREE.ShaderMaterial({
      uniforms: { uGlobeRadius: { value: 1.0 } },
      vertexShader: `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 worldPos = (camRight * (uv.x - 0.5) + camUp * (uv.y - 0.5)) * 3.2;
          gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
        }`,
      fragmentShader: `
        varying vec2 vUv;
        void main(){
          float dist = length(vUv - 0.5) * 2.0;
          float t = (dist - 0.58) / (1.0 - 0.58);
          t = clamp(t, 0.0, 1.0);
          if(dist < 0.60) discard;
          vec3 c0 = vec3(0.72, 0.86, 0.94);
          vec3 c1 = vec3(0.22, 0.48, 0.82);
          vec3 c2 = vec3(0.06, 0.20, 0.52);
          vec3 c3 = vec3(0.02, 0.06, 0.22);
          vec3 col; float alpha;
          if(t < 0.25){
            float s = t / 0.25; col = mix(c0, c1, s); alpha = (1.0 - s) * 0.13 + s * 0.14;
          } else if(t < 0.55){
            float s = (t - 0.25) / 0.30; col = mix(c1, c2, s); alpha = (1.0 - s) * 0.14 + s * 0.10;
          } else if(t < 0.80){
            float s = (t - 0.55) / 0.25; col = mix(c2, c3, s); alpha = (1.0 - s) * 0.10 + s * 0.05;
          } else {
            float s = (t - 0.80) / 0.20; col = c3; alpha = (1.0 - s) * 0.05;
          }
          float innerFade = smoothstep(0.58, 0.70, dist);
          alpha *= innerFade;
          gl_FragColor = vec4(col, alpha);
        }`,
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    S.sceneEffects.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMat));

    // ═══ GLOBE MESH ═══
    const loader = new THREE.TextureLoader();
    const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
    blank.needsUpdate = true;

    const globeMat = new THREE.ShaderMaterial({
      uniforms: {
        uDayTex: { value: blank }, uNightTex: { value: blank },
        uSunLat: { value: 0.0 }, uSunLon: { value: 0.0 }, uTexReady: { value: 0.0 }
      },
      vertexShader: `
        varying vec3 vNormal; varying vec3 vWorldPos; varying vec2 vUv;
        void main(){
          vNormal = normalize(normalMatrix * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz; vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: GLOBE_FRAG,
      side: THREE.FrontSide
    });
    S.globeMesh = new THREE.Mesh(new THREE.SphereGeometry(1.0, 96, 96), globeMat);
    S.sceneGlobe.add(S.globeMesh);

    // Load textures
    let loadedCount = 0;
    function fadeInGlobe() {
      const start = performance.now();
      const dur = 1200;
      function tick() {
        if (S.disposed) return;
        const p = Math.min((performance.now() - start) / dur, 1.0);
        globeMat.uniforms.uTexReady.value = p * p * (3 - 2 * p);
        if (p < 1.0) requestAnimationFrame(tick);
      }
      tick();
    }
    function onLoaded() { loadedCount++; if (loadedCount === 1) fadeInGlobe(); }

    loader.load('/Land_ocean_ice.jpg', tex => { globeMat.uniforms.uDayTex.value = tex; onLoaded(); });
    loader.load('/BlackMarble.jpg', tex => { globeMat.uniforms.uNightTex.value = tex; onLoaded(); });

    // Fallback
    const texTimeout = setTimeout(() => {
      if (S.globeMesh && globeMat.uniforms.uTexReady.value < 1.0) {
        globeMat.uniforms.uTexReady.value = 1.0;
      }
    }, 8000);

    // Subsolar point
    {
      const now = new Date();
      const utcH = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
      const dayOfYear = Math.floor((now - new Date(now.getUTCFullYear(), 0, 0)) / 86400000);
      const sunLat = -23.45 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10)) * Math.PI / 180;
      const sunLonDeg = (12 - utcH) * 15;
      const sunLon = sunLonDeg * Math.PI / 180;
      globeMat.uniforms.uSunLat.value = sunLat;
      globeMat.uniforms.uSunLon.value = sunLon;
    }

    // Orient to user timezone
    const tzLon = (new Date().getTimezoneOffset() / 60) * -15;
    S.globeRotY = tzLon * (Math.PI / 180);
    S.globeMesh.rotation.y = S.globeRotY;
    S.glowMesh.rotation.y = S.globeRotY;

    // ═══ BLOOM ═══
    const pr = Math.min(devicePixelRatio, 3);
    const pw = Math.floor(canvas.clientWidth * pr), phh = Math.floor(canvas.clientHeight * pr);
    const bw = Math.floor(pw / 2), bh = Math.floor(phh / 2);
    S.bloomRT1 = new THREE.WebGLRenderTarget(Math.max(bw, 1), Math.max(bh, 1));
    S.bloomRT2 = new THREE.WebGLRenderTarget(Math.max(bw, 1), Math.max(bh, 1));

    const sg = new THREE.PlaneGeometry(2, 2);
    const blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(1, 0) }, uRes: { value: new THREE.Vector2(Math.max(bw, 1), Math.max(bh, 1)) } },
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
      fragmentShader: `uniform sampler2D tDiffuse;uniform vec2 uDir,uRes;varying vec2 vUv;void main(){vec2 px=uDir/uRes;vec4 c=vec4(0.);float w[5];w[0]=.227027;w[1]=.194596;w[2]=.121622;w[3]=.054054;w[4]=.016216;c+=texture2D(tDiffuse,vUv)*w[0];for(int i=1;i<5;i++){c+=texture2D(tDiffuse,vUv+px*float(i))*w[i];c+=texture2D(tDiffuse,vUv-px*float(i))*w[i];}gl_FragColor=c;}`
    });
    const compMat = new THREE.ShaderMaterial({
      uniforms: { tEffects: { value: null }, tBloom: { value: null }, uStr: { value: bloomStrength } },
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
      fragmentShader: `uniform sampler2D tEffects,tBloom;uniform float uStr;varying vec2 vUv;void main(){vec4 e=texture2D(tEffects,vUv);vec4 b=texture2D(tBloom,vUv);gl_FragColor=e+b*uStr*3.;}`
    });
    const effectsRT = new THREE.WebGLRenderTarget(Math.max(pw, 1), Math.max(phh, 1));
    S.bloomQuad = {
      blurMat, compMat,
      mesh: new THREE.Mesh(sg, blurMat), compMesh: new THREE.Mesh(sg, compMat), effectsRT,
      blurScene: new THREE.Scene(), compScene: new THREE.Scene(),
      blurCam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    };
    S.bloomQuad.blurScene.add(S.bloomQuad.mesh);
    S.bloomQuad.compScene.add(S.bloomQuad.compMesh);

    // ═══ INPUT ═══
    let hasDragged = false;
    const onPointerDown = (e) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      S.isDragging = true; S.prevX = e.clientX; S.prevY = e.clientY;
      S.velYaw = 0; S.velPitch = 0;
      if (!hasDragged) { hasDragged = true; setHintVisible(false); }
    };
    const onPointerMove = (e) => {
      if (!S.isDragging) return;
      e.preventDefault();
      const dx = e.clientX - S.prevX, dy = e.clientY - S.prevY;
      S.velYaw = dx * 0.007; S.velPitch = dy * 0.007;
      S.globeRotY += S.velYaw; S.globeRotX += S.velPitch;
      S.globeRotX = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, S.globeRotX));
      S.prevX = e.clientX; S.prevY = e.clientY;
    };
    const onPointerUp = () => { S.isDragging = false; };

    canvas.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);

    // ═══ RESIZE ═══
    const BASE_FOV = 52;
    function onResize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      S.renderer.setSize(w, h, false);
      S.camera.aspect = w / h;
      // Widen FOV on wide/short containers so the globe isn't clipped horizontally
      // At portrait ratios (aspect <= 0.75) use the base FOV; as it gets wider, increase FOV
      const aspect = w / h;
      if (aspect > 0.75) {
        S.camera.fov = BASE_FOV + (aspect - 0.75) * 18;
      } else {
        S.camera.fov = BASE_FOV;
      }
      S.camera.updateProjectionMatrix();
      const pr2 = Math.min(devicePixelRatio, 3);
      const pw2 = Math.floor(w * pr2), ph2 = Math.floor(h * pr2);
      const bw2 = Math.max(Math.floor(pw2 / 2), 1), bh2 = Math.max(Math.floor(ph2 / 2), 1);
      S.bloomRT1.setSize(bw2, bh2); S.bloomRT2.setSize(bw2, bh2);
      S.bloomQuad.effectsRT.setSize(pw2, ph2);
      S.bloomQuad.blurMat.uniforms.uRes.value.set(bw2, bh2);
    }
    window.addEventListener('resize', onResize);
    onResize();

    // Fade hint after 4s
    const hintTimeout = setTimeout(() => setHintVisible(false), 4000);

    // ═══ SHOOTING STARS ═══
    function updateShootingStars(now, dt) {
      if (now > S.nextStarTime && S.shootingStars.length < 5) {
        const slot = S.starPool[S.starPoolIdx % S.starPool.length];
        S.starPoolIdx++;
        const theta = Math.random() * Math.PI * 2, phi = Math.acos(2 * Math.random() - 1);
        const r = 4.5 + Math.random() * 3.5;
        const ox = r * Math.sin(phi) * Math.cos(theta), oy = r * Math.sin(phi) * Math.sin(theta), oz = r * Math.cos(phi);
        const radial = new THREE.Vector3(ox, oy, oz).normalize();
        const randVec = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        const radialComponent = radial.clone().multiplyScalar(randVec.dot(radial));
        const dir = randVec.sub(radialComponent).normalize();
        const life = 1.0 + Math.random() * 0.9;
        slot.mesh.visible = true;
        S.shootingStars.push({ slot, ox, oy, oz, dir, life, maxLife: life, speed: 2.5 + Math.random() * 2.0, width: .008 + Math.random() * .012 });
        S.nextStarTime = now + 800 + Math.random() * 2400;
      }
      for (let si = S.shootingStars.length - 1; si >= 0; si--) {
        const s = S.shootingStars[si];
        s.life -= dt;
        if (s.life <= 0) { s.slot.mesh.visible = false; S.shootingStars.splice(si, 1); continue; }
        const progress = 1 - (s.life / s.maxLife);
        const alpha = Math.sin(progress * Math.PI) * 0.9;
        const dist = progress * s.speed * s.maxLife;
        const trail = Math.min(dist, 0.15 + s.width * 0.5);
        const hx = s.ox + s.dir.x * dist, hy = s.oy + s.dir.y * dist, hz = s.oz + s.dir.z * dist;
        const tx = hx - s.dir.x * trail, ty = hy - s.dir.y * trail, tz = hz - s.dir.z * trail;
        const camFwd = new THREE.Vector3(0, 0, -1);
        const perp = new THREE.Vector3().crossVectors(s.dir, camFwd).normalize().multiplyScalar(s.width * .18);
        const v = s.slot.verts;
        v[0] = hx + perp.x; v[1] = hy + perp.y; v[2] = hz + perp.z;
        v[3] = hx - perp.x; v[4] = hy - perp.y; v[5] = hz - perp.z;
        v[6] = tx + perp.x; v[7] = ty + perp.y; v[8] = tz + perp.z;
        v[9] = hx - perp.x; v[10] = hy - perp.y; v[11] = hz - perp.z;
        v[12] = tx - perp.x; v[13] = ty - perp.y; v[14] = tz - perp.z;
        v[15] = tx + perp.x; v[16] = ty + perp.y; v[17] = tz + perp.z;
        s.slot.geo.attributes.position.needsUpdate = true;
        s.slot.mat.uniforms.uAlpha.value = alpha;
      }
    }

    // ═══ ANIMATE ═══
    function animate() {
      if (S.disposed) return;
      S.animFrameId = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - S.lastTime) / 1000, 0.05);
      S.lastTime = now;
      const t = now * 0.001;

      if (!S.isDragging) {
        S.velYaw *= 0.94; S.velPitch *= 0.88;
        S.globeRotY += S.velYaw; S.globeRotX += S.velPitch;
        if (Math.abs(S.velYaw) < 0.0008) S.globeRotY += AUTO_SPIN;
      }
      S.globeRotX = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, S.globeRotX));

      S.globeMesh.rotation.x = S.globeRotX; S.globeMesh.rotation.y = S.globeRotY;
      S.glowMesh.rotation.x = S.globeRotX; S.glowMesh.rotation.y = S.globeRotY;

      S.shellMats.forEach(m => { m.uniforms.uTime.value = t; });
      if (S.skyMat) S.skyMat.uniforms.uTime.value = t;
      if (S.pMat) S.pMat.uniforms.uTime.value = t;
      S.wisps.forEach(m => { m.uniforms.uTime.value = t; });

      S.nebFlowAccum.x += 0.003 * dt; S.nebFlowAccum.y += 0.002 * dt; S.nebFlowAccum.z += 0.06 * dt;
      if (S.isDragging) { S.nebFlowAccum.x += S.velYaw * 0.15; S.nebFlowAccum.y += S.velPitch * 0.10; }
      S.shellMats.forEach(m => m.uniforms.uFlow.value.copy(S.nebFlowAccum));

      updateShootingStars(now, dt);

      // Render pipeline
      S.renderer.setRenderTarget(S.bloomQuad.effectsRT);
      S.renderer.clear(true, true, true);
      S.renderer.render(S.sceneEffects, S.camera);

      S.bloomQuad.blurMat.uniforms.tDiffuse.value = S.bloomQuad.effectsRT.texture;
      S.bloomQuad.blurMat.uniforms.uDir.value.set(1, 0);
      S.bloomQuad.mesh.material = S.bloomQuad.blurMat;
      S.renderer.setRenderTarget(S.bloomRT1); S.renderer.clear();
      S.renderer.render(S.bloomQuad.blurScene, S.bloomQuad.blurCam);

      S.bloomQuad.blurMat.uniforms.tDiffuse.value = S.bloomRT1.texture;
      S.bloomQuad.blurMat.uniforms.uDir.value.set(0, 1);
      S.renderer.setRenderTarget(S.bloomRT2); S.renderer.clear();
      S.renderer.render(S.bloomQuad.blurScene, S.bloomQuad.blurCam);

      S.bloomQuad.compMat.uniforms.tEffects.value = S.bloomQuad.effectsRT.texture;
      S.bloomQuad.compMat.uniforms.tBloom.value = S.bloomRT2.texture;
      S.bloomQuad.compMesh.material = S.bloomQuad.compMat;
      S.renderer.setRenderTarget(null); S.renderer.clear();
      S.renderer.render(S.bloomQuad.compScene, S.bloomQuad.blurCam);

      S.renderer.clearDepth();
      S.renderer.render(S.sceneGlobe, S.camera);
    }

    animate();

    // ═══ CLEANUP ═══
    return () => {
      S.disposed = true;
      cancelAnimationFrame(S.animFrameId);
      clearTimeout(texTimeout);
      clearTimeout(hintTimeout);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      S.renderer.dispose();
      S.bloomRT1.dispose(); S.bloomRT2.dispose();
      S.bloomQuad.effectsRT.dispose();
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#000", ...style }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", touchAction: "none" }}
      />
      <div style={{
        position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        pointerEvents: "none", userSelect: "none"
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "rgba(100,180,255,0.7)",
          boxShadow: "0 0 8px 2px rgba(100,180,255,0.4)",
          animation: "pulseRing 2.8s ease-in-out infinite"
        }} />
        <div style={{
          fontFamily: "'DM Mono', 'Courier New', monospace",
          fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase",
          color: "rgba(160,200,255,0.55)"
        }}>
          247 scrolling now
        </div>
      </div>
      <div style={{
        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        fontFamily: "'DM Mono','Courier New',monospace",
        fontSize: 10, letterSpacing: "0.2em", color: "rgba(140,180,255,0.3)",
        pointerEvents: "none", textTransform: "uppercase",
        transition: "opacity 1.5s",
        opacity: hintVisible ? 1 : 0
      }}>
        drag to explore
      </div>
    </div>
  );
}
