// The shared 3D stage: renderer, sky, light and camera, sized to the window.
import * as THREE from 'three';
import { LOD } from './models.js';

let sky = null;    // one sky texture, shared by every scene

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Film-style colour: bright sun without washed-out highlights.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  // A soft darkening at the screen's edges, over the map but under the HUD.
  const vignette = document.createElement('div');
  vignette.className = 'vignette';
  canvas.insertAdjacentElement('afterend', vignette);

  const camera = new THREE.PerspectiveCamera(45, 1, 1, 2000);
  LOD.camera = camera;
  let scene, sun;

  // Each map has its own scene with its own sky and sun; switching maps swaps the scene.
  // A low, warm sun and a sky that fades from blue to a hazy horizon.
  function newScene({ fog = [260, 720] } = {}) {
    const s = new THREE.Scene();
    s.background = skyGradient();
    s.fog = new THREE.Fog(new THREE.Color('#c9d6dc'), ...fog);
    s.add(new THREE.HemisphereLight('#cfe0f0', '#6a5a3a', 1.35));
    const light = new THREE.DirectionalLight('#ffe4bd', 2.9);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.bias = -0.0008;
    s.add(light, light.target);
    s.userData.sun = light;
    return s;
  }
  function use(s) { scene = s; sun = s.userData.sun; }
  use(newScene());

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // The shadow box follows the camera so shadows stay sharp at every zoom.
  function placeSun(c, heightAt, maxSize = 260) {
    const size = Math.min(maxSize, Math.max(50, c.dist * 0.9));
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -size; cam.right = cam.top = size;
    cam.near = 1; cam.far = 600;
    cam.updateProjectionMatrix();
    sun.target.position.set(c.x, heightAt(c.x, c.z), c.z);
    // Low and from the side, for long shadows.
    sun.position.set(c.x + 200, heightAt(c.x, c.z) + 120, c.z + 30);
  }

  function skyGradient() {
    if (sky) return sky;
    const cv = document.createElement('canvas');
    cv.width = 2; cv.height = 256;
    const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#7fa3c4'); gr.addColorStop(0.55, '#bfd0da'); gr.addColorStop(1, '#e9dcc4');
    g.fillStyle = gr;
    g.fillRect(0, 0, 2, 256);
    sky = new THREE.CanvasTexture(cv);
    sky.colorSpace = THREE.SRGBColorSpace;
    return sky;
  }

  // Free a scene's GPU memory once its map is gone for good.
  function dispose(s) {
    s.traverse(o => {
      o.geometry?.dispose();
      for (const m of [o.material].flat()) { if (!m) continue; m.map?.dispose(); m.userData?.mask?.dispose(); m.dispose(); }
    });
  }

  return { renderer, scene, camera, placeSun, newScene, use, dispose, current: () => scene };
}
