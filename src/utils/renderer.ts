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
      return preference === 'webgpu' && typeof navigator !== 'undefined' && !!(navigator as any).gpu;
    }
    // Default to WebGL for maximum compatibility in sandboxed development iframes
    return false;
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

      let isInitialized = false;
      let initErrorOccurred = false;

      // Strict 1500ms timeout race for WebGPU async initialization to prevent hanging in sandboxed frames
      const initTimeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("WebGPU initialization timed out (1.5s limit)")), 1500);
      });

      // Ensure safe asynchronous initialization of WebGPU backend and device
      Promise.race([renderer.init(), initTimeout]).then(() => {
        isInitialized = true;
        console.log("✅ WebGPURenderer async initialization completed successfully.");

        // Monitor GPUDevice loss to automatically heal the state of the applet
        const device = (renderer.backend as any)?.device;
        if (device && device.lost) {
          device.lost.then((info: any) => {
            console.warn(`⚠️ [WebGPU] Device lost: ${info?.message || 'Unknown reason'}. Reverting to WebGL...`);
            if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
              localStorage.setItem('rendering_backend', 'webgl');
              window.location.reload();
            }
          });
        }
      }).catch((err) => {
        initErrorOccurred = true;
        console.error("❌ WebGPURenderer async initialization failed:", err);
        // Fallback to WebGL instantly to preserve user experience
        if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
          localStorage.setItem('rendering_backend', 'webgl');
          window.location.reload();
        }
      });

      // Patch the asynchronous render method to prevent crashes during async backend initialization
      const originalRender = renderer.render.bind(renderer);
      renderer.render = async function (scene: any, camera: any): Promise<void> {
        if (initErrorOccurred) {
          return;
        }
        if (!isInitialized) {
          // Bypassing render commands until the WebGPU context is fully established
          return;
        }
        try {
          await originalRender(scene, camera);
        } catch (err: any) {
          const errStr = String(err?.stack || err?.message || err || '');
          console.error("❌ [WebGPURenderer] Runtime render crash:", err);
          
          // Auto-recover to WebGL if a fatal GPU resource or device loss occurred
          if (errStr.includes('lost') || errStr.includes('destroy') || errStr.includes('GPUDevice') || errStr.includes('NodeMaterial') || errStr.includes('NodeBuilder') || errStr.includes('ShaderMaterial')) {
            if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
              localStorage.setItem('rendering_backend', 'webgl');
              window.location.reload();
            }
          }
        }
      };

      return renderer;
    } catch (err) {
      console.warn("⚠️ WebGPURenderer instant instantiation failed, falling back to WebGLRenderer:", err);
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
  if (!isWebGPURendererActive()) return;

  scene.traverse((child: any) => {
    if (child.material) {
      const convertMaterial = (mat: any) => {
        if (!mat) return mat;

        // Check if the material or the child mesh is a custom shader-based outline mesh.
        // Direct MToon outline passes and meshes typically contain 'outline' or 'vrmoutline' in their names.
        const isOutline = 
          (mat.name && (mat.name.toLowerCase().includes('outline') || mat.name.toLowerCase().includes('vrmoutline'))) ||
          (child.name && (child.name.toLowerCase().includes('outline') || child.name.toLowerCase().includes('vrmoutline')));

        if (isOutline) {
          // Transcode incompatible outline ShaderMaterials into perfectly invisible standard materials
          // to completely avoid NodeBuilder compilation issues and prevent solid black clipping models.
          const invisibleMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(0, 0, 0),
            transparent: true,
            opacity: 0,
            depthWrite: false,
            depthTest: false,
            visible: false
          });

          if (typeof mat.dispose === 'function') {
            mat.dispose();
          }

          return invisibleMat;
        }

        // Check if it is a standard built-in Three.js material that WebGPU supports out-of-the-box
        const isStandard = 
          (mat.isMeshStandardMaterial || 
          mat.isMeshBasicMaterial || 
          mat.isMeshPhongMaterial || 
          mat.isMeshPhysicalMaterial || 
          mat.isMeshLambertMaterial || 
          mat.isPointsMaterial || 
          mat.isLineBasicMaterial || 
          mat.isSpriteMaterial ||
          mat.isNodeMaterial) &&
          !mat.isMToonNodeMaterial &&
          mat.type !== 'MToonNodeMaterial' &&
          mat.constructor?.name !== 'MToonNodeMaterial';

        // Custom shader materials like VRMMToonMaterial and custom MToonNodeMaterial are incompatible with WebGPURenderer's standard TSL shaders or lighting.
        // We transcode them to fully compatible WebGPU-native materials.
        const needsConversion = !isStandard || mat.isVRMMToonMaterial || mat.type === 'VRMMToonMaterial' || mat.isShaderMaterial || mat.isMToonNodeMaterial || mat.type === 'MToonNodeMaterial' || mat.constructor?.name === 'MToonNodeMaterial';

        if (needsConversion) {
          // Extract texture and color from standard fields or custom shader uniforms
          const extractedColor = mat.color || 
            mat.uniforms?.color?.value || 
            mat.uniforms?.uColor?.value || 
            mat.uniforms?.litFactor?.value || 
            new THREE.Color(1, 1, 1);

          const extractedMap = mat.map || 
            mat.uniforms?.map?.value || 
            mat.uniforms?.uMap?.value || 
            null;

          const isFlat = mat.type === 'MeshBasicMaterial' || 
            mat.isMeshBasicMaterial || 
            (mat.name && mat.name.toLowerCase().includes('text')) || 
            child.isText || 
            (child.constructor && child.constructor.name && child.constructor.name.toLowerCase().includes('text')) ||
            (mat.uniforms && !mat.uniforms.roughness && !mat.uniforms.metalness);

          let standardMat;
          if (isFlat) {
            standardMat = new THREE.MeshBasicMaterial({
              color: extractedColor,
              map: extractedMap,
              transparent: mat.transparent || false,
              opacity: mat.opacity !== undefined ? mat.opacity : 1.0,
              side: mat.side !== undefined ? mat.side : THREE.DoubleSide,
              depthWrite: mat.depthWrite !== undefined ? mat.depthWrite : true,
              depthTest: mat.depthTest !== undefined ? mat.depthTest : true,
            });
          } else {
            standardMat = new THREE.MeshStandardMaterial({
              color: extractedColor,
              map: extractedMap,
              normalMap: mat.normalMap || mat.uniforms?.normalMap?.value || null,
              normalScale: mat.normalScale || mat.uniforms?.normalScale?.value || new THREE.Vector2(1, 1),
              roughness: mat.roughness !== undefined ? mat.roughness : (mat.uniforms?.roughness?.value !== undefined ? mat.uniforms.roughness.value : 0.6),
              metalness: mat.metalness !== undefined ? mat.metalness : (mat.uniforms?.metalness?.value !== undefined ? mat.uniforms.metalness.value : 0.1),
              emissive: mat.emissive || mat.uniforms?.emissive?.value || new THREE.Color(0, 0, 0),
              emissiveMap: mat.emissiveMap || mat.uniforms?.emissiveMap?.value || null,
              alphaMap: mat.alphaMap || mat.uniforms?.alphaMap?.value || null,
              transparent: mat.transparent || false,
              opacity: mat.opacity !== undefined ? mat.opacity : 1.0,
              side: mat.side !== undefined ? mat.side : THREE.DoubleSide,
              depthWrite: mat.depthWrite !== undefined ? mat.depthWrite : true,
              depthTest: mat.depthTest !== undefined ? mat.depthTest : true,
            });
          }

          if (mat.alphaTest !== undefined) {
            standardMat.alphaTest = mat.alphaTest;
          }

          // Dispose of the original incompatible material to prevent GPU memory leaks
          if (typeof mat.dispose === 'function') {
            mat.dispose();
          }

          return standardMat;
        }

        return mat;
      };

      if (Array.isArray(child.material)) {
        child.material = child.material.map(convertMaterial);
      } else {
        child.material = convertMaterial(child.material);
      }
    }
  });
}


