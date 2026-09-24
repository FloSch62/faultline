import * as THREE from "three";

type Motion = "scuttle" | "coil" | "wing" | "spectral" | "armored" | "chorus" | "reactor";
interface Rig { motion: Motion; speed: number; bend: number; breath: number; float: number; roll: number }
const RIGS: Record<string, Rig> = {
  leech: { motion: "scuttle", speed: 2.8, bend: .035, breath: .022, float: .055, roll: .022 },
  serpent: { motion: "coil", speed: 1.9, bend: .065, breath: .02, float: .04, roll: .032 },
  moth: { motion: "wing", speed: 4.1, bend: .09, breath: .016, float: .16, roll: .025 },
  wraith: { motion: "spectral", speed: 1.7, bend: .045, breath: .026, float: .17, roll: .04 },
  storm: { motion: "reactor", speed: 2.5, bend: .025, breath: .055, float: .12, roll: .055 },
  sentinel: { motion: "armored", speed: 1.1, bend: .008, breath: .022, float: .025, roll: .009 },
  marshal: { motion: "armored", speed: 1.35, bend: .012, breath: .022, float: .035, roll: .012 },
  prophet: { motion: "spectral", speed: 1.3, bend: .025, breath: .024, float: .075, roll: .02 },
  widow: { motion: "scuttle", speed: 1.8, bend: .055, breath: .026, float: .055, roll: .028 },
  colossus: { motion: "armored", speed: .85, bend: .006, breath: .03, float: .018, roll: .008 },
  choir: { motion: "chorus", speed: 1.55, bend: .03, breath: .024, float: .09, roll: .016 },
  weaver: { motion: "scuttle", speed: 2.35, bend: .045, breath: .02, float: .045, roll: .023 },
  reaver: { motion: "spectral", speed: 1.8, bend: .032, breath: .03, float: .11, roll: .04 },
  regent: { motion: "armored", speed: .95, bend: .01, breath: .028, float: .026, roll: .012 },
  cantor: { motion: "chorus", speed: 1.1, bend: .045, breath: .032, float: .12, roll: .018 },
  core: { motion: "reactor", speed: 1.5, bend: .024, breath: .042, float: .075, roll: .025 },
  // v4 leaders
  foreman: { motion: "armored", speed: 1.05, bend: .012, breath: .026, float: .03, roll: .012 },
  nest: { motion: "scuttle", speed: 1.6, bend: .05, breath: .028, float: .05, roll: .024 },
  demolition: { motion: "armored", speed: .8, bend: .008, breath: .03, float: .02, roll: .008 },
  blight: { motion: "coil", speed: 1.35, bend: .055, breath: .024, float: .045, roll: .026 },
  // v4 escorts and adds: small bodies, quicker and lighter than the machines they serve.
  "spark-mite": { motion: "scuttle", speed: 3.4, bend: .04, breath: .02, float: .07, roll: .03 },
  splicer: { motion: "scuttle", speed: 2.6, bend: .05, breath: .02, float: .05, roll: .026 },
  "relay-drone": { motion: "reactor", speed: 2.2, bend: .02, breath: .03, float: .15, roll: .035 },
  "ward-node": { motion: "armored", speed: 1.25, bend: .01, breath: .024, float: .05, roll: .012 },
  "tap-spinner": { motion: "scuttle", speed: 2.2, bend: .06, breath: .022, float: .06, roll: .028 },
  "glass-echo": { motion: "spectral", speed: 1.6, bend: .04, breath: .026, float: .14, roll: .035 },
  "rigger-drone": { motion: "reactor", speed: 2, bend: .022, breath: .03, float: .11, roll: .03 },
  "gate-warden": { motion: "armored", speed: 1, bend: .01, breath: .026, float: .03, roll: .012 },
  chorister: { motion: "chorus", speed: 1.3, bend: .04, breath: .03, float: .1, roll: .018 },
  "quarantine-drone": { motion: "reactor", speed: 1.8, bend: .022, breath: .036, float: .09, roll: .025 },
};

/** How far a hostile's idle float lifts and dips it (world units at a 10.5 sprite). */
export const rigFloat = (id: string) => (RIGS[id] ?? RIGS.leech).float;

/** Up-lit rim of dilated alpha: a hard, readable silhouette against the busy relay backdrop. */
const RIM_VERTEX = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const RIM_FRAGMENT = `
  uniform sampler2D map; uniform mat3 uvTransform; uniform vec3 color; uniform float strength;
  uniform float radius; uniform float time; uniform float fade;
  varying vec2 vUv;
  float alphaAt(vec2 uv) { return texture2D(map, (uvTransform * vec3(clamp(uv, .004, .996), 1.)).xy).a; }
  void main() {
    float own = alphaAt(vUv);
    float near = 0., far = 0.;
    for (int i = 0; i < 8; i++) {
      float angle = float(i) / 8. * 6.28318 + .39;
      vec2 direction = vec2(cos(angle), sin(angle));
      near = max(near, alphaAt(vUv + direction * radius));
      far = max(far, alphaAt(vUv + direction * radius * 2.8));
    }
    // A thin contour inside a wider glow: readable, but atmospheric rather than cut out.
    float rim = clamp(near - own * .9, 0., 1.) * .5 + clamp(far - near, 0., 1.) * .3;
    // Lit from the relay pit: bright along the lower silhouette, fading toward the crown.
    float under = .18 + 1.1 * smoothstep(.85, .1, vUv.y);
    float flicker = .82 + .18 * sin(time * 2.7 + vUv.y * 14. + vUv.x * 6.);
    float edge = smoothstep(0., .03, vUv.x) * smoothstep(0., .03, vUv.y) * smoothstep(0., .03, 1. - vUv.x) * smoothstep(0., .03, 1. - vUv.y);
    gl_FragColor = vec4(color * strength * under * flicker, rim * edge * fade);
  }`;
const EMBER_VERTEX = `
  uniform float time; uniform float size; uniform float height; uniform float width; uniform float rate; uniform float base;
  attribute float seed; varying float vAlpha; varying float vHeat;
  void main() {
    float t = fract(seed * 7.13 + time * rate * (.35 + .65 * fract(seed * 3.7)));
    vec3 p = vec3((fract(seed * 13.1) - .5) * width + sin(time * .7 + seed * 40.) * .45 * t,
      mix(base, height, t), (fract(seed * 5.3) - .5) * 2.4 + cos(time * .5 + seed * 20.) * .3);
    vAlpha = smoothstep(0., .12, t) * (1. - smoothstep(.55, 1., t));
    vHeat = 1. - t;
    vec4 mv = modelViewMatrix * vec4(p, 1.);
    gl_PointSize = size * (.45 + fract(seed * 9.7)) * (300. / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const EMBER_FRAGMENT = `
  uniform vec3 color; uniform float intensity; varying float vAlpha; varying float vHeat;
  void main() {
    float d = length(gl_PointCoord - .5);
    float a = smoothstep(.5, .0, d);
    vec3 hot = mix(color, vec3(1., .86, .62), vHeat * .45);
    gl_FragColor = vec4(hot * (1.2 + vHeat), a * a * vAlpha * intensity);
  }`;

function sigilTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const c = canvas.getContext("2d")!;
  c.translate(256, 256);
  c.strokeStyle = "#fff";
  c.fillStyle = "#fff";
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const [radius, width, alpha] of [[242, 3, .9], [228, 1.2, .55], [168, 2, .7], [150, 1, .4], [96, 1.4, .45]] as const) {
    c.globalAlpha = alpha; c.lineWidth = width;
    c.beginPath(); c.arc(0, 0, radius, 0, Math.PI * 2); c.stroke();
  }
  // Tick ring and angular glyphs: a guardian's seal, never legible text.
  for (let i = 0; i < 96; i++) {
    const a = i / 96 * Math.PI * 2, long = i % 8 === 0;
    c.globalAlpha = long ? .9 : .45; c.lineWidth = long ? 2.2 : 1;
    c.beginPath(); c.moveTo(Math.cos(a) * 230, Math.sin(a) * 230);
    c.lineTo(Math.cos(a) * (long ? 206 : 220), Math.sin(a) * (long ? 206 : 220)); c.stroke();
  }
  for (let i = 0; i < 24; i++) {
    c.save(); c.rotate(i / 24 * Math.PI * 2); c.translate(0, -196);
    c.globalAlpha = .75; c.lineWidth = 1.8; c.beginPath();
    const strokes = 2 + Math.floor(rand() * 3);
    for (let s = 0; s < strokes; s++) {
      c.moveTo((rand() - .5) * 14, (rand() - .5) * 18);
      c.lineTo((rand() - .5) * 14, (rand() - .5) * 18);
    }
    c.stroke(); c.restore();
  }
  for (let i = 0; i < 3; i++) {
    c.save(); c.rotate(i / 3 * Math.PI * 2 + .3);
    c.globalAlpha = .5; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, -168); c.lineTo(145, 84); c.lineTo(-145, 84); c.closePath(); c.stroke();
    c.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A subdivided painted puppet: wing tips, tendrils and limbs move independently
 * of its center. Atlas edges remain pinned to prevent bleeding into other cells.
 * Layers share the deforming geometry: a dark silhouette, an up-lit rim, the
 * painted body with glowing eyes/cores, embers and (for guardians) a turning seal. */
export class EnemyActor {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** Rising embers around the body; add to the enemy group (not billboarded). */
  readonly embers: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly rim: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly sigil: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private id = "leech";
  private boss = false;
  private enteredAt = 0;
  private transition: { kind: "enrage" | "death" | "break"; start: number; duration: number; done: () => void } | null = null;
  private readonly dissolve = { value: 0 };
  private readonly glowUniform = { value: 1 };
  private readonly underUniform = { value: 1 };
  private readonly underColor = { value: new THREE.Color(0xff7a4a) };
  private readonly tint = new THREE.Color();
  private readonly rest: Float32Array;
  /** 0–1: a dormant escort sits dimmer and quieter (its phase passes). */
  dim = 0;
  /** A placeholder cell until the painted sheet lands: tinted toward the hostile's colour. */
  stand = 0;
  /** `layer` lifts every render order by 10 per layer, so a nearer port draws after the leader. */
  constructor(layer = 0) {
    const geometry = new THREE.PlaneGeometry(1, 1, 28, 28);
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    material.onBeforeCompile = shader => {
      shader.uniforms.uDissolve = this.dissolve;
      shader.uniforms.uGlow = this.glowUniform;
      shader.uniforms.uUnder = this.underUniform;
      shader.uniforms.uUnderColor = this.underColor;
      shader.vertexShader = `varying vec2 actorUv;\n${shader.vertexShader}`.replace("#include <uv_vertex>", "#include <uv_vertex>\nactorUv = uv;");
      shader.fragmentShader = `uniform float uDissolve; uniform float uGlow; uniform float uUnder; uniform vec3 uUnderColor; varying vec2 actorUv;\n${shader.fragmentShader}`.replace("#include <color_fragment>", `#include <color_fragment>
        {
          // Saturated highlights (eyes, cores, crystals) burn past 1.0 so bloom catches them.
          float lum = dot(diffuseColor.rgb, vec3(.299, .587, .114));
          float sat = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
          // Pale armour and wings stay below bloom; only saturated eyes and cores ignite.
          float hot = smoothstep(.35, .8, lum) * smoothstep(.28, .62, sat);
          diffuseColor.rgb *= .9 + uGlow * hot * 1.7;
          // Up-lit from the relay pit, darker toward the crown: heavier and closer.
          float under = smoothstep(.6, .0, actorUv.y);
          diffuseColor.rgb += uUnderColor * under * uUnder * (.16 + lum * .5);
          diffuseColor.rgb *= mix(1., .7, smoothstep(.5, 1., actorUv.y) * uUnder);
        }
        float grain = fract(sin(dot(floor(actorUv * 95.0), vec2(12.9898, 78.233))) * 43758.5453);
        float edge = length(actorUv - .5) * .6 + grain * .4;
        if (uDissolve > 0.0) {
          float burn = smoothstep(uDissolve - .07, uDissolve, edge);
          diffuseColor.rgb = mix(vec3(1.0, .62, .25) * 2.2, diffuseColor.rgb, smoothstep(uDissolve, uDissolve + .08, edge));
          diffuseColor.a *= burn;
        }
      `);
    };
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.renderOrder = 6 + layer * 10;
    this.rest = new Float32Array(geometry.attributes.position.array);

    this.shadow = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: 0x030204, transparent: true, opacity: .62, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    }));
    this.shadow.position.set(0, -.012, -.03);
    this.shadow.scale.setScalar(1.035);
    this.shadow.renderOrder = 4 + layer * 10;
    this.mesh.add(this.shadow);

    this.rim = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      vertexShader: RIM_VERTEX, fragmentShader: RIM_FRAGMENT, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
      uniforms: {
        map: { value: null }, uvTransform: { value: new THREE.Matrix3() }, color: { value: new THREE.Color(0xff8a5a) },
        strength: { value: 1 }, radius: { value: .007 }, time: { value: 0 }, fade: { value: 1 },
      },
    }));
    this.rim.position.z = -.015;
    this.rim.renderOrder = 5 + layer * 10;
    this.mesh.add(this.rim);

    this.sigil = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
      toneMapped: false, color: 0xff8a5a,
    }));
    this.sigil.position.set(0, .06, -.09);
    this.sigil.renderOrder = 3 + layer * 10;
    this.sigil.visible = false;
    this.mesh.add(this.sigil);

    const count = 180, seeds = new Float32Array(count), positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) seeds[i] = (i * 0.618034 + (i % 7) * 0.113) % 1;
    const emberGeometry = new THREE.BufferGeometry();
    emberGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    emberGeometry.setAttribute("seed", new THREE.Float32BufferAttribute(seeds, 1));
    emberGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 12);
    this.embers = new THREE.Points(emberGeometry, new THREE.ShaderMaterial({
      vertexShader: EMBER_VERTEX, fragmentShader: EMBER_FRAGMENT, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: {
        time: { value: 0 }, size: { value: .09 }, height: { value: 8 }, width: { value: 7 }, rate: { value: .085 }, base: { value: -2.2 },
        color: { value: new THREE.Color(0xff8a5a) }, intensity: { value: .8 },
      },
    }));
    this.embers.renderOrder = 7 + layer * 10;
    this.embers.frustumCulled = false;
  }
  enter(id: string, boss = false) {
    this.id = id; this.boss = boss; this.enteredAt = performance.now(); this.transition = null; this.dissolve.value = 0;
    this.sigil.visible = boss;
    // The seal is drawn on a canvas the first time a guardian appears (never in headless rules tests).
    if (boss && !this.sigil.material.map && typeof document !== "undefined") {
      this.sigil.material.map = sigilTexture();
      this.sigil.material.needsUpdate = true;
    }
    this.embers.geometry.setDrawRange(0, boss ? 180 : 110);
  }
  transitionTo(kind: "enrage" | "death" | "break", done: () => void, quick: boolean) {
    this.transition = { kind, start: performance.now(), duration: quick ? 180 : kind === "death" ? 1150 : 1000, done };
  }
  clear() { this.transition = null; this.dissolve.value = 0; }
  transitioning() { return this.transition !== null; }
  update(camera: THREE.Camera, now: number, time: number, reduced: boolean, size: number,
    color: number, enraged: boolean, hurt: number, attack: number | null, kind?: string) {
    const rig = RIGS[this.id] ?? RIGS.leech;
    const t = time * rig.speed * (enraged ? 1.22 : 1);
    const enter = Math.min(1, (now - this.enteredAt) / (reduced ? 120 : 1100));
    const transition = this.transition;
    const progress = transition ? Math.min(1, (now - transition.start) / transition.duration) : 0;
    const power = transition?.kind === "enrage" ? Math.sin(progress * Math.PI) : 0;
    const death = transition?.kind === "death" ? progress : 0;
    const broken = transition?.kind === "break" ? Math.sin(progress * Math.PI) : 0;
    const windup = attack === null ? 0 : kind === "charge" ? Math.sin(attack * Math.PI) * 1.6 : Math.sin(Math.min(1, attack / .36) * Math.PI);
    const strike = attack === null || kind === "charge" ? 0 : Math.sin(Math.max(0, (attack - .36) / .64) * Math.PI);
    const amplitude = reduced ? 0 : 1;
    // A slow, heavy heave under the faster rig breath: the creature is alive and waiting.
    const heave = Math.sin(time * (this.boss ? 1.15 : 1.4)) * .5 + .5;
    const positions = this.mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = this.rest[i * 3], y = this.rest[i * 3 + 1];
      // Zero displacement at the atlas boundary; deform the silhouette inside it.
      const pin = Math.max(0, 1 - Math.pow(Math.max(Math.abs(x), Math.abs(y)) * 2, 6));
      const sides = Math.min(1, Math.abs(x) * 3.6);
      let dx = 0, dy = 0;
      if (rig.motion === "wing") {
        dx = Math.sign(x) * sides * Math.sin(t) * rig.bend;
        dy = sides * Math.cos(t) * rig.bend * .45;
      } else if (rig.motion === "coil" || rig.motion === "spectral") {
        dx = Math.sin(y * (rig.motion === "coil" ? 13 : 8) + t) * rig.bend * (.4 + Math.abs(y));
        dy = Math.cos(x * 9 + t * .8) * rig.bend * .18;
      } else if (rig.motion === "scuttle") {
        const limbs = sides * Math.max(0, .5 - y);
        dx = Math.sin(t * 2 + y * 18 + Math.sign(x) * 2) * rig.bend * limbs;
        dy = Math.cos(t * 2 + x * 12) * rig.bend * limbs * .65;
      } else if (rig.motion === "chorus") {
        dy = Math.sin(t + x * 12) * rig.bend * sides;
        dx = Math.sin(t * .6) * rig.bend * x;
      } else if (rig.motion === "reactor") {
        dx = Math.sin(t + y * 12) * rig.bend * sides;
        dy = Math.cos(t + x * 12) * rig.bend * sides;
      }
      const breath = Math.sin(t) * rig.breath + heave * rig.breath * .8;
      // Anticipation: shoulders widen and the body rears before it strikes.
      dx += x * (breath + windup * .05 + power * .08);
      dy += y * (breath + windup * .06 + strike * .045) - death * Math.abs(x) * .25;
      positions.setXYZ(i, x + dx * pin * amplitude, y + dy * pin * amplitude, 0);
    }
    positions.needsUpdate = true;
    this.mesh.quaternion.copy(camera.quaternion);
    this.mesh.rotateZ(amplitude * (Math.sin(t * .6) * rig.roll + (kind === "sever" ? strike * .15 : 0) + hurt * -.07 - broken * .14));
    this.mesh.scale.setScalar(size * (1 + amplitude * (-.14 * (1 - enter) + windup * .035 + strike * .085 + power * .1 - death * .12)));
    // Travel scales with the body: a small portrait bobs, rises and sinks as far as a large one.
    const unit = size / 10.5;
    this.mesh.position.y = amplitude * unit * (Math.sin(t) * rig.float * 1.6 - (1 - enter) * 1.6 - death * 1.1 - broken * .45);
    this.mesh.material.opacity = enter * (reduced ? 1 - death : 1);
    this.mesh.material.color.setRGB(1, 1 - hurt * .35, 1 - hurt * .5);
    this.tint.setHex(enraged ? 0xff9c80 : color);
    this.mesh.material.color.lerp(this.tint, (enraged ? .12 : 0) + power * .55 + broken * .3);
    if (hurt > 0) this.mesh.material.color.lerp(new THREE.Color(1.6, 1.45, 1.35), hurt * .4);
    if (this.stand > 0) this.mesh.material.color.lerp(this.tint.setHex(color), this.stand);
    if (this.dim > 0) this.mesh.material.color.multiplyScalar(1 - this.dim * .45);
    this.dissolve.value = reduced ? 0 : death * .95;

    // Eyes and cores flare with breath, anticipation and rage.
    this.glowUniform.value = 1 + heave * .35 * amplitude + windup * .9 + strike * .6 + (enraged ? .55 : 0) + power * 1.2;
    this.underColor.value.setHex(color).lerp(new THREE.Color(0xff5a2e), enraged ? .55 : .2);
    const map = this.mesh.material.map;
    const rim = this.rim.material.uniforms;
    if (map) {
      map.updateMatrix();
      rim.map.value = map;
      rim.uvTransform.value.copy(map.matrix);
    }
    this.rim.visible = !!map;
    rim.color.value.setHex(color).lerp(new THREE.Color(enraged ? 0xff3b1f : 0xffd2a0), enraged ? .5 : .12);
    rim.strength.value = (this.boss ? 1.1 : .8) + windup * 1.3 + strike * .7 + hurt * 2.4 + power * 2 + (enraged ? .45 : 0);
    rim.time.value = reduced ? 0 : time;
    rim.fade.value = enter * (1 - death);
    this.shadow.material.opacity = .62 * enter * (1 - death);

    const sigil = this.sigil.material;
    if (this.boss) {
      sigil.color.setHex(color).lerp(new THREE.Color(enraged ? 0xff5030 : 0xffd7a0), .3);
      sigil.opacity = enter * (1 - death) * (.22 + heave * .12 + windup * .35 + power * .4);
      this.sigil.rotation.z = reduced ? 0 : time * -.08;
      this.sigil.scale.setScalar(1.32 + heave * .02 * amplitude + windup * .06);
    }
    const ember = this.embers.material.uniforms;
    ember.time.value = reduced ? 0 : time;
    ember.color.value.setHex(color).lerp(new THREE.Color(0xff7040), enraged ? .6 : .35);
    ember.rate.value = (enraged ? .13 : .085) * (1 + windup * .6);
    ember.intensity.value = enter * (1 - death * .5) * (reduced ? .45 : .85) * (this.boss ? 1.2 : 1) * (1 - this.dim * .6);
    ember.width.value = size * .95;
    ember.height.value = size * 1.15;
    ember.base.value = -size * .21;
    ember.size.value = this.boss ? .12 : .095;

    const state = transition?.kind ?? (hurt > .15 ? "hurt" : attack !== null ? kind === "charge" ? "charge" : attack < .36 ? "windup" : attack < .8 ? "attack" : "recover" : enter < 1 ? "enter" : "idle");
    if (transition && progress >= 1) { this.transition = null; transition.done(); }
    return state;
  }
  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.shadow.material.dispose();
    this.rim.material.dispose();
    this.sigil.geometry.dispose();
    this.sigil.material.map?.dispose();
    this.sigil.material.dispose();
    this.embers.geometry.dispose();
    this.embers.material.dispose();
  }
}
