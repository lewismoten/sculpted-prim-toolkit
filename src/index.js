import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

let image2D;
let canvas2D;
let canvas3D;
let width;
let height;

const scene = new THREE.Scene();
let camera;
let renderer;
let orbitControls;

function handleWindowLoad() {
  canvas3D = document.getElementById('image-3d');
  const rect = canvas3D.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ canvas: canvas3D});
  renderer.setSize( width, height );

  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(1, 1, 1);
  scene.add(light);

  orbitControls = new OrbitControls( camera, renderer.domElement );
  camera.position.z = 5;

  canvas2D = document.getElementById('image-preview');
  document.getElementById('image-selector').addEventListener('change', handleImageSelectorChange);

  document.getElementById('scaleX').addEventListener('input', handleScaleXChange);
  document.getElementById('scaleY').addEventListener('input', handleScaleYChange);
  document.getElementById('scaleZ').addEventListener('input', handleScaleZChange);

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
  drawControlMesh(controlVertices);
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
  })
  scene.add( controlVerticesObject );

  applyScale(controlVerticesObject);
  controlVerticesObject.visible = document.getElementById('show-control-vertices').checked;

  camera.position.z = 5;
}
function xyIndex(x, y) {
  // stitch edges of x
  if(x < 0) x = width - 1;
  if(x >= width) x = 0;
  // do not stitch edges of y
  if(y < 0) y = 0;
  if(y >= height) y = height - 1;
  // use left corner for top/bottom edges
  if(y === 0) x = 0;
  if(y === height - 1) x = 0;
  return (y * width + x);
}
function drawControlMesh(controlVertices) {
  if(controlMeshObject) {
    controlMeshObject.geometry.dispose();
    controlMeshObject.material.dispose();
    scene.remove(controlMeshObject);
  }

  const controlMeshGeometry = new THREE.BufferGeometry();
  const vertices = controlVertices.reduce((all, { x, y, z }, i) => {
    const offset = i * 3;
    all[offset] = x;
    all[offset + 1] = y;
    all[offset + 2] = z;
    return all;
  }, new Float32Array(controlVertices.length * 3));
  controlMeshGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

  const controlMeshMaterial = new THREE.MeshBasicMaterial( { color: 0xcccccc, side: THREE.DoubleSide } );

  
  var indexedTriangles = [];
  for(let x = 1; x < width - 1; x++) {
    for(let y = 1; y < height - 1; y++) {
      const center = xyIndex(x, y);
      const topLeft = xyIndex(x-1, y-1);
      const topRight = xyIndex(x, y-1);
      const middleLeft = xyIndex(x-1, y);
      const middleRight = xyIndex(x+1, y);
      const bottomCenter = xyIndex(x, y+1);
      
      indexedTriangles.push(center, topLeft, middleLeft);
      indexedTriangles.push(center, middleLeft, bottomCenter);
      indexedTriangles.push(center, topRight, middleRight);
      indexedTriangles.push(center, middleRight, bottomCenter);
    }
  }
  controlMeshGeometry.setIndex(indexedTriangles);

  controlMeshObject = new THREE.Mesh(controlMeshGeometry, controlMeshMaterial);
  scene.add(controlMeshObject);

  applyScale(controlMeshObject);

  controlMeshObject.visible = document.getElementById('show-control-mesh').checked;
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
  mesh.rotation.x += 0.01;
  mesh.rotation.y += 0.01;
};

function animate() {
	requestAnimationFrame( animate );
  rotate(controlVerticesObject);
  rotate(controlMeshObject);
  renderer.render( scene, camera );
}

window.addEventListener('load', handleWindowLoad);


