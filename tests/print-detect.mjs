import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {PNG} from '/opt/codex/cua_node/lib/node_modules/pngjs/lib/png.js';
import {calibrate} from '../dist/vision.js';
for(const paper of ['a4','letter'])for(const type of ['','browser-','app-']){
 const name=type===''?`print-${paper}`:type==='browser-'?`print-browser-${paper}-phone`:`print-app-${paper}-phone`;
 const png=PNG.sync.read(readFileSync(`tests/${name}.png`)),c=calibrate(png,paper);assert.equal(c.markers.length,4);assert.ok(c.rms<.2,`${name}: ${c.rms}`);console.log(`${name}: all four codes decode; calibration residual ${c.rms.toFixed(3)} mm`);
}
