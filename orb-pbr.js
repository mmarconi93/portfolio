import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { RoomEnvironment } from 'https://unpkg.com/three@0.160.0/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js';

const canvas = document.getElementById('webgl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(0, 0, 6);
scene.add(camera);

// Environment lighting
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.background = null;

// Lights
const key = new THREE.SpotLight(0xffffff, 2.0, 0, Math.PI / 5, 0.6, 1.2);
key.position.set(3, 5, 6);
scene.add(key);
scene.add(new THREE.AmbientLight(0x404060, 0.4));

// Geometry & material
const geometry = new THREE.IcosahedronGeometry(2.2, 7);
const material = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color(0x4a1cff),
  metalness: 0.9,
  roughness: 0.2,
  clearcoat: 1.0,
  clearcoatRoughness: 0.15,
  sheen: 1.0,
  sheenColor: new THREE.Color(0xbda6ff),
  iridescence: 0.2,
  iridescenceIOR: 1.3
});

// Uniforms
const uniforms = {
  uTime: { value: 0 },
  uAmp: { value: 0.35 },
  uFreq: { value: 1.25 }
};

// Shader modifications
material.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = uniforms.uTime;
  shader.uniforms.uAmp = uniforms.uAmp;
  shader.uniforms.uFreq = uniforms.uFreq;

  // Noise functions
  const noise = `
    vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
    vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
    float snoise(vec3 v){
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i  = floor(v + dot(v, C.yyy) );
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + 2.0 * C.xxx;
      vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
      i = mod(i, 289.0);
      vec4 p = permute(permute(permute(
                i.z + vec4(0.0, i1.z, i2.z, 1.0))
              + i.y + vec4(0.0, i1.y, i2.y, 1.0))
              + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      float n_ = 1.0/7.0;
      vec3  ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
      vec3 p0 = vec3(a0.xy,h.x);
      vec3 p1 = vec3(a1.xy,h.y);
      vec3 p2 = vec3(a0.zw,h.z);
      vec3 p3 = vec3(a1.zw,h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1),
                                     dot(p2,p2), dot(p3,p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1),
                              dot(x2,x2), dot(x3,x3)), 0.0);
      m = m*m;
      return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1),
                                  dot(p2,x2), dot(p3,x3)));
    }
  `;

  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${noise}\nuniform float uTime; uniform float uAmp; uniform float uFreq;`)
    .replace('#include <begin_vertex>', `
      #include <begin_vertex>
      float n = snoise(normal * uFreq + vec3(uTime*0.12, uTime*0.08, uTime*0.05));
      transformed += normal * (n * uAmp);
    `);

  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uTime;')
    .replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      float pulse = smoothstep(0.5, 1.0, sin(uTime*1.6)*0.5 + 0.5);
      totalEmissiveRadiance += vec3(0.5, 0.2, 1.0) * 0.08 * pulse;
    `);
};

// Orb mesh
const orb = new THREE.Mesh(geometry, material);
scene.add(orb);

// Glow shell
const glowGeo = new THREE.SphereGeometry(2.5, 48, 48);
const glowMat = new THREE.MeshBasicMaterial({ color: 0x8b63ff, transparent: true, opacity: 0.12 });
const glow = new THREE.Mesh(glowGeo, glowMat);
scene.add(glow);

// Composer + bloom
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.8, 0.9, 0.2);
composer.addPass(bloom);

// Resize
function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(dpr);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    composer.setSize(w, h);
  }
}
window.addEventListener('resize', resize);

// Mouse parallax
const wrap = document.querySelector('.orb-wrap');
let targetX = 0, targetY = 0;
window.addEventListener('mousemove', (e) => {
  const r = wrap.getBoundingClientRect();
  const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
  const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
  targetX = -dy * 0.5;
  targetY = dx * 0.5;
});

// Animation loop
let t = 0;
function tick() {
  resize();
  t += 0.016;
  uniforms.uTime.value = t;
  orb.rotation.x += (targetX - orb.rotation.x) * 0.06;
  orb.rotation.y += (targetY - orb.rotation.y) * 0.06;
  glow.rotation.copy(orb.rotation);
  composer.render();
  requestAnimationFrame(tick);
}
tick();

// Footer year
document.addEventListener('DOMContentLoaded', () => {
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
});
