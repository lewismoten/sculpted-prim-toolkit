import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

let image2D;
let canvas2D;
let canvas3D;
let width;
let height;
let ambientLight;

const scene = new THREE.Scene();
let camera;
let renderer;

function handleWindowLoad() {
  canvas3D = document.getElementById('image-3d');
  const rect = canvas3D.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ canvas: canvas3D});
  renderer.setSize( width, height );

  const light = new THREE.DirectionalLight(0xffffff, 10);
  light.position.set(1.5, 1.5, 1.5);
  light.lookAt(0, 0, 0);
  scene.add(light);

  ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const orbitControls = new OrbitControls( camera, renderer.domElement );

  camera.position.set(1.5, 1.5, 1.5);
  camera.lookAt(0, 0, 0);

  canvas2D = document.getElementById('image-preview');
  document.getElementById('image-selector').addEventListener('change', handleImageSelectorChange);

  document.getElementById('scaleX').addEventListener('input', handleScaleXChange);
  document.getElementById('scaleY').addEventListener('input', handleScaleYChange);
  document.getElementById('scaleZ').addEventListener('input', handleScaleZChange);

  document.getElementById('ambientIntensity').addEventListener('input', handleAmbientIntensityChange);
  document.getElementById('show-control-vertices').addEventListener('change', handleShowControlVerticesChange);
  document.getElementById('show-control-mesh').addEventListener('change', handleShowControlMeshChange);
  handleImageSelectorChange();
  requestAnimationFrame( animate );
}

function handleImageSelectorChange() {
  const imageSelector = document.getElementById('image-selector');
  const imageUrl = imageSelector.value;
  image2D = new Image();
  image2D.src = imageUrl;
  image2D.onload = handleImage2DLoad
}
function handleImage2DLoad() {
  const ctx = canvas2D.getContext('2d', {willReadFrequently: true});
  canvas2D.width = image2D.width;
  canvas2D.height = image2D.height;
  ctx.drawImage(image2D, 0, 0);
  const controlVertices = readControlVertices(ctx);
  drawControlVertices(controlVertices);
  drawSphericalControlMesh(controlVertices);
}
function mapCv(value) {
  return (value - 128) / 128;
}
function rgbLong(r, g, b) {
  return (r << 16) | (g << 8) | b;
}
function readControlVertices(ctx) {
  const pixels = ctx.getImageData(0, 0, canvas2D.width, canvas2D.height).data;
  const controlVertices = [];
  for(let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const color = rgbLong(r, g, b);
    controlVertices.push({
      color,
      x: mapCv(r),
      y: mapCv(g),
      z: mapCv(b)
    })
  }
  return controlVertices;
}
let controlVerticesObject;
let controlMeshObject;

function drawControlVertices(controlVertices) {
  if(controlVerticesObject) {
    controlVerticesObject.children.forEach(mesh => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    scene.remove(controlVerticesObject);
  }
  controlVerticesObject = new THREE.Object3D();
  controlVertices.forEach(({ x, y, z, color }) => {
    const geometry = new THREE.BoxGeometry( 0.01, 0.01, 0.01 );
    const material = new THREE.MeshBasicMaterial( { color } );
    const mesh = new THREE.Mesh( geometry, material );
    mesh.position.set(x, y, z);
    controlVerticesObject.add(mesh);
  });
  setPositionCentered(controlVerticesObject);
  scene.add( controlVerticesObject );

  applyScale(controlVerticesObject);
  controlVerticesObject.visible = document.getElementById('show-control-vertices').checked;
}
function sphericalIndex(x, y) {
  return y * (width + 1) + x;
}

function drawSphericalControlMesh(controlVertices) {
  cleanupControlMesh();
  const controlMeshGeometry = createSphericalControlGeometry(controlVertices, width, height);
  const controlMeshMaterial = new THREE.MeshPhongMaterial( { color: 'red' } );
  controlMeshObject = new THREE.Mesh(controlMeshGeometry, controlMeshMaterial);
  setPositionCentered(controlMeshObject);
  scene.add(controlMeshObject);
  applyScale(controlMeshObject);
  controlMeshObject.visible = document.getElementById('show-control-mesh').checked;
}

function cleanupControlMesh() {
  if(controlMeshObject) {
    scene.remove(controlMeshObject);
    controlMeshObject.geometry.dispose();
    controlMeshObject.material.dispose();
  }
}
function createSphericalControlGeometry(controlVertices, horizontalSegments, verticalSegments) {
  const controlMeshGeometry = new THREE.BufferGeometry();
  const vertices = createSphericalControlVertices(controlVertices, horizontalSegments, verticalSegments);
  controlMeshGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  const indexedTriangles = createSphericalControlTriangles(horizontalSegments, verticalSegments);
  controlMeshGeometry.setIndex(indexedTriangles);
  controlMeshGeometry.setDrawRange(0, indexedTriangles.length);
  return controlMeshGeometry;
}

function createSphericalControlVertices(controlVertices, horizontalSegments, verticalSegments) {
  const count = ((horizontalSegments + 1) * (verticalSegments + 1)) * 3;
  const vertices = new Float32Array(count);
  controlVertices.forEach(({ x, y, z }, i) => {
    const offset = i * 3;
    vertices[offset] = x;
    vertices[offset + 1] = y;
    vertices[offset + 2] = z;
  });
  return vertices;
}

function createSphericalControlTriangles(horizontalSegments, verticalSegments) {
  var indexedTriangles = [];
  for(let x = 0; x < horizontalSegments; x++) {
    for(let y = 0; y < verticalSegments; y++) {
      const centerIndex = sphericalIndex(x, y);
      const topIndex = sphericalIndex(x, y + 1);
      const leftIndex = sphericalIndex(x + 1, y);
      const topLeftIndex = sphericalIndex(x + 1, y + 1);
      if(topLeftIndex >= 0 && topIndex >= 0 && leftIndex >= 0) {
        // Add triangles in counter-clockwise order
        indexedTriangles.push(centerIndex, topIndex, leftIndex);
        indexedTriangles.push(topIndex, topLeftIndex, leftIndex);
      }
    }
  }
  return indexedTriangles;
}
function setPositionCentered(mesh) {
  mesh.position.set(0,0,0);
}

function applyScale(mesh) {
  mesh.scale.set(
    document.getElementById('scaleX').value,
    document.getElementById('scaleY').value,
    document.getElementById('scaleZ').value
  );
}
function handleScaleXChange() {
  const scaleX = document.getElementById('scaleX').value;
  controlVerticesObject.scale.x = scaleX;
}
function handleScaleYChange() {
  const scaleY = document.getElementById('scaleY').value;
  controlVerticesObject.scale.y = scaleY;
}
function handleScaleZChange() {
  const scaleZ = document.getElementById('scaleZ').value;
  controlVerticesObject.scale.z = scaleZ;
}
function handleShowControlVerticesChange() {
  controlVerticesObject.visible = document.getElementById('show-control-vertices').checked;
}
function handleShowControlMeshChange() {
  controlMeshObject.visible = document.getElementById('show-control-mesh').checked;
}
const rotate = (mesh) => {
  if(!mesh) return;
  // mesh.rotation.x += 0.01;
  // mesh.rotation.y += 0.01;
};
function handleAmbientIntensityChange() {
  ambientLight.intensity = document.getElementById('ambientIntensity').value;
}
function animate() {
	requestAnimationFrame( animate );
  rotate(controlVerticesObject);
  rotate(controlMeshObject);
  renderer.render( scene, camera );
}

window.addEventListener('load', handleWindowLoad);


