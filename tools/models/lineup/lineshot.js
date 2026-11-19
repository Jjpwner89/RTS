// Bake a few units and line them up side-on for a picture, saved to the shot server.
const R = window.__roster, { THREE } = R;
export async function run(keys, name, { light = false, turn = Math.PI / 2, gap = 3, cam = [0, 2.2, 14], at = [0, 1.2, 0] } = {}) {
  const B = await import('/bake.js?' + Date.now());
  const { scene: baked, report } = await B.bakeAll(new RegExp(`^unit\\.(${keys.join('|')})$`));
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#8fa36b');
  scene.add(new THREE.HemisphereLight('#fff', '#5a5040', 1.5));
  const sun = new THREE.DirectionalLight('#fff', 2.2); sun.position.set(4, 8, 6); scene.add(sun);
  const vc = new THREE.MeshLambertMaterial({ vertexColors: true });
  keys.forEach((k, i) => {
    for (const part of ['gear', 'cloth']) {
      const src = baked.getObjectByName(`unit.${k}.${part}${light ? '.light' : ''}`); if (!src) continue;
      const geo = src.geometry.clone(); geo.computeVertexNormals();
      const c = geo.attributes.color;
      if (part === 'cloth') for (let j = 0; j < c.count; j++) { const v = c.getX(j); c.setXYZ(j, v * 0.25, v * 0.4, v * 0.9); }
      const m = new THREE.Mesh(geo, vc); m.position.set((i - (keys.length - 1) / 2) * gap, 0, 0); m.rotation.y = turn; scene.add(m);
    }
  });
  const canvas = document.createElement('canvas'); canvas.width = 1400; canvas.height = 700;
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  r.outputColorSpace = THREE.SRGBColorSpace;
  const c = new THREE.PerspectiveCamera(30, 2, 0.1, 300); c.position.set(...cam); c.lookAt(...at);
  r.render(scene, c);
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  await fetch('http://127.0.0.1:8855/' + name, { method: 'PUT', body: blob }); r.dispose();
  return report;
}
