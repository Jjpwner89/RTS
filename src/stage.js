// The shared 3D stage: renderer, sky, light and camera, sized to the window.
import * as THREE from 'three';

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const sky = new THREE.Color('#b9cbd6');
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 300, 760);
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 2000);

  scene.add(new THREE.HemisphereLight('#dfe9f2', '#5a5236', 1.6));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // The shadow box follows the camera so shadows stay sharp at every zoom.
  function placeSun(c, heightAt) {
    const size = Math.min(260, Math.max(50, c.dist * 0.9));
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -size; cam.right = cam.top = size;
    cam.near = 1; cam.far = 600;
    cam.updateProjectionMatrix();
    sun.target.position.set(c.x, heightAt(c.x, c.z), c.z);
    sun.position.set(c.x + 120, 220, c.z + 80);
  }

  return { renderer, scene, camera, placeSun };
}
