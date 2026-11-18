// The shared 3D stage: renderer, sky, light and camera, sized to the window.
import * as THREE from 'three';

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const camera = new THREE.PerspectiveCamera(45, 1, 1, 2000);
  let scene, sun;

  // Each map has its own scene with its own sky and sun; switching maps swaps the scene.
  function newScene({ fog = [300, 760] } = {}) {
    const s = new THREE.Scene();
    const sky = new THREE.Color('#b9cbd6');
    s.background = sky;
    s.fog = new THREE.Fog(sky, ...fog);
    s.add(new THREE.HemisphereLight('#dfe9f2', '#5a5236', 1.6));
    const light = new THREE.DirectionalLight('#fff1d6', 2.2);
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
    sun.position.set(c.x + 120, 220, c.z + 80);
  }

  // Free a scene's GPU memory once its map is gone for good.
  function dispose(s) {
    s.traverse(o => {
      o.geometry?.dispose();
      for (const m of [o.material].flat()) { if (!m) continue; m.map?.dispose(); m.dispose(); }
    });
  }

  return { renderer, scene, camera, placeSun, newScene, use, dispose, current: () => scene };
}
