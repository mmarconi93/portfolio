import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

// Canvas and scene
const canvas = document.getElementById('webgl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(0, 0, 6);
scene.add(camera);

// Resize handler
function resize(){
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== w * dpr || canvas.height !== h * dpr){
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(dpr);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}
window.addEventListener('resize', resize);

// Lights for subtle rim
const light1 = new THREE.PointLight(0xffffff, 6, 10, 2);
light1.position.set(-2, 1, 3);
scene.add(light1);
const light2 = new THREE.PointLight(0x6a00ff, 8, 10, 2);
light2.position.set(2.5, -1.2, 2.5);
scene.add(light2);

// Shader material for neon purple sphere with animated displacement
const vertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  uniform float uTime;

  // Classic 3D Perlin noise (IQ)
  vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 =   v - i + dot(i, C.xxx) ;
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );
    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
    i = mod(i, 289.0 );
    vec4 p = permute( permute( permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
    float n_ = 1.0/7.0;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a1.xy,h.y);
    vec3 p2 = vec3(a0.zw,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m*m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                  dot(p2,x2), dot(p3,x3) ) );
  }

  void main(){
    vUv = uv;
    vNormal = normal;

    float n = snoise(normal * 1.2 + vec3(uTime*0.15, uTime*0.1, uTime*0.05));
    float displacement = n * 0.35;
    vec3 newPosition = position + normal * displacement;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`;

const fragmentShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  uniform float uTime;

  void main(){
    // Fake Fresnel rim
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0,0.0,1.0))), 2.5);

    // Neon purple gradient
    vec3 colDeep = vec3(0.06, 0.02, 0.14);   // dark purple
    vec3 colMid  = vec3(0.36, 0.0, 1.0);     // neon
    vec3 colLight= vec3(0.73, 0.62, 1.0);    // lavender highlight

    float glow = smoothstep(0.2, 0.95, fresnel);
    vec3 color = mix(colDeep, colMid, glow);
    color = mix(color, colLight, pow(glow, 4.0));

    gl_FragColor = vec4(color, 1.0);
  }
`;

const uniforms = { uTime: { value: 0 } };
const geometry = new THREE.IcosahedronGeometry(2.2, 6);
const material = new THREE.ShaderMaterial({
  vertexShader, fragmentShader, uniforms,
  lights: false, transparent: true
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// Subtle postprocessing-ish glow via second mesh
const glowMat = new THREE.MeshBasicMaterial({ color: 0x6a00ff, transparent: true, opacity: 0.12 });
const glowMesh = new THREE.Mesh(new THREE.SphereGeometry(2.45, 48, 48), glowMat);
scene.add(glowMesh);

// Parallax
const orbWrap = document.querySelector('.orb-wrap');
let targetRotX = 0, targetRotY = 0;
window.addEventListener('mousemove', (e)=>{
  const rect = orbWrap.getBoundingClientRect();
  const cx = rect.left + rect.width/2;
  const cy = rect.top + rect.height/2;
  const dx = (e.clientX - cx) / rect.width;
  const dy = (e.clientY - cy) / rect.height;
  targetRotY = dx * 0.6;
  targetRotX = -dy * 0.6;
});

// Animation loop
let t = 0;
function tick(){
  resize();
  t += 0.016;
  uniforms.uTime.value = t;

  mesh.rotation.y += (targetRotY - mesh.rotation.y) * 0.06;
  mesh.rotation.x += (targetRotX - mesh.rotation.x) * 0.06;
  glowMesh.rotation.copy(mesh.rotation);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

// Year
document.addEventListener('DOMContentLoaded', ()=>{
  const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
});
