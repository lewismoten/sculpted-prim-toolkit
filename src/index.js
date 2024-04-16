import * as THREE from 'three';

let image2D;
let imagePreview;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
const renderer = new THREE.WebGLRenderer();

function handleWindowLoad() {
  renderer.setSize( window.innerWidth, window.innerHeight );
  document.body.appendChild( renderer.domElement );
  camera.position.z = 5;
  animate();

  imagePreview = document.getElementById('image-preview');
  document.getElementById('image-selector').addEventListener('change', handleImageSelectorChange);
  handleImageSelectorChange();
}

function handleImageSelectorChange() {
  const imageSelector = document.getElementById('image-selector');
  const imageUrl = imageSelector.value;
  image2D = new Image();
  image2D.src = imageUrl;
  image2D.onload = handleImage2DLoad
}
function handleImage2DLoad() {
  const ctx = imagePreview.getContext('2d');
  imagePreview.width = image2D.width;
  imagePreview.height = image2D.height;
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
  const pixels = ctx.getImageData(0, 0, imagePreview.width, imagePreview.height).data;
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
function drawControlVertices(controlVertices) {
  scene.children.forEach(child => scene.remove(child));
  controlVertices.forEach(({ x, y, z, color }) => {
    const geometry = new THREE.SphereGeometry( 0.01, 32, 32 );
    const material = new THREE.MeshBasicMaterial( { color } );
    const sphere = new THREE.Mesh( geometry, material );
    sphere.position.set(x, y, z);
    scene.add( sphere );
  })
}

function animate() {
	requestAnimationFrame( animate );
	renderer.render( scene, camera );
}

window.addEventListener('load', handleWindowLoad);


