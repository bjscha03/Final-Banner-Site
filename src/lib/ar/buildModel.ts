import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

export const in2m = (n: number) => n * 0.0254;



export async function buildBannerGLBUSDZ(params: {
  widthIn: number;
  heightIn: number;
  textureCanvas: HTMLCanvasElement; // already composited with artwork (and grommets if desired)
}) {
  const { widthIn, heightIn, textureCanvas } = params;
  const widthM = in2m(widthIn);
  const heightM = in2m(heightIn);

  const scene = new THREE.Scene();
  const tex = new THREE.CanvasTexture(textureCanvas);
  tex.flipY = true; // Fix upside-down texture

  const geom = new THREE.PlaneGeometry(widthM, heightM);
  const mat = new THREE.MeshPhysicalMaterial({ 
    map: tex, 
    roughness: 0.85, 
    metalness: 0.0,
    transparent: false,
    side: THREE.DoubleSide
  });
  const plane = new THREE.Mesh(geom, mat);
  scene.add(plane);
  
  // Add lighting for better visibility
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.1));
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(1, 1, 1);
  scene.add(directionalLight);

  try {
    // GLB for Android/WebXR
    const glbBlob = await new Promise<Blob>((resolve, reject) => {
      const exporter = new GLTFExporter();
      exporter.parse(
        scene,
        (result) => {
          try {
            if (result instanceof ArrayBuffer) {
              const blob = new Blob([result], { type: 'model/gltf-binary' });
              resolve(blob);
            } else {
              reject(new Error('Expected ArrayBuffer from GLTFExporter'));
            }
          } catch (err) {
            reject(err);
          }
        },
        (error) => reject(error),
        { binary: true }
      );
    });
    const glbUrl = URL.createObjectURL(glbBlob);

    // For now, use GLB for both platforms (more reliable)
    // iOS Quick Look also supports GLB files
    const usdzUrl = glbUrl;

    return { glbUrl, usdzUrl };
  } catch (error) {
    console.error('Error building AR models:', error);
    throw error;
  }
}
