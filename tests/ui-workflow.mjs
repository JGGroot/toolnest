// Run against a local server with Playwright installed or TOOLNEST_PLAYWRIGHT set.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.TOOLNEST_PLAYWRIGHT ? pathToFileURL(process.env.TOOLNEST_PLAYWRIGHT).href : 'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TOOLNEST_CHANNEL?{channel:process.env.TOOLNEST_CHANNEL}:{})});
const url=process.env.TOOLNEST_URL||'http://localhost:3000/';
try{
 for(const width of [1440,820,390]){
  const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'?sample');
  await page.waitForFunction(()=>document.querySelectorAll('.tool-item').length===3);
  assert.equal(await page.locator('#fingerMode,#addFinger,#fingerDiameter').count(),0);
  assert.equal(await page.locator('#footerStatus').isVisible(),false);
  const workspace=await page.locator('.app-layout').boundingBox();
  assert.equal(workspace.x,0);
  assert.equal(workspace.width,width);
  assert.ok(Math.abs(workspace.y+workspace.height-(width<=1280?932:1000))<2);
  assert.equal(await page.locator('#advanced').getAttribute('open'),null);
  if(await page.locator('#settingsBtn').isVisible())await page.locator('#settingsBtn').click();
  await page.locator('[data-outline-preset=balanced]').click();
  await page.waitForFunction(()=>document.getElementById('previewStatus').dataset.state==='ready');
  await page.locator('summary').filter({hasText:'Fine-tune outline'}).click();
  assert.ok(await page.locator('#smoothingMode').isVisible());
  await page.locator('summary').filter({hasText:'Fine-tune outline'}).click();
  await page.locator('#addAllToFoam').click();
  await page.waitForFunction(()=>document.querySelectorAll('.foam-instance').length===3);
  // Menus expose labelled choices, dismiss after an action, and preserve focus.
  await page.locator('.tool-menu>summary').filter({hasText:'Draw'}).click();
  await page.locator('[data-sketch=rect]').click();
  assert.equal(await page.locator('.tool-menu[open]').count(),0);
  assert.equal(await page.locator('#sketchPaletteHead').getAttribute('aria-expanded'),'true');
  await page.locator('#sketchFinish').click();
  await page.locator('.tool-menu>summary').filter({hasText:'Modify'}).click();
  assert.equal(await page.locator('#foamMirror').count(),1);
  await page.locator('#foamMirror').click();
  assert.equal(await page.locator('.tool-menu[open]').count(),0);
  await page.locator('.tool-menu>summary').filter({hasText:'Align'}).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.tool-menu[open]').count(),0);
  if(width<768)await page.locator('[data-foam-panel=settings]').click();
  await page.locator('#foamUndo').click();
  await page.locator('summary').filter({hasText:'Position & size'}).click();
  assert.ok(await page.locator('#foamX').isVisible());
  await page.locator('summary').filter({hasText:'Position & size'}).click();
  // Export still works with the extra options collapsed.
  const download=page.waitForEvent('download');
  await page.locator('#foamExport').click();
  assert.match((await download).suggestedFilename(),/\.svg$/);
  await page.locator('#foamPhotoControls>summary').click();
  await page.locator('#foamPhotoEdit').click();
  assert.ok(await page.locator('#stockPhotoDialog').isVisible());
  await page.locator('#closeStockPhoto').click();
  if(width<768)await page.locator('[data-foam-panel=layout]').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log(`${width}px: presets, manual controls, transfer, menus, mirror/undo, export and photo dialog passed`);
  await context.close();
 }
}finally{await browser.close();}
