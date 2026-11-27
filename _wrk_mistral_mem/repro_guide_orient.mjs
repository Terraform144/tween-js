// Harnais guide v2 : angleAt + resolve avec guideOrient
import { samplePath } from '/run/media/zulup/TOSHIBA EXT/_SRC/__Debrouillard/Animate_JS_PRJ/src/core/guide.js';
import { resolveLayersAtFrame } from '/run/media/zulup/TOSHIBA EXT/_SRC/__Debrouillard/Animate_JS_PRJ/src/playback/resolve.js';

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };
const near = (a, b, eps=0.01) => Math.abs(a - b) <= eps;

// ligne horizontale (0,0)->(100,0) : tangente = 0°
const line = samplePath([{x:0,y:0},{x:100,y:0}], false);
ok(line && near(line.angleAt(0), 0) && near(line.angleAt(0.5), 0) && near(line.angleAt(1), 0), 'ligne horizontale: angleAt = 0° partout');
// ligne verticale (0,0)->(0,100) : tangente = 90°
const vline = samplePath([{x:0,y:0},{x:0,y:100}], false);
ok(near(vline.angleAt(0.5), 90, 0.01), 'ligne verticale: angleAt(0.5) = 90°');
// diagonale (0,0)->(100,100) : 45°
const diag = samplePath([{x:0,y:0},{x:100,y:100}], false);
ok(near(diag.angleAt(0.5), 45, 0.01), 'diagonale: angleAt(0.5) = 45°');

// resolve avec guideOrient : calque guidé, guide = ligne horizontale, tween f0->f10
const mkEl = (id, x, y, rot=0) => ({ kind:'shape', id, name:'', shapeType:'rect', x, y, width:10, height:10, points:[], rotation:rot, scaleX:1, scaleY:1, opacity:1, fill:'#f00', stroke:'#000', strokeWidth:0, closed:false });
const guideLayer = { id:'g', name:'G', visible:true, guide:true, keyframes:[{ index:0, elements:[{ kind:'shape', id:'p', shapeType:'path', x:0, y:100, points:[{x:0,y:0},{x:300,y:0}], closed:false, fill:'#000', stroke:'#000', strokeWidth:1 }], tween:null, script:'' }] };
const guidedLayer = { id:'d', name:'D', visible:true, guided:true, guideOrient:true, keyframes:[
  { index:0, elements:[mkEl('a', 0, 100, 30)], tween:{ easing:'linear' }, script:'' },
  { index:10, elements:[mkEl('a', 0, 100, 30)], tween:null, script:'' }, // l'objet ne bouge pas en propre : il colle au guide
] };
const layers = [guidedLayer, guideLayer]; // guide au-dessus (index plus grand)
// frame 5 = milieu : t=0.5 -> point (150,100), tangente 0° -> rotation = 30 - 30 + 0 = 0
const els = resolveLayersAtFrame(layers, 5, { includeGuides: false });
const a = els.find(e => e.id === 'a');
ok(near(a.x, 150, 0.5) && near(a.y, 100, 0.5), `frame 5: position (${a.x},${a.y}) ~ (150,100)`);
ok(near(a.rotation, 0, 0.5), `guideOrient: rotation frame 5 = ${a.rotation} ~ 0° (base 30 - 30 + tangente 0)`);

// sans guideOrient : rotation inchangée (interpolée 30->30 = 30)
const guided2 = { ...guidedLayer, id:'d2', guideOrient:false };
const els2 = resolveLayersAtFrame([guided2, guideLayer], 5, { includeGuides: false });
const a2 = els2.find(e => e.id === 'a');
ok(near(a2.rotation, 30, 0.5), `sans guideOrient: rotation = ${a2.rotation} ~ 30° (inchangée)`);

// guide vertical : tangente 90° -> rotation = 30 - 30 + 90 = 90
const vGuide = { ...guideLayer, id:'gv', keyframes:[{ index:0, elements:[{ kind:'shape', id:'p2', shapeType:'path', x:50, y:0, points:[{x:0,y:0},{x:0,y:200}], closed:false, fill:'#000', stroke:'#000', strokeWidth:1 }], tween:null, script:'' }] };
const els3 = resolveLayersAtFrame([guidedLayer, vGuide], 5, { includeGuides: false });
const a3 = els3.find(e => e.id === 'a');
ok(near(a3.rotation, 90, 0.5), `guide vertical: rotation frame 5 = ${a3.rotation} ~ 90°`);

console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
