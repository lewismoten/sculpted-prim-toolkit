import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { NURBSSurface } from 'three/examples/jsm/curves/NURBSSurface.js';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import Stats from 'three/examples/jsm/libs/stats.module';

const defaultCameraAngle = 'front';
const defaultModel = 'plopp smile_sculpture.png';
const defaultSkin = 'alignment-map-1024';

const VERTICAL_OFFSET = 1; // Y starts at 1, not zero as in the technicial documentation
const MAX_VERTECES = 1024;
const PIXEL_RED_INDEX = 0;
const PIXEL_GREEN_INDEX = 1;
const PIXEL_BLUE_INDEX = 2;
const PIXEL_ALPHA_INDEX = 3;
const WORLD_POSITION = new THREE.Vector3();
const MAX_MODEL_SIZE = 1;

let image2D;
let original2D;
let snapshot3D;
let canvas2D;
let canvas3D;
let width;
let height;
let ambientLight;
let directionalLight;
let horizontalSegments = 32;
let verticalSegments = 32;
let cameraOrbitControls;
let selectToolDown = false;
let pointer = {
  x: undefined,
  y: undefined,
  moved: false
};

const scene = new THREE.Scene();
let camera;
let renderer;
let skin;
let transformControls;

let pixels;
let modelObject;
let nurbsControlVertices;
let cubeObject;
let boundariesObject;
let verticesObject;
let wireframeObject;
let nurbsObject;
let segments;
let selectedVerticesObject;
let objectList = [];
const modelPosition = new THREE.Vector3(0, 0, 0);
const modelScale = new THREE.Vector3(1, 1, 1);
const modelRotation = new THREE.Vector3(0, 0, 0);
let stats;

function handleWindowLoad() {
  canvas3D = document.getElementById('image-3d');
  const rect = canvas3D.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ canvas: canvas3D, preserveDrawingBuffer: true});
  renderer.setSize( width, height );

  const bounds = renderer.domElement.getBoundingClientRect();
  stats = new Stats();
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.display = document.getElementById('show-stats').checked ? 'block' : 'none';
  updateStatsLocation();
  document.body.appendChild(stats.domElement);
  document.getElementById('show-stats').addEventListener('change', () => {
    stats.domElement.style.display = document.getElementById('show-stats').checked ? 'block' : 'none';
  });

  window.addEventListener('resize', () => {
    updateStatsLocation();
  });

  directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(1.5, 1.5, 1.5);
  directionalLight.lookAt(0, 0, 0);
  scene.add(directionalLight);


  ambientLight = new THREE.AmbientLight(0xffffff, parseFloat(document.getElementById('ambientIntensity').value));
  scene.add(ambientLight);

  scene.background = new THREE.Color(0x000040);

  const axesHelper = new THREE.AxesHelper(.75);
  scene.add(axesHelper);

  setupTransformControls(camera);

  drawCube();
  drawBoundaries();

  document.getElementById('center-model').addEventListener('click', moveModelToCenter);
  document.getElementById('scale-to-bounding-volume').addEventListener('click', scaleModelToBoundingVolume);
  document.getElementById('axis-helper').addEventListener('change', () => {
    axesHelper.visible = document.getElementById('axis-helper').checked;
  });

  canvas2D = document.getElementById('image-preview');
  let drawingCanvas2D = false;
  canvas2D.addEventListener('click', handle2DCanvasClick);
  canvas2D.addEventListener('mousemove', (e) => {
    if(drawingCanvas2D) handle2DCanvasClick(e);
  });
  canvas2D.addEventListener('mouseout', () => { drawingCanvas2D = false });
  canvas2D.addEventListener('mouseup', () => { drawingCanvas2D = false });
  canvas2D.addEventListener('mousedown', () => { drawingCanvas2D = true });
  document.getElementById('image-selector').addEventListener('change', handleImageSelectorChange);
  document.getElementById('texture-selector').addEventListener('change', handleTextureSelectorChange);

  document.getElementById('take-snapshot').addEventListener('click', takeSnapshot);
  document.getElementsByName('unused-pixels').forEach(input => {
    input.addEventListener('change', updateVerticyPositions);
  });
  document.getElementById('export-image').addEventListener('click', exportImage);
  document.getElementById('export-gltf').addEventListener('click', exportGltf.bind(undefined, false));
  document.getElementById('export-glb').addEventListener('click', exportGltf.bind(undefined, true));

  document.getElementById('texture-rotation').addEventListener('input', rotateTexture);
  document.getElementById('texture-horizontal-offset').addEventListener('input', offsetTextureHorizontally);
  document.getElementById('texture-vertical-offset').addEventListener('input', offsetTextureVertically);
  document.getElementById('texture-horizontal-repeat').addEventListener('input', repeatTextureHorizontally);
  document.getElementById('texture-vertical-repeat').addEventListener('input', repeatTextureVertically);
  document.getElementById('show-texture-emissive').addEventListener('change', handleTextureEmissiveChange);
  document.getElementById('texture-opacity').addEventListener('input', handleTextureOpacityChange);
  document.getElementsByName('tool').forEach(input => {
    input.addEventListener('change', () => {
      const tool = selectedTool();
      enableCameraOrbit(tool === 'camera');
      enableSelection(tool === 'select');
      synchronizeTransformControlsMode();
    });
  });
  trackPointer(canvas3D, pointer);

  canvas3D.addEventListener('click', handle3dCanvasClick);

  "xyz".split('').forEach(axis => {
    const radianInput = document.getElementById(`rotation-${axis}`);
    const degreesInput = document.getElementById(`rotation-${axis}-degrees`);
    const scaleInput = document.getElementById(`scale-${axis}-value`);
    const scaleRangeInput = document.getElementById(`scale-${axis}-range`);

    const selectedPosRange = document.getElementById(`selected-pos-${axis}-range`);
    const selectedPosValue = document.getElementById(`selected-pos-${axis}-value`);

    const defaultDegrees = 0;

    radianInput.min = -Math.PI;
    radianInput.max = Math.PI;

    selectedPosRange.addEventListener('input', () => {
      changeSelectedVertexPosition(axis, parseInt(selectedPosRange.value));
    });
    selectedPosValue.addEventListener('input', () => {
      changeSelectedVertexPosition(axis, parseInt(selectedPosValue.value));
    });

    setObjectScaleRange(axis, 1);
    setObjectScaleValue(axis, 1);
    setObjectRotationRadiansInput(axis, degreesToRadians(defaultDegrees));
    setObjectRotationDegreeInput(axis, radiansToDegrees(defaultDegrees));
    degreesInput.addEventListener('input', () => {
      setObjectRotationRadiansInput(axis, degreesToRadians(parseFloat(degreesInput.value)));
      applyRotationToObects(new THREE.Vector3(
        parseFloat(document.getElementById('rotation-x').value),
        parseFloat(document.getElementById('rotation-y').value),
        parseFloat(document.getElementById('rotation-z').value)
      ))
    });
    radianInput.addEventListener('input', () => {
      setObjectRotationDegreeInput(axis, radiansToDegrees(parseFloat(radianInput.value)));
      applyRotationToObects(new THREE.Vector3(
        parseFloat(document.getElementById('rotation-x').value),
        parseFloat(document.getElementById('rotation-y').value),
        parseFloat(document.getElementById('rotation-z').value)
      ))
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
  ['row', 'column'].forEach(axis => {
    const vertexRangeInput = document.getElementById(`vertex-${axis}-range`);
    const vertexValueInput = document.getElementById(`vertex-${axis}-value`);
    vertexValueInput.value = vertexRangeInput.value;
    vertexRangeInput.addEventListener('input', () => {
      vertexValueInput.value = vertexRangeInput.value;
      displayIndexOfVertexAfterRowOrColumnChanged();
    });
    vertexValueInput.addEventListener('input', () => {
      vertexRangeInput.value = vertexValueInput.value;
      displayIndexOfVertexAfterRowOrColumnChanged();
    });
  });
  const vertexIndexRangeInput = document.getElementById('vertex-index-range');
  const vertexIndexValueInput = document.getElementById('vertex-index-value');
  vertexIndexValueInput.value = vertexIndexRangeInput.value;
  vertexIndexRangeInput.addEventListener('input', () => {
    vertexIndexValueInput.value = vertexIndexRangeInput.value;
    displayRowAndColumnAfterVertexIndexChanged();
  });
  vertexIndexValueInput.addEventListener('input', () => {
    vertexIndexRangeInput.value = vertexIndexValueInput.value;
    displayRowAndColumnAfterVertexIndexChanged();
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
    applyRotationToObects(new THREE.Vector3(0, 0, 0));
  });
  const cameras = ['front', 'back', 'left', 'right', 'top', 'bottom', 'iso', 'perspective'];
  cameras.forEach(angle => {
    document.getElementById(`camera-${angle}`)
      .addEventListener('click', changeCameraAngle.bind(this, angle, width, height));
  });
  document.getElementById(`camera-${defaultCameraAngle}`).click();


  document.getElementById('ambientIntensity').addEventListener('input', handleAmbientIntensityChange);
  document.getElementById('show-model-mesh').addEventListener('change', handleShowModelMeshChange);
  document.getElementById('show-control-vertices').addEventListener('change', handleShowControlVerticesChange);
  document.getElementById('show-control-mesh').addEventListener('change', handleShowControlMeshChange);
  document.getElementById('show-nurbs-mesh').addEventListener('change', handleShowNurbsMeshChange);
  document.getElementById('show-cube').addEventListener('change', handleShowCubeChange);
  document.getElementById('show-model-boundaries').addEventListener('change', handleShowGhostChange);
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
      textureSelector.appendChild(option);
    });
    textureSelector.value = defaultSkin;
    handleTextureSelectorChange();
  });
}
function changeSelectedVertexPosition(axis, value) {
  // update UI input
  document.getElementById(`selected-pos-${axis}-range`).value = value;
  document.getElementById(`selected-pos-${axis}-value`).value = value;

  const byteVector = {
    x: parseInt(document.getElementById('selected-pos-x-value').value),
    y: parseInt(document.getElementById('selected-pos-y-value').value),
    z: parseInt(document.getElementById('selected-pos-z-value').value)
  }

  // update model data
  const index = getSelectedIndex();
  const pixel = bytePositionAsPixelRgb(byteVector.x, byteVector.y, byteVector.z);
  if(pixels[index][PIXEL_RED_INDEX] === pixel.r &&
    pixels[index][PIXEL_GREEN_INDEX] === pixel.g &&
    pixels[index][PIXEL_BLUE_INDEX] === pixel.b) {
    // Nothing changed
    console.log('Selected data not changed');
    return;
  };
  pixels[index][PIXEL_RED_INDEX] = pixel.r;
  pixels[index][PIXEL_GREEN_INDEX] = pixel.g;
  pixels[index][PIXEL_BLUE_INDEX] = pixel.b;

  // update vertex data
  const snappedVertex = convertRgbToVertex(pixel.r, pixel.g, pixel.b);
  nurbsControlVertices[index] = snappedVertex;

  // update model data image
  const { x, y } = indexOfVertexToImageXy(index);
  updateModelDataPixel(x, y, pixel.r, pixel.g, pixel.b);

  updateVertexModelsPositionAndColor(index, snappedVertex, pixel);

  // update model
  drawModelMesh(nurbsControlVertices);
  // update wireframe
  buildWireframeObject(nurbsControlVertices);
  // update nurbs surface
  drawNurbsSurfaceMesh(nurbsControlVertices);

  displayNewlySelectedVertex();
}

function getPositionToCenterModel() {
  const worldPosition = new THREE.Vector3();
  modelObject.getWorldPosition(worldPosition);
  const boundingBox = new THREE.Box3().setFromObject(modelObject);
  const boundingBoxSize = boundingBox.getSize(new THREE.Vector3());
  boundingBox.getSize(boundingBoxSize);
  const center = boundingBox.getCenter(new THREE.Vector3());
  return center.multiplyScalar(-MAX_MODEL_SIZE);
}
function moveModelToCenter() {
  const center = getPositionToCenterModel();
  const epsilon = vectorSnapSize() / 2;

  // is already centered?
  if("xyz".split('').every(axis => 
    Math.abs(center[axis]) < epsilon
  )) return;

  modelPosition.copy(center);
  applyToModels((object) => {
    object.position.copy(center);
  });
  saveVerticesPositionsToModelData();
  resetModelPositionRotationAndScale();
}
function resetModelPositionRotationAndScale() {
  modelPosition.set(0, 0, 0);
  modelScale.set(1, 1, 1);
  modelRotation.set(0, 0, 0);
  applyToModels((object) => {
    object.position.copy(modelPosition);
    object.scale.copy(modelScale);
    object.rotation.set(modelRotation.x, modelRotation.y, modelRotation.z);
  });
}
function applyToModels(callback) {
  [
    modelObject,
    verticesObject,
    selectedVerticesObject,
    nurbsObject
  ].forEach(callback);
}
function scaleModelToBoundingVolume() {
  
  // need to 'rebake' verticies to get the bounding box to scale in the correct directions
  saveVerticesPositionsToModelData();
  resetModelPositionRotationAndScale();
  const epsilon = vectorSnapSize() / 2;
  const maxLength = MAX_MODEL_SIZE - epsilon;

  let boundingBox = new THREE.Box3().setFromObject(modelObject);
  let size = boundingBox.getSize(new THREE.Vector3());

  let changed = false;
  "xyz".split('')
    .forEach(axis => {
      const length = size[axis];
      if(length >= maxLength) return;
      changed = true;
      const scale = MAX_MODEL_SIZE / length;
      modelScale[axis] = scale * modelScale[axis];
      applyToModels((object) => {
        object.scale.copy(modelScale);
      });
    });

  if(changed) {
    // center - scaled object may have partially escaped the bounding box
    const center = getPositionToCenterModel();
    modelPosition.copy(center);
    applyToModels((object) => {
      object.position.copy(center);
    });
  
    saveVerticesPositionsToModelData();
    resetModelPositionRotationAndScale();
  }
};
function takeSnapshot() {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = image2D.width;
  tempCanvas.height = image2D.height;
  const ctx = tempCanvas.getContext('2d', {willReadFrequently: true});
  ctx.drawImage(canvas3D, 0, 0, canvas3D.width, canvas3D.height, 0, 0, image2D.width, image2D.height);
  snapshot3D = new Image();
  snapshot3D.src = tempCanvas.toDataURL();
  snapshot3D.onload = () => {
    const unusedPixels = document.querySelector('input[name="unused-pixels"]:checked').value;
    if(unusedPixels === 'snapshot') updateVerticyPositions();
  }
}
function overwriteUnusedPixelsWithContext(source) {
  const width = image2D.width;
  const height = image2D.height;
  for(let x = 0; x < width; x++) {
    for(let y = 0; y < height; y++) {
      const isUsed = isImageXyVertex(x, y, width, height);
      if(isUsed) continue;
      const [r, g, b] = source.getImageData(x, y, 1, 1).data;
      setPixelColorOnImageOfData(x, y, r, g, b);
    }
  }
}
function updateModelDataPixel(x, y, r, g, b) {
  const canRead = isImageXyVertex(x, y, image2D.width, image2D.height);
  if(!canRead) {
    console.log('Pixel %sx%s is not a vector.', x, y);
    return;
  }

  const drawBlocks = document.querySelector('input[name="unused-pixels"]:checked').value === 'blocks';
  const blockWidth = Math.pow(2, segments.horizontalDownsample + 1);
  const blockHeight = Math.pow(2, segments.verticalDownsample + 1);
  if(drawBlocks) {
    for(let h = 0; h < blockWidth; h++) {
      for(let v = 0; v < blockHeight; v++) {
        setPixelColorOnImageOfData(x + h, y + v, r, g, b);
      }
    }
  } else {
    setPixelColorOnImageOfData(x, y, r, g, b);
  }
}
function updateModelDataUnusedPixels() {
  const width = image2D.width;
  const height = image2D.height;
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const ctx = tempCanvas.getContext('2d', {willReadFrequently: true});
  const unusedPixels = document.querySelector('input[name="unused-pixels"]:checked').value;
  switch(unusedPixels) {
    case 'black':
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, width, height);
      break;
    case 'camera':
      ctx.drawImage(canvas3D, 0, 0, canvas3D.width, canvas3D.height, 0, 0, width, height);
      break;
    case 'original':
      ctx.drawImage(original2D, 0, 0); 
      break;
    case 'snapshot':
      if(snapshot3D)
        ctx.drawImage(snapshot3D, 0, 0, snapshot3D.width, snapshot3D.height, 0, 0, width, height);
      else 
        ctx.drawImage(canvas2D, 0, 0);
      break;
    case 'blocks':
      ctx.drawImage(image2D, 0, 0); 
      break;
    default:
      ctx.fillStyle = 'red';
      ctx.fillRect(0, 0, width, height);
  }
  overwriteUnusedPixelsWithContext(ctx);
}
function originalImageContext() {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.width = original2D.width;
  ctx.height = original2D.height;
  ctx.drawImage(original2D, 0, 0);
  return ctx;
}
function applyOriginalVectorsToModelDataImage() {
  const source = originalImageContext();
  for(let x = 0; x < image2D.width; x++) {
    for(let y = 0; y < image2D.height; y++) {
      const isUsed = isImageXyVertex(x, y, image2D.width, image2D.height);
      if(!isUsed) continue;
      const [r, g, b] = source.getImageData(x, y, 1, 1).data;
      updateModelDataPixel(x, y, r, g, b);
    }
  }
}
function applyVectorsToModelDataImage() {
  let outOfBounds = false;
  selectedVerticesObject.children.forEach(object => {
    const i = object.userData.index;
    const worldPosition = object.getWorldPosition(object.position);
    let xyz = "xyz".split('').map(axis => mapControlVectorValueAsByte(worldPosition[axis]))
    if(xyz.some(v => v < 0 || v > 255)) {
      outOfBounds = true;
      xyz = xyz.map(mapClamp(0, 255));
    }
    const rgb = bytePositionAsPixelRgb(...xyz);
    const point = indexOfVertexToImageXy(i);
    updateModelDataPixel(point.x, point.y, rgb.r, rgb.g, rgb.b);
  });
}
function updateVerticyPositions() {
  updateModelDataUnusedPixels();
  applyVectorsToModelDataImage();
  // rebuild models
  image2D.src = canvas2D.toDataURL();

  // reset scale/position/rotation
  modelScale.set(1, 1, 1);
  modelRotation.set(0, 0, 0);
  modelPosition.set(0, 0, 0);
  saveVerticesPositionsToModelData();
}
function mapClamp(min, max) {
  return (value) => Math.min(max, Math.max(min, value));
}

function updateStatsLocation() {
  const bounds = renderer.domElement.getBoundingClientRect();
  stats.domElement.style.top = `${bounds.top}px`;
  stats.domElement.style.left = `${bounds.left}px`;
}
function areTransformControlsEnabled() {
  const tool = selectedTool();
  return ['rotate', 'scale', 'move'].includes(tool);
}
function synchronizeTransformControlsMode() {
  const tool = selectedTool();
  let enabled = areTransformControlsEnabled();
  if(transformControls) {
    if(!transformControls.object) {
      enabled = false;
    }
    transformControls.enabled = enabled;
    transformControls.visible = enabled;
    switch(tool) {
      case 'rotate':
        transformControls.setMode('rotate');
        break;
      case 'scale':
        transformControls.setMode('scale');
        break;
      case 'move':
        transformControls.setMode('translate');
        break;
    }
  }
}
function attachTransformControls(object) {
  if(transformControls) {
    if(transformControls.object) {
      transformControls.detach();
    }
    transformControls.attach(object);
  }
  synchronizeTransformControlsMode();
}
const SHIFT_KEY = 'Shift';
function handleTranslationKeyDown(event) {
  if(!transformControls) return;
  if(event.key === SHIFT_KEY) {
    const movement = 0.1; // vectorSnapSize();
    transformControls.setTranslationSnap(movement);
    transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
    transformControls.setScaleSnap(movement);
  }
}
function handleTranslationKeyUp(event) {
  if(!transformControls) return;
  if(event.key === SHIFT_KEY) {
    transformControls.setTranslationSnap(null);
    transformControls.setRotationSnap(null);
    transformControls.setScaleSnap(null);
  }
}
function cleanupTransformControls() {
  if(transformControls) {
    transformControls.detach();
    scene.remove(transformControls);
    transformControls.dispose();
    transformControls = null;
    window.removeEventListener('keydown', handleTranslationKeyDown);
    window.removeEventListener('keyup', handleTranslationKeyUp);
  }
};
function setupTransformControls(camera) {
  let object;
  if(transformControls){ 
    object = transformControls.object;
    cleanupTransformControls();
  }
  transformControls = new TransformControls(camera, renderer.domElement);
  const enabled = areTransformControlsEnabled();
  transformControls.enabled = enabled;
  transformControls.visible = enabled;
  transformControls.setSize(transformControls.size * 3);
  transformControls.addEventListener('change', (e) => {
    if(!transformControls.enabled) return;
    if(modelObject) {
      clampDimensions(transformControls.object);
    }
    render();
  });
  transformControls.addEventListener('dragging-changed', event => {
    if(!transformControls.enabled) return;
    if(cameraOrbitControls) cameraOrbitControls.enabled = !event.value;
    if(!event.value) {
      clampDimensions(transformControls.object);
    }
  });
  attachTransformControls(modelObject);
  window.addEventListener('keydown', handleTranslationKeyDown);
  window.addEventListener('keyup', handleTranslationKeyUp);
  scene.add(transformControls);
  if(object) attachTransformControls(object);
  else attachTransformControls(modelObject);
  synchronizeTransformControlsMode();
}
function clampDimensions(source) {
  if(!source) return;
  const maxLength = 1; // 1x1x1 cube

  let boundingBox = new THREE.Box3().setFromObject(source);
  let size = boundingBox.getSize(new THREE.Vector3());

  const maxXyz = "xyz".split('')
    .map(axis => boundingBox.max[axis] - boundingBox.min[axis])
    .reduce((max, v)=> Math.max(max, v), 0);

  let changed = false;

  // Clamp Scale
  if(maxXyz > maxLength) {
    changed = true;
    const scaleDown = maxLength / maxXyz;
    source.scale.set(scaleDown, scaleDown, scaleDown);
    boundingBox = new THREE.Box3().setFromObject(source);
    size = boundingBox.getSize(new THREE.Vector3());
  }
  // Clamp position inside cube
  function clampAxis(axis) {
    const half = size[axis] / 2;
    const value = THREE.MathUtils.clamp(source.position[axis], -0.5 + half, 0.5 - half);
    if(value !== source.position[axis]) {
      changed = true;
      source.position[axis] = value;
    }
  }
  "xyz".split('').forEach(clampAxis);

  if(!modelPosition.equals(source.position)) {
    changed = true;
    modelPosition.copy(source.position);
  }
  if(!modelScale.equals(source.scale)) {
    changed = true;
    modelScale.copy(source.scale);
  }
  if(!modelRotation.equals(source.rotation)) {
    changed = true;
    modelRotation.copy(source.rotation);
  }
  if(changed) {
    saveVerticesPositionsToModelData(source);
  }
}
function saveVerticesPositionsToModelData() {
  if(!selectedVerticesObject) return;
  if(!verticesObject) return;
  let changed = false;
  selectedVerticesObject.children.forEach((object) => {
    const { index } = object.userData;
    // grab world coordinates of vertex
    const vertex = object.getWorldPosition(WORLD_POSITION);
    // translate to byte values
    const byteVertex = "xyz".split('').reduce((v, axis) => ({ ... v, 
      [axis]: mapControlVectorValueAsByte(vertex[axis])
    }), {});
    const { r, g, b } = bytePositionAsPixelRgb(byteVertex.x, byteVertex.y, byteVertex.z);
    const snappedVertex = convertRgbToVertex(r, g, b);

    if(r === pixels[index][PIXEL_RED_INDEX] &&
      g === pixels[index][PIXEL_GREEN_INDEX] &&
      b === pixels[index][PIXEL_BLUE_INDEX]) {
      // Nothing changed
      return;
    }
    changed = true;

    // update model data
    pixels[index][PIXEL_RED_INDEX] = r;
    pixels[index][PIXEL_GREEN_INDEX] = g;
    pixels[index][PIXEL_BLUE_INDEX] = b;

    if(index === getSelectedIndex()) {
      document.getElementById('selected-pos-vector').innerText = `<${
        [snappedVertex.x, snappedVertex.y, snappedVertex.z].map(v => v.toFixed(3)).join(', ')
      }>`;
      document.getElementById('selected-pos-x-range').value = byteVertex.x;
      document.getElementById('selected-pos-x-value').value = byteVertex.x;
      document.getElementById('selected-pos-y-range').value = byteVertex.y;
      document.getElementById('selected-pos-y-value').value = byteVertex.y;
      document.getElementById('selected-pos-z-range').value = byteVertex.z;
      document.getElementById('selected-pos-z-value').value = byteVertex.z;
    }

    // update vertex data
    nurbsControlVertices[index] = snappedVertex;

    // update model data image
    const { x, y } = indexOfVertexToImageXy(index);
    updateModelDataPixel(x, y, r, g, b);

    // update vertex models
    updateVertexModelsPositionAndColor(index, snappedVertex, {r, g, b});
  
    // update selected vertices model with updated vertex xyz (byte translation)
  });
  if(!changed) {
    console.log('nothing changed');
    return; // nothing to update
  }

  // Reset scale/position/rotation
  modelPosition.set(0, 0, 0);
  modelScale.set(1, 1, 1);
  modelRotation.set(0, 0, 0);

  "xyz".split('').forEach(axis => {
    // Scale
    const scale = modelScale[axis];
    document.getElementById(`scale-${axis}-range`).value = scale.toFixed(2);
    document.getElementById(`scale-${axis}-value`).value = scale.toFixed(2);
    // Rotation
    const rotation = modelRotation[axis];
    let degrees = radiansToDegrees(rotation);
    degrees = Math.round(degrees * 20) / 20;
    document.getElementById(`rotation-${axis}-degrees`).value = degrees.toFixed(2);
    document.getElementById(`rotation-${axis}`).value = rotation.toFixed(2);
  });
  // update model
  drawModelMesh(nurbsControlVertices);
  // update wireframe
  buildWireframeObject(nurbsControlVertices);
  // update nurbs surface
  drawNurbsSurfaceMesh(nurbsControlVertices);
}
function updateVertexModelsPositionAndColor(index, {x,y,z}, {r, g, b}) {
  [
    verticesObject.children[index],
    selectedVerticesObject.children[index]
  ].forEach(object => {
    object.position.set(x, y, z);
    object.material.color = new THREE.Color(rgbLong(r, g, b));
    object.material.needsUpdate = true;
  });
};
function getPositionAsBytes() {
  const x = parseInt(document.getElementById('selected-pos-x-value').value);
  const y = parseInt(document.getElementById('selected-pos-y-value').value);
  const z = parseInt(document.getElementById('selected-pos-z-value').value);
  return { x, y, z };
}
function updateModelVertexPosition() {
  const pos = getPositionAsBytes();
  const rgb = bytePositionAsPixelRgb(pos.x, pos.y, pos.z);

  const i = getSelectedIndex();
  const point = indexOfVertexToImageXy(i);

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = image2D.width;
  tempCanvas.height = image2D.height;
  const tempCtx = tempCanvas.getContext('2d', {willReadFrequently: true});
  tempCtx.drawImage(image2D, 0, 0);

  // Update the pixel data
  const imageData = tempCtx.getImageData(point.x, point.y, 1, 1);
  imageData.data[0] = rgb.r;
  imageData.data[1] = rgb.g;
  imageData.data[2] = rgb.b;
  tempCtx.putImageData(imageData, point.x, point.y);

  image2D.src = tempCanvas.toDataURL();
}
function handlePointerMove(event) {
  this.x = event.clientX;
  this.y = event.clientY;
  if(this.down && !this.moved) {
    this.moved = this.xDown !== this.x || this.yDown !== this.y;
  }
}
function handlePointerUp(event) {
  this.down = false;
}
function handlePointerDown(event) {
  this.down = true;
  this.xDown = event.clientX;
  this.yDown = event.clientY;
  this.moved = false;
}
function trackPointer(domElement, pointer) {
  const onMove = handlePointerMove.bind(pointer);
  const onUp = handlePointerUp.bind(pointer);
  const onDown = handlePointerDown.bind(pointer);
  domElement.addEventListener('click', onMove);
  domElement.addEventListener('mousemove',onMove);
  domElement.addEventListener('mouseout', onUp);
  domElement.addEventListener('mouseup', onUp);
  domElement.addEventListener('mousedown', onDown);
}
function enableCameraOrbit(enable) {
  cameraOrbitControls.enabled = enable;
}
function handleSelectDown() {
  selectToolDown = true;
}
function handleSelectMove(event) {
  if(selectToolDown) handle3dCanvasClick(event);
}
function handleSelectUp() {
  selectToolDown = false;
}
function enableSelection(enable) {
  selectToolDown = false;
  if(enable) {
    canvas3D.addEventListener('mousedown', handleSelectDown);
    canvas3D.addEventListener('mousemove', handleSelectMove);
    canvas3D.addEventListener('mouseup', handleSelectUp);
    canvas3D.addEventListener('mouseout', handleSelectUp);
  } else {
    canvas3D.removeEventListener('mousedown', handleSelectDown);
    canvas3D.removeEventListener('mousemove', handleSelectMove);
    canvas3D.removeEventListener('mouseup', handleSelectUp);
    canvas3D.removeEventListener('mouseout', handleSelectUp);
  }
}
function selectedTool() {
  return document.querySelector('input[name="tool"]:checked').value;
}
function handle3dCanvasClick(event) {
  if(selectedTool() !== 'select') {
    if(pointer.moved) return;
  }
  const rect = canvas3D.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  mouse.x = ( x / width ) * 2 - 1;
  mouse.y = - ( y / height ) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  let intersected = false;
  raycaster.intersectObject(modelObject).forEach(intersects => {
    intersected = true;
    const { x, y } = intersects.uv;
    const index = getVertexByUvMapping(x, y);
    setSelectedIndexOfVertex(index);
  });
  if(!intersected) {
    raycaster.intersectObjects(verticesObject.children).forEach(intersects => {
      if(intersected) return;
      intersected = true;
      const index = intersects.object.userData.index;
      setSelectedIndexOfVertex(index);
    });
  }
}
function setSelectedIndexOfVertex(index) {
  document.getElementById('vertex-index-range').value = index;
  document.getElementById('vertex-index-value').value = index;
  selectedVerticesObject.children.forEach(mesh => {
    mesh.visible = mesh.userData.index === index;
  });
  displayRowAndColumnAfterVertexIndexChanged();
}

function displayIndexOfVertexAfterRowOrColumnChanged() {
  const i = rowColumnToIndexOfVertex(
    parseInt(document.getElementById('vertex-row-range').value),
    parseInt(document.getElementById('vertex-column-range').value),
    horizontalSegments,
    verticalSegments
  );
  setSelectedIndexOfVertex(i);
}
function indexOfVertexToRowAndColumn(i) {
  const row = Math.floor(i / (horizontalSegments + 1));
  let column = i % (horizontalSegments + 1);
  // hidden column for seam is first column
  if(column === horizontalSegments) {
    column = 0;
  }
  // poles only use center pixel
  if(row === 0 || row === verticalSegments) {
    column = Math.floor(horizontalSegments / 2);
  }
  return { row, column };
}
function indexOfVertexToImageXy(i) {
  const { row, column } = indexOfVertexToRowAndColumn(i);
  return {
    x: column * Math.pow(2, segments.horizontalDownsample + 1),
    y: (row * Math.pow(2, segments.verticalDownsample + 1)) + VERTICAL_OFFSET
  };
}
function getVertexByUvMapping(u, v) {
  let column = u * horizontalSegments + 1;
  let row = (1 - v) * verticalSegments + 1;

  column = Math.floor(column - 0.5);
  row = Math.floor(row - 0.5);
  return rowColumnToIndexOfVertex(row, column, horizontalSegments, verticalSegments);
}
function displayRowAndColumnAfterVertexIndexChanged(){
  const i = parseInt(document.getElementById('vertex-index-range').value);
  const { row, column } = indexOfVertexToRowAndColumn(i);
  document.getElementById('vertex-row-range').value = row;
  document.getElementById('vertex-column-range').value = column;
  document.getElementById('vertex-row-value').value = row;
  document.getElementById('vertex-column-value').value = column;
  displayNewlySelectedVertex()
}
function translatePointerCoordinates({clientX, clientY}, canvas, image) {
  const border = 1;
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - (rect.left + border));
  const y = (clientY - (rect.top + border));
  const scaleX = image.width / (rect.width - (border * 2));
  const scaleY = image.height / (rect.height - (border * 2));;
  return {
    x: x * scaleX,
    y: y * scaleY
  };
}
function handle2DCanvasClick(event) {
  let {x, y} = translatePointerCoordinates(event, canvas2D, image2D);
  const column = Math.floor(x / Math.pow(2, segments.horizontalDownsample + 1));
  const row = Math.floor(y / Math.pow(2, segments.verticalDownsample + 1));
  const i = rowColumnToIndexOfVertex(
    row,
    column,
    horizontalSegments,
    verticalSegments
  );
  setSelectedIndexOfVertex(i);
}
function pixelIndexAsHexArray(index) {
  return pixels[index].map(v => v.toString(16).padStart(2, '0'));
}
function displayNewlySelectedVertex() {
  const i = getSelectedIndex();
  const hexArray = pixelIndexAsHexArray(i);
  "rgb".split('').forEach((channel, idx) => {
    document.getElementById(`model-data-${channel}`).innerText = hexArray[idx];
  });
  document.getElementById('vertex-color').style.backgroundColor = '#' + hexArray.join('');

  displayVertexPosition()
  drawModelCanvas();
}
function getSelectedIndex() {
  return rowColumnToIndexOfVertex(
    parseInt(document.getElementById('vertex-row-range').value),
    parseInt(document.getElementById('vertex-column-range').value),
    horizontalSegments,
    verticalSegments
  );
}
function displayVertexPosition() {
  const i = getSelectedIndex();
  const [r, g, b] = pixels[i];
  const x = getPixelValueForAxis('x', r, g, b);
  const y = getPixelValueForAxis('y', r, g, b);
  const z = getPixelValueForAxis('z', r, g, b);
  document.getElementById('selected-pos-x-range').value = x;
  document.getElementById('selected-pos-x-value').value = x;
  document.getElementById('selected-pos-y-range').value = y;
  document.getElementById('selected-pos-y-value').value = y;
  document.getElementById('selected-pos-z-range').value = z;
  document.getElementById('selected-pos-z-value').value = z;
  document.getElementById('selected-pos-vector').innerText = `<${
    [x, y, z].map(v => mapByteToControlVectorValue(v).toFixed(3)).join(', ')
  }>`;
}
function drawModelCanvas() {
  updateModelDataUnusedPixels();
  applyVectorsToModelDataImage();
  highlightVertex();
}
function highlightVertex() {
  if(!pixels) return;
  const index = rowColumnToIndexOfVertex(
    parseInt(document.getElementById('vertex-row-range').value),
    parseInt(document.getElementById('vertex-column-range').value),
    horizontalSegments,
    verticalSegments
  );

  // 2D selection
  highlightSelectedVertexOnImageOfData();

  // 3D selection
  selectedVerticesObject.children.forEach(mesh => {
    mesh.visible = mesh.userData.index === index;
  });
  
}
function highlightSelectedVertexOnImageOfData() {
  const index = rowColumnToIndexOfVertex(
    parseInt(document.getElementById('vertex-row-range').value),
    parseInt(document.getElementById('vertex-column-range').value),
    horizontalSegments,
    verticalSegments
  );
  const [r, g, b] = pixels[index];
  const isBlackBg = document.querySelector('input[name="unused-pixels"]:checked').value === 'black';
  const outlineColor = isBlackBg ? 'white' : getContrastingColor(r, g, b);

  const { x, y } = indexOfVertexToImageXy(index);
  const canRead = isImageXyVertex(x, y, image2D.width, image2D.height);
  if(!canRead) {
    console.log('About to update a pixel that should not be updated');
  }
  const {row, column} = indexOfVertexToRowAndColumn(index);
  const vIndex = rowColumnToIndexOfVertex(row, column, horizontalSegments, verticalSegments);
  if(vIndex !== index) {
    console.log('Data index %s does not map to row %s Column %s index %s', index, row, column, vIndex);
  }

  document.getElementById('selected-pixel-xy').innerText = `${x}x${y}`;
  document.getElementById('selected-pixel-color').innerText = `rgb(${r}, ${g}, ${b})`;

  const value = outlineColor === 'black' ? 0 : 255;
  for(let xx = x - 1; xx <= x + 1; xx++) {
    for(let yy = y - 1; yy <= y + 1; yy++) {
      if(xx === x && yy === y) continue;
      setPixelColorOnImageOfData(xx, yy, value, value, value);
    }
  }
}
function setPixelColorOnImageOfData(x, y, r, g, b) {
  const ctx = getModelCanvasContext();
  const imageData = ctx.getImageData(x, y, 1, 1);
  // Preserve transparency
  imageData.data[0] = r;
  imageData.data[1] = g;
  imageData.data[2] = b;
  // imageData.data[2] = 255; // Opaque
  ctx.putImageData(imageData, x, y);
}
function getModelCanvasContext() {
  const ctx = canvas2D.getContext('2d', {willReadFrequently: true});
  ctx.imageSmoothingEnabled = false;
  return ctx;
}
function getContrastingColor(r, g, b) {
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 125 ? 'black' : 'white';
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
  modelScale[axis] = value;
  displayScaleValues();
}
function setObjectScaleValue(axis, value) {
  document.getElementById(`scale-${axis}-value`).value = value.toFixed(2);
  modelScale[axis] = value;
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
  setupTransformControls(camera);
}

function createCameraControls(camera, domElement) {
  if(cameraOrbitControls) cameraOrbitControls.dispose();
  if(selectedTool() !== 'camera') return;
  // NOTE: Create controls after camera has been positioned and rotated
  cameraOrbitControls = new OrbitControls( camera, domElement );
}

function createCamera(angle, size, canvasWidth, canvasHeight) {
  if(camera) scene.remove(camera);
  const canvasRatio = canvasWidth / canvasHeight;
  let max = Math.max(size.x, size.y, size.z);
  switch(angle) {
    case 'front':
    case 'back':
    case 'left':
    case 'right':
    case 'top':
    case 'bottom':
    case 'iso':
      if(angle === 'iso') max *= 1.6666;
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
      camera = new THREE.PerspectiveCamera(60, canvasRatio, 0.1, 1000);
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
    removeTexture(nurbsObject, modelObject);
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
    applyTextureToObjects(image, nurbsObject, modelObject);
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
    applyTextureToObjects(textureImage, nurbsObject, modelObject);
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
function handleTextureOpacityChange() {
  const opacity = parseFloat(document.getElementById('texture-opacity').value);
  [nurbsObject, modelObject].forEach(object => {
    if(object) {
      object.material.transparent = opacity < 1;
      object.material.opacity = opacity;
      object.material.needsUpdate = true;
    }
  });

}
function handleTextureEmissiveChange() {
  const isEmissive = document.getElementById('show-texture-emissive').checked;
  [nurbsObject, modelObject].forEach(object => {
    if(object) {
      object.material.emissive = new THREE.Color(isEmissive ? 0xffffff : 0x000000);
    }
  });
}
function repeatTextureVertically() {
  skin.repeat.y = parseFloat(document.getElementById('texture-vertical-repeat').value);
}
function applyTextureToObjects(image) {
  const isEmissive = document.getElementById('show-texture-emissive').checked;
  const opacity = parseFloat(document.getElementById('texture-opacity').value);
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
      object.material.emissive = new THREE.Color(isEmissive ? 0xffffff : 0x000000);
      object.material.emissiveMap = skin;
      object.material.transparent = opacity < 1;
      object.material.opacity = opacity;
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
      object.material.emissiveMap = null;
      object.material.needsUpdate = true;
    }
  });
}
function handleImageSelectorChange() {
  const imageSelector = document.getElementById('image-selector');
  loadImageOfModelData(imageSelector.value);
}
function loadImageOfModelData(url) {
  original2D = new Image();
  original2D.src = url;
  original2D.onload = () => {
    image2D = new Image();
    image2D.src = url;
    image2D.onload = imageOfModelDataLoaded;
  };
}
function imageOfModelDataLoaded() {
  canvas2D.width = image2D.width;
  canvas2D.height = image2D.height;
  const ctx = getModelCanvasContext();
  ctx.drawImage(image2D, 0, 0);

  segments = downsampleSegments(image2D.width/2, image2D.height/2, MAX_VERTECES);
  horizontalSegments = segments.horizontal;
  verticalSegments = segments.vertical;

  document.getElementById('image-size').innerText = `${image2D.width}x${image2D.height}`;

  const vertexColumnRangeInput = document.getElementById('vertex-column-range');
  const vertexRowRangeInput = document.getElementById('vertex-row-range');
  const vertexColumnValueInput = document.getElementById('vertex-column-value');
  const vertexRowValueInput = document.getElementById('vertex-row-value');
  vertexColumnRangeInput.max = horizontalSegments;
  vertexRowRangeInput.max = verticalSegments;
  vertexColumnValueInput.max = horizontalSegments;
  vertexRowValueInput.max = verticalSegments;
  if(vertexColumnRangeInput.value > horizontalSegments) {
    vertexColumnRangeInput.value = horizontalSegments;
    vertexColumnValueInput.value = horizontalSegments;
  }
  if(vertexRowRangeInput.value > verticalSegments) {
    vertexRowRangeInput.value = verticalSegments;
    vertexRowValueInput.value = verticalSegments;
  }

  document.getElementById('horizontal-segments').innerText = horizontalSegments.toLocaleString() + " + 1";
  document.getElementById('vertical-segments').innerText = verticalSegments.toLocaleString() + " + 1";
  document.getElementById('horizontal-downsampling').innerText = segments.horizontalDownsample === 0 ? '' : `(downsampled: ${segments.horizontalDownsample})`;
  document.getElementById('vertical-downsampling').innerText = segments.verticalDownsample === 0 ? '' : `(downsampled: ${segments.verticalDownsample})`;

  const imageData = ctx.getImageData(0, 0, image2D.width, image2D.height).data;
  pixels = getModelPixels(imageData, segments);
  nurbsControlVertices = pixels.map(([r, g, b]) => convertRgbToVertex(r, g, b));

  // Draw frame around selected pixel
  highlightSelectedVertexOnImageOfData();

  const vertexCount = nurbsControlVertices.length;
  const vertexIndexRangeInput = document.getElementById('vertex-index-range');
  const vertexIndexValueInput = document.getElementById('vertex-index-value');
  vertexIndexRangeInput.max = vertexCount - 1;
  vertexIndexValueInput.max = vertexCount - 1;
  drawObjects(nurbsControlVertices);
}
function drawObjects(nurbsControlVertices) {
  drawControlVertices(nurbsControlVertices);
  buildWireframeObject(nurbsControlVertices);
  drawModelMesh(nurbsControlVertices);
  drawNurbsSurfaceMesh(nurbsControlVertices);
  drawSelectionVertices();
  displayNewlySelectedVertex();
}
function mapByteToControlVectorValue(byteValue) {
  return (byteValue / 255) - 0.5;
}
function vectorSnapSize() {
  return mapByteToControlVectorValue(1) - mapByteToControlVectorValue(0);
}
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
function mapControlVectorValueAsByte(position) {
  const value = Math.round((position + 0.5) * 255);
  return clamp(value, 0, 255);
}
function rgbLong(r, g, b) {
  return (r << 16) | (g << 8) | b;
}
function bytePositionAsPixelRgb(x, y, z) {
  return { r: z, g: x, b: y };
}
function getPixelValueForAxis(axis, r, g, b) { 
  if(axis === 'x') return g;
  if(axis === 'y') return b;
  return r;
}
function convertRgbToVertex(r, g, b) {
  return {
    color: rgbLong(r, g, b),
    x: mapByteToControlVectorValue(getPixelValueForAxis('x', r, g, b)),
    y: mapByteToControlVectorValue(getPixelValueForAxis('y', r, g, b)),
    z: mapByteToControlVectorValue(getPixelValueForAxis('z', r, g, b))
  };
}

function surviveDownsampling(value, amount) {
  for(let i = 1; i <= amount; i++) {
    if(value % Math.pow(2, i+1) === i * 2) return false;
  }
  return true;
}
function isImageXyVertex(x, y, width, height) {
  const {
    horizontalDownsample: skipH,
    verticalDownsample: skipV
  } = downsampleSegments(width/2, height/2, MAX_VERTECES);
  // Top/bottom poles
  if(y === 0 || y === height - 1) return x === Math.floor(width / 2);  
  // verticalOffset
  y -= VERTICAL_OFFSET;
  if(x % 2 === 1 || y % 2 === 1) return false;
  if(!surviveDownsampling(x, skipH)) return false;
  if(!surviveDownsampling(y, skipV)) return false;
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
function getModelPixels(imageData, segments) {
  const width = canvas2D.width;
  const height = canvas2D.height;
  const pixelDataBytes = 4;
  // get pixels in row major order, top to bottom, left to right as (r, g, b, a)
  const controlVertices = [];

  let lastRow = -1;
  let firstVirtex = null;

  for(let i = 0; i < imageData.length; i += pixelDataBytes) {
    const x = (i / pixelDataBytes) % width;
    const y = Math.floor((i / pixelDataBytes) / width);
    if(!isImageXyVertex(x, y, width, height)) continue;

    if(y !== lastRow) {
      if(firstVirtex) controlVertices.push(firstVirtex);
      lastRow = y;
    }

    const vertex = imageData.slice(i, i + 3);
    controlVertices.push(vertex);
    if(x === 0) firstVirtex = vertex;
    if(y === 0 || y === height - 1) {
      // repeat vector for all segments at the poles
      for(let j = 0; j < segments.horizontal; j++) {
        controlVertices.push(vertex);
      }
    }
  }
  return controlVertices;
}
function drawControlVertices(controlVertices) {
  removeObjectFromList(verticesObject);
  verticesObject = new THREE.Object3D();
  verticesObject.name = 'Vertices';
  controlVertices.forEach(({ x, y, z, color}, index) => {
    const geometry = new THREE.BoxGeometry( 0.01, 0.01, 0.01 );
    const material = new THREE.MeshBasicMaterial( { color } );
    const mesh = new THREE.Mesh( geometry, material );
    mesh.position.set(x, y, z);
    mesh.userData.index = index;
    verticesObject.add(mesh);
  });
  setTranslationToObject(verticesObject);
  scene.add( verticesObject );

  verticesObject.visible = document.getElementById('show-control-vertices').checked;
  addObjectToList(verticesObject);
}
function drawSelectionVertices() {  
  const vertices = pixels.map(([r, g, b]) => convertRgbToVertex(r, g, b));
  removeObjectFromList(selectedVerticesObject);
  const selectedIndex = parseInt(document.getElementById('vertex-index-range').value);
  const object = new THREE.Object3D();
  object.name = 'Vertices';
  vertices.forEach(({ x, y, z, color }, i) => {
    const {row, column} = indexOfVertexToRowAndColumn(i);
    if(row === 0 || row === verticalSegments) {
      // poles only use center pixel
      if(column != Math.floor(horizontalSegments / 2)) return;
    }
    if(column === horizontalSegments) {
      // hidden column for seam is first column
      return;
    }
    const geometry = new THREE.BoxGeometry( 0.02, 0.02, 0.02 );
    const material = new THREE.MeshStandardMaterial( { color, emissive: color } );
    const mesh = new THREE.Mesh( geometry, material );
    mesh.name = 'Pixel'
    mesh.userData.index = i;
    mesh.userData.row = row;
    mesh.userData.column = column;
    mesh.position.set(x, y, z);
    mesh.visible = selectedIndex === i;
    object.add(mesh);
  });
  setTranslationToObject(object);
  scene.add( object );
  selectedVerticesObject = object;
  addObjectToList(object);
}
function rowColumnToIndexOfVertex(row, column, horizontalSegments, verticalSegments) {
  if(row >= verticalSegments || row <= 0) {
    // poles of top and bottom are centered
    column = Math.floor(horizontalSegments / 2);
  }
  // keep row within bounds
  if(row < 0) {
    row = 0;
  } else if(row >= verticalSegments) {
    // HACK: seems center pixel is not in the proper place?
    return ((horizontalSegments + 1) * verticalSegments);
    // row = verticalSegments - 1;
  }
if(column < 0) {
  // stitch left to right
  column += horizontalSegments + 1;
} else if(column >= horizontalSegments) {
  // stitch right to left
  column -= horizontalSegments + 1;
}
  return row * (horizontalSegments + 1) + column;
}

function drawNurbsSurfaceMesh(controlVertices) {
  removeObjectFromList(nurbsObject);
  let degrees = parseInt(document.getElementById('nurbs-degrees').value);

  const degreeU = degrees;
  const degreeV = degrees;

  const knotsU = makeClosedUniformKnots(horizontalSegments, degreeU);
  const knotsV = makeClosedUniformKnots(verticalSegments, degreeV);

  document.getElementById('nurbs-knots-u').innerText = knotsU.length.toLocaleString();
  document.getElementById('nurbs-knots-u').title = knotsU.map(v => v.toLocaleString()).join(", ");
  document.getElementById('nurbs-knots-v').innerText = knotsV.length.toLocaleString();
  document.getElementById('nurbs-knots-v').title = knotsV.map(v => v.toLocaleString()).join(", ");

  const net = [];
  // with nurbs surfaces, we need to duplicate the first and last row and column
  // to keep the surface closed
  for(let column = 0; column < horizontalSegments+1; column++) {
    const vPoints = [];
    for(let row = 0; row < verticalSegments+1; row++) {
      const index = rowColumnToIndexOfVertex(row, column, horizontalSegments, verticalSegments);
      const { x, y, z } = controlVertices[index];
      vPoints.unshift(new THREE.Vector4(x, y, z, 1));
    }
    net.push(vPoints);
  }

  const nurbsSurface = new NURBSSurface(
    degreeU, degreeV,
    knotsU, knotsV,
    net,
  );
  const geometry = new ParametricGeometry(
    nurbsSurface.getPoint.bind(nurbsSurface),
    (horizontalSegments + 1) * degreeU,
    (verticalSegments + 1) * degreeV
  );

  const isEmissive = document.getElementById('show-texture-emissive').checked;
  const opacity = parseFloat(document.getElementById('texture-opacity').value);
  const material = new THREE.MeshStandardMaterial( { 
    color: 'white',
    emissive: isEmissive ? 0xFFFFFF : 0x000000,
    transparent: opacity < 1,
    opacity
  });
  if(skin) {
    material.map = skin;
    material.emissiveMap = skin;
  }
  nurbsObject = new THREE.Mesh(geometry, material);
  nurbsObject.name = 'NURBS Surface';
  setTranslationToObject(nurbsObject);
  scene.add(nurbsObject);
  nurbsObject.visible = document.getElementById('show-nurbs-mesh').checked;
  addObjectToList(nurbsObject);
}
function makeClosedUniformKnots(spans, degreeOfRepeat) {
  const count = spans + degreeOfRepeat + 1;
  const knots = new Array(count);
  for(let i = 0; i < count; i++) {
    if(i < degreeOfRepeat) knots[i] = 0;
    else if(i > count - degreeOfRepeat - 1) knots[i] = count - (degreeOfRepeat * 2) + 1;
    else knots[i] = i - degreeOfRepeat + 1;
  }
  return knots;
}
function buildWireframeObject(vertices) {
  removeObjectFromList(wireframeObject);
  const controlMeshGeometry = createBufferGeometry(vertices, horizontalSegments, verticalSegments);
  const controlMeshMaterial = new THREE.MeshStandardMaterial( { color: 0xFFFFFF, wireframe: true } );
  wireframeObject = new THREE.Mesh(controlMeshGeometry, controlMeshMaterial);
  wireframeObject.name = 'Wireframe';
  setTranslationToObject(wireframeObject);
  scene.add(wireframeObject);
  wireframeObject.visible = document.getElementById('show-control-mesh').checked;
  addObjectToList(wireframeObject);
}
function drawModelMesh(controlVertices) {
  removeObjectFromList(modelObject);
  function getPoint(u, v, target) {
    
    let column = Math.floor(u * (horizontalSegments + 1));
    let row = Math.floor((1 - v) * (verticalSegments + 1));
    const index = rowColumnToIndexOfVertex(
      row,
      column, 
      horizontalSegments,
      verticalSegments
    );
    const { x, y, z } = controlVertices[index];
    target.set(x, y, z);
  }
  const geometry = new ParametricGeometry(getPoint, horizontalSegments, verticalSegments);
  geometry.computeVertexNormals();
  const isEmissive = document.getElementById('show-texture-emissive').checked;
  const opacity = parseFloat(document.getElementById('texture-opacity').value);
  const material = new THREE.MeshStandardMaterial({
    color: 'white',
    emissive: isEmissive ? 0xFFFFFF : 0x000000,
    transparent: opacity < 1,
    opacity
  });
  if(skin) {
    material.map = skin;
    material.emissiveMap = skin;
  }
  modelObject = new THREE.Mesh(geometry, material);
  modelObject.name = 'Model';

  setTranslationToObject(modelObject);
  scene.add(modelObject);
  modelObject.visible = document.getElementById('show-model-mesh').checked;
  attachTransformControls(modelObject);
  addObjectToList(modelObject);
}
function createBufferGeometry(vertices, horizontalSegments, verticalSegments) {
  const controlMeshGeometry = new THREE.BufferGeometry();
  const positions = createSphericalVertices(vertices, horizontalSegments, verticalSegments);
  controlMeshGeometry.setAttribute('position', positions);
  const indexedTriangles = createSphericalControlTriangles(horizontalSegments, verticalSegments);
  controlMeshGeometry.setIndex(indexedTriangles);
  controlMeshGeometry.setDrawRange(0, indexedTriangles.length);
  controlMeshGeometry.computeVertexNormals();
  const uvs = createUvMappingForSphere(controlMeshGeometry.attributes.position.count, horizontalSegments, verticalSegments);
  controlMeshGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  controlMeshGeometry.computeTangents();

  document.getElementById('control-mesh-vertices').innerText = positions.count.toLocaleString();
  document.getElementById('control-mesh-faces').innerText = (indexedTriangles.length / 3).toLocaleString();
  document.getElementById('control-mesh-positions').innerText = controlMeshGeometry.attributes.position.count.toLocaleString();
  return controlMeshGeometry;
}
function changeUvMapping() {
  if(wireframeObject) {
    const geometry = wireframeObject.geometry;
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

function createSphericalVertices(vertices, horizontalSegments, verticalSegments) {
  const count = ((horizontalSegments + 1) * (verticalSegments + 1)) * 3;
  const values = new Float32Array(count);
  vertices.forEach(({ x, y, z }, i) => {
    const offset = i * 3;
    values[offset] = x;
    values[offset + 1] = y;
    values[offset + 2] = z;
  });
  return new THREE.BufferAttribute(values, 3);
}

function createSphericalControlTriangles(horizontalSegments, verticalSegments) {
  var indexedTriangles = [];
  for(let column = 0; column < horizontalSegments; column++) {
    for(let row = 0; row < verticalSegments; row++) {
      const centerIndex = rowColumnToIndexOfVertex(row, column, horizontalSegments, verticalSegments);
      const bottomRightIndex = rowColumnToIndexOfVertex(row + 1, column + 1, horizontalSegments, verticalSegments);
      const bottomIndex = rowColumnToIndexOfVertex(row + 1, column, horizontalSegments, verticalSegments);
      const rightIndex = rowColumnToIndexOfVertex(row, column + 1, horizontalSegments, verticalSegments);
      // Add triangles in counter-clockwise order
      if(row === 0) {
        // triangles at top pole
        indexedTriangles.push(centerIndex, bottomIndex, bottomRightIndex);
      } else if(row === verticalSegments - 1) {
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
      return 'green';
    case 'front':
    case 'back':
      return 'blue';
    case 'left':
    case 'right':
      return 'red';
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
  const map = new THREE.TextureLoader().load(url);
  return new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: map,  transparent: true, opacity: 0.5 })
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
  setTranslationToObject(cubeObject);

  // Add materials in the order of the cubes faces
  // (this is the standard order for a cuboid in most 3d modeling programs)
  const materials = ['Right', 'Left', 'Top', 'Bottom', 'Front', 'Back'].map(textMaterial);
  cubeObject.material = materials;

  scene.add(cubeObject);
  cubeObject.scale.set(1, 1, 1);
  cubeObject.visible = document.getElementById('show-cube').checked;
}

function addObjectToList(object) {
  if(!object) return;
  objectList.push(object);
}
function removeObjectFromList(object) {
  objectList = objectList.filter(obj => obj !== object);
  removeFromScene(object);
}
function removeFromScene(object) {
  if(!object) return;
  scene.remove(object);
  if(object.geometry) object.geometry.dispose();
  if(object.material) object.material.dispose();
  if(object.dispose) object.dispose();
}
function drawBoundaries() {
  removeFromScene(boundariesObject);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({side: THREE.BackSide, color: 'white'});
  boundariesObject = new THREE.Mesh(geometry, material);

  const materials = ['Right', 'Left', 'Top', 'Bottom', 'Front', 'Back'].map(gridTexture.bind(this, 16, 16));
  boundariesObject.material = materials;

  setTranslationToObject(boundariesObject);

  scene.add(boundariesObject);
  boundariesObject.scale.set(1, 1, 1);
  boundariesObject.visible = document.getElementById('show-model-boundaries').checked;
}
function gridTexture(columns, rows, face) {
  const color = faceColor(face);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgb(127, 127, 255)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  for(let x = 0; x <= columns; x++) {
    ctx.beginPath();
    ctx.moveTo(0, x * canvas.height / rows);
    ctx.lineTo(canvas.width, x * canvas.height / rows);
    ctx.stroke();
    for(let y = 0; y <= rows; y++) {
      ctx.beginPath();
      ctx.moveTo(x * canvas.width / columns, 0);
      ctx.lineTo(x * canvas.width / columns, canvas.height);
      ctx.stroke();
    }
  }
  const map = new THREE.TextureLoader().load(canvas.toDataURL());
  const material = new THREE.MeshStandardMaterial( { 
    side: THREE.BackSide, 
    map,
    emissive: 0xffffff,
    emissiveMap: map
  } );
  return material;
}
function setTranslationToObject(object) {
  object.position.set(modelPosition.x, modelPosition.y, modelPosition.z);
  //object.position.copy(object.worldToLocal(modelPosition));
  object.rotation.set(modelRotation.x, modelRotation.y, modelRotation.z);
  object.scale.set(modelScale.x, modelScale.y, modelScale.z);
}
function applyTransformationToObects() {
  objectList.filter(Boolean).forEach(setTranslationToObject);
}
function applyScaleToObjects() {
  objectList.filter(Boolean).forEach(object => {
    object.scale.set(modelScale.x, modelScale.y, modelScale.z);
  });
}
function applyRotationToObects(rotation) {
  modelRotation.set(rotation.x, rotation.y, rotation.z);
  objectList
    .filter(Boolean)
    .forEach(mesh => {
      mesh.rotation.set(modelRotation.x, modelRotation.y, modelRotation.z);
    });
}
function handleShowControlVerticesChange() {
  verticesObject.visible = document.getElementById('show-control-vertices').checked;
}
function handleShowControlMeshChange() {
  wireframeObject.visible = document.getElementById('show-control-mesh').checked;
}
function handleShowModelMeshChange() {
  modelObject.visible = document.getElementById('show-model-mesh').checked;
}
function handleShowNurbsMeshChange() {
  nurbsObject.visible = document.getElementById('show-nurbs-mesh').checked;
}
function handleShowCubeChange() {
  cubeObject.visible = document.getElementById('show-cube').checked;
}
function handleShowGhostChange() {
  boundariesObject.visible = document.getElementById('show-model-boundaries').checked;
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
  if(!modelObject) return;
  const rotation = modelObject.rotation.clone();
  let changed = false;
  "xyz".split('').forEach(axis => {
    if(document.getElementById(`spin-${axis}`).checked) {
      rotation[axis] = rotateWrap(rotation[axis], 0.02);
      changed = true;
      setObjectRotationRadiansInput(axis, rotation[axis]);
      setObjectRotationDegreeInput(axis, radiansToDegrees(rotation[axis]));
    }
  });
  if(changed) applyRotationToObects(rotation);
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
  if(cameraOrbitControls) cameraOrbitControls.update();
  rotate();
  changeDirectionalLight();
  render();
}
function render() {
  renderer.render( scene, camera );
  const unusedPixels = document.querySelector('input[name="unused-pixels"]:checked').value;
  if(unusedPixels === 'camera') {
    updateModelDataUnusedPixels();
  };

  stats.update();
}

function fileName(ext) {
  const imageSelector = document.getElementById('image-selector');
  const name = imageSelector.value
    .replace(/\.[^.]+$/i, '.') // remove ext
    .replace(/^.*\//, ''); // remove path
  return new Date().toLocaleString() + ' ' + name + ext;
}
function exportImage() {
  // redraw canvas without selected vertex
  updateModelDataUnusedPixels();
  applyVectorsToModelDataImage();

  const dataURL = canvas2D.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = dataURL;
  link.download = fileName('png');
  link.click();

  // display selected vertex
  highlightVertex();
}
function includeTextures() {
  document.getElementById('export-texture').checked
}
function exportGltf(binary) {
  const gltfExporter = new GLTFExporter();
  const options = {
    includeTextures: includeTextures(),
    binary
  }
  function success(result) {
    let blob;
    if(result instanceof ArrayBuffer) {
      blob = new Blob([result], { type: 'model/gltf-binary' });
    }
    else {
      const data = JSON.stringify(result, null, 2);
      blob = new Blob([data], { type: 'text/plain' });
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName(binary ? 'glb' : 'gltf');
    link.click();
  }
  function failed(error) {
    console.error('Failed to export GLTF', error);
  }
  gltfExporter.parse(modelObject, success, failed, options);
}

window.addEventListener('load', handleWindowLoad);


