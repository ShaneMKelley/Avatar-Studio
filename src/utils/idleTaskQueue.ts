import * as THREE from 'three';

type IdleTask = () => void;

class IdleTaskQueue {
  private tasks: IdleTask[] = [];
  private isProcessing = false;

  /**
   * Enqueues a non-critical task to run when the browser/main-thread is idle.
   */
  enqueue(task: IdleTask) {
    this.tasks.push(task);
    this.scheduleProcessing();
  }

  private scheduleProcessing() {
    if (this.isProcessing || this.tasks.length === 0) return;
    this.isProcessing = true;

    // Use native requestIdleCallback if available, with an optimized requestAnimationFrame fallback
    const requestIdle =
      (typeof window !== 'undefined' && (window as any).requestIdleCallback) ||
      ((cb: any) => {
        const start = Date.now();
        return setTimeout(() => {
          cb({
            didTimeout: false,
            timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
          });
        }, 1);
      });

    requestIdle((deadline: any) => {
      // Process tasks until deadline is near or all tasks are completed
      while (
        (deadline.timeRemaining() > 1 || deadline.didTimeout) &&
        this.tasks.length > 0
      ) {
        const task = this.tasks.shift();
        if (task) {
          try {
            task();
          } catch (e) {
            console.error('❌ Error executing deferred idle task:', e);
          }
        }
      }

      this.isProcessing = false;
      if (this.tasks.length > 0) {
        this.scheduleProcessing();
      }
    });
  }

  /**
   * Safe, non-blocking deferred disposal of Three.js Object3D nodes.
   * Traverses meshes, disposes their geometries, materials, and textures incrementally.
   */
  disposeDeferred(object: THREE.Object3D) {
    this.enqueue(() => {
      this.disposeObjectInner(object);
    });
  }

  private disposeObjectInner(object: THREE.Object3D) {
    object.traverse((child: any) => {
      // 1. Dispose of Geometry
      if (child.geometry) {
        const geom = child.geometry;
        this.enqueue(() => {
          try {
            geom.dispose();
          } catch (err) {
            // Safe swallow if already disposed
          }
        });
      }

      // 2. Dispose of Materials & Textures
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => {
          this.enqueue(() => {
            try {
              // Dispose texture maps on the material to clean up GPU VRAM
              const textureKeys = [
                'map', 'lightMap', 'bumpMap', 'normalMap', 'specularMap',
                'displacementMap', 'alphaMap', 'roughnessMap', 'metalnessMap', 'emissiveMap'
              ];
              textureKeys.forEach((key) => {
                if (mat[key] && typeof mat[key].dispose === 'function') {
                  mat[key].dispose();
                }
              });

              if (typeof mat.dispose === 'function') {
                mat.dispose();
              }
            } catch (err) {
              // Safe swallow if already disposed
            }
          });
        });
      }
    });
  }
}

export const idleTaskQueue = new IdleTaskQueue();
