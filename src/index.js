import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

let image2D;
let canvas2D;
let canvas3D;

const scene = new THREE.Scene();
let camera;
let renderer;
let orbitControls;

function handleWindowLoad() {
  canvas3D = document.getElementById('image-3d');
  const { width, height } = canvas3D.getBoundingClientRect();
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ canvas: canvas3D});
  renderer.setSize( width, height );

  orbitControls = new OrbitControls( camera, renderer.domElement );
  camera.position.z = 5;

  canvas2D = document.getElementById('image-preview');
  document.getElementById('image-selector').addEventListener('change', handleImageSelectorChange);

  document.getElementById('scaleX').addEventListener('input', handleScaleXChange);
  document.getElementById('scaleY').addEventListener('input', handleScaleYChange);
  document.getElementById('scaleZ').addEventListener('input', handleScaleZChange);

  document.getElementById('show-control-vertices').addEventListener('change', handleShowControlVerticesChange);
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

  controlVerticesObject.scale.set(
    document.getElementById('scaleX').value,
    document.getElementById('scaleY').value,
    document.getElementById('scaleZ').value
    );
  controlVerticesObject.visible = document.getElementById('show-control-vertices').checked;

  camera.position.z = 5;
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
function animate() {
	requestAnimationFrame( animate );
  if(controlVerticesObject) {
    controlVerticesObject.rotation.x += 0.01;
    controlVerticesObject.rotation.y += 0.01;
  }
	renderer.render( scene, camera );
}

window.addEventListener('load', handleWindowLoad);


