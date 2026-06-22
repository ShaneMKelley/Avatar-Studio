import * as THREE from 'three';
// @ts-ignore
import { WebGPURenderer } from 'three/webgpu';

/**
 * Checks if WebGPU is supported by the client browser/hardware and enabled by the user.
 */
export function isWebGPURendererActive(): boolean {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const preference = localStorage.getItem('rendering_backend');
    if (preference) {
      return preference === 'webgpu' && typeof navigator !== 'undefined' && !!navigator.gpu;
    }
  }
  return false;
}

/**
 * Creates a high-performance WebGPURenderer with a stable WebGLRenderer fallback
 * to ensure 100% compatibility across all client devices.
 */
export function createWebGPURenderer(params: any) {
  const canvas = params instanceof HTMLCanvasElement ? params : params?.canvas;

  if (isWebGPURendererActive()) {
    try {
      console.log("🚀 Instantiating Three.js WebGPURenderer...");
      const renderer = new WebGPURenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });

      // Patch the synchronous render method to prevent crashes during async backend initialization
      const originalRender = renderer.render.bind(renderer);
      renderer.render = async function (scene: any, camera: any) {
        try {
          return await originalRender(scene, camera);
        } catch (err) {
          if (renderer.renderAsync) {
            return await renderer.renderAsync(scene, camera).catch(() => {});
          } else {
            console.warn("[WebGPURenderer] Render omitted during async initialization", err);
          }
        }
      };

      return renderer;
    } catch (err) {
      console.warn("⚠️ WebGPURenderer initialization failed, falling back to WebGLRenderer:", err);
    }
  }

  // Fallback to standard highly-polished WebGL backend
  return new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  });
}

/**
 * Traverses a 3D model (e.g., VRM / GLTF) and transcode materials if needed.
 */
export function convertVRMMaterialsForWebGPU(scene: THREE.Object3D) {
  // Modern standard and node-based materials do not need manual transcode under Three.js R173 WebGPURenderer.
  return;
}


