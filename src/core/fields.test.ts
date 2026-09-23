import test from "node:test";
import assert from "node:assert/strict";
import { newExpedition, parseExpedition } from "./expedition.ts";
import { chooseRoom, combatPreview, endTurn, playZone, relocateNode } from "./run.ts";
import { RULES } from "./cards.ts";
import type { CardId, Zone } from "./types.ts";

function encounter(enemy = "prophet") {
  const e = newExpedition("architect", 292);
  const r = e.run;
  chooseRoom(r,"0-1");
  r.enemy!.id = enemy; r.enemy!.hp = r.enemy!.maxHp = 100;
  r.integrity = r.maxIntegrity = 100; r.energy = 20;
  r.topology.nodes.push({ id: "router1", role: "router", x: 0, z: 0 });
  r.topology.links.push({ a: "alpha", b: "router1" },{ a: "router1", b: "omega" });
  return e;
}
function field(e: ReturnType<typeof encounter>, card: CardId, zone: Zone) {
  e.run.hand = [card];
  return playZone(e.run,0,zone);
}

test("resonance follows the chosen route and counts a zone once, not each device",()=>{
  const e=encounter(),r=e.run;
  assert.equal(field(e,"resonance-field","center").ok,true);
  assert.equal(combatPreview(r).packetDamage,8);
  r.topology.nodes.push({id:"router2",role:"router",x:3,z:0});
  r.topology.links=[{a:"alpha",b:"router1"},{a:"router1",b:"router2"},{a:"router2",b:"omega"}];
  assert.equal(combatPreview(r).packetDamage,8);
  relocateNode(r,"router1",0,-3);relocateNode(r,"router2",3,-3);
  assert.equal(combatPreview(r).packetDamage,5);
});
test("allied fields persist for exactly three transmissions and replace allied slots",()=>{
  const e=encounter("leech");
  field(e,"resonance-field","center");field(e,"aegis-field","center");
  assert.deepEqual(e.run.zoneEffects,[{zone:"center",kind:"aegis",turns:3}]);
  assert.equal(combatPreview(e.run).shield,3);
  endTurn(e.run);assert.equal(e.run.zoneEffects[0].turns,2);
  endTurn(e.run);assert.equal(e.run.zoneEffects[0].turns,1);
  endTurn(e.run);assert.deepEqual(e.run.zoneEffects,[]);
});
test("corruption telegraphs a band, resolves after attack, then lasts two full turns",()=>{
  const e=encounter(),r=e.run;
  const snapshot=structuredClone(r),p=combatPreview(r);
  assert.deepEqual(r,snapshot);
  assert.deepEqual(p.zoneThreat,{zone:"center",kind:"corrosion",turns:2});
  assert.equal(p.incoming,0);
  endTurn(r);
  assert.equal(r.integrity,100);
  assert.deepEqual(r.zoneEffects,[p.zoneThreat]);
  const next=combatPreview(r);assert.equal(next.incomingRaw,4);
  assert.equal(endTurn(r).integrityDamage,next.incoming);
  assert.equal(r.zoneEffects[0].turns,1);
  const last=combatPreview(r);assert.equal(endTurn(r).integrityDamage,last.incoming);
  assert.deepEqual(r.zoneEffects,[]);
});
test("moving out of corrosion changes the forecast and leaves the hostile field behind",()=>{
  const e=encounter(),r=e.run;endTurn(r);
  assert.equal(combatPreview(r).incoming,4);
  const energy=r.energy;
  assert.equal(relocateNode(r,"router1",0,-3).ok,true);
  assert.equal(r.energy,energy-1);
  assert.equal(combatPreview(r).incoming,2);
  assert.equal(r.zoneEffects[0].zone,"center");
  assert.equal(r.zoneEffects[0].turns,2);
});
test("cleansing removes only hostile fields and jams in the chosen zone",()=>{
  const e=encounter(),r=e.run;
  field(e,"resonance-field","center");endTurn(r);
  r.zoneEffects.push({zone:"north",kind:"suppression",turns:2});
  r.faultNode="router1";r.drawPile=["fiber"];
  field(e,"purge-field","center");
  assert.equal(r.faultNode,null);
  assert.deepEqual(r.zoneEffects,[{zone:"center",kind:"resonance",turns:2},{zone:"north",kind:"suppression",turns:2}]);
  assert.deepEqual(r.hand,["fiber"]);
  assert.equal(combatPreview(r).packetDamage,8);
});
test("free cleansing exhausts before drawing and cannot redraw itself forever",()=>{
  const e=encounter(),r=e.run;
  r.drawPile=[];r.discardPile=[];
  field(e,"purge-field","center");
  assert.deepEqual(r.hand,[]);
  assert.deepEqual(r.exhaustPile,["purge-field"]);
  assert.equal(playZone(r,0,"center").ok,false);
});
test("widow suppression affects routing and the best clean path wins",()=>{
  const e=encounter("widow"),r=e.run;
  endTurn(r);assert.equal(combatPreview(r).packetDamage,2);
  r.topology.nodes.push({id:"router2",role:"router",x:0,z:-3});
  r.topology.links.push({a:"alpha",b:"router2"},{a:"router2",b:"omega"});
  assert.deepEqual(combatPreview(r).signalPath,["alpha","router2","omega"]);
  assert.equal(combatPreview(r).packetDamage,5+RULES.bandwidthPerChannel);
});
test("aegis requires a live route; null fields defend occupied hardware without a route",()=>{
  const e=encounter("leech"),r=e.run;
  field(e,"aegis-field","center");r.topology.links=[];
  assert.equal(combatPreview(r).shield,0);
  field(e,"null-field","center");
  assert.equal(combatPreview(r).shield,2);
  relocateNode(r,"router1",0,3);
  assert.equal(combatPreview(r).shield,0);
});
test("a finishing blow cancels corruption and clears encounter fields",()=>{
  const e=encounter(),r=e.run;field(e,"resonance-field","center");r.enemy!.hp=1;
  assert.equal(combatPreview(r).zoneThreat,null);
  assert.equal(endTurn(r).defeated,true);
  assert.deepEqual(r.zoneEffects,[]);
});
test("colossus armor is graded: every extra channel strips 2",()=>{
  const e=encounter("colossus"),r=e.run;
  assert.equal(combatPreview(r).packetDamage,1); // 5 − 4 armor
  r.topology.nodes.push({id:"router2",role:"router",x:0,z:3});
  r.topology.links.push({a:"alpha",b:"router2"},{a:"router2",b:"omega"});
  assert.equal(combatPreview(r).packetDamage,5+RULES.bandwidthPerChannel-2); // bandwidth, 2 armor left
  r.topology.nodes.push({id:"router3",role:"router",x:0,z:-3});
  r.topology.links.push({a:"alpha",b:"router3"},{a:"router3",b:"omega"});
  assert.equal(combatPreview(r).packetDamage,5+2*RULES.bandwidthPerChannel); // armor gone
});
test("stacked penalties stop at zero and visible calculation terms still reconcile",()=>{
  const e=encounter("colossus"),r=e.run;
  r.zoneEffects=[{zone:"center",kind:"suppression",turns:2}];
  const p=combatPreview(r);
  assert.equal(p.packetDamage,0);
  assert.equal(p.damageTerms.reduce((sum,term)=>sum+term.amount,0),0);
  assert.equal(endTurn(r).packetDamage,0);
});
test("invalid field actions are atomic and field saves validate timers and ownership slots",()=>{
  const e=encounter(),r=e.run;r.hand=["resonance-field"];r.energy=0;
  const before=structuredClone(r);
  assert.equal(playZone(r,0,"center").ok,false);assert.deepEqual(r,before);
  r.energy=1;const ready=structuredClone(r);
  assert.equal(playZone(r,0,"elsewhere" as Zone).ok,false);assert.deepEqual(r,ready);
  playZone(r,0,"center");
  assert.deepEqual(parseExpedition(JSON.stringify(e))!.run.zoneEffects,r.zoneEffects);
  r.zoneEffects[0].turns=0;assert.equal(parseExpedition(JSON.stringify(e)),null);
  r.zoneEffects=[{zone:"center",kind:"resonance",turns:3},{zone:"center",kind:"aegis",turns:2}];
  assert.equal(parseExpedition(JSON.stringify(e)),null);
});
