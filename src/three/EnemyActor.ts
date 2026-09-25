/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
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

/** How far a hostile's idle float lifts and dips it (rig units: a sprite is 10.5 across). */
export const rigFloat = (id: string) => (RIGS[id] ?? RIGS.leech).float;
/** How far its idle motion (float, breath and roll) may carry a painted edge, as a fraction of the sprite. */
export const rigReach = (id: string) => {
  const rig = RIGS[id] ?? RIGS.leech;
  return rig.float * 1.6 / 10.5 + rig.breath * .9 + rig.roll * .5;
};

/** Embers in the rail's pixel space: `unit` is pixels per rig unit, `pixel` device pixels per rig unit. */
const EMBER_VERTEX = `
  uniform float time; uniform float size; uniform float height; uniform float width; uniform float rate; uniform float base;
  uniform float unit; uniform float pixel;
  attribute float seed; varying float vAlpha; varying float vHeat;
  void main() {
    float t = fract(seed * 7.13 + time * rate * (.35 + .65 * fract(seed * 3.7)));
    vec3 p = vec3((fract(seed * 13.1) - .5) * width + sin(time * .7 + seed * 40.) * .45 * unit * t, mix(base, height, t), 0.);
    vAlpha = smoothstep(0., .12, t) * (1. - smoothstep(.55, 1., t));
    vHeat = 1. - t;
    gl_PointSize = size * (.45 + fract(seed * 9.7)) * pixel;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
  }`;
const EMBER_FRAGMENT = `
  uniform vec3 color; uniform float intensity; varying float vAlpha; varying float vHeat;
  void main() {
    float d = length(gl_PointCoord - .5);
    float a = smoothstep(.5, .0, d);
    vec3 hot = mix(color, vec3(1., .86, .62), vHeat * .45);
    gl_FragColor = vec4(hot * (1.2 + vHeat), a * a * vAlpha * intensity);
  }`;

/** A subdivided painted puppet: wing tips, tendrils and limbs move independently
 * of its center; the portrait's edges stay pinned. It lives in the rail's own layer, where a
 * world unit is a CSS pixel and `size` is the portrait's side in pixels. At rest it shows the
 * painting as painted; its states show in its motion, a hit's flash, its colour as it charges or
 * rages, and the embers rising behind it. */
export class EnemyActor {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** Rising embers around the body; add to the enemy group (not billboarded). */
  readonly embers: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private id = "leech";
  private boss = false;
  private enteredAt = 0;
  private transition: { kind: "enrage" | "death" | "break"; start: number; duration: number; done: () => void } | null = null;
  private readonly dissolve = { value: 0 };
  private readonly glowUniform = { value: 0 };
  private readonly tint = new THREE.Color();
  private readonly rest: Float32Array;
  /** 0–1: a dormant escort sits dimmer and quieter (its phase passes). */
  dim = 0;
  /** A kindred stand-in body (its own portrait failed to load): tinted toward the hostile's colour. */
  stand = 0;
  /** The rail layer's device pixels per CSS pixel (ember sizes). */
  pixelRatio = 1;
  /** `layer` lifts the body's render order by 10 per layer, so a nearer port draws after the
   * leader; every port's embers draw before every body. */
  constructor(layer = 0) {
    const geometry = new THREE.PlaneGeometry(1, 1, 28, 28);
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    material.onBeforeCompile = shader => {
      shader.uniforms.uDissolve = this.dissolve;
      shader.uniforms.uGlow = this.glowUniform;
      shader.vertexShader = `varying vec2 actorUv;\n${shader.vertexShader}`.replace("#include <uv_vertex>", "#include <uv_vertex>\nactorUv = uv;");
      // Portraits are drawn smaller than painted (down to about half): a slight negative bias keeps
      // the minified paint crisp instead of trilinear-soft.
      shader.fragmentShader = shader.fragmentShader.replace("texture2D( map, vMapUv )", "texture2D( map, vMapUv, -.5 )");
      shader.fragmentShader = `uniform float uDissolve; uniform float uGlow; varying vec2 actorUv;\n${shader.fragmentShader}`.replace("#include <color_fragment>", `#include <color_fragment>
        {
          // Saturated highlights (eyes, cores, crystals) flare as it winds up, strikes and rages;
          // at rest the painting is untouched.
          float lum = dot(diffuseColor.rgb, vec3(.299, .587, .114));
          float sat = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
          diffuseColor.rgb *= 1. + uGlow * smoothstep(.35, .8, lum) * smoothstep(.28, .62, sat) * .55;
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
        unit: { value: 1 }, pixel: { value: 1 },
        color: { value: new THREE.Color(0xff8a5a) }, intensity: { value: .8 },
      },
    }));
    this.embers.renderOrder = 1 + layer;
    this.embers.frustumCulled = false;
  }
  enter(id: string, boss = false) {
    this.id = id; this.boss = boss; this.enteredAt = performance.now(); this.transition = null; this.dissolve.value = 0;
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

    // Eyes and cores flare with anticipation and rage.
    this.glowUniform.value = windup * .9 + strike * .6 + (enraged ? .55 : 0) + power * 1.2;
    const ember = this.embers.material.uniforms;
    ember.time.value = reduced ? 0 : time;
    ember.color.value.setHex(color).lerp(new THREE.Color(0xff7040), enraged ? .6 : .35);
    ember.rate.value = (enraged ? .13 : .085) * (1 + windup * .6);
    ember.intensity.value = enter * (1 - death * .5) * (reduced ? .45 : .85) * (this.boss ? 1.2 : 1) * (1 - this.dim * .6);
    ember.width.value = size * .95;
    ember.height.value = size * 1.15;
    ember.base.value = -size * .21;
    ember.size.value = this.boss ? .12 : .095;
    ember.unit.value = unit;
    ember.pixel.value = unit * this.pixelRatio;

    const state = transition?.kind ?? (hurt > .15 ? "hurt" : attack !== null ? kind === "charge" ? "charge" : attack < .36 ? "windup" : attack < .8 ? "attack" : "recover" : enter < 1 ? "enter" : "idle");
    if (transition && progress >= 1) { this.transition = null; transition.done(); }
    return state;
  }
  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.embers.geometry.dispose();
    this.embers.material.dispose();
  }
}
