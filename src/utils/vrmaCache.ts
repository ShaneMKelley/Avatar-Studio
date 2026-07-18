import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMAnimationLoaderPlugin } from "@pixiv/three-vrm-animation";
import { getProxyUrl } from "./proxy";

// Single shared GLTFLoader instance with the VRMAnimationLoaderPlugin registered
let sharedVrmaLoader: GLTFLoader | null = null;

function getSharedVrmaLoader(): GLTFLoader {
  if (!sharedVrmaLoader) {
    sharedVrmaLoader = new GLTFLoader();
    sharedVrmaLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));
  }
  return sharedVrmaLoader;
}

// Global cache for VRMA GLTF objects to avoid repeating fetches/parses across all components
const vrmaCache: Record<string, Promise<any>> = {};

/**
 * Loads a VRMA (VRM Animation) file with dynamic memory caching.
 * Bypasses network requests and glTF parsing for previously loaded animation files.
 */
export function loadVrmaWithCache(url: string): Promise<any> {
  const proxyUrl = getProxyUrl(url);
  if (!vrmaCache[proxyUrl]) {
    const loader = getSharedVrmaLoader();
    vrmaCache[proxyUrl] = new Promise((resolve, reject) => {
      loader.load(proxyUrl, resolve, undefined, reject);
    });
  }
  return vrmaCache[proxyUrl];
}
