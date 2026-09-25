/* FAULTLINE: GPL-3.0-only with section 7(b) attribution terms; see LICENSE and ATTRIBUTION.md. */
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { EnemyActor } from "../three/EnemyActor.ts";
import { ENEMIES } from "./enemies.ts";

test("every enemy has a finite moving rig and reduced motion pins the painted mesh", () => {
  const camera = new THREE.PerspectiveCamera();
  for (const enemy of Object.values(ENEMIES)) {
    const actor = new EnemyActor();
    actor.enter(enemy.id);
    const now = performance.now() + 1000;
    actor.update(camera, now, .2, false, 4.3, enemy.color, false, 0, null);
    const first = [...actor.mesh.geometry.attributes.position.array];
    actor.update(camera, now + 2100, 2.3, false, 4.3, enemy.color, false, 0, null);
    const second = [...actor.mesh.geometry.attributes.position.array];
    assert.notDeepEqual(first, second, `${enemy.id} must move inside its silhouette`);
    assert.ok(second.every(Number.isFinite), enemy.id);
    actor.update(camera, now, .2, true, 4.3, enemy.color, false, 0, null);
    const still = [...actor.mesh.geometry.attributes.position.array];
    actor.update(camera, now + 2100, 2.3, true, 4.3, enemy.color, true, .8, .3, "breach");
    assert.ok([...actor.mesh.geometry.attributes.position.array].every((value, i) => value === still[i]), `${enemy.id} reduced motion`);
    actor.mesh.geometry.dispose(); actor.mesh.material.dispose();
  }
});

test("transformation and defeat complete once, and clearing an animation cancels its callback", () => {
  const actor = new EnemyActor(), camera = new THREE.PerspectiveCamera();
  actor.enter("core");
  let completed = 0;
  for (const kind of ["enrage", "death", "break"] as const) {
    actor.transitionTo(kind, () => completed++, false);
    const now = performance.now();
    actor.update(camera, now + 2500, 2.5, false, 5.2, 0xff777e, true, 0, null);
    actor.update(camera, now + 3000, 3, false, 5.2, 0xff777e, true, 0, null);
  }
  assert.equal(completed, 3);
  actor.transitionTo("death", () => completed++, false);
  actor.clear();
  actor.update(camera, performance.now() + 2500, 2.5, false, 5.2, 0xff777e, true, 0, null);
  assert.equal(completed, 3);
  actor.mesh.geometry.dispose(); actor.mesh.material.dispose();
});
