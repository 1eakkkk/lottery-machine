import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Curved surface patch in the ball's local frame, with an outward +Z normal. */
export function ballLabelGeometry(radius: number) {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  const rings = 6, segments = 24, angle = .50, extent = Math.sin(angle);
  for (let ring = 0; ring <= rings; ring++) for (let i = 0; i <= segments; i++) {
    const theta = angle * ring / rings, phi = i / segments * Math.PI * 2;
    const x = Math.sin(theta) * Math.cos(phi), y = Math.sin(theta) * Math.sin(phi);
    positions.push(x * radius, y * radius, Math.cos(theta) * radius);
    uv.push(.5 + x / (2 * extent), .5 + y / (2 * extent));
  }
  for (let ring = 0; ring < rings; ring++) for (let i = 0; i < segments; i++) {
    const a = ring * (segments + 1) + i, b = a + segments + 1;
    indices.push(a, b, b + 1, a, b + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export function numberedBallSurface(radius: number) {
  const cap = ballLabelGeometry(radius);
  const normals: [number,number,number][] = [];
  for (const a of [-1,1]) for (const b of [-1,1]) normals.push([a,b,0],[a,0,b],[0,a,b]);
  const patches = normals.map(normal => {
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), new THREE.Vector3(...normal).normalize());
    return cap.clone().applyQuaternion(quaternion);
  });
  const geometry = mergeGeometries(patches)!;
  cap.dispose(); patches.forEach(patch => patch.dispose());
  return geometry;
}
