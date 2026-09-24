// Stress the real UI, including the CSS viewport sizes produced by 110% zoom.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { newExpedition } from '../src/core/expedition.ts';
import { chooseRoom } from '../src/core/run.ts';
import { CARDS, RELICS } from '../src/core/cards.ts';
import { ENEMIES } from '../src/core/enemies.ts';
const origin=process.env.FAULTLINE_ORIGIN || 'http://127.0.0.1:4174';
const sizes=[[320,740],[390,844],[768,1024],[900,700],[1024,600],[1164,655],[1242,698],[1280,720],[1366,768],[1440,900],[1745,982],[1920,1080],[2560,1440]];
const browser=await chromium.launch({args:['--no-sandbox','--enable-unsafe-swiftshader']});
await mkdir('artifacts/layout-audit',{recursive:true});
const report=[],errors=[];
const page=await browser.newPage();
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
  const fixture=sessionStorage.getItem('layout-fixture');
  if(fixture)localStorage.setItem('faultline-expedition-v2',fixture);
});
await page.goto(origin);
async function install(e) {
  await page.evaluate(e=>{
    sessionStorage.setItem('layout-fixture',JSON.stringify(e));
    localStorage.setItem('faultline-settings-v2',JSON.stringify({music:0,effects:0,motion:false}));
    localStorage.setItem('faultline-preferences-v1',JSON.stringify({tips:true,fast:true}));
  },e);
  await page.reload();await page.locator('[data-action="continue"]').click();await page.evaluate(()=>document.fonts.ready);
}
const e=newExpedition('architect',923),r=e.run;chooseRoom(r,'0-1');
r.enemy={...Object.fromEntries(['id','name','title','color'].map(k=>[k,ENEMIES.cantor[k]])),hp:32,maxHp:80,turn:9};r.bossIntroSeen=true;r.stage=1;r.floor=6;r.currentRoom='6-1';r.turn=10;
r.log=['The Hollow Choir prepares to jam a device and suppress its band.'];
r.relics=Object.keys(RELICS);r.reserveEnergy=3;r.packetBoost=8;r.block=12;
r.topology.nodes.push({id:'router1',role:'router',x:0,z:0});r.topology.links.push({a:'alpha',b:'router1'},{a:'router1',b:'omega'});
r.hand=Object.keys(CARDS).sort((a,b)=>CARDS[b].rules.length-CARDS[a].rules.length).slice(0,10);
r.zoneEffects=[{zone:'center',kind:'resonance',turns:3},{zone:'center',kind:'suppression',turns:2}];
await install(e);
for(const [width,height] of sizes){
  await page.setViewportSize({width,height});await page.mouse.move(0,0);await page.evaluate(()=>document.querySelector('#app').scrollTop=0);
  const measurements=await page.evaluate(()=>{
    const rect=el=>el.getBoundingClientRect();const panel=rect(document.querySelector('.player-plate')),hand=rect(document.querySelector('#hand-zone')),enemy=rect(document.querySelector('.enemy-plate'));
    const problems=[];
    const hint=rect(document.querySelector('.target-hint'));
    if(hint.bottom>hand.top-8)problems.push(`instruction meets cards: ${hint.bottom} / ${hand.top}`);
    const fields=rect(document.querySelector('.field-strip'));
    for(const box of [panel,enemy])if(fields.left<box.right&&fields.right>box.left&&fields.top<box.bottom&&fields.bottom>box.top)problems.push('field controls overlap a combatant panel');
    const piles=rect(document.querySelector('.draw-piles')),transmit=rect(document.querySelector('.transmit-button'));
    if(piles.left<transmit.right&&piles.right>transmit.left&&piles.top<transmit.bottom&&piles.bottom>transmit.top)problems.push('card piles overlap Transmit');
    for(const card of document.querySelectorAll('[data-hand]')){
      const rule=rect(card.querySelector('.card-rule')),footer=rect(card.querySelector('.card-footer'));
      const copy=card.querySelector('.card-copy');
      if(rule.bottom>footer.top-2||copy.scrollHeight>copy.clientHeight+1)problems.push(`${card.dataset.cardId}: card rule exceeds its space (${rule.bottom-footer.top})`);
      const title=card.querySelector('.card-heading');if(title.scrollWidth>title.clientWidth+1||title.scrollHeight>title.clientHeight+1)problems.push(`${card.dataset.cardId}: title overflow`);
    }
    for(const selector of ['.field-seal','.player-tools','.vital-heading','.intent-medallion'])for(const el of document.querySelectorAll(selector)){
      if(el.scrollWidth>el.clientWidth+2)problems.push(`${selector}: horizontal overflow ${el.scrollWidth-el.clientWidth}`);
    }
    if(panel.bottom>hand.top-12)problems.push(`player meets hand: ${panel.bottom} / ${hand.top}`);
    if(enemy.bottom>hand.top-12)problems.push(`enemy meets hand: ${enemy.bottom} / ${hand.top}`);
    for(const button of document.querySelectorAll('.player-tools button')){
      const b=rect(button);if(b.left<panel.left+12||b.right>panel.right-12||b.bottom>panel.bottom-25)problems.push(`tool too close to frame: ${button.textContent.trim()}`);
    }
    if(document.querySelector('#app').clientWidth>900)for(const selector of ['.plate-heading','.combatant-identity h2']){
      const heading=document.querySelector(selector),frame=heading.closest('.battle-plate').getBoundingClientRect();
      if(rect(heading).top<frame.top+24)problems.push('combatant name too close to frame crest');
    }
    const app=document.querySelector('#app');if(app.scrollWidth>app.clientWidth+1)problems.push('horizontal page overflow');
    return {problems,playerBottom:panel.bottom,enemyBottom:enemy.bottom,handTop:hand.top,gameHeight:document.querySelector('.game-root').clientHeight};
  });
  report.push({scene:'battle',width,height,...measurements});
  await page.screenshot({path:`artifacts/layout-audit/battle-${width}x${height}.png`,animations:'disabled'});
}
const selecting=structuredClone(e);selecting.run.hand=['resonance-field','purge-field','clabernetes','router','fiber'];
await install(selecting);await page.locator('[data-hand="0"]').click();
for(const [width,height] of [[320,740],[390,844],[1024,600],[1440,900]]){
  await page.setViewportSize({width,height});
  const problems=await page.evaluate(()=>{
    const hint=document.querySelector('.target-hint').getBoundingClientRect(),hand=document.querySelector('#hand-zone').getBoundingClientRect(),fields=document.querySelector('.field-strip').getBoundingClientRect();
    return [...(hint.bottom>hand.top-8?['selected instruction meets cards']:[]),...(hint.top<fields.bottom+4?['selected instruction meets fields']:[])];
  });
  report.push({scene:'selected-field',width,height,problems});
  await page.screenshot({path:`artifacts/layout-audit/selected-field-${width}.png`,animations:'disabled'});
}
// Inspect the generated atlas cells in the real Three.js scene.
await page.setViewportSize({width:1440,height:900});
for(const id of ['serpent','moth','marshal','choir','weaver','reaver']){
  const hostile=structuredClone(e),definition=ENEMIES[id];
  hostile.run.stage=['serpent','moth'].includes(id)?0:id==='reaver'?2:1;
  hostile.run.floor=4;hostile.run.currentRoom='4-0';hostile.run.turn=1;
  const hp=22+hostile.run.stage*8;
  hostile.run.enemy={id,name:definition.name,title:definition.title,color:definition.color,hp,maxHp:hp,turn:0};
  hostile.run.log=[`${definition.name} enters the grid. Establish a route.`];
  hostile.run.relics=['hot-swap'];hostile.run.hand=['router','fiber','guard','resonance-field','purge-field'];
  hostile.run.block=0;hostile.run.packetBoost=0;hostile.run.reserveEnergy=0;hostile.run.zoneEffects=[];
  await install(hostile);
  await page.screenshot({path:`artifacts/layout-audit/hostile-${id}.png`,animations:'disabled'});
}
for(const stage of [0,1,2]){
  const e=newExpedition('architect',934);e.run.stage=stage;e.run.floor=6;chooseRoom(e.run,'6-1');
  await install(e);
  for(const [width,height] of [[390,844],[1024,600],[1242,698],[1440,900]]){
    await page.setViewportSize({width,height});await page.locator('dialog .gold-button').scrollIntoViewIfNeeded();
    const problems=await page.locator('dialog').evaluate(el=>{const result=[];if(el.scrollWidth>el.clientWidth+2)result.push('intro horizontal overflow');for(const h of el.querySelectorAll('h1,p,button'))if(h.scrollWidth>h.clientWidth+2)result.push(`${h.tagName} overflow`);return result;});
    report.push({scene:`guardian-${stage}`,width,height,problems});
    if(stage===0||width===1440)await page.screenshot({path:`artifacts/layout-audit/guardian-${stage}-${width}.png`,animations:'disabled'});
  }
}
await install(e);
for(const action of ['settings','combat-details','enemy-dossier','devices']){
  await page.locator(`[data-action="${action}"]`).first().click();
  for(const [width,height] of [[320,740],[390,844],[1024,600],[1440,900]]){
    await page.setViewportSize({width,height});
    const problems=await page.locator('dialog').evaluate(el=>{
      const issues=[];if(el.scrollWidth>el.clientWidth+2)issues.push('dialog horizontal overflow');
      for(const text of el.querySelectorAll('h1,h2,h3,p,.calculation-term,.setting-row,.device-row'))if(text.scrollWidth>text.clientWidth+2)issues.push(`${text.className||text.tagName}: text overflow`);
      return issues;
    });
    report.push({scene:action,width,height,problems});
    if(width===390||width===1440)await page.screenshot({path:`artifacts/layout-audit/${action}-${width}.png`,animations:'disabled'});
  }
  await page.keyboard.press('Escape');
}
await page.locator('[data-action="settings"]').click();await page.locator('[data-action="save-exit"]').click();
for(const scene of ['title','select']){
  if(scene==='select')await page.locator('[data-action="new"]').click();
  for(const [width,height] of [[320,740],[390,844],[1024,600],[1242,698],[1440,900]]){
    await page.setViewportSize({width,height});
    const problems=await page.locator('#screen').evaluate(el=>{
      const issues=[];
      for(const text of el.querySelectorAll('h1,p,.keeper-name>strong,.keeper-name>em,.keeper-kit')){
        // Cinzel's em box extends past a heading's line box; visible overflow
        // does not clip the glyphs. Hidden content and horizontal overflow do.
        if(text.scrollWidth>text.clientWidth+2||(getComputedStyle(text).overflowY!=='visible'&&text.scrollHeight>text.clientHeight+2))issues.push(`${text.className||text.tagName}: text overflow`);
      }
      const menu=el.querySelector('.title-copy')?.getBoundingClientRect();
      if(menu)for(const selector of ['.title-bottom','.now-playing']){
        const other=document.querySelector(selector);if(!other||!other.getClientRects().length)continue;
        const box=other.getBoundingClientRect();if(menu.left<box.right&&menu.right>box.left&&menu.top<box.bottom&&menu.bottom>box.top)issues.push(`${selector}: overlaps menu`);
      }
      return issues;
    });
    report.push({scene,width,height,problems});
    await page.screenshot({path:`artifacts/layout-audit/${scene}-${width}.png`,animations:'disabled'});
  }
}
for(const phase of ['map','reward','forge','relic']){
  const e=newExpedition('architect',933);e.run.relics=Object.keys(RELICS);e.run.phase=phase;
  e.run.cardRewards=['containerlab','clabernetes','null-field'];e.run.relicRewards=['parallel-core','shield-array','packet-lens'];
  await install(e);
  for(const [width,height] of [[320,740],[390,844],[1024,600],[1242,698],[1440,900]]){
    await page.setViewportSize({width,height});
    const problems=await page.evaluate(()=>{
      const problems=[];for(const el of document.querySelectorAll('#screen h1,#screen p,.relic-option>strong,.relic-option>span,.forge-options>button>strong,.forge-options>button>small,.forge-options>button>span:not(.forge-art),.card-copy,.keeper-name,.keeper-kit')){
        if(el.scrollWidth>el.clientWidth+2)problems.push(`${el.className||el.tagName}: horizontal overflow`);
        if(el.scrollHeight>el.clientHeight+2)problems.push(`${el.className||el.tagName}: vertical overflow`);
      }
      return problems;
    });
    report.push({scene:phase,width,height,problems});
    await page.screenshot({path:`artifacts/layout-audit/${phase}-${width}.png`,animations:'disabled'});
  }
}
await writeFile('artifacts/layout-audit/report.json',JSON.stringify({report,errors},null,2)+'\n');
const issues=report.filter(r=>r.problems.length);
console.log(JSON.stringify({issues,errors},null,2));
await browser.close();
process.exitCode=issues.length||errors.length?1:0;
