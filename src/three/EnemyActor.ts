import * as THREE from "three";

type Motion = "scuttle" | "coil" | "wing" | "spectral" | "armored" | "chorus" | "reactor";
interface Rig { motion: Motion; speed: number; bend: number; breath: number; float: number; roll: number }
const RIGS: Record<string, Rig> = {
  leech: { motion: "scuttle", speed: 2.8, bend: .035, breath: .018, float: .055, roll: .022 },
  serpent: { motion: "coil", speed: 1.9, bend: .065, breath: .016, float: .04, roll: .032 },
  moth: { motion: "wing", speed: 4.1, bend: .09, breath: .012, float: .16, roll: .025 },
  wraith: { motion: "spectral", speed: 1.7, bend: .045, breath: .022, float: .17, roll: .04 },
  storm: { motion: "reactor", speed: 2.5, bend: .025, breath: .05, float: .12, roll: .055 },
  sentinel: { motion: "armored", speed: 1.1, bend: .008, breath: .017, float: .025, roll: .009 },
  marshal: { motion: "armored", speed: 1.35, bend: .012, breath: .018, float: .035, roll: .012 },
  prophet: { motion: "spectral", speed: 1.3, bend: .025, breath: .02, float: .075, roll: .02 },
  widow: { motion: "scuttle", speed: 1.8, bend: .055, breath: .022, float: .055, roll: .028 },
  colossus: { motion: "armored", speed: .85, bend: .006, breath: .024, float: .018, roll: .008 },
  choir: { motion: "chorus", speed: 1.55, bend: .03, breath: .02, float: .09, roll: .016 },
  weaver: { motion: "scuttle", speed: 2.35, bend: .045, breath: .016, float: .045, roll: .023 },
  reaver: { motion: "spectral", speed: 1.8, bend: .032, breath: .025, float: .11, roll: .04 },
  regent: { motion: "armored", speed: .95, bend: .01, breath: .022, float: .026, roll: .012 },
  cantor: { motion: "chorus", speed: 1.1, bend: .045, breath: .027, float: .12, roll: .018 },
  core: { motion: "reactor", speed: 1.5, bend: .024, breath: .038, float: .075, roll: .025 },
};

/** A subdivided painted puppet: wing tips, tendrils and limbs move independently
 * of its center. Atlas edges remain pinned to prevent bleeding into other cells. */
export class EnemyActor {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private id = "leech";
  private enteredAt = 0;
  private transition: { kind: "enrage" | "death" | "break"; start: number; duration: number; done: () => void } | null = null;
  private readonly dissolve = { value: 0 };
  private readonly tint = new THREE.Color();
  private readonly rest: Float32Array;
  constructor() {
    const geometry = new THREE.PlaneGeometry(1, 1, 28, 28);
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    material.onBeforeCompile = shader => {
      shader.uniforms.uDissolve = this.dissolve;
      shader.vertexShader = `varying vec2 actorUv;\n${shader.vertexShader}`.replace("#include <uv_vertex>", "#include <uv_vertex>\nactorUv = uv;");
      shader.fragmentShader = `uniform float uDissolve; varying vec2 actorUv;\n${shader.fragmentShader}`.replace("#include <color_fragment>", `#include <color_fragment>
        float grain = fract(sin(dot(floor(actorUv * 95.0), vec2(12.9898, 78.233))) * 43758.5453);
        float edge = length(actorUv - .5) * .6 + grain * .4;
        if (uDissolve > 0.0) {
          float burn = smoothstep(uDissolve - .07, uDissolve, edge);
          diffuseColor.rgb = mix(vec3(1.0, .62, .25), diffuseColor.rgb, smoothstep(uDissolve, uDissolve + .08, edge));
          diffuseColor.a *= burn;
        }
      `);
    };
    this.mesh = new THREE.Mesh(geometry, material);
    this.rest = new Float32Array(geometry.attributes.position.array);
  }
  enter(id: string) { this.id = id; this.enteredAt = performance.now(); this.transition = null; this.dissolve.value = 0; }
  transitionTo(kind: "enrage" | "death" | "break", done: () => void, quick: boolean) {
    this.transition = { kind, start: performance.now(), duration: quick ? 180 : kind === "death" ? 1150 : 1000, done };
  }
  clear() { this.transition = null; this.dissolve.value = 0; }
  update(camera: THREE.Camera, now: number, time: number, reduced: boolean, size: number,
    color: number, enraged: boolean, hurt: number, attack: number | null, kind?: string) {
    const rig = RIGS[this.id];
    const t = time * rig.speed * (enraged ? 1.22 : 1);
    const enter = Math.min(1, (now - this.enteredAt) / (reduced ? 120 : 800));
    const transition = this.transition;
    const progress = transition ? Math.min(1, (now - transition.start) / transition.duration) : 0;
    const power = transition?.kind === "enrage" ? Math.sin(progress * Math.PI) : 0;
    const death = transition?.kind === "death" ? progress : 0;
    const broken = transition?.kind === "break" ? Math.sin(progress * Math.PI) : 0;
    const windup = attack === null ? 0 : kind === "charge" ? Math.sin(attack * Math.PI) * 1.6 : Math.sin(Math.min(1, attack / .36) * Math.PI);
    const strike = attack === null || kind === "charge" ? 0 : Math.sin(Math.max(0, (attack - .36) / .64) * Math.PI);
    const amplitude = reduced ? 0 : 1;
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
      const breath = Math.sin(t) * rig.breath;
      dx += x * (breath - windup * .035 + power * .08);
      dy += y * (breath + windup * .045 + strike * .035) - death * Math.abs(x) * .25;
      positions.setXYZ(i, x + dx * pin * amplitude, y + dy * pin * amplitude, 0);
    }
    positions.needsUpdate = true;
    this.mesh.quaternion.copy(camera.quaternion);
    this.mesh.rotateZ(amplitude * (Math.sin(t * .6) * rig.roll + (kind === "sever" ? strike * .15 : 0) + hurt * -.05 - broken * .14));
    this.mesh.scale.setScalar(size * (1 + amplitude * (-.12 * (1 - enter) + strike * .055 + power * .08 - death * .12)));
    this.mesh.position.y = amplitude * (Math.sin(t) * rig.float - (1 - enter) * .5 - death * .7 - broken * .35);
    this.mesh.material.opacity = enter * (reduced ? 1 - death : 1);
    this.mesh.material.color.setRGB(1, 1 - hurt * .35, 1 - hurt * .5);
    this.tint.setHex(enraged ? 0xff9c80 : color);
    this.mesh.material.color.lerp(this.tint, (enraged ? .10 : 0) + power * .55 + broken * .3);
    this.dissolve.value = reduced ? 0 : death * .95;
    const state = transition?.kind ?? (hurt > .15 ? "hurt" : attack !== null ? kind === "charge" ? "charge" : attack < .36 ? "windup" : attack < .8 ? "attack" : "recover" : enter < 1 ? "enter" : "idle");
    if (transition && progress >= 1) { this.transition = null; transition.done(); }
    return state;
  }
}
