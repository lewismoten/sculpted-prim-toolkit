import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { NURBSSurface } from 'three/examples/jsm/curves/NURBSSurface.js';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';

const defaultCameraAngle = 'front';
const defaultModel = 'UFO Sculpty 1.0.png';
const defaultSkin = 'Funky UFO 1.0.png';
let currentCameraAngle = defaultCameraAngle;

let image2D;
let canvas2D;
let canvas3D;
let width;
let height;
let ambientLight;
let directionalLight;
let rotation = {x: 0, y: 0, z: 0};
let horizontalSegments = 32;
let verticalSegments = 32;
let controls;

const scene = new THREE.Scene();
let camera;
let renderer;
let skin;

let nurbsControlVertices;
let cubeObject;
let controlVerticesObject;
let controlMeshObject;
let nurbsMeshObject;

function handleWindowLoad() {
  canvas3D = document.getElementById('image-3d');
  const rect = canvas3D.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ canvas: canvas3D});
  renderer.setSize( width, height );

  directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(1.5, 1.5, 1.5);
  directionalLight.lookAt(0, 0, 0);
  scene.add(directionalLight);

  ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  drawCube();

  canvas2D = document.getElementById('image-preview');
  document.getElementById('image-selector').addEventListener('change', handleImageSelectorChange);
  document.getElementById('texture-selector').addEventListener('change', handleTextureSelectorChange);
  document.getElementById('reveal-vertices').addEventListener('change', handleImageSelectorChange);
  document.getElementById('texture-rotation').addEventListener('input', rotateTexture);
  document.getElementById('texture-horizontal-offset').addEventListener('input', offsetTextureHorizontally);
  document.getElementById('texture-vertical-offset').addEventListener('input', offsetTextureVertically);
  document.getElementById('texture-horizontal-repeat').addEventListener('input', repeatTextureHorizontally);
  document.getElementById('texture-vertical-repeat').addEventListener('input', repeatTextureVertically);

  "xyz".split('').forEach(axis => {
    const radianInput = document.getElementById(`rotation-${axis}`);
    const degreesInput = document.getElementById(`rotation-${axis}-degrees`);
    const scaleInput = document.getElementById(`scale-${axis}-value`);
    const scaleRangeInput = document.getElementById(`scale-${axis}-range`);

    const defaultDegrees = 0;

    radianInput.min = -Math.PI;
    radianInput.max = Math.PI;

    setObjectScaleRange(axis, 1);
    setObjectScaleValue(axis, 1);
    setObjectRotationRadiansInput(axis, degreesToRadians(defaultDegrees));
    setObjectRotationDegreeInput(axis, radiansToDegrees(defaultDegrees));
    degreesInput.addEventListener('input', () => {
      setObjectRotationRadiansInput(axis, degreesToRadians(parseFloat(degreesInput.value)));
    });
    radianInput.addEventListener('input', () => {
      setObjectRotationDegreeInput(axis, radiansToDegrees(parseFloat(radianInput.value)));
    });
    scaleInput.addEventListener('input', () => {
      setObjectScaleRange(axis, parseFloat(scaleInput.value));
      applyScaleToObjects();
    });
    scaleRangeInput.addEventListener('input', () => {
      setObjectScaleValue(axis, parseFloat(scaleRangeInput.value));
      applyScaleToObjects();
    });
  });
  
  document.getElementById('nurbs-degrees').addEventListener('input', () => {
    drawNurbsSurfaceMesh(nurbsControlVertices);
  });
  document.getElementById('no-rotation').addEventListener('click', () => {
    "xyz".split('').forEach(axis => {
      document.getElementById(`spin-${axis}`).checked = false;
      document.getElementById(`rotation-${axis}`).value = 0;
      setObjectRotationDegreeInput(axis, radiansToDegrees(0))
    });
  });
  const cameras = ['front', 'back', 'left', 'right', 'top', 'bottom', 'iso', 'perspective'];
  cameras.forEach(angle => {
    document.getElementById(`camera-${angle}`)
      .addEventListener('click', changeCameraAngle.bind(this, angle, width, height));
  });
  document.getElementById('camera-reset').addEventListener('click', () => {
    document.getElementById(`camera-${currentCameraAngle}`).click();
  });
  document.getElementById(`camera-${defaultCameraAngle}`).click();


  document.getElementById('ambientIntensity').addEventListener('input', handleAmbientIntensityChange);
  document.getElementById('show-control-vertices').addEventListener('change', handleShowControlVerticesChange);
  document.getElementById('show-control-mesh').addEventListener('change', handleShowControlMeshChange);
  document.getElementById('show-nurbs-mesh').addEventListener('change', handleShowNurbsMeshChange);
  document.getElementById('show-cube').addEventListener('change', handleShowCubeChange);
  requestAnimationFrame( animate );
  fetch('files.json').then(response => response.json()).then(files => {

    const imageSelector = document.getElementById('image-selector');
    Object.keys(files.sculptedPrimNames).forEach(name => {
      const file = files.sculptedPrimNames[name];
      const option = document.createElement('option');
      option.value = `images/sculpted-prims/${file}`;
      option.innerText = name;
      if(file === defaultModel) {
        option.selected = true;
      }
      imageSelector.appendChild(option);
    });
    handleImageSelectorChange();
    const textureSelector = document.getElementById('texture-selector');
    Object.keys(files.textureNames).forEach(name => {
      const file = files.textureNames[name];
      const option = document.createElement('option');
      option.value = `images/textures/${file}`;
      option.innerText = name;
      if(file === defaultSkin) {
        option.selected = true;
      }
      textureSelector.appendChild(option);
    });
    handleTextureSelectorChange();
  });
}
function displayScaleValues() {
  const x = parseFloat(document.getElementById('scale-x-value').value);
  const y = parseFloat(document.getElementById('scale-y-value').value);
  const z = parseFloat(document.getElementById('scale-z-value').value);
  document.getElementById('scale-values').innerText = `<${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}>`;
}
function displayRotationValues() {
  const x = parseFloat(document.getElementById('rotation-x').value);
  const y = parseFloat(document.getElementById('rotation-y').value);
  const z = parseFloat(document.getElementById('rotation-z').value);
  document.getElementById('rotation-values').innerText = `<${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}>`;

}
function setObjectScaleRange(axis, value) {
  document.getElementById(`scale-${axis}-range`).value = value.toFixed(2);
  displayScaleValues();
}
function setObjectScaleValue(axis, value) {
  document.getElementById(`scale-${axis}-value`).value = value.toFixed(2);
  displayScaleValues();
}
function setObjectRotationDegreeInput(axis, degrees) {
  // round by 0.05
  degrees = Math.round(degrees * 20) / 20;
  document.getElementById(`rotation-${axis}-degrees`).value = degrees.toFixed(2);
  displayRotationValues();
}
function setObjectRotationRadiansInput(axis, radians) {
  document.getElementById(`rotation-${axis}`).value = radians.toFixed(2);
  displayRotationValues();
}
function radiansToDegrees(radians) {
  // -Math.PI = 180 degrees, 0 = 0 degrees, Math.PI = -180 degrees
  let scale = radians / Math.PI / 2;
  if(scale < 0) scale += 1;
  return (scale * 360) % 360;
}
function degreesToRadians(degrees) {
  // 0 degrees = 0 radians, 360 degrees = Math.PI, 180 degrees = -Math.PI
  let scale = (degrees / 360);
  if(scale > 0.5) {
    scale = scale - 1;
  }
  return scale * Math.PI * 2;
}
function changeCameraAngle(angle, width, height) {
  currentCameraAngle = angle;
  document.getElementById('camera-angle-selected').innerText = angle;
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
    removeTexture(nurbsMeshObject);
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
    applyTextureToObjects(image, nurbsMeshObject);
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
  return letters + row.toString();
}
function loadTexture(textureUrl) {
  const textureImage = new Image();
  textureImage.src = textureUrl;
  textureImage.onload = () => {
    drawTexturePreview(textureImage);
    applyTextureToObjects(textureImage, nurbsMeshObject);
  }
}
function drawTexturePreview(image) {
  const texturePreview = document.getElementById('texture-preview');
  const ctx = texturePreview.getContext('2d');
  ctx.clearRect(0, 0, texturePreview.width, texturePreview.height);
  ctx.drawImage(image, 0, 0, texturePreview.width, texturePreview.height);
}
function rotateTexture() {
  const rotation = parseFloat(document.getElementById('texture-rotation').value);
  skin.rotation = rotation;
  skin.needsUpdate = true;
}
function offsetTextureHorizontally() {
  skin.offset.x = parseFloat(document.getElementById('texture-horizontal-offset').value);
}
function offsetTextureVertically() {
  skin.offset.y = parseFloat(document.getElementById('texture-vertical-offset').value);
}
function repeatTextureHorizontally() {
  skin.repeat.x = parseFloat(document.getElementById('texture-horizontal-repeat').value);
}
function repeatTextureVertically() {
  skin.repeat.y = parseFloat(document.getElementById('texture-vertical-repeat').value);
}
function applyTextureToObjects(image) {
  skin = new THREE.Texture(image);
  skin.wrapS = THREE.RepeatWrapping;
  skin.wrapT = THREE.RepeatWrapping;
  skin.rotation = Math.PI / -2;
  skin.generateMipmaps = true;
  skin.minFilter = THREE.LinearMipmapLinearFilter;
  skin.maxFilter = THREE.LinearMipmapLinearFilter;
  skin.needsUpdate = true;
  Array.from(arguments).slice(1).forEach(object => {
    if(object) {
      object.material.map = skin;
      object.material.needsUpdate = true;
    }
  });
}
function removeTexture() {
  const texturePreview = document.getElementById('texture-preview');
  const ctx = texturePreview.getContext('2d');
  ctx.clearRect(0, 0, texturePreview.width, texturePreview.height);
  skin = null;
  Array.from(arguments).forEach(object => {
    if(object) {
      object.material.map = null;
      object.material.needsUpdate = true;
    }
  });
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

  const segments = downsampleSegments(image2D.width/2, image2D.height/2, 1024);
  horizontalSegments = segments.horizontal;
  verticalSegments = segments.vertical;

  document.getElementById('horizontal-segments').innerText = horizontalSegments.toLocaleString() + " + 1";
  document.getElementById('vertical-segments').innerText = verticalSegments.toLocaleString() + " + 1";
  document.getElementById('horizontal-downsampling').innerText = segments.horizontalDownsample === 0 ? '' : `(downsampled: ${segments.horizontalDownsample})`;
  document.getElementById('vertical-downsampling').innerText = segments.verticalDownsample === 0 ? '' : `(downsampled: ${segments.verticalDownsample})`;

  hideUnusedPixels(canvas2D, segments.horizontalDownsample, segments.verticalDownsample);
  nurbsControlVertices = readControlVertices(ctx, segments);
  drawControlVertices(nurbsControlVertices);
  drawSphericalControlMesh(nurbsControlVertices);
  drawNurbsSurfaceMesh(nurbsControlVertices);
}
function hideUnusedPixels(canvas, skipH, skipV) {
  if(!document.getElementById('reveal-vertices').checked) return;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  const width = canvas.width;
  const height = canvas.height;
  ctx.fillStyle = 'black';
  for(let x = 0; x < width; x++) {
    for(let y = 0; y < height; y++) {
      if(canReadControlVertex(x, y, width, height, skipH, skipV)) continue;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}
function mapByteToControlVectorValue(byteValue) {
  return (byteValue / 255) - 0.5;
}
function rgbLong(r, g, b) {
  return (r << 16) | (g << 8) | b;
}
function convertRgbToVertex(r, g, b) {
  return {
    color: rgbLong(r, g, b),
    x: mapByteToControlVectorValue(g),
    y: mapByteToControlVectorValue(b),
    z: mapByteToControlVectorValue(r)
  };
}

function surviveDownsampling(value, amount) {
  for(let i = 1; i <= amount; i++) {
    if(value % Math.pow(2, i+1) === i * 2) return false;
  }
  return true;
}
function canReadControlVertex(columnIndex, rowIndex, width, height, skipH, skipV) {
  // Top pole
  if(rowIndex === 0 || rowIndex === height - 1) return columnIndex === Math.floor(width / 2);  
  if(columnIndex % 2 === 1 || rowIndex % 2 === 1) return false;
  if(!surviveDownsampling(columnIndex, skipH)) return false;
  if(!surviveDownsampling(rowIndex, skipV)) return false;
  return true;
}
function downsampleSegments(width, height, verticesLimit) {
  const segments = {
    horizontal: width,
    vertical: height,
    horizontalDownsample: 0,
    verticalDownsample: 0
  }
  while(segments.horizontal * segments.vertical > verticesLimit) {
    const max = Math.max(segments.horizontal, segments.vertical);
    if(max === segments.horizontal) {
      segments.horizontalDownsample++;
      segments.horizontal = Math.floor(segments.horizontal / 2);
    }
    if(max === segments.vertical) {
      segments.verticalDownsample++;
      segments.vertical = Math.floor(segments.vertical / 2);
    }
  }
  return segments;
}
function readControlVertices(ctx, segments) {
  const width = canvas2D.width;
  const height = canvas2D.height;
  const pixelDataBytes = 4;
  // get pixels in row major order, top to bottom, left to right as (r, g, b, a)
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const controlVertices = [];

  let lastRow = -1;
  let firstVirtex = null;

  for(let i = 0; i < pixels.length; i += pixelDataBytes) {
    const columnIndex = (i / pixelDataBytes) % width;
    const rowIndex = Math.floor((i / pixelDataBytes) / width);
    if(!canReadControlVertex(columnIndex, rowIndex, width, height, segments.horizontalDownsample, segments.verticalDownsample)) continue;

    if(rowIndex !== lastRow) {
      if(firstVirtex) controlVertices.push(firstVirtex);
      lastRow = rowIndex;
    }

    const vertex = convertRgbToVertex(...pixels.slice(i, i + 3));
    controlVertices.push(vertex);
    if(columnIndex === 0) firstVirtex = vertex;
    if(rowIndex === 0 || rowIndex === height - 1) {
      // repeat vector for all segments at the poles
      for(let j = 0; j < segments.horizontal; j++) {
        controlVertices.push(vertex);
      }
    }
  }
  return controlVertices;
}
function drawControlVertices(controlVertices) {
  if(controlVerticesObject) {
    controlVerticesObject.children.forEach(mesh => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    scene.remove(controlVerticesObject);
  }
  controlVerticesObject = new THREE.Object3D();
  const exists = [];
  controlVertices.forEach(({ x, y, z, color }) => {
    const tag = `${x},${y},${z}`;
    if(exists.includes(tag)) return;
    exists.push(tag);
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
  x += horizontalSegments + 1;
} else if(x >= horizontalSegments) {
  // stitch right to left
  x -= horizontalSegments + 1;
}
  return y * (horizontalSegments + 1) + x;
}

function drawNurbsSurfaceMesh(controlVertices) {
  if(nurbsMeshObject) {
    nurbsMeshObject.geometry.dispose();
    nurbsMeshObject.material.dispose();
    scene.remove(nurbsMeshObject);
  }
  // Buggy - Can only create a square mesh
  if(horizontalSegments !== verticalSegments) return;

  const degrees = parseInt(document.getElementById('nurbs-degrees').value);
  const degreeU = degrees;
  const degreeV = degrees;
  const uSpans = horizontalSegments + 2 - degreeU;
  const vSpans = verticalSegments + 1 - degreeV;
  let nsControlPoints = [];
  for(let v = 0; v < vSpans + degreeV; v++) {
    const row = [];
    for(let u = 0; u < uSpans + degreeU; u++) {
      const index = sphericalIndex(u, v, horizontalSegments, verticalSegments);
      const { x, y, z } = controlVertices[index];
      row.push(new THREE.Vector4(x, y, z, 1));
    }
    nsControlPoints.push(row);
  }

  const knotsU = new Array(uSpans + degreeU);
  const knotsV = new Array(vSpans + degreeV);
  // make uniform list of knot integers with smooth transitions
  for(let i = 0; i < knotsU.length; i++) {
    knotsU[i] = i;
  }
  for(let i = 0; i < knotsV.length; i++) {
    knotsV[i] = i;
  }

  // This causes errors with nets that are not square
  const nurbsSurface = new NURBSSurface(
    degreeU, degreeV,
    knotsU, knotsV,
    nsControlPoints,
  );
  const slices = horizontalSegments * 4;
  const stacks = verticalSegments * 4;
  const geometry = new ParametricGeometry(nurbsSurface.getPoint.bind(nurbsSurface), slices, stacks);

  const material = new THREE.MeshStandardMaterial( { color: 'white' } );
  if(skin) {
    material.map = skin;
  }
  nurbsMeshObject = new THREE.Mesh(geometry, material);
  setPositionCentered(nurbsMeshObject);
  scene.add(nurbsMeshObject);
  applyScale(nurbsMeshObject);
  nurbsMeshObject.visible = document.getElementById('show-nurbs-mesh').checked;

}
function drawSphericalControlMesh(controlVertices) {
  cleanupControlMesh();
  const controlMeshGeometry = createSphericalControlGeometry(controlVertices, horizontalSegments, verticalSegments);
  const controlMeshMaterial = new THREE.MeshStandardMaterial( { color: 0xFFFFFF, wireframe: true } );
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
  controlMeshGeometry.computeTangents();

  document.getElementById('control-mesh-vertices').innerText = controlVertices.length.toLocaleString();
  document.getElementById('control-mesh-faces').innerText = (indexedTriangles.length / 3).toLocaleString();
  document.getElementById('control-mesh-positions').innerText = controlMeshGeometry.attributes.position.count.toLocaleString();
  return controlMeshGeometry;
}
function changeUvMapping() {
  if(controlMeshObject) {
    const geometry = controlMeshObject.geometry;
    const uvs = createUvMappingForSphere(geometry.attributes.position.count, horizontalSegments, verticalSegments);
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.attributes.uv.needsUpdate = true;
  }
}

function createUvMappingForSphere(positionCount, horizontalSegments, verticalSegments) {
  const uvs = new Float32Array(positionCount * 2);
  const verticesPerRow = horizontalSegments + 1;
  let row = 0;
  let column = 0;
  for(let i = 0; i < positionCount; i++) {
    if(i !== 0) {
      column++;
      if(column === verticesPerRow) {
        column = 0;
        row++;
      }
    }
    const u = i * 2;
    const v = u + 1;
    if(row=== 0) {
      // top pole
      uvs[u] = 0.5;
      uvs[v] = 1;
    } else if(row === verticalSegments) {
      // bottom pole
      uvs[u] = 0.5;
      uvs[v] = 0.0;
    } else {
      // middle of sphere
      uvs[u] = column / horizontalSegments;
      uvs[v] = 1 - (row / verticalSegments);
    }
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
      if(y === 0) {
        // triangles at top pole
        indexedTriangles.push(centerIndex, bottomIndex, bottomRightIndex);
      } else if(y === verticalSegments - 1) {
        // triangles at bottom pole
        indexedTriangles.push(centerIndex, bottomRightIndex, rightIndex);
      } else {
        // quads in the middle of poles
        indexedTriangles.push(centerIndex, bottomRightIndex, rightIndex);
        indexedTriangles.push(centerIndex, bottomIndex, bottomRightIndex);
      }
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
    document.getElementById('scale-x-range').value,
    document.getElementById('scale-y-range').value,
    document.getElementById('scale-z-range').value
  );
}
function applyScaleToObjects() {
  [
    cubeObject,
    controlVerticesObject,
    controlMeshObject,
    nurbsMeshObject
  ].filter(Boolean).forEach(applyScale);
}
function handleShowControlVerticesChange() {
  controlVerticesObject.visible = document.getElementById('show-control-vertices').checked;
}
function handleShowControlMeshChange() {
  controlMeshObject.visible = document.getElementById('show-control-mesh').checked;
}
function handleShowNurbsMeshChange() {
  nurbsMeshObject.visible = document.getElementById('show-nurbs-mesh').checked;
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
      setObjectRotationRadiansInput(axis, rotation[axis]);
      setObjectRotationDegreeInput(axis, radiansToDegrees(rotation[axis]));
    }
  });

  [
    cubeObject,
    controlVerticesObject,
    controlMeshObject,
    nurbsMeshObject
  ].filter(Boolean)
  .forEach(mesh => {
    mesh.rotation.set(rotation.x, rotation.y, rotation.z);
  });
};
function handleAmbientIntensityChange() {
  ambientLight.intensity = document.getElementById('ambientIntensity').value;
}

function changeDirectionalLight() {
  const angle = parseFloat(document.getElementById('directional-light-angle').value);
  const elevation = parseFloat(document.getElementById('directional-light-elevation').value);
  directionalLight.position.set(
    Math.cos(angle) * Math.cos(elevation),
    Math.sin(elevation),
    Math.sin(angle) * Math.cos(elevation)
  );
  directionalLight.intensity = document.getElementById('directionalIntensity').value;
}
function animate() {
	requestAnimationFrame( animate );
  if(controls) controls.update();
  rotate();
  changeDirectionalLight();

  renderer.render( scene, camera );
}

window.addEventListener('load', handleWindowLoad);


