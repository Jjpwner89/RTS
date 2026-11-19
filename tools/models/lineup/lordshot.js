// Lords and trial armour beside today's soldiers, rendered offscreen and saved to the shot server.
const R = window.__roster, { THREE } = R;
const shot = async (scene, cam, name) => {
  const canvas = document.createElement('canvas'); canvas.width = 1400; canvas.height = 900;
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  r.outputColorSpace = THREE.SRGBColorSpace; r.render(scene, cam);
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  await fetch('http://127.0.0.1:8855/' + name, { method: 'PUT', body: blob }); r.dispose();
};
const TEAMS = [[0.25, 0.4, 0.9], [0.85, 0.64, 0.25], [0.48, 0.31, 0.63]];
export async function run({ light = false } = {}) {
  const B = await import('/bake.js?' + Date.now());
  const { scene: baked, report } = await B.bakeAll(/^unit\.(lord|lady|captain|knight|spear|sword|militia)$/);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#8fa36b');
  scene.add(new THREE.HemisphereLight('#fff', '#5a5040', 1.5));
  const sun = new THREE.DirectionalLight('#fff', 2.2); sun.position.set(4, 8, 6); scene.add(sun);
  const vc = new THREE.MeshLambertMaterial({ vertexColors: true });
  const row = [['militia', 0], ['spear', 0], ['sword', 0], ['knight', 0], ['captain', 0], ['lord', 0], ['lady', 1], ['lord', 2]];
  row.forEach(([k, t], i) => {
    for (const part of ['gear', 'cloth']) {
      const src = baked.getObjectByName(`unit.${k}.${part}${light ? '.light' : ''}`); if (!src) continue;
      const geo = src.geometry.clone(); geo.computeVertexNormals();
      const c = geo.attributes.color;
      if (part === 'cloth') { const T = TEAMS[t]; for (let j = 0; j < c.count; j++) { const v = c.getX(j); c.setXYZ(j, v * T[0], v * T[1], v * T[2]); } }
      const m = new THREE.Mesh(geo, vc); m.position.set(i * 3.4 - 12, 0, 0); m.rotation.y = 0.5; scene.add(m);
    }
  });
  let i = 0;
  for (const make of Object.values(B.TRIAL)) {
    const f = await make(); const g = f.group || f; g.position.set(i++ * 1.8 - 12, 0, 5); g.rotation.y = 0.3; scene.add(g);
  }
  const near = new THREE.PerspectiveCamera(30, 1400 / 900, 0.1, 300); near.position.set(-0.5, 11, 33); near.lookAt(0, 1.4, 1);
  await shot(scene, near, `lords-near${light ? '-light' : ''}.png`);
  const far = new THREE.PerspectiveCamera(30, 1400 / 900, 0.1, 400); far.position.set(0, 40, 55); far.lookAt(0, 0, 1);
  await shot(scene, far, `lords-far${light ? '-light' : ''}.png`);
  const close = new THREE.PerspectiveCamera(30, 1400 / 900, 0.1, 100); close.position.set(7.5, 3.2, 7.5); close.lookAt(7.5, 1.7, 0);
  const trial = new THREE.PerspectiveCamera(30, 1400 / 900, 0.1, 100); trial.position.set(-9.5, 2.6, 11.5); trial.lookAt(-9.5, 1.1, 3);
  await shot(scene, trial, 'lords-trial.png');
  await shot(scene, close, 'lords-close.png');
  const back = new THREE.PerspectiveCamera(30, 1400 / 900, 0.1, 100); back.position.set(6, 3.6, -7); back.lookAt(6, 1.6, 0);
  await shot(scene, back, 'lords-back.png');
  return report;
}
