/**
 * bg3d.js – High-graphics 3D bouncing cube background
 * ES module: loaded with <script type="module">
 * Features: RoundedBox geometry, MeshPhysical glass, MeshStandard matte,
 *            PMREM HDR env-map, Unreal Bloom, ACES tonemapping, real physics.
 */

import * as THREE from 'three';
import { RGBELoader }       from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer }   from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }       from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }  from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }       from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('bg-canvas');
if (!canvas) { console.warn('bg3d: no canvas'); }

// ─── Renderer ────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    logarithmicDepthBuffer: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

// ─── Scene ───────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020810);
scene.fog = new THREE.FogExp2(0x030c1e, 0.016);

// ─── Camera ──────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(
    48,
    window.innerWidth / window.innerHeight,
    0.5, 300
);
// Angled top-down view like the reference image
camera.position.set(0, 32, 52);
camera.lookAt(0, 0, 0);

// ─── Environment Map (HDR reflection) ────────────────────────────────────────
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

async function loadEnv() {
    const urls = [
        'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_08_1k.hdr',
        'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/blue_photo_studio_1k.hdr',
    ];

    for (const url of urls) {
        try {
            const hdrTex = await new RGBELoader().loadAsync(url);
            const envMap = pmrem.fromEquirectangular(hdrTex).texture;
            hdrTex.dispose();
            scene.environment = envMap;
            return;
        } catch { /* try next */ }
    }

    // Fallback: neutral room environment if network unavailable
    try {
        const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
        const env = pmrem.fromScene(new RoomEnvironment()).texture;
        scene.environment = env;
    } catch { /* silently ignore */ }
}
loadEnv();

// ─── Lighting ────────────────────────────────────────────────────────────────
// Hemisphere – deep blue sky / near-black ground
const hemi = new THREE.HemisphereLight(0x1a4bb5, 0x020612, 1.1);
scene.add(hemi);

// Key directional: cold blue-white from upper-left casts sharp shadows
const sun = new THREE.DirectionalLight(0xc4d8ff, 2.2);
sun.position.set(-18, 36, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far  = 140;
const sc = sun.shadow.camera;
sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50;
sun.shadow.bias = -0.0008;
scene.add(sun);

// Strong animated blue glow from below (replicates the floor-glow in the reference)
const blueGlow = new THREE.PointLight(0x0d4fff, 6.0, 90, 1.5);
blueGlow.position.set(0, -8, 22);
scene.add(blueGlow);

// Deep blue rim from back-left
const rimLight = new THREE.PointLight(0x0033cc, 4.0, 110, 1.7);
rimLight.position.set(-24, 10, -18);
scene.add(rimLight);

// White specular sparkle – critical for glass refractions to pop
const specLight = new THREE.PointLight(0xffffff, 2.8, 75, 2.0);
specLight.position.set(18, 28, 14);
scene.add(specLight);

// Secondary fill from right side
const fillLight = new THREE.PointLight(0x2255cc, 1.4, 80, 2.0);
fillLight.position.set(22, 14, 6);
scene.add(fillLight);

// ─── Floor (reflective dark blue, matches reference) ─────────────────────────
const floorMat = new THREE.MeshStandardMaterial({
    color: 0x050f22,
    roughness: 0.18,
    metalness: 0.80,
    envMapIntensity: 1.6,
});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(250, 250), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -9.5;
floor.receiveShadow = true;
scene.add(floor);

// ─── Cube Materials ───────────────────────────────────────────────────────────
/**
 * Matte blue: like the solid powder-blue cubes in the reference.
 * High roughness, minimal metalness, smooth diffuse gradient under directional light.
 */
function makeMatteMat() {
    const m = new THREE.MeshStandardMaterial({
        color:            new THREE.Color(0x1f5dc8),
        roughness:        0.78,
        metalness:        0.04,
        envMapIntensity:  0.55,
    });
    // Slight tint variation so cubes aren't identical
    m.color.setHSL(
        THREE.MathUtils.randFloat(0.58, 0.64),   // blue hue range
        THREE.MathUtils.randFloat(0.65, 0.90),
        THREE.MathUtils.randFloat(0.35, 0.52),
    );
    return m;
}

/**
 * Glass / crystal: like the transparent chrome-edge cubes in the reference.
 * High transmission, low roughness, real IOR, clearcoat, attenuation tint.
 */
function makeGlassMat(size) {
    return new THREE.MeshPhysicalMaterial({
        color:                 new THREE.Color(0x99c8ff),
        roughness:             0.02,
        metalness:             0.0,
        transmission:          0.97,
        transparent:           true,
        ior:                   1.52,
        thickness:             size * 0.95,
        attenuationColor:      new THREE.Color(0x3366ff),
        attenuationDistance:   size * 1.2,
        reflectivity:          0.95,
        envMapIntensity:       2.6,
        clearcoat:             1.0,
        clearcoatRoughness:    0.03,
    });
}

// ─── Physics Config ───────────────────────────────────────────────────────────
const bounds = { minX: -24, maxX: 24, minY: -9.5, maxY: 32, minZ: -24, maxZ: 24 };

const phy = {
    gravity:        -26,
    restitution:    0.78,
    wallDamping:    0.84,
    linearDamping:  0.9983,
    angularDamping: 0.9958,
    floorFriction:  0.985,
};

// ─── Spawn Cubes ─────────────────────────────────────────────────────────────
const cubes = [];
const CUBE_COUNT = prefersReducedMotion ? 4 : 13;

// Pattern: matte / glass / matte / matte / glass ...  keeps ~1:3 glass ratio
const GLASS_INDICES = new Set([1, 4, 7, 10]);

for (let i = 0; i < CUBE_COUNT; i++) {
    const size    = THREE.MathUtils.randFloat(3.2, 6.4);
    const bevel   = size * 0.09;      // smooth chamfered edges
    const segs    = 3;                // keep geometry lightweight
    const isGlass = GLASS_INDICES.has(i);

    const geo = new RoundedBoxGeometry(size, size, size, segs, bevel);
    const mat = isGlass ? makeGlassMat(size) : makeMatteMat();

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
        THREE.MathUtils.randFloatSpread(36),
        THREE.MathUtils.randFloat(2, 28),
        THREE.MathUtils.randFloatSpread(36),
    );
    mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
    );
    // Glass cubes don't cast hard opaque shadows
    mesh.castShadow    = !isGlass;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Sphere-sweep bounding radius for collision
    const radius = (Math.sqrt(3) * size) / 2;
    const mass   = size ** 3;

    cubes.push({
        mesh, size, radius, mass, isGlass,
        velocity: new THREE.Vector3(
            THREE.MathUtils.randFloatSpread(9),
            THREE.MathUtils.randFloat(-2, 4),
            THREE.MathUtils.randFloatSpread(9),
        ),
        angularVelocity: new THREE.Vector3(
            THREE.MathUtils.randFloatSpread(1.8),
            THREE.MathUtils.randFloatSpread(1.8),
            THREE.MathUtils.randFloatSpread(1.8),
        ),
    });
}

// ─── Physics Functions ───────────────────────────────────────────────────────
function wallCollide(b) {
    const p = b.mesh.position, v = b.velocity, r = b.radius;

    if (p.y - r < bounds.minY) {
        p.y = bounds.minY + r;
        v.y = Math.abs(v.y) * phy.restitution;
        v.x *= phy.floorFriction;
        v.z *= phy.floorFriction;
        // Spin from floor contact
        b.angularVelocity.x += (Math.random() - 0.5) * 0.3;
        b.angularVelocity.z += (Math.random() - 0.5) * 0.3;
    }
    if (p.y + r > bounds.maxY) { p.y = bounds.maxY - r; v.y = -Math.abs(v.y) * phy.restitution; }
    if (p.x - r < bounds.minX) { p.x = bounds.minX + r; v.x =  Math.abs(v.x) * phy.wallDamping;  }
    if (p.x + r > bounds.maxX) { p.x = bounds.maxX - r; v.x = -Math.abs(v.x) * phy.wallDamping;  }
    if (p.z - r < bounds.minZ) { p.z = bounds.minZ + r; v.z =  Math.abs(v.z) * phy.wallDamping;  }
    if (p.z + r > bounds.maxZ) { p.z = bounds.maxZ - r; v.z = -Math.abs(v.z) * phy.wallDamping;  }
}

// Pre-allocated vectors to avoid GC pressure each frame
const _d  = new THREE.Vector3();
const _n  = new THREE.Vector3();
const _rv = new THREE.Vector3();
const _j  = new THREE.Vector3();
const _cr = new THREE.Vector3();

function cubeCollisions() {
    for (let i = 0; i < cubes.length; i++) {
        for (let k = i + 1; k < cubes.length; k++) {
            const a = cubes[i], b = cubes[k];

            _d.subVectors(b.mesh.position, a.mesh.position);
            const dist = _d.length();
            const minD = a.radius + b.radius;
            if (!dist || dist >= minD) continue;

            _n.copy(_d).divideScalar(dist);
            const pen = minD - dist;
            const tm  = a.mass + b.mass;

            a.mesh.position.addScaledVector(_n, -(pen * b.mass / tm));
            b.mesh.position.addScaledVector(_n,   pen * a.mass / tm);

            _rv.subVectors(a.velocity, b.velocity);
            const vn = _rv.dot(_n);
            if (vn > 0) continue;

            const imp = (-(1 + phy.restitution) * vn) / (1 / a.mass + 1 / b.mass);
            _j.copy(_n).multiplyScalar(imp);

            a.velocity.addScaledVector(_j,  1 / a.mass);
            b.velocity.addScaledVector(_j, -1 / b.mass);

            // Impart angular impulse from collision
            const sk = 0.12;
            _cr.crossVectors(_n, a.velocity);
            a.angularVelocity.addScaledVector(_cr,  sk / a.mass);
            _cr.crossVectors(_n, b.velocity);
            b.angularVelocity.addScaledVector(_cr, -sk / b.mass);
        }
    }
}

// ─── Post-processing: Bloom ──────────────────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.50,  // strength  – glass edges softly glow
    0.60,  // radius
    0.72,  // threshold – only bright surfaces bloom
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ─── Render Loop ─────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function frame() {
    requestAnimationFrame(frame);

    const dt = Math.min(clock.getDelta(), 1 / 30);
    const t  = clock.elapsedTime;

    // ── Animate lights for shifting reflections / refractions
    blueGlow.position.x  = Math.sin(t * 0.38) * 20;
    blueGlow.position.z  = 22 + Math.cos(t * 0.31) * 9;
    rimLight.position.x  = -24 + Math.cos(t * 0.51) * 12;
    rimLight.position.z  = -18 + Math.sin(t * 0.45) * 12;
    specLight.position.x = 18  + Math.sin(t * 0.72) * 9;
    specLight.position.y = 28  + Math.cos(t * 0.98) * 7;
    fillLight.position.z = 6   + Math.sin(t * 0.60) * 8;

    // ── Very gentle camera drift (cinematic parallax)
    camera.position.x = Math.sin(t * 0.055) * 2.5;
    camera.position.y = 32 + Math.sin(t * 0.038) * 1.0;
    camera.lookAt(0, 0, 0);

    // ── Physics step
    for (const body of cubes) {
        body.velocity.y += phy.gravity * dt;
        body.velocity.multiplyScalar(phy.linearDamping);
        body.mesh.position.addScaledVector(body.velocity, dt * 5.0);

        body.angularVelocity.multiplyScalar(phy.angularDamping);
        body.mesh.rotation.x += body.angularVelocity.x * dt * 3.8;
        body.mesh.rotation.y += body.angularVelocity.y * dt * 3.8;
        body.mesh.rotation.z += body.angularVelocity.z * dt * 3.8;

        wallCollide(body);
    }

    cubeCollisions();
    composer.render();
}

if (prefersReducedMotion) {
    composer.render();
} else {
    frame();
}

// ─── Resize ──────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    composer.setSize(w, h);
    bloom.setSize(w, h);
});
