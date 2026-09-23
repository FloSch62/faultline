import { test, expect, type Page } from "@playwright/test";
import { newExpedition } from "../src/core/expedition.ts";
import { chooseRoom } from "../src/core/run.ts";
import { RELICS } from "../src/core/cards.ts";
import type { RelicId } from "../src/core/types.ts";

const storage="faultline-expedition-v2";
async function start(page: Page, relics=false) {
  const e=newExpedition("architect",292),r=e.run;
  chooseRoom(r,"0-1");
  r.enemy={id:"prophet",name:"RUST PROPHET",title:"Corrupts the ground beneath you",hp:100,maxHp:100,turn:0,color:0xe49b72};
  r.topology.nodes.push({id:"router1",role:"router",x:0,z:0});
  r.topology.links.push({a:"alpha",b:"router1"},{a:"router1",b:"omega"});
  r.hand=["resonance-field","purge-field","aegis-field","null-field","guard","fiber"];
  r.energy=10;
  r.drawPile=["purge-field","guard","fiber","router","fiber","guard"];
  r.deck.push("aegis-field","null-field");
  if(relics){r.relics=Object.keys(RELICS) as RelicId[];r.zoneEffects=[{zone:"center",kind:"resonance",turns:2},{zone:"center",kind:"corrosion",turns:2}];}
  await page.addInitScript(({storage,e})=>{if(sessionStorage.getItem("fields-seeded"))return;sessionStorage.setItem("fields-seeded","1");localStorage.setItem(storage,JSON.stringify(e));localStorage.setItem("faultline-preferences-v1",JSON.stringify({tips:false,fast:true}));localStorage.setItem("faultline-settings-v2",JSON.stringify({music:0,effects:0,motion:false}));},{storage,e});
  await page.goto("./");
  await page.locator('[data-action="continue"]').click();
}
async function saved(page:Page){return page.evaluate(storage=>JSON.parse(localStorage.getItem(storage)!).run,storage);}

test("fields can be targeted, persist through corruption, cleansed, and undone",async({page})=>{
  await start(page);
  await expect(page.locator('.hazard-caption')).toContainText('CENTER');
  await page.locator('[data-card-id="resonance-field"][data-hand]').click();
  await expect(page.locator('.field-seal.targetable')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await expect(page.locator('.field-seal.targetable')).toHaveCount(0);
  await expect(page.locator('dialog')).not.toBeVisible();
  await page.locator('[data-card-id="resonance-field"][data-hand]').click();
  await page.locator('[data-field-zone="center"]').click();
  await expect(page.locator('.signal-readout strong')).toContainText('8');
  await expect(page.locator('[data-field-zone="center"]')).toContainText('Resonance 3t');
  await page.locator('[data-action="transmit"]').click();
  await expect(page.locator('.game-root')).not.toHaveClass(/busy/,{timeout:15000});
  expect((await saved(page)).zoneEffects).toEqual([{zone:'center',kind:'resonance',turns:2},{zone:'center',kind:'corrosion',turns:2}]);
  await expect(page.locator('[data-field-zone="center"]')).toHaveClass(/corrupted/);
  // Reload the actual autosave before playing the cleanse drawn for turn two.
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await page.locator('[data-card-id="purge-field"][data-hand]').click();
  await page.locator('[data-field-zone="center"]').click();
  await expect(page.locator('[data-field-zone="center"]')).not.toHaveClass(/corrupted/);
  expect((await saved(page)).zoneEffects).toEqual([{zone:'center',kind:'resonance',turns:2}]);
  expect((await saved(page)).exhaustPile).toContain('purge-field');
  await page.locator('[data-action="undo"]').click();
  await expect(page.locator('[data-field-zone="center"]')).toHaveClass(/corrupted/);
});

test("player vitals, every relic, fields and full card rules fit without collisions",async({page})=>{
  await start(page,true);
  for(const viewport of [{width:1366,height:768},{width:1440,height:900},{width:1920,height:1080}]){
    await page.setViewportSize(viewport);await page.mouse.move(0,0);
    await expect(page.locator('.relic-token')).toHaveCount(9);
    const measurements=await page.evaluate(()=>{
      const panel=document.querySelector('.player-plate')!.getBoundingClientRect();
      const enemy=document.querySelector('.enemy-plate')!.getBoundingClientRect();
      const health=document.querySelector('.enemy-health-label strong')!.getBoundingClientRect();
      const hand=document.querySelector('#hand-zone')!.getBoundingClientRect();
      const relics=[...document.querySelectorAll('.relic-token')].map(e=>e.getBoundingClientRect());
      const cards=[...document.querySelectorAll('[data-hand]')].map(e=>({rule:e.querySelector('.card-rule')!.getBoundingClientRect().bottom,footer:e.querySelector('.card-footer')!.getBoundingClientRect().top}));
      return {panelBottom:panel.bottom,enemyBottom:enemy.bottom,handTop:hand.top,healthRight:health.right,enemyRight:enemy.right,relicsInside:relics.every(r=>r.top>=panel.top&&r.bottom<=panel.bottom),cards};
    });
    expect(measurements.panelBottom+15).toBeLessThan(measurements.handTop);
    expect(measurements.enemyBottom+15).toBeLessThan(measurements.handTop);
    expect(measurements.healthRight).toBeLessThan(measurements.enemyRight);
    expect(measurements.relicsInside).toBe(true);
    for(const card of measurements.cards)expect(card.rule).toBeLessThan(card.footer);
    const assets=await page.evaluate(async()=>Promise.all(['hostiles-zones','zone-card-atlas','combat-frames','relay-bazaar'].map(async name=>{const image=new Image();image.src=new URL(`art/${name}.png`,document.baseURI).href;try{await image.decode();return image.naturalWidth>0;}catch{return false;}})));
    expect(assets.every(Boolean)).toBe(true);
  }
  await page.locator('.relic-token').first().click();
  await expect(page.getByRole('heading',{name:'Power that stays with you.'})).toBeVisible();
  await expect(page.locator('dialog .relic-ledger p')).toHaveCount(9);
  await expect(page.locator('dialog .history-list')).toHaveCount(0);
  await page.screenshot({path:'artifacts/relic-journal.png',animations:'disabled'});
  await page.keyboard.press('Escape');
});

test("the nine local music tracks decode for browser playback",async({page})=>{
  await page.goto('./');await page.locator('[data-action="new"]').click();
  const tracks=await page.evaluate(async()=>{
    const names=['the-last-relay','signal-and-steel','the-blackout-core','the-copper-market','a-light-left-on','a-thousand-fractures','copperlight-pursuit','ghosts-in-the-relay','redline-protocol'];
    const base=document.baseURI;
    return Promise.all(names.map(async name=>{const a=new Audio(new URL(`audio/${name}-instrumental.ogg`,base).href);a.volume=0;try{await a.play();const result={name,duration:a.duration,ready:a.readyState};a.pause();a.removeAttribute('src');a.load();return result;}catch{return {name,duration:0,ready:0};}}));
  });
  for(const track of tracks){expect(track.ready,track.name).toBeGreaterThanOrEqual(2);expect(track.duration).toBeGreaterThan(60);}
});

for (const scene of [
  {room:"1-1",floor:1,title:"The Copper Market",file:"the-copper-market",art:"relay-bazaar"},
  {room:"2-0",floor:2,title:"A Light Left On",file:"a-light-left-on",art:"relay-sanctuary"},
  {room:"3-2",floor:3,title:"A Thousand Fractures",file:"a-thousand-fractures",art:"relay-interior"},
]) test(`${scene.title} is selected and loaded in its game scene`,async({page})=>{
  const e=newExpedition("architect",293);
  e.run.floor=scene.floor;
  chooseRoom(e.run,scene.room);
  await page.addInitScript(({storage,e})=>localStorage.setItem(storage,JSON.stringify(e)),{storage,e});
  await page.goto('./');
  const score=page.waitForResponse(response=>response.url().endsWith(`${scene.file}-instrumental.ogg`)&&response.ok());
  await page.locator('[data-action="continue"]').click();
  await score;
  await expect(page.locator('#now-playing')).toContainText(scene.title);
  const backdrop=await page.locator('.scene-backdrop').evaluate(el=>getComputedStyle(el).backgroundImage);
  expect(backdrop).toContain(`${scene.art}.png`);
  expect(await page.evaluate(async backdrop=>{const image=new Image();image.src=backdrop.slice(5,-2);try{await image.decode();return image.naturalWidth>0;}catch{return false;}},backdrop)).toBe(true);
});
