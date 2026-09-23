import * as THREE from "three";

/** Brushed instrument metal: every device and prop shares this language. */
export function mat(
  color: number,
  emissive = 0x000000,
  intensity = 0,
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.64,
    roughness: 0.53,
    clearcoat: 0.12,
    clearcoatRoughness: 0.48,
    emissive,
    emissiveIntensity: intensity,
  });
}
export function glow(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity === 1,
  });
}
export function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  sides: number,
  material: THREE.Material,
  y: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, sides),
    material,
  );
  mesh.position.y = y;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
export function ring(
  radius: number,
  tube: number,
  color: number,
  y: number,
  opacity = 1,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 6, 64),
    glow(color, opacity),
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}
export function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
/** Soft radial decal drawn once on a canvas; used for scorch marks and infections. */
export function radialTexture(stops: [number, string][], veins = 0, seed = 1): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const c = canvas.getContext("2d")!;
  const gradient = c.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  c.fillStyle = gradient;
  c.fillRect(0, 0, 256, 256);
  let s = seed * 9301 + 49297;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  c.strokeStyle = stops[0][1];
  for (let i = 0; i < veins; i++) {
    let x = 128, y = 128, angle = rand() * Math.PI * 2;
    c.globalAlpha = .55;
    c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(x, y);
    for (let step = 0; step < 9; step++) {
      angle += (rand() - .5) * 1.1;
      x += Math.cos(angle) * 11; y += Math.sin(angle) * 11;
      c.lineTo(x, y);
      c.lineWidth = Math.max(.6, 2.4 - step * .22);
    }
    c.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
/** A floor-lying plane (decal) in device-group space. */
export function decal(texture: THREE.Texture, size: number, y: number, opacity: number, additive = false): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map: texture, transparent: true, opacity, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.renderOrder = 2;
  return mesh;
}
/** A ring broken into dashes: reads as "boundary", not as a device skirt. */
export function dashedRing(radius: number, tube: number, color: number, y: number, opacity: number, dashes = 16): THREE.Group {
  const group = new THREE.Group();
  const arc = (Math.PI * 2) / dashes;
  for (let i = 0; i < dashes; i++) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 4, 8, arc * .55), glow(color, opacity));
    mesh.rotation.x = Math.PI / 2;
    mesh.rotation.z = i * arc;
    mesh.position.y = y;
    mesh.renderOrder = 3;
    group.add(mesh);
  }
  return group;
}
