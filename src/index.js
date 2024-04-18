import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const defaultCameraAngle = 'front';

let image2D;
let canvas2D;
let canvas3D;
let width;
let height;
let ambientLight;
let directionaLight;
let rotation = {x: 0, y: 0, z: 0};
let horizontalSegments = 32;
let verticalSegments = 32;
let controls;

const scene = new THREE.Scene();
let camera;
let renderer;
let skin;

let cubeObject;

function handleWindowLoad() {
  canvas3D = document.getElementById('image-3d');
  const rect = canvas3D.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ canvas: canvas3D});
  renderer.setSize( width, height );

  directionaLight = new THREE.DirectionalLight(0xffffff, 1);
  directionaLight.position.set(1.5, 1.5, 1.5);
  directionaLight.lookAt(0, 0, 0);
  scene.add(directionaLight);

  ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  drawCube();

  canvas2D = document.getElementById('image-preview');
  document.getElementById('image-selector').addEventListener('change', handleImageSelectorChange);
  document.getElementById('texture-selector').addEventListener('change', handleTextureSelectorChange);

  document.getElementById('scaleX').addEventListener('input', applyScaleToObjects);
  document.getElementById('scaleY').addEventListener('input', applyScaleToObjects);
  document.getElementById('scaleZ').addEventListener('input', applyScaleToObjects);

  document.getElementById('no-rotation').addEventListener('click', () => {
    "xyz".split('').forEach(axis => {
      document.getElementById(`spin-${axis}`).checked = false;
      document.getElementById(`rotation-${axis}`).value = 0;
    });
  });
  const cameras = ['front', 'back', 'left', 'right', 'top', 'bottom', 'iso', 'perspective'];
  cameras.forEach(angle => {
    document.getElementById(`camera-${angle}`)
      .addEventListener('click', changeCameraAngle.bind(this, angle, width, height));
  });
  document.getElementById(`camera-${defaultCameraAngle}`).click();

  'xyz'.split('').forEach(axis => {
    const rotationInput = document.getElementById(`rotation-${axis}`);
    rotationInput.min = -Math.PI;
    rotationInput.max = Math.PI;
    rotationInput.value = 0;
  });

  document.getElementById('ambientIntensity').addEventListener('input', handleAmbientIntensityChange);
  document.getElementById('directionalIntensity').addEventListener('input', handleDirectionalIntensityChange);
  document.getElementById('show-control-vertices').addEventListener('change', handleShowControlVerticesChange);
  document.getElementById('show-control-mesh').addEventListener('change', handleShowControlMeshChange);
  document.getElementById('show-cube').addEventListener('change', handleShowCubeChange);
  requestAnimationFrame( animate );
  fetch('files.json').then(response => response.json()).then(files => {
    const imageSelector = document.getElementById('image-selector');
    files.sculptedPrims.forEach(file => {
      const option = document.createElement('option');
      option.value = `images/sculpted-prims/${file}`;
      option.innerText = file;
      if(file === 'UFO Sculpty 1.0.png') {
        option.selected = true;
      }
      imageSelector.appendChild(option);
    });
    handleImageSelectorChange();
    const textureSelector = document.getElementById('texture-selector');
    files.textures.forEach(file => {
      const option = document.createElement('option');
      option.value = `images/textures/${file}`;
      option.innerText = file;
      // if(file === 'mapping grid guide.png') {
      //   option.selected = true;
      // }
      textureSelector.appendChild(option);
    });
    handleTextureSelectorChange();
  });
}

function changeCameraAngle(angle, width, height) {
  const bounds = new THREE.Box3().setFromObject(cubeObject);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  // Create camera based on angle and size of mesh
  const camera = createCamera(angle, size, width, height);
  // Calculate camera position based on angle, field of view, mesh size & location
  const pos = getAnglePosition(angle, camera.fov, center, size);
  camera.position.set(pos.x, pos.y, pos.z);
  camera.lookAt(0, 0, 0);
  createCameraControls(camera, renderer.domElement);
}

function createCameraControls(camera, domElement) {
  if(controls) controls.dispose();
  // NOTE: Create controls after camera has been positioned and rotated
  controls = new OrbitControls( camera, domElement );
}

function createCamera(angle, size, canvasWidth, canvasHeight) {
  if(camera) scene.remove(camera);
  const canvasRatio = canvasWidth / canvasHeight;
  switch(angle) {
    case 'front':
    case 'back':
    case 'left':
    case 'right':
    case 'top':
    case 'bottom':
    case 'iso':
      const max = Math.max(size.x, size.y, size.z);
      const frustumWidth = max * canvasRatio;
      const frustumHeight = max;
      camera = new THREE.OrthographicCamera(
        frustumWidth / -2,
        frustumWidth / 2,
        frustumHeight / 2,
        frustumHeight / -2,
        1,
        1000
      );
      break;
    case 'perspective':
      camera = new THREE.PerspectiveCamera(75, canvasRatio, 0.1, 1000);
      break;
  }
  return camera;
}
function getAnglePosition(angle, fov, targetPos, targetSize) {

  let distance;
  if(angle === 'perspective') {
    distance = Math.max(targetSize.x, targetSize.y, targetSize.z) / (2 * Math.tan(fov * Math.PI / 360));
  } else {
    distance = Math.max(targetSize.x, targetSize.y, targetSize.z) * 2;
  }

  const offset = (x, y, z) => ({
    x: targetPos.x + (x * distance), 
    y: targetPos.y + (y * distance),
    z: targetPos.z + (z * distance)
  });


  switch(angle) {
    case 'front': return offset(0, 0, 1);
    case 'back': return offset(0, 0, -1);
    case 'left': return offset(-1, 0, 0);
    case 'right': return offset(1, 0, 0);
    case 'top': return offset(0, 1, 0);
    case 'bottom': return offset(0, -1, 0);
    case 'perspective': return ({x: 1.5, y: 1.5, z: 1.5});
    default: return offset(1,1,1);
  }
}
const alignmentMapPattern = /alignment-map-(\d+)$/;
function handleTextureSelectorChange() {
  const textureSelector = document.getElementById('texture-selector');
  const textureUrl = textureSelector.value;
  skin?.dispose();
  if(textureUrl === '') {
    removeTexture(controlMeshObject);
  } else if(alignmentMapPattern.test(textureUrl)) {
    const size = parseInt(textureUrl.match(alignmentMapPattern)[1]);
    loadAlignmentMap(size);
  } else {
    loadTexture(textureUrl);
  }
}
function loadAlignmentMap(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // horizontal gradient for hue
  const hueGradient = ctx.createLinearGradient(0, 0, size, 0);
  const stops = 7;
  for(let i = 0; i <= stops; i++) {
    const hue = 360 - Math.floor((360 / stops) * i);
    hueGradient.addColorStop(i/stops, `hsl(${hue}, 100%, 50%)`);
  }
  ctx.fillStyle = hueGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // vertical gradient for saturation
  const saturationGradient = ctx.createLinearGradient(0, 0, 0, size);
  saturationGradient.addColorStop(0, 'rgba(128, 128, 128, 1)');
  saturationGradient.addColorStop(1, 'rgba(128, 128, 128, 0)');
  ctx.fillStyle = saturationGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Center cross hairs
  ctx.strokeStyle = 'red';
  ctx.lineWidth = 10 * (size / 512);
  ctx.beginPath();
  ctx.moveTo(0, canvas.height / 2);
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();

  ctx.lineWidth = 1;
  ctx.strokeStyle = 'black';

  const cellSize = 32;
  const cellWidth = cellSize;
  const cellHeight = cellSize;
  let fontSize = cellSize / 2.5;
  if(size >= 512) {
    fontSize = cellSize / 3;
  }
  for(let x = 0; x < canvas.width; x+=cellWidth) {
    // vertical grid lines
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();

    // odd columns are shaded
    const col = Math.floor(x / cellWidth);
    if(col % 2 === 1) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(x, 0, cellWidth, canvas.height);
    }

  }
  const bgColors = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet', 'white', 'black'];
  const fgColors = ['black', 'black', 'black', 'yellow', 'yellow', 'white', 'black', 'black', 'white'];

  for(let y = 0; y < canvas.height; y+= cellHeight) {
    // horizontal grid lines
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
    for(let x = 0; x < canvas.width; x+=cellWidth) {
      const row = Math.floor(y / cellHeight);
      const col = Math.floor(x / cellWidth);
      const colorIndex = (row + col) % bgColors.length;

      // draw circle background
      ctx.beginPath();
      ctx.arc(x + cellWidth/2, y + cellHeight/2, cellWidth/2.5, 0, Math.PI * 2);
      ctx.fillStyle = bgColors[colorIndex];
      ctx.fill();

      // draw coordinates over circle
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const text = getCellText(x, y, cellSize);
      ctx.fillStyle = fgColors[colorIndex];
      ctx.fillText(text, x + cellWidth/2, y + cellHeight/2, x + cellWidth);
    }
  }


  const dataURL = canvas.toDataURL();
  const image = new Image();
  image.src = dataURL;
  image.onload = () => {
    drawTexturePreview(image);
    applyTextureToObject(image, controlMeshObject);
  }
}
function getCellText(x, y, size) {
  let row = Math.floor(y / size) + 1;
  let col = Math.floor(x / size) + 1;
  let letters = '';
  while(col > 0) {
    const remainder = col % 26;
    if(remainder === 0) {
      letters = 'Z' + letters;
      col = Math.floor(col / 26) - 1;
    } else {
      letters = String.fromCharCode(64 + remainder) + letters;
      col = Math.floor(col / 26);
    }
  }
  return letters + row.toString().padStart(2, '0');
}
function loadTexture(textureUrl) {
  const textureImage = new Image();
  textureImage.src = textureUrl;
  textureImage.onload = () => {
    drawTexturePreview(textureImage);
    applyTextureToObject(textureImage, controlMeshObject);
  }
}
function drawTexturePreview(image) {
  const texturePreview = document.getElementById('texture-preview');
  const ctx = texturePreview.getContext('2d');
  ctx.clearRect(0, 0, texturePreview.width, texturePreview.height);
  ctx.drawImage(image, 0, 0, texturePreview.width, texturePreview.height);
}
function applyTextureToObject(image, object) {
  skin = new THREE.Texture(image);
  skin.needsUpdate = true;
  if(object) {
    object.material.map = skin;
    object.material.needsUpdate = true;
  }
}
function removeTexture(object) {
  const texturePreview = document.getElementById('texture-preview');
  const ctx = texturePreview.getContext('2d');
  ctx.clearRect(0, 0, texturePreview.width, texturePreview.height);
  skin = null;
  if(object) {
    object.material.map = null;
    object.material.needsUpdate = true;
  }
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
  document.getElementById('image-size').innerText = `${image2D.width}x${image2D.height}`;
  ctx.drawImage(image2D, 0, 0);
  const controlVertices = readControlVertices(ctx);
  drawControlVertices(controlVertices);
  drawSphericalControlMesh(controlVertices);
}
function mapCv(value) {
  // 0 to 255 === -0.5 to 0.5
  return (value - 128) / 256;
}
function rgbLong(r, g, b) {
  return (r << 16) | (g << 8) | b;
}
function readControlVertices(ctx) {
  const width = canvas2D.width;
  const height = canvas2D.height;
  const pixelDataBytes = 4;
  // get pixels in row major order, top to bottom, left to right as (r, g, b, a)
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const controlVertices = [];
  horizontalSegments = Math.floor(width / 2);
  verticalSegments = Math.floor(height / 2);

  document.getElementById('horizontal-segments').innerText = horizontalSegments.toLocaleString() + " + 1";
  document.getElementById('vertical-segments').innerText = verticalSegments.toLocaleString() + " + 1";


  for(let i = 0; i < pixels.length; i += pixelDataBytes) {
    const columnIndex = (i / pixelDataBytes) % width;
    const rowIndex = Math.floor((i / pixelDataBytes) / width);
    // skip odd pixels
    if(columnIndex % 2 === 1 && columnIndex !== width-1) continue;
    if(rowIndex % 2 === 1) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const color = rgbLong(r, g, b);
    controlVertices.push({
      color,
      x: mapCv(g),
      y: mapCv(b),
      z: mapCv(r)
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
function sphericalIndex(x, y, horizontalSegments, verticalSegments) {
  if(y >= verticalSegments || y <= 0) {
    // poles of top and bottom are centered
    x = Math.floor(horizontalSegments / 2);
  }
  // keep y within bounds
  if(y < 0) {
    y = 0;
  } else if(y >= verticalSegments) {
    y = verticalSegments - 1;
  }
  if(x < 0) {
    // stitch left to right
    x = horizontalSegments - 1;
  } else if(x >= horizontalSegments) {
    // stitch right to left
    x = 0;
  }
  return y * (horizontalSegments + 1) + x;
}

function drawSphericalControlMesh(controlVertices) {
  cleanupControlMesh();
  const controlMeshGeometry = createSphericalControlGeometry(controlVertices, horizontalSegments, verticalSegments);
  const controlMeshMaterial = new THREE.MeshStandardMaterial( { color: 'white' } );
  if(skin) {
    controlMeshMaterial.map = skin;
  }
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
  controlMeshGeometry.computeVertexNormals();
  const uvs = createUvMappingForSphere(controlMeshGeometry.attributes.position.count, horizontalSegments, verticalSegments);
  controlMeshGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  document.getElementById('control-mesh-vertices').innerText = controlVertices.length.toLocaleString();
  document.getElementById('control-mesh-faces').innerText = (indexedTriangles.length / 3).toLocaleString();
  document.getElementById('control-mesh-positions').innerText = controlMeshGeometry.attributes.position.count.toLocaleString();
  return controlMeshGeometry;
}
function createUvMappingForSphere(positionCount, horizontalSegments, verticalSegments) {
  const uvs = new Float32Array(positionCount * 2);
  const verticesPerRow = horizontalSegments + 1;
  for(let i = 0; i < positionCount; i++) {
    const offset = i * 2;
    const u = horizontalSegments - (i % verticesPerRow);
    const v = Math.floor(i / verticesPerRow);
    uvs[offset] = u / horizontalSegments;
    uvs[offset + 1] = v / verticalSegments;
  }
  return uvs;
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
      const centerIndex = sphericalIndex(x, y, horizontalSegments, verticalSegments);
      const bottomRightIndex = sphericalIndex(x + 1, y + 1, horizontalSegments, verticalSegments);
      const bottomIndex = sphericalIndex(x, y + 1, horizontalSegments, verticalSegments);
      const rightIndex = sphericalIndex(x + 1, y, horizontalSegments, verticalSegments);
        // Add triangles in counter-clockwise order
        indexedTriangles.push(bottomRightIndex, rightIndex, centerIndex);
        indexedTriangles.push(centerIndex, bottomIndex, bottomRightIndex);
    }
  }
  return indexedTriangles;
}
function faceColor(face) {
  switch(face.toLowerCase()) {
    case 'top':
    case 'bottom':
      return 'red';
    case 'front':
    case 'back':
      return 'green';
    case 'left':
    case 'right':
      return 'blue';
    default:
      return 'white';
  }
}
function textMaterial(text) {

  const color = faceColor(text);

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // draw gradient
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.sqrt(centerX * centerX + centerY * centerY);
  const gradient = ctx.createRadialGradient(
    centerX,
    centerY, 
    0,
    centerX,
    centerY,
    radius
  );
  gradient.addColorStop(0, 'white');
  gradient.addColorStop(1, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // draw outline
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, canvas.width, canvas.height);

  // draw text
  ctx.fillStyle = 'black';
  const fontSize = 32;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const url = canvas.toDataURL();
  return new THREE.MeshStandardMaterial({ map: new THREE.TextureLoader().load(url) })
}
function drawCube() {
  if(cubeObject) {
    cubeObject.geometry.dispose();
    cubeObject.material.dispose();
    scene.remove(cubeObject);
  }
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial( { color: 'white' } );
  cubeObject = new THREE.Mesh(geometry, material);
  setPositionCentered(cubeObject);

  // Add materials in the order of the cubes faces
  // (this is the standard order for a cuboid in most 3d modeling programs)
  const materials = ['Right', 'Left', 'Top', 'Bottom', 'Front', 'Back'].map(textMaterial);
  cubeObject.material = materials;

  scene.add(cubeObject);
  applyScale(cubeObject);
  cubeObject.visible = document.getElementById('show-cube').checked;
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
function applyScaleToObjects() {
  [
    cubeObject,
    controlVerticesObject,
    controlMeshObject
  ].filter(Boolean).forEach(applyScale);
}
function handleShowControlVerticesChange() {
  controlVerticesObject.visible = document.getElementById('show-control-vertices').checked;
}
function handleShowControlMeshChange() {
  controlMeshObject.visible = document.getElementById('show-control-mesh').checked;
}
function handleShowCubeChange() {
  cubeObject.visible = document.getElementById('show-cube').checked;
}

const rotateWrap = (value, offset) => {
  value += offset;
  if(value < -Math.PI) {
    value = value + Math.PI * 2;
  } else if(value >= Math.PI) {
    value = value - Math.PI * 2;
  }
  return value;
}
const rotate = () => {
  "xyz".split('').forEach(axis => {
    rotation[axis] = parseFloat(document.getElementById(`rotation-${axis}`).value);
    if(document.getElementById(`spin-${axis}`).checked) {
      rotation[axis] = rotateWrap(rotation[axis], 0.02);
      document.getElementById(`rotation-${axis}`).value = rotation[axis];
    }
  });

  [
    cubeObject,
    controlVerticesObject,
    controlMeshObject
  ].filter(Boolean)
  .forEach(mesh => {
    mesh.rotation.set(rotation.x, rotation.y, rotation.z);
  });
};
function handleAmbientIntensityChange() {
  ambientLight.intensity = document.getElementById('ambientIntensity').value;
}
function handleDirectionalIntensityChange() {
  directionaLight.intensity = document.getElementById('directionalIntensity').value;
}
function animate() {
	requestAnimationFrame( animate );
  if(controls) controls.update();
  rotate();
  renderer.render( scene, camera );
}

window.addEventListener('load', handleWindowLoad);


