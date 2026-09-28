import * as THREE from './vendor/three.js';
import { WORLD, EXTRACTION, OBSTACLES, distance } from './game-core.js';

const SCALE = 0.03;
const UP = new THREE.Vector3(0, 1, 0);
const worldX = x => (x - WORLD.width / 2) * SCALE;
const worldZ = y => (y - WORLD.height / 2) * SCALE;

/** Entirely procedural meshes and textures; no downloaded art or model assets. */
export class ArenaScene {
  constructor(canvas) {
    this.canvas = canvas;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch { throw new Error('The 3D arena needs WebGL 2. Enable hardware acceleration or open this page in a current Chrome, Edge, Firefox or Safari browser.'); }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#667d91');
    this.scene.fog = new THREE.Fog('#667d91', 43, 110);
    this.camera = new THREE.PerspectiveCamera(57, 1, 0.1, 180);
    this.lookAt = new THREE.Vector3(); this.targetCamera = new THREE.Vector3(); this.targetLook = new THREE.Vector3();
    this.materials = new Map(); this.geometries = new Map(); this.textures = new Set();
    this.initialCamera = true; this.particleCursor = 0; this.cameraObstacles = [];
    this.makeLights(); this.makeStadium(); this.makeExtraction();
    this.player = this.makeRocket('#ee773b', '#c7733a', true);
    this.scene.add(this.player);
    this.rivals = ['#dc5965', '#726eca', '#c5a347'].map(color => { const rocket = this.makeRocket(color, color, false); this.scene.add(rocket); return rocket; });
    this.runners = Array.from({ length: 8 }, () => { const runner = this.makeRunner(); this.scene.add(runner); return runner; });
    this.makeEffects();
    this.resize();
  }

  material(color, metalness = 0.2, roughness = 0.7, emissive = null) {
    const key = `${color}|${metalness}|${roughness}|${emissive}`;
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({ color, metalness, roughness, ...(emissive ? { emissive, emissiveIntensity: 1.5 } : {}) }));
    return this.materials.get(key);
  }
  geometry(key, create) { if (!this.geometries.has(key)) this.geometries.set(key, create()); return this.geometries.get(key); }
  mesh(parent, geometry, material, x = 0, y = 0, z = 0, cast = true) {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = cast; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  box(parent, x, y, z, width, height, depth, material, cast = true) {
    const mesh = this.mesh(parent, this.geometry('box', () => new THREE.BoxGeometry(1, 1, 1)), material, x, y, z, cast); mesh.scale.set(width, height, depth); return mesh;
  }
  cylinder(parent, x, y, z, radiusTop, radiusBottom, height, material, sides = 12) {
    return this.mesh(parent, this.geometry(`c${radiusTop},${radiusBottom},${height},${sides}`, () => new THREE.CylinderGeometry(radiusTop, radiusBottom, height, sides)), material, x, y, z);
  }
  sphere(parent, x, y, z, radius, material) {
    return this.mesh(parent, this.geometry('sphere', () => new THREE.SphereGeometry(1, 12, 8)), material, x, y, z).scale.setScalar(radius);
  }
  limb(parent, start, end, radius, material) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end), direction = b.clone().sub(a);
    const limb = this.mesh(parent, this.geometry('limb', () => new THREE.CylinderGeometry(1, 1, 1, 8)), material);
    limb.position.copy(a).add(b).multiplyScalar(0.5); limb.scale.set(radius, direction.length(), radius); limb.quaternion.setFromUnitVectors(UP, direction.normalize()); return limb;
  }
  texture(width, height, draw) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; draw(canvas.getContext('2d'), width, height);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy()); this.textures.add(texture); return texture;
  }

  makeLights() {
    this.scene.add(new THREE.HemisphereLight('#c6e1f4', '#51493f', 2.3));
    const sun = new THREE.DirectionalLight('#ffe0ac', 3.2); sun.position.set(-18, 32, 12); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -31, right: 31, top: 25, bottom: -25, near: 1, far: 90 });
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04; this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#99c7e8', 1.5); fill.position.set(20, 9, -20); this.scene.add(fill);
  }

  makeStadium() {
    const steel = this.material('#354952', 0.55, 0.72), concrete = this.material('#65747a', 0.1, 0.95), dark = this.material('#182c36', 0.5), cyan = this.material('#45ceca', 0.4, 0.35, '#087e86');
    const floorTexture = this.texture(512, 512, (c, w, h) => {
      c.fillStyle = '#53606a'; c.fillRect(0, 0, w, h);
      let seed = 37; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(${random() > 0.5 ? '210,218,214' : '7,14,22'},${random() * 0.09})`; c.fillRect(random() * w, random() * h, 1 + random() * 5, 1); }
      c.strokeStyle = '#34434e'; c.lineWidth = 3; c.strokeRect(1, 1, w - 2, h - 2);
      c.strokeStyle = '#65727a'; c.lineWidth = 1; c.strokeRect(4, 4, w - 8, h - 8);
      for (const x of [13, 499]) for (const y of [13, 499]) { c.fillStyle = '#26343d'; c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill(); }
      c.strokeStyle = 'rgba(183,192,182,.16)'; for (let i = 0; i < 12; i++) { c.beginPath(); c.moveTo(random() * w, random() * h); c.lineTo(random() * w, random() * h); c.stroke(); }
    });
    floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping; floorTexture.repeat.set(12, 8);
    const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture, color: '#b0afb0', roughness: 0.88, metalness: 0.28 }); this.materials.set('floor', floorMaterial);
    this.box(this.scene, 0, -0.22, 0, 52, 0.4, 34, floorMaterial, false);
    const lane = this.material('#c1bca4', 0.1, 0.9);
    for (const z of [-11, 11]) {
      this.box(this.scene, 0, 0.008, z, 42, 0.012, 0.07, lane, false);
      for (let x = -20; x < 22; x += 3) this.box(this.scene, x, 0.011, z * 0.77, 1.3, 0.013, 0.085, lane, false);
    }
    for (const x of [-20, 20]) this.box(this.scene, x, 0.009, 0, 0.07, 0.015, 22, lane, false);
    for (const z of [-4.5, 4.5]) for (let x = -20; x < 22; x += 4) {
      const marker = this.box(this.scene, x, 0.013, z, 0.6, 0.015, 0.11, lane, false); marker.rotation.y = Math.PI / 4;
    }
    const hazardTexture = this.texture(256, 64, c => {
      c.fillStyle = '#a99b64'; c.fillRect(0, 0, 256, 64); c.fillStyle = '#273943';
      for (let x = -64; x < 320; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 32, 0); c.lineTo(x + 96, 64); c.lineTo(x + 64, 64); c.fill(); }
    });
    hazardTexture.wrapS = THREE.RepeatWrapping; hazardTexture.repeat.set(3, 1);
    const hazard = new THREE.MeshStandardMaterial({ map: hazardTexture, roughness: 0.8 }); this.materials.set('hazard', hazard);
    for (const z of [-15, 15]) {
      this.box(this.scene, 0, 0.7, z, 49, 1.4, 0.55, steel);
      this.box(this.scene, 0, 1.43, z, 49, 0.07, 0.6, cyan, false);
      for (let x = -23; x <= 23; x += 5.75) {
        this.box(this.scene, x, 0.38, z - Math.sign(z) * 0.32, 4.5, 0.48, 0.09, hazard, false);
        this.box(this.scene, x, 1.06, z, 0.18, 0.7, 0.8, concrete);
      }
      for (let tier = 0; tier < 5; tier++) {
        this.box(this.scene, 0, 0.9 + tier * 0.65, z + Math.sign(z) * (1.3 + tier * 1.15), 53, 0.55, 1.2, tier % 2 ? dark : concrete, false);
        this.box(this.scene, 0, 1.23 + tier * 0.65, z + Math.sign(z) * (1.3 + tier * 1.15), 51, 0.12, 0.5, this.material(tier % 2 ? '#4c777b' : '#a1734f'), false);
      }
    }
    for (const x of [-24, 24]) {
      this.box(this.scene, x, 0.7, 0, 0.55, 1.4, 30, steel); this.box(this.scene, x, 1.43, 0, 0.6, 0.07, 30, cyan, false);
      for (let tier = 0; tier < 4; tier++) this.box(this.scene, x + Math.sign(x) * (1.3 + tier * 1.15), 0.9 + tier * 0.7, 0, 1.2, 0.6, 37, concrete, false);
    }
    // Thousands of spectators are represented with one efficient instanced draw call.
    const crowd = new THREE.InstancedMesh(this.geometry('crowd', () => new THREE.IcosahedronGeometry(0.16, 0)), this.material('#9ba3a4'), 480);
    const dummy = new THREE.Object3D(); const crowdColors = ['#455d6d', '#917851', '#66868b', '#b59c76', '#43515e'];
    let index = 0;
    for (const side of [-1, 1]) for (let tier = 0; tier < 5; tier++) for (let seat = 0; seat < 48; seat++) {
      dummy.position.set(-24 + seat * 1.02, 1.56 + tier * 0.65, side * (16.3 + tier * 1.15)); dummy.scale.set(1, 1.7, 1); dummy.updateMatrix(); crowd.setMatrixAt(index, dummy.matrix); crowd.setColorAt(index++, new THREE.Color(crowdColors[(seat + tier * 7) % crowdColors.length]));
    }
    this.scene.add(crowd);
    for (const x of [-22, 22]) for (const z of [-16, 16]) {
      this.cylinder(this.scene, x, 6, z, 0.14, 0.24, 12, steel, 8);
      this.box(this.scene, x, 12, z, 4, 0.65, 0.5, dark);
      for (let i = -1; i <= 1; i++) this.box(this.scene, x + i * 1.1, 11.9, z - Math.sign(z) * 0.32, 0.8, 0.36, 0.05, this.material('#fff2c6', 0, 0.3, '#ffcb75'), false);
    }
    for (const z of [-22, 22]) {
      this.box(this.scene, 0, 7, z, 55, 0.35, 0.45, steel);
      for (let x = -25; x <= 25; x += 5) {
        this.box(this.scene, x, 5, z, 0.25, 4, 0.3, steel);
        this.limb(this.scene, [x, 4, z], [x + 4, 7, z], 0.07, steel);
      }
      this.makeBillboard(z);
    }
    for (let i = 0; i < 30; i++) {
      const angle = i * Math.PI * 2 / 30, radius = 58 + i % 3 * 8, height = 5 + i % 7 * 2;
      this.box(this.scene, Math.cos(angle) * radius, height / 2 - 1, Math.sin(angle) * radius, 4 + i % 4, height, 5, this.material('#526576', 0.1, 1), false);
    }
    for (const obstacle of OBSTACLES) this.makePillar(obstacle);
  }

  makeBillboard(z) {
    const texture = this.texture(1024, 256, (c, w, h) => {
      c.fillStyle = '#132631'; c.fillRect(0, 0, w, h); c.fillStyle = '#ee9c54'; c.fillRect(0, 0, 12, h);
      c.fillStyle = '#e9e9d9'; c.font = '900 77px Arial'; c.textAlign = 'center'; c.fillText('ROCKET JOCKEY', w / 2, 110);
      c.fillStyle = '#67d6cd'; c.font = 'bold 30px monospace'; c.fillText('SECTOR 07   //   THE DRYDOCK', w / 2, 177);
      c.fillStyle = '#ee9c54'; c.font = '22px monospace'; c.fillText('NO WHEELS. NO LIMITS.', w / 2, 224);
    });
    const material = new THREE.MeshBasicMaterial({ map: texture }); this.materials.set(`billboard${z}`, material);
    const board = this.mesh(this.scene, new THREE.PlaneGeometry(14, 3.5), material, 0, 6, z - Math.sign(z) * 0.3, false);
    if (z > 0) board.rotation.y = Math.PI;
    this.box(this.scene, 0, 6, z, 14.4, 3.9, 0.35, this.material('#263a45'));
  }

  makePillar(obstacle) {
    const x = worldX(obstacle.x), z = worldZ(obstacle.y), r = obstacle.radius * SCALE;
    const group = new THREE.Group(); this.scene.add(group);
    const steel = this.material('#52616a', 0.65), dark = this.material('#233541', 0.55), orange = this.material('#cf8c4c');
    this.cylinder(group, x, 0.2, z, r, r, 0.4, dark, 8);
    this.cylinder(group, x, 1.9, z, r * 0.68, r * 0.83, 3.4, steel, 8);
    this.cylinder(group, x, 0.58, z, r * 0.96, r * 0.96, 0.22, orange, 8);
    this.cylinder(group, x, 3.55, z, r * 0.8, r * 0.8, 0.28, dark, 8);
    this.cylinder(group, x, 3.72, z, r * 0.73, r * 0.73, 0.06, this.material('#63ddd5', 0.2, 0.3, '#20998f'), 8);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      this.box(group, x + Math.cos(a) * r * 0.73, 2, z + Math.sin(a) * r * 0.73, 0.13, 2.1, 0.13, dark);
    }
    // Occluders need independent materials: fading one must not change all stadium steel.
    const materials = new Map();
    group.traverse(mesh => {
      if (!mesh.isMesh) return;
      if (!materials.has(mesh.material)) { const material = mesh.material.clone(); material.transparent = true; materials.set(mesh.material, material); }
      mesh.material = materials.get(mesh.material);
    });
    this.cameraObstacles.push({ x, z, radius: r, group, materials: [...materials.values()], opacity: 1 });
  }

  /** The XZ entry fraction for a swept camera sphere against a vertical pillar. */
  cameraIntersection(px, pz, cx, cz, obstacle, clearance = 0.65) {
    const dx = cx - px, dz = cz - pz, ox = px - obstacle.x, oz = pz - obstacle.z;
    const a = dx * dx + dz * dz;
    if (a < 0.0001) return null;
    const radius = obstacle.radius + clearance, b = 2 * (ox * dx + oz * dz), c = ox * ox + oz * oz - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    const entry = (-b - Math.sqrt(discriminant)) / (2 * a), exit = (-b + Math.sqrt(discriminant)) / (2 * a);
    if (exit < 0 || entry > 1) return null;
    return Math.max(0, entry);
  }

  resolveCameraOcclusion(px, pz, desiredDistance, dt) {
    let safeDistance = desiredDistance;
    for (const obstacle of this.cameraObstacles) {
      const entry = this.cameraIntersection(px, pz, this.targetCamera.x, this.targetCamera.z, obstacle);
      if (entry !== null) safeDistance = Math.min(safeDistance, Math.max(0, desiredDistance * entry - 0.2));
    }
    // Never squeeze the camera into the rider: close obstacles fade instead.
    if (safeDistance >= 5.1 && safeDistance < desiredDistance) {
      const ratio = safeDistance / desiredDistance;
      this.targetCamera.x = px + (this.targetCamera.x - px) * ratio;
      this.targetCamera.z = pz + (this.targetCamera.z - pz) * ratio;
    }
    for (const obstacle of this.cameraObstacles) {
      const desiredBlocked = this.cameraIntersection(px, pz, this.targetCamera.x, this.targetCamera.z, obstacle) !== null;
      const actualBlocked = !this.initialCamera && this.cameraIntersection(px, pz, this.camera.position.x, this.camera.position.z, obstacle) !== null;
      const blocked = desiredBlocked || actualBlocked;
      // Hide immediately on obstruction; restore smoothly as the camera clears.
      obstacle.opacity = blocked ? 0.035 : Math.min(1, obstacle.opacity + dt * 3);
      for (const material of obstacle.materials) { material.opacity = obstacle.opacity; material.depthWrite = obstacle.opacity > 0.98; }
      obstacle.group.traverse(mesh => { if (mesh.isMesh) mesh.castShadow = obstacle.opacity > 0.98; });
    }
  }

  makeExtraction() {
    const radius = EXTRACTION.radius * SCALE;
    this.cylinder(this.scene, 0, 0.018, 0, radius, radius, 0.05, this.material('#3a6970', 0.55, 0.45), 64);
    const ringGeometry = new THREE.TorusGeometry(radius, 0.045, 6, 80);
    this.extractionRing = this.mesh(this.scene, ringGeometry, this.material('#76f8d8', 0.2, 0.3, '#25b997'), 0, 0.065, 0, false); this.extractionRing.rotation.x = -Math.PI / 2;
    const inner = this.mesh(this.scene, new THREE.TorusGeometry(radius * 0.78, 0.022, 6, 64), this.material('#c6f7db', 0, 0.4, '#54b895'), 0, 0.065, 0, false); inner.rotation.x = -Math.PI / 2;
    const iconTexture = this.texture(512, 512, c => {
      c.clearRect(0, 0, 512, 512); c.strokeStyle = '#95fce0'; c.lineWidth = 16;
      c.beginPath(); c.moveTo(186, 225); c.lineTo(256, 155); c.lineTo(326, 225); c.moveTo(256, 160); c.lineTo(256, 305); c.stroke();
      c.font = 'bold 37px monospace'; c.fillStyle = '#c2ffe9'; c.textAlign = 'center'; c.fillText('EXTRACT', 256, 380);
    });
    const material = new THREE.MeshBasicMaterial({ map: iconTexture, transparent: true, depthWrite: false }); this.materials.set('padIcon', material);
    const icon = this.mesh(this.scene, new THREE.PlaneGeometry(4.6, 4.6), material, 0, 0.08, 0, false); icon.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; this.cylinder(this.scene, Math.cos(a) * (radius + 0.2), 0.2, Math.sin(a) * (radius + 0.2), 0.075, 0.11, 0.4, this.material('#86f9e0', 0.1, 0.3, '#1ac49d'), 6); }
  }

  makeRocket(color, jacketColor, player) {
    const group = new THREE.Group(); const hull = this.material(color, 0.48, 0.44), cream = this.material('#dbd5b7', 0.35, 0.6), metal = this.material('#506471', 0.75, 0.4), dark = this.material('#1a2932', 0.4, 0.65);
    const body = this.cylinder(group, 0, 1.02, 0, 0.34, 0.38, 2.3, hull, 16); body.rotation.x = Math.PI / 2;
    const nose = this.cylinder(group, 0, 1.02, -1.47, 0.015, 0.34, 0.65, cream, 16); nose.rotation.x = -Math.PI / 2;
    const exhaust = this.cylinder(group, 0, 1.02, 1.25, 0.27, 0.4, 0.35, metal, 16); exhaust.rotation.x = Math.PI / 2;
    const rim = this.mesh(group, new THREE.TorusGeometry(0.29, 0.045, 8, 20), dark, 0, 1.02, 1.43); rim.rotation.z = Math.PI / 8;
    const stripe = this.cylinder(group, 0, 1.02, -0.65, 0.348, 0.348, 0.22, cream, 16); stripe.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      const fin = this.box(group, side * 0.46, 1.02, 0.78, 0.56, 0.065, 0.6, hull); fin.rotation.y = side * -0.35;
      this.box(group, side * 0.51, 1.02, 1.01, 0.4, 0.075, 0.12, cream);
      this.box(group, side * 0.37, 0.88, -0.24, 0.11, 0.11, 0.75, metal);
      this.box(group, side * 0.56, 0.61, 0.13, 0.28, 0.055, 0.45, dark);
    }
    const tailFin = this.box(group, 0, 1.4, 0.91, 0.055, 0.65, 0.55, hull); tailFin.rotation.x = -0.2;
    this.box(group, 0, 1.37, 0.07, 0.39, 0.12, 0.68, this.material('#403c36'));
    this.limb(group, [0, 1.31, -0.65], [0, 1.8, -0.65], 0.045, metal);
    this.limb(group, [-0.48, 1.79, -0.66], [0.48, 1.79, -0.66], 0.045, metal);
    for (const side of [-1, 1]) this.limb(group, [side * 0.36, 1.79, -0.66], [side * 0.52, 1.79, -0.66], 0.063, dark);
    const jacket = this.material(jacketColor, 0.1, 0.85), pants = this.material(player ? '#2e4c65' : '#34434b', 0.05, 0.9), leather = this.material('#27313a', 0.1, 0.7), helmet = this.material(player ? '#e3d5a9' : '#d4d7d1', 0.4, 0.5);
    // Jointed seated pose: thighs wrap the fuel tank; both hands meet the handlebar.
    this.box(group, 0, 1.59, 0.02, 0.4, 0.28, 0.36, pants);
    const torso = this.box(group, 0, 1.99, -0.08, 0.58, 0.67, 0.36, jacket); torso.rotation.x = -0.17;
    this.box(group, 0, 2.06, 0.13, 0.37, 0.38, 0.07, this.material('#dbc696', 0, 0.9));
    this.box(group, 0, 2.06, 0.176, 0.12, 0.28, 0.015, jacket);
    this.box(group, 0, 1.71, 0, 0.43, 0.09, 0.39, leather);
    for (const side of [-1, 1]) {
      const hip = [side * 0.2, 1.6, 0.03], knee = [side * 0.54, 1.14, -0.2], ankle = [side * 0.54, 0.74, 0.2];
      this.limb(group, hip, knee, 0.14, pants); this.sphere(group, ...knee, 0.145, pants); this.limb(group, knee, ankle, 0.11, pants);
      this.box(group, side * 0.54, 0.67, 0.05, 0.23, 0.24, 0.46, leather);
      const shoulder = [side * 0.31, 2.22, -0.11], elbow = [side * 0.45, 1.98, -0.37], hand = [side * 0.44, 1.81, -0.64];
      this.sphere(group, ...shoulder, 0.14, jacket); this.limb(group, shoulder, elbow, 0.12, jacket); this.limb(group, elbow, hand, 0.095, jacket); this.sphere(group, ...hand, 0.092, leather);
    }
    this.cylinder(group, 0, 2.39, -0.17, 0.12, 0.13, 0.15, this.material('#bb906f'), 8);
    this.sphere(group, 0, 2.62, -0.21, 0.27, helmet);
    const visor = this.box(group, 0, 2.62, -0.445, 0.4, 0.13, 0.07, this.material('#152c3d', 0.65, 0.2)); visor.rotation.x = -0.1;
    this.box(group, 0, 2.84, -0.21, 0.08, 0.027, 0.23, this.material('#b66035'));
    for (const side of [-1, 1]) this.sphere(group, side * 0.245, 2.61, -0.18, 0.074, metal);
    const flameMaterial = new THREE.MeshBasicMaterial({ color: '#ffad44', transparent: true, opacity: 0.85, depthWrite: false }); this.materials.set(`flame-${this.materials.size}`, flameMaterial);
    const flame = this.mesh(group, this.geometry('flame', () => new THREE.ConeGeometry(0.23, 1.2, 9)), flameMaterial, 0, 1.02, 2.01, false); flame.rotation.x = Math.PI / 2;
    const coreMaterial = new THREE.MeshBasicMaterial({ color: '#fff1b2' }); this.materials.set(`flame-core-${this.materials.size}`, coreMaterial);
    const flameCore = this.mesh(group, this.geometry('flameCore', () => new THREE.ConeGeometry(0.12, 0.8, 8)), coreMaterial, 0, 1.02, 1.8, false); flameCore.rotation.x = Math.PI / 2;
    group.userData = { flame, flameCore, hull: torso }; return group;
  }

  makeRunner() {
    const root = new THREE.Group(), figure = new THREE.Group(); root.add(figure);
    const suit = this.material('#aebd89', 0.05, 0.9), dark = this.material('#374951'), skin = this.material('#d2aa87');
    this.box(figure, 0, 0.92, 0, 0.3, 0.44, 0.2, suit); this.sphere(figure, 0, 1.28, 0, 0.16, skin);
    this.box(figure, 0, 1.29, -0.14, 0.21, 0.075, 0.06, dark);
    const legs = [], arms = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(side * 0.1, 0.73, 0); figure.add(leg); this.limb(leg, [0, 0, 0], [0, -0.55, 0], 0.065, suit); this.box(leg, 0, -0.55, -0.04, 0.13, 0.12, 0.25, dark); legs.push(leg);
      const arm = new THREE.Group(); arm.position.set(side * 0.22, 1.06, 0); figure.add(arm); this.limb(arm, [0, 0, 0], [side * 0.02, -0.36, 0], 0.055, suit); arms.push(arm);
    }
    const ring = this.mesh(root, this.geometry('runnerRing', () => new THREE.TorusGeometry(0.4, 0.018, 5, 24)), this.material('#d2e3a0', 0, 0.6, '#779843'), 0, 0.035, 0, false); ring.rotation.x = Math.PI / 2;
    const diamond = this.mesh(root, this.geometry('target', () => new THREE.OctahedronGeometry(0.12)), this.material('#d7f4ab', 0, 0.5, '#81ad53'), 0, 1.75, 0, false);
    root.userData = { figure, legs, arms, ring, diamond }; return root;
  }

  makeEffects() {
    this.tetherGeometry = new THREE.BufferGeometry(); this.tetherGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    this.tether = new THREE.Line(this.tetherGeometry, new THREE.LineBasicMaterial({ color: '#81ffe1' })); this.tether.frustumCulled = false; this.scene.add(this.tether);
    const particleGeometry = this.geometry('particle', () => new THREE.IcosahedronGeometry(0.04, 0));
    const particleMaterial = new THREE.MeshBasicMaterial({ color: '#8bf5d2' }); this.materials.set('particles', particleMaterial);
    this.particles = Array.from({ length: 56 }, () => { const mesh = this.mesh(this.scene, particleGeometry, particleMaterial, 0, -10, 0, false); mesh.visible = false; return { mesh, life: 0, vx: 0, vy: 0, vz: 0 }; });
    this.targetMarker = new THREE.Group();
    const material = this.material('#88ffe0', 0, 0.3, '#25ba92');
    for (const side of [-1, 1]) { const a = this.box(this.targetMarker, side * 0.22, 0, 0, 0.45, 0.045, 0.07, material, false); a.rotation.y = side * 0.6; }
    this.scene.add(this.targetMarker);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect(); this.renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    this.camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height); this.camera.updateProjectionMatrix();
  }
  resetCamera() { this.initialCamera = true; }
  burst(event) {
    for (let i = 0; i < 20; i++) {
      const p = this.particles[this.particleCursor++ % this.particles.length]; p.life = 0.7 + Math.random() * 0.3; p.mesh.visible = true;
      p.mesh.position.set(worldX(event.x), 1.1, worldZ(event.y)); p.vx = (Math.random() - 0.5) * 5; p.vy = 1 + Math.random() * 3; p.vz = (Math.random() - 0.5) * 5;
    }
  }
  update(state, input, dt, time) {
    const p = state.player, running = state.status === 'running';
    this.updateRocket(this.player, p, running && input.thrust, running && input.boost && state.energy > 0, time, true, input);
    state.rivals.forEach((rival, i) => this.updateRocket(this.rivals[i], rival, true, false, time + i, false, {}));
    state.npcs.forEach((npc, i) => {
      const root = this.runners[i], tethered = state.tether === npc.id; root.position.set(worldX(npc.x), 0, worldZ(npc.y));
      root.rotation.y = tethered ? Math.atan2(p.x - npc.x, p.y - npc.y) : time * 0.15 + npc.phase;
      const gait = Math.sin(time * (tethered ? 13 : 5) + npc.phase) * (tethered ? 0.7 : 0.25);
      root.userData.legs.forEach((leg, index) => { leg.rotation.x = gait * (index ? -1 : 1); });
      root.userData.arms.forEach((arm, index) => { arm.rotation.x = -gait * (index ? -1 : 1); });
      root.userData.diamond.position.y = 1.75 + Math.sin(time * 3 + i) * 0.08; root.userData.diamond.rotation.y = time;
      root.userData.ring.scale.setScalar(tethered || distance(npc, p) < 165 ? 1.3 : 1);
    });
    const tethered = state.npcs.find(npc => npc.id === state.tether); this.tether.visible = Boolean(tethered);
    if (tethered) {
      const positions = this.tetherGeometry.attributes.position;
      positions.setXYZ(0, worldX(p.x), 1.05, worldZ(p.y)); positions.setXYZ(1, worldX((p.x + tethered.x) / 2), 0.4, worldZ((p.y + tethered.y) / 2)); positions.setXYZ(2, worldX(tethered.x), 0.9, worldZ(tethered.y)); positions.needsUpdate = true;
    }
    const target = tethered ? EXTRACTION : [...state.npcs].sort((a, b) => distance(a, p) - distance(b, p))[0];
    this.targetMarker.visible = Boolean(target) && running;
    if (target) { this.targetMarker.position.set(worldX(target.x), tethered ? 2.6 : 2.1, worldZ(target.y)); this.targetMarker.rotation.y = time * 0.6; }
    for (const particle of this.particles) if (particle.life > 0 && state.status !== 'paused') {
      particle.life -= dt; particle.vy -= dt * 5; particle.mesh.position.x += particle.vx * dt; particle.mesh.position.y += particle.vy * dt; particle.mesh.position.z += particle.vz * dt;
      particle.mesh.scale.setScalar(Math.max(0, particle.life) * 2); particle.mesh.visible = particle.life > 0;
    }
    const dx = Math.cos(p.angle), dz = Math.sin(p.angle), px = worldX(p.x), pz = worldZ(p.y);
    const speed = Math.hypot(p.vx, p.vy), boost = running && input.boost && input.thrust && state.energy > 0;
    const followDistance = 6.7 + Math.min(1, speed / 570) * 0.7;
    this.targetCamera.set(px - dx * followDistance, 4.1, pz - dz * followDistance);
    this.resolveCameraOcclusion(px, pz, followDistance, dt);
    this.targetLook.set(px + dx * 3.3, 1.25, pz + dz * 3.3);
    const smoothing = this.initialCamera ? 1 : 1 - Math.exp(-dt * 8);
    this.camera.position.lerp(this.targetCamera, smoothing); this.lookAt.lerp(this.targetLook, smoothing); this.initialCamera = false;
    this.camera.lookAt(this.lookAt);
    const fov = boost ? 64 : 57; this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-dt * 4)); this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }
  updateRocket(group, sled, thrust, boost, time, player, input) {
    group.position.set(worldX(sled.x), Math.sin(time * 4) * 0.025, worldZ(sled.y)); group.rotation.y = -sled.angle - Math.PI / 2;
    group.rotation.z = player && thrust ? ((input.left ? 1 : 0) - (input.right ? 1 : 0)) * 0.07 : 0;
    const length = thrust ? (boost ? 1.9 : 1) : 0.28;
    group.userData.flame.scale.set(1 + (boost ? 0.15 : 0), length * (0.9 + Math.sin(time * 41) * 0.1), 1);
    group.userData.flame.position.z = 1.43 + length * 0.59;
    group.userData.flame.material.color.set(boost ? '#69eced' : '#ffad44');
    group.userData.flameCore.scale.y = length; group.userData.flameCore.position.z = 1.43 + length * 0.38;
  }
  dispose() {
    const geometries = new Set(), materials = new Set(this.materials.values());
    this.scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) { if (Array.isArray(object.material)) object.material.forEach(m => materials.add(m)); else materials.add(object.material); } });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); this.textures.forEach(t => t.dispose()); this.renderer.dispose();
  }
}
