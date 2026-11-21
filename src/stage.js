// The shared 3D stage: renderer, sky, light and camera, sized to the window.
// How it all looks (light, haze, sky, the quality setting, the finishing pass) is look.js.
import * as THREE from 'three';
import { LOD } from './models.js';
import { look, onQuality, guessQuality, lightScene, prepare, mountPicture, Post, SUN_DIR, PALETTE } from './look.js';

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  // Film-style colour: bright sun without washed-out highlights.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = PALETTE.exposure;
  // A soft darkening at the screen's edges, over the map but under the HUD.
  const vignette = document.createElement('div');
  vignette.className = 'vignette';
  canvas.insertAdjacentElement('afterend', vignette);

  const camera = new THREE.PerspectiveCamera(45, 1, 1, 2000);
  LOD.camera = camera;
  let scene, sun;

  // Each map has its own scene with its own sky and sun; switching maps swaps the scene.
  function newScene({ fog } = {}) {
    const s = new THREE.Scene();
    lightScene(s, fog ? { fog } : undefined);
    return s;
  }
  function use(s) { scene = s; sun = s.userData.sun; }
  use(newScene());

  function resize() {
    renderer.setPixelRatio(Math.min(devicePixelRatio, look.q.scale));
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // The quality setting: sharpness, shadows, and whether frames get the finishing pass.
  let shadowSize = look.q.shadow;
  function applyQuality(q) {
    renderer.shadowMap.enabled = q.shadow > 0;
    renderer.shadowMap.type = q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    shadowSize = q.shadow;
    resize();
    renderer.shadowMap.needsUpdate = true;
  }
  guessQuality(renderer.getContext());
  applyQuality(look.q);
  onQuality((name, q) => applyQuality(q));
  mountPicture();

  // A whole-screen frame through the stage camera goes through the finishing pass (look.js);
  // anything else (a picture in a corner, a render into a buffer) is drawn as asked.
  const post = new Post(renderer);
  const draw = renderer.render.bind(renderer);
  renderer.render = (s, cam) => {
    prepare(s);
    if (look.q.post && cam === camera && !renderer.getRenderTarget() && !renderer.getScissorTest() && s.userData.look) post.render(draw, s, cam, look.q);
    else draw(s, cam);
  };

  // The shadow box follows the camera so shadows stay sharp at every zoom.
  function placeSun(c, heightAt, maxSize = 260) {
    if (sun.castShadow !== shadowSize > 0 || (shadowSize && sun.shadow.mapSize.x !== shadowSize)) {
      sun.castShadow = shadowSize > 0;
      sun.shadow.mapSize.set(shadowSize || 512, shadowSize || 512);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    const size = Math.min(maxSize, Math.max(50, c.dist * 0.9));
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -size; cam.right = cam.top = size;
    cam.near = 1; cam.far = 600;
    cam.updateProjectionMatrix();
    const y = heightAt(c.x, c.z);
    sun.target.position.set(c.x, y, c.z);
    // Low and from the side, for long shadows.
    sun.position.set(c.x + SUN_DIR.x * 236, y + SUN_DIR.y * 236, c.z + SUN_DIR.z * 236);
  }

  // Free a scene's GPU memory once its map is gone for good.
  function dispose(s) {
    s.traverse(o => {
      o.geometry?.dispose();
      for (const m of [o.material].flat()) { if (!m) continue; m.map?.dispose(); m.userData?.mask?.dispose(); m.dispose(); }
    });
  }

  const stage = { renderer, scene, camera, placeSun, newScene, use, dispose, current: () => scene, post };
  // For measuring from the console: look.bench() (look.js).
  window.stage = stage;
  return stage;
}
