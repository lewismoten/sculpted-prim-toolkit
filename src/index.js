import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { NURBSSurface } from 'three/examples/jsm/curves/NURBSSurface.js';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import Stats from 'three/examples/jsm/libs/stats.module';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

const defaultCameraAngle = 'iso';
const defaultModel = '128-5 tokoroten cube (from SL).png';
const defaultSkin = 'dynamic-model-face-angle';

const MAX_VERTECES = 1024;
const HEX_BLACK = '#000000';
const HEX_WHITE = '#ffffff';
const WORLD_POSITION = new THREE.Vector3();
const MAX_MODEL_SIZE = 1;
const MAPPING_TYPE = {
  spherical: {
    // horizontal pole - 32
    // horizontal - 0, 2 ... 60, 62, 0
    // vertical - 0, 2, ... 60, 62, 63
    x: 32,
    y: 33,
    yHasPoles: true,
    xStitched: true,
    yStitched: false,
    dataCount: (32 * 31) + 2,
    vectorCount: 33 * 33
  },
  plane: {
    // horizontal - 0, 2 ... 64, 63
    // vertical - 0, 2 ... 64, 63
    x: 33,
    y: 33,
    yHasPoles: false,
    xStitched: false,
    yStitched: false,
    dataCount: 33 * 33,
    vectorCount: 33 * 33
  },
  cylinder: {
    // horizontal - 0, 2 ... 61, 62
    // vertical - 0, 2 ... 62, 63
    x: 32,
    y: 33,
    yHasPoles: false,
    xStitched: true,
    yStitched: false,
    dataCount: 32 * 33,
    vectorCount: 32 * 33
  },
  torus: {
    // horizontal - 0, 2 ... 61, 62
    // vertical - 0, 2 ... 61, 62
    x: 32,
    y: 32,
    yHasPoles: false,
    xStitched: true,
    yStitched: true,
    dataCount: 32 * 32,
    vectorCount: 32 * 32
  }
}
const DEFAULT_MAPPING_TYPE = Object.keys(MAPPING_TYPE)[0];

let image2D;
let textureImage;
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
let pointCloudObject;
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

  textureImage = new Image();
  textureImage.onload = handleTextureLoaded;

  const tips = document.getElementsByClassName('tooltip');
  for(let i = 0; i < tips.length; i++) {
    const tip = tips[i];
    const id = tip.getAttribute('data-target');
    const target = document.getElementById(id);
    target.classList.add('has-tooltip');
    target.addEventListener('mouseover', () => tip.setAttribute('data-open', true));
    target.addEventListener('mouseout', () => tip.setAttribute('data-open', false));
  }

  //hasTooltip
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
  axesHelper.visible = document.getElementById('axis-helper').checked;
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
  canvas2D.addEventListener('click', handleModelImageClicked);
  canvas2D.addEventListener('mousemove', (e) => {
    if(drawingCanvas2D) handleModelImageClicked(e);
  });
  canvas2D.addEventListener('mouseout', () => { drawingCanvas2D = false });
  canvas2D.addEventListener('mouseup', () => { drawingCanvas2D = false });
  canvas2D.addEventListener('mousedown', () => { drawingCanvas2D = true });
  document.getElementById('image-selector').addEventListener('change', handleModelSelectorChange);
  document.getElementById('texture-selector').addEventListener('change', handleTextureSelectorChange);

  document.getElementById('take-snapshot').addEventListener('click', takeSnapshot);
  document.getElementsByName('unused-pixels').forEach(input => {
    input.addEventListener('change', updateVerticyPositions);
  });
  document.getElementById('export-image').addEventListener('click', exportImage);
  document.getElementById('export-gltf').addEventListener('click', exportGltf.bind(undefined, false));
  document.getElementById('export-glb').addEventListener('click', exportGltf.bind(undefined, true));
  document.getElementById('export-obj').addEventListener('click', exportObj);
  document.getElementById('export-stl').addEventListener('click', exportStl);

  bindRadianAndDegreeInput(
    'texture-rotation',
    'texture-rotation-value',
    handleTextureOrientation
  )
  bindRangeAndNumericInput(
    'texture-horizontal-offset',
    'texture-horizontal-offset-value',
    handleTextureOrientation
  );
  bindRangeAndNumericInput(
    'texture-vertical-offset',
    'texture-vertical-offset-value',
    handleTextureOrientation
  );
  bindRangeAndNumericInput(
    'texture-horizontal-repeat',
    'texture-horizontal-repeat-value',
    handleTextureOrientation
  );
  bindRangeAndNumericInput(
    'texture-vertical-repeat',
    'texture-vertical-repeat-value',
    handleTextureOrientation
  );
  document.getElementById('show-texture-emissive').addEventListener('change', handleTextureEmissiveChange);
  document.getElementById('texture-flip-v').addEventListener('change', handleTextureOrientation);
  document.getElementById('texture-flip-h').addEventListener('change', handleTextureOrientation);
  bindRangeAndNumericInput(
    'texture-opacity',
    'texture-opacity-value',
    handleTextureOpacityChange
  );
  document.getElementById('dynamic-colors').addEventListener('change', () => {
    if(isDynamicTexture()) handleDynamicMapChange();
  });
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
      changeSelectedVertexPosition(axis, parseInt(selectedPosRange.value), getModelReadOptions(image2D));
    });
    selectedPosValue.addEventListener('input', () => {
      changeSelectedVertexPosition(axis, parseInt(selectedPosValue.value), getModelReadOptions(image2D));
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
      handleRowOrColumnChanged();
    });
    vertexValueInput.addEventListener('input', () => {
      vertexRangeInput.value = vertexValueInput.value;
      handleRowOrColumnChanged();
    });
  });
  const vertexIndexRangeInput = document.getElementById('vertex-index-range');
  const vertexIndexValueInput = document.getElementById('vertex-index-value');
  vertexIndexValueInput.value = vertexIndexRangeInput.value;
  vertexIndexRangeInput.addEventListener('input', () => {
    vertexIndexValueInput.value = vertexIndexRangeInput.value;
    handleSelectedIndexChanged();
  });
  vertexIndexValueInput.addEventListener('input', () => {
    vertexIndexRangeInput.value = vertexIndexValueInput.value;
    handleSelectedIndexChanged();
  });
  
  document.getElementById('nurbs-degrees').addEventListener('input', () => {
    drawNurbsSurfaceMesh(nurbsControlVertices, getModelReadOptions(image2D));
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
  document.getElementById('show-point-cloud').addEventListener('change', handleShowControlVerticesChange);
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
    handleModelSelectorChange();
    const textureSelector = document.getElementById('texture-selector');
    Object.keys(files.textureNames).forEach(name => {
      const file = files.textureNames[name];
      const option = document.createElement('option');
      option.value = `images/textures/${file}`;
      option.innerText = name;
      if(defaultSkin === file) {
        option.selected = true;
      }
      textureSelector.appendChild(option);
    });
    if(textureSelector.value === '') {
      // build-in textures
      textureSelector.value = defaultSkin;
    }
    handleTextureSelectorChange();
  });
}
function bindRangeAndNumericInput(rangeId, numericId, callback) {
  const range = document.getElementById(rangeId);
  const numeric = document.getElementById(numericId);
  numeric.value = parseFloat(numeric.value).toFixed(2);
  range.value = parseFloat(numeric.value).toFixed(2);
  const handler = debounce(callback, 100);
  range.addEventListener('input', () => {
    numeric.value = parseFloat(range.value).toFixed(2);
    handler();
  });
  numeric.addEventListener('input', () => {
    range.value = parseFloat(numeric.value).toFixed(2);
    handler();
  });
}
function bindRadianAndDegreeInput(radianId, degreeId, callback) {
  const radian = document.getElementById(radianId);
  const degree = document.getElementById(degreeId);
  degree.min = 0;
  degree.max = 359.95;
  degree.step = 0.05;
  radian.min = -Math.PI;
  radian.max = Math.PI;
  degree.value = parseFloat(degree.value).toFixed(2);
  radian.value = degreesToRadians(parseFloat(degree.value));
  const handler = debounce(callback, 100);
  radian.addEventListener('input', () => {
    const value = radiansToDegrees(parseFloat(radian.value));
    degree.value = (Math.floor(value * 20) / 20).toFixed(2);
    handler();
  });
  degree.addEventListener('input', () => {
    radian.value = degreesToRadians(parseFloat(degree.value));
    handler();
  });
}
function debounce(callback, delay) {
  let timeoutId;
  return function(...args) {
    const context = this;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => callback.apply(context, args), delay);
  }
}
function throttle(callback, delay) {
  let lastExecutionTime = 0;
  let timeoutId;
  return function(...args) {
    const context = this;
    const currentTime = Date.now();
    const elapsedTime = currentTime - lastExecutionTime;
    if(!lastExecutionTime || elapsedTime >= delay) {
      callback.apply(context, args);
      lastExecutionTime = currentTime;
    } else {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        callback.apply(context, args);
        lastExecutionTime = currentTime;
      }, delay - elapsedTime);
    }
  }
}
function changeSelectedVertexPosition(axis, value, options) {
  // update UI input
  document.getElementById(`selected-pos-${axis}-range`).value = value;
  document.getElementById(`selected-pos-${axis}-value`).value = value;

  const byteVector = {
    x: parseInt(document.getElementById('selected-pos-x-value').value),
    y: parseInt(document.getElementById('selected-pos-y-value').value),
    z: parseInt(document.getElementById('selected-pos-z-value').value)
  }

  // update model data
  const index = getSelectedIndex(options);
  const pixel = bytePositionAsPixelRgb(byteVector.x, byteVector.y, byteVector.z);
  if(rgbAreEqual(pixels[index], pixel)) {
    // Nothing changed
    console.log('Selected data not changed');
    return;
  };
  pixels[index] = pixel;

  // update vertex data
  const snappedVertex = rgbAsVertexAndColor(pixel);
  nurbsControlVertices[index] = snappedVertex;

  // update model data image
  const { x, y } = indexOfImageDataToImageXy(index, options);
  updateModelDataPixel(x, y, pixel.r, pixel.g, pixel.b);

  updateVertexModelsPositionAndColor(index, snappedVertex, pixel);

  // update model
  buildModel(nurbsControlVertices, options);
  // update wireframe
  buildWireframeObject(nurbsControlVertices, options);
  // update nurbs surface
  drawNurbsSurfaceMesh(nurbsControlVertices);

  // Dynamic texutres need to be updated
  if(isDynamicTexture()) {
    handleDynamicMapChange();
  }

  displayNewlySelectedVertex(options);
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
  const options = getModelReadOptions(image2D);

  // is already centered?
  if("xyz".split('').every(axis => 
    Math.abs(center[axis]) < epsilon
  )) return;

  modelPosition.copy(center);
  applyToModels((object) => {
    object.position.copy(center);
  });
  saveVerticesPositionsToModelData(options);
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
    pointCloudObject,
    selectedVerticesObject,
    nurbsObject
  ].forEach(callback);
}
function scaleModelToBoundingVolume() {
  const options = getModelReadOptions(image2D);
  // need to 'rebake' verticies to get the bounding box to scale in the correct directions
  saveVerticesPositionsToModelData(options);
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
  
    saveVerticesPositionsToModelData(options);
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
function overwriteUnusedPixelsWithContext(source, targetCtx, options) {
  const width = options.width;
  const height = options.height;
  for(let x = 0; x < width; x++) {
    for(let y = 0; y < height; y++) {
      const isUsed = imageXyIsImageData(x, y, options);
      if(isUsed) continue;
      const [r, g, b] = getPixelColorFromImageOfData(x, y, source);
      setPixelColorOnImageOfData(x, y, r, g, b, targetCtx);
    }
  }
}
function updateModelDataPixel(x, y, r, g, b, targetCtx = getModelCanvasContext(), options = getModelReadOptions(image2D)) {
  const canRead = imageXyIsImageData(x, y, options);
  if(!canRead) {
    // console.log('Pixel %sx%s is not a vector.', x, y); xxx
    return;
  }
  const drawBlocks = document.querySelector('input[name="unused-pixels"]:checked').value === 'blocks';
  if(drawBlocks) {
    drawBlock(x, y, {r, g, b}, targetCtx, options);
  } else {
    setPixelColorOnImageOfData(x, y, r, g, b, targetCtx);
  }
}
function drawBlock(x, y, rgb, ctx, options) {
  const blockWidth = Math.pow(2, options.hDown + 1);
  const blockHeight = Math.pow(2, options.vDown + 1);
  for(let h = 0; h < blockWidth; h++) {
    for(let v = 0; v < blockHeight; v++) {
      setPixelColorOnImageOfData(x + h, y + v, rgb.r, rgb.g, rgb.b, ctx);
    }
  }
}
function updateModelDataUnusedPixels(targetCtx, options) {
  if(options === undefined) return;
  const width = options.width;
  const height = options.height;
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
    case 'texture':
      ctx.drawImage(textureImage, 0, 0, textureImage.width, textureImage.height, 0, 0, width, height);
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
  overwriteUnusedPixelsWithContext(ctx, targetCtx, options);
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
      const isUsed = imageXyIsImageData(x, y, getModelReadOptions(image2D));
      if(!isUsed) continue;
      const [r, g, b] = getPixelColorFromImageOfData(x, y, source);
      updateModelDataPixel(x, y, r, g, b);
    }
  }
}
function applyVectorsToModelDataImage(targetCtx, options) {
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
    const point = indexOfImageDataToImageXy(i, options);
    updateModelDataPixel(point.x, point.y, rgb.r, rgb.g, rgb.b, targetCtx, options);
  });
}
function getModelName() {
  const selector = document.getElementById('image-selector');
  return selector.options[selector.selectedIndex].innerText;
}
let currentName;
function modelNameChanged() {
  const name = getModelName();
  if(name !== currentName) {
    currentName = name;
    return true;
  }
  return false;
}
function getModelReadOptions(size = image2D) {
  const width = size.width;
  const height = size.height;
  if(width <= 0 || height <= 0) {
    throw "Width or Height cannot be zero!";
  }
  const segments = downsampleSegments(width, height);
  const mapping = {...MAPPING_TYPE[DEFAULT_MAPPING_TYPE]};
  if(width < 32) {
    // prim oven images are 16 x 256
    // hard code these for now...
    mapping.x = 8;
    mapping.y = 129;
    mapping.dataCount = (8 * 127) + 2;
    mapping.vectorCount = 9 * 129;
  } else if(width === 32) {
    // prim oven image is 32x512 for Overlook3b
    // hard code these for now...
    mapping.x = 16;
    mapping.y = 65;
    mapping.dataCount = (16 * 63) + 2;
    mapping.vectorCount = 17 * 65;
  } else if(width === 128 && height === 32) {
    // pie (creame)
    // not sure where this one came from...
    mapping.x = 64;
    mapping.y = 17;
    mapping.dataCount = (64 * 15) + 2;
    mapping.vectorCount = 65 * 17;

  }

  const options = {
    width,
    height,
    hDown: segments.horizontalDownsample,
    vDown: segments.verticalDownsample,
    rows: segments.vertical,
    columns: segments.horizontal,
    mapping
  };
  options.minY = indexOfImageDataToImageXy(0, options).y;
  options.minX = indexOfImageDataToImageXy(rowColumnToIndexOfVertex(1, 0, options), options).x;
  options.maxX = indexOfImageDataToImageXy(rowColumnToIndexOfVertex(2, 0, options)-1, options).x;
  options.maxY = indexOfImageDataToImageXy(mapping.dataCount-1, options).y;

  // Check that top pole is applied
  if(modelNameChanged()) {
    const rc = indexOfImageDataToRowAndColumn(1, options);
    if(!(rc.row === 1 && rc.column === 0)) {
      console.log(getModelName(),JSON.parse(JSON.stringify(options)));
      console.error('Expected index 1 to be Row 1, Column 0 but got Row %s Column %s', rc.row, rc.column);  
    }
  }

  return options;
}
const clone = o => JSON.parse(JSON.stringify(o));

function updateVerticyPositions() {
  const options = getModelReadOptions(image2D);
  updateModelDataUnusedPixels(
    getModelCanvasContext(),
    options
  );
  applyVectorsToModelDataImage(
    getModelCanvasContext(),
    options
  );
  // rebuild models
  image2D.src = canvas2D.toDataURL();

  // reset scale/position/rotation
  modelScale.set(1, 1, 1);
  modelRotation.set(0, 0, 0);
  modelPosition.set(0, 0, 0);
  saveVerticesPositionsToModelData(options);
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
function saveVerticesPositionsToModelData(options) {
  if(!selectedVerticesObject) return;
  if(!pointCloudObject) return;
  let changed = false;
  selectedVerticesObject.children.forEach((object) => {
    const { index } = object.userData;
    // grab world coordinates of vertex
    const vertex = object.getWorldPosition(WORLD_POSITION);
    // translate to byte values
    const byteVertex = "xyz".split('').reduce((v, axis) => ({ ... v, 
      [axis]: mapControlVectorValueAsByte(vertex[axis])
    }), {});
    const rgb = bytePositionAsPixelRgb(byteVertex.x, byteVertex.y, byteVertex.z);
    const snappedVertex = rgbAsVertexAndColor(rgb);

    if(rgb.r === pixels[index].r &&
      rgb.g === pixels[index].g &&
      rgb.b === pixels[index].b) {
      // Nothing changed
      return;
    }
    changed = true;

    // update model data
    pixels[index] = rgb;

    if(index === getSelectedIndex(options)) {
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
    const { x, y } = indexOfImageDataToImageXy(index, options);
    updateModelDataPixel(x, y, rgb.r, rgb.g, rgb.b);

    // update vertex models
    updateVertexModelsPositionAndColor(index, snappedVertex, rgb);
  
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
  buildModel(nurbsControlVertices, options);
  // update wireframe
  buildWireframeObject(nurbsControlVertices, options);
  // update nurbs surface
  drawNurbsSurfaceMesh(nurbsControlVertices, options);
}
function updateVertexModelsPositionAndColor(index, {x,y,z}, rgb) {
  [
    pointCloudObject.children[index],
    selectedVerticesObject.children[index]
  ].forEach(object => {
    object.position.set(x, y, z);
    object.material.color = rgbAsColor(rgb);
    object.material.needsUpdate = true;
  });
};
function getPositionAsBytes() {
  const x = parseInt(document.getElementById('selected-pos-x-value').value);
  const y = parseInt(document.getElementById('selected-pos-y-value').value);
  const z = parseInt(document.getElementById('selected-pos-z-value').value);
  return { x, y, z };
}
function updateModelVertexPosition(options) {
  const pos = getPositionAsBytes();
  const rgb = bytePositionAsPixelRgb(pos.x, pos.y, pos.z);

  const i = getSelectedIndex(options);
  const point = indexOfImageDataToImageXy(i, options);

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = image2D.width;
  tempCanvas.height = image2D.height;
  const tempCtx = tempCanvas.getContext('2d', {willReadFrequently: true});
  tempCtx.drawImage(image2D, 0, 0);

  // Update the pixel data
  setPixelColorOnImageOfData(point.x, point.y, rgb.r, rgb.g, rgb.b, tempCtx);

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
  const options = getModelReadOptions(image2D);
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
    const index = getVertexByUvMapping(x, y, options);
    setSelectedIndexOfVertex(index);
  });
  if(!intersected) {
    raycaster.intersectObjects(pointCloudObject.children).forEach(intersects => {
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
  handleSelectedIndexChanged();
}

function handleRowOrColumnChanged() {
  const options = getModelReadOptions(image2D);
  const i = rowColumnToIndexOfVertex(
    parseInt(document.getElementById('vertex-row-range').value),
    parseInt(document.getElementById('vertex-column-range').value),
    options
  );
  setSelectedIndexOfVertex(i);
}
function getVertexByUvMapping(u, v, options) {
  let column = u * options.columns + 1;
  let row = (1 - v) * options.rows + 1;

  column = Math.floor(column - 0.5);
  row = Math.floor(row - 0.5);
  return rowColumnToIndexOfVertex(row, column, options);
}
function handleSelectedIndexChanged() {
  const options = getModelReadOptions(image2D);
  const i = parseInt(document.getElementById('vertex-index-range').value);
  const { row, column } = indexOfImageDataToRowAndColumn(i, options);
  document.getElementById('vertex-row-range').value = row;
  document.getElementById('vertex-column-range').value = column;
  document.getElementById('vertex-row-value').value = row;
  document.getElementById('vertex-column-value').value = column;
  displayNewlySelectedVertex(options)
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
function handleModelImageClicked(event) {
  const options = getModelReadOptions(image2D);
  let {x, y} = translatePointerCoordinates(event, canvas2D, image2D);
  const index = imageXyToClosestIndexOfImageData(x, y, options);
  setSelectedIndexOfVertex(index);
}
function pixelIndexAsHexArray(index) {
  return "rgb".split('').map(channel => pixels[index][channel].toString(16).padStart(2, '0'));
}
function displayNewlySelectedVertex(options) {
  const i = getSelectedIndex(options);
  const hexArray = pixelIndexAsHexArray(i);
  "rgb".split('').forEach((channel, idx) => {
    document.getElementById(`model-data-${channel}`).innerText = hexArray[idx];
  });
  document.getElementById('vertex-color').style.backgroundColor = '#' + hexArray.join('');

  displayVertexPosition(options)
  drawModelCanvas();
}
function getSelectedIndex(options) {
  return rowColumnToIndexOfVertex(
    parseInt(document.getElementById('vertex-row-range').value),
    parseInt(document.getElementById('vertex-column-range').value),
    options
  );
}
function displayVertexPosition(options) {
  const i = getSelectedIndex(options);
  const rgb = pixels[i];
  const x = axisValueOfRgb(rgb, 'x');
  const y = axisValueOfRgb(rgb, 'y');
  const z = axisValueOfRgb(rgb, 'z');
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
  const options = getModelReadOptions(image2D);
  updateModelDataUnusedPixels(
    getModelCanvasContext(),
    options
  );
  applyVectorsToModelDataImage(
    getModelCanvasContext(),
    options
  );
  highlightVertex(options);
}
function highlightVertex(options) {
  if(!pixels) return;
  const index = rowColumnToIndexOfVertex(
    parseInt(document.getElementById('vertex-row-range').value),
    parseInt(document.getElementById('vertex-column-range').value),
    options
  );

  // 2D selection
  highlightSelectedVertexOnImageOfData();

  // 3D selection
  selectedVerticesObject.children.forEach(mesh => {
    mesh.visible = mesh.userData.index === index;
  });
  
}
function highlightSelectedVertexOnImageOfData(options = getModelReadOptions(image2D)) {//hhh
  const row = parseInt(document.getElementById('vertex-row-range').value);
  const column = parseInt(document.getElementById('vertex-column-range').value);

  const index = rowColumnToIndexOfVertex(
    row,
    column,
    options
  );
  if(isNaN(index) || index > options.mapping.dataCount) {
    console.error('unable to highlight row %s column %s - index %s out of range 0 - %s',
      row,
      column,
      index,
      options.mapping.dataCount
    );
    return;
  }
  const rgb = pixels[index];
  const isBlackBg = document.querySelector('input[name="unused-pixels"]:checked').value === 'black';
  const outlineColor = isBlackBg ? 'white' : getContrastingColor(rgb);

  const { x, y } = indexOfImageDataToImageXy(index, options);
  const canRead = imageXyIsImageData(x, y, options);
  if(!canRead) {
    console.log('About to update a pixel that should not be updated');
  }
  //const {row, column} = indexOfImageDataToRowAndColumn(index);
  const vIndex = rowColumnToIndexOfVertex(row, column, options);
  if(vIndex !== index) {
    console.log('Data index %s does not map to row %s Column %s index %s', index, row, column, vIndex);
  }

  document.getElementById('selected-pixel-xy').innerText = `${x}x${y}`;
  document.getElementById('selected-pixel-color').innerText = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;

  const value = outlineColor === 'black' ? 0 : 255;
  for(let xx = x - 1; xx <= x + 1; xx++) {
    for(let yy = y - 1; yy <= y + 1; yy++) {
      if(xx === x && yy === y) continue;
      setPixelColorOnImageOfData(xx, yy, value, value, value);
    }
  }
}
function getAllPixelColorsFromImageOfData(ctx, width, height) {
  return ctx.getImageData(0, 0, width, height).data;
}
function getPixelColorFromImageOfData(x, y, ctx = getModelCanvasContext()) {
  const imageData = ctx.getImageData(x, y, 1, 1);
  return [
    imageData.data[0],
    imageData.data[1],
    imageData.data[2]
  ];
}
function setPixelColorOnImageOfData(x, y, r, g, b, ctx = getModelCanvasContext()) {
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
function getContrastingColor(rgb) {
  if(!rgb) {
    console.error('Color not provided.');
    return 'black';
  }
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
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
const dynamicMapPattern = /dynamic-model-(.*)$/
function handleTextureSelectorChange() {
  const textureUrl = selectedTexture();
  skin?.dispose();
  if(textureUrl === '') {
    removeTexture(nurbsObject, modelObject);
  } else if(isDynamicTexture()) {
    handleDynamicMapChange();    
  } else if(alignmentMapPattern.test(textureUrl)) {
    const size = parseInt(textureUrl.match(alignmentMapPattern)[1]);
    loadAlignmentMap(size);
  } else {
    loadTexture(textureUrl);
  }
}
function selectedTexture() {
  return document.getElementById('texture-selector').value;
}
function dynamicColorScheme() {
  const scheme = document.getElementById('dynamic-colors').value;
  switch(scheme) {
    case 'grey-scale':
      return [0x000000, 0x808080, 0x808080, 0x808080, 0xFFFFFF];
    case 'heat':
      return [0xFF0000, 0xFFA500, 0xFFA500, 0xFFFF00];
    case 'magma':
      return [0x000004, 0x140B4D, 0x3B0F70, 0x641A80, 0x8C2981, 0xB73779, 0xDE4968, 0xF7705C, 0xFE9F6D, 0xFECEA4, 0xFCFDBF];
    case 'rainbow':
      return [0xFF0000, 0x00FF00, 0xFFFF00, 0x00FF00, 0x00FFFF, 0x00FF00, 0x0000FF]
    case 'red-white-blue':
      return [0xFF0000, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0x0000FF];
    case 'rgb':
      return [0xFF0000, 0x00FF00, 0x00FF00, 0x00FF00, 0x0000FF]
    default:
      return [0x000000, 0xFFFFFF];
  }
}
function dynamicTextureName() {
  if(!isDynamicTexture()) return;
  return selectedTexture().match(dynamicMapPattern)[1];
}
function isDynamicTexture() {
  return dynamicMapPattern.test(selectedTexture());
}
function createDynamicModelVertexTexture() {
  const options = getModelReadOptions({width: 256, height: 256})

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});

  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for(let i = 0; i < options.mapping.dataCount; i++) {
    const {x, y} = indexOfImageDataToImageXy(i, options);
    drawBlock(x, y, pixels[i], ctx, options);
  }
  return canvas.toDataURL();
}
function drawTransparencyBackground(ctx, {width, height}) {
  const cellSize = Math.min(width, height) / 256;
  const xCells = width / cellSize;
  const yCells = height / cellSize;
  const color1 = 'rgba(255, 255, 255, 1)';
  const color2 = 'rgba(191, 191, 191, 1)';
  for(let x = 0; x < xCells; x++) {
    for(let y = 0; y < yCells; y++) {
      ctx.fillStyle = ((x+y) % 2 === 0) ? color1 : color2
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }  
}
function prepareForDynamicTexture() {
  const canvas = document.createElement('canvas');
  canvas.height = canvas.width = 256;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});

  drawTransparencyBackground(ctx, canvas);

  const options = getModelReadOptions(image2D);
  const targetOptions = getModelReadOptions(canvas);
  const vectors = pixels.map(rgbAsVector);
  const trianglePositionIndexes = getIndexesOfTriangleVectorIndexes(options);
  const trianglePositionXy = getTextureMapCoordinatesForTriangles(targetOptions);
  // group triangle vectors and original x/y coordinates
  const triangles = [];
  const trianglesXy = [];
  for(let i = 0; i < trianglePositionIndexes.length; i+= 3) {
    const index1 = trianglePositionIndexes[i];
    const index2 = trianglePositionIndexes[i + 1];
    const index3 = trianglePositionIndexes[i + 2];

    if(index1 === index2 || index1 === index3 || index2 === index3) {
      // no area
      continue;
    }

    const vector1 = vectors[index1];
    const vector2 = vectors[index2];
    const vector3 = vectors[index3];
    if(
      vectorsAreEqual(vector1, vector2) ||
      vectorsAreEqual(vector1, vector3) ||
      vectorsAreEqual(vector2, vector3)
    ) {
      // no area
      continue;
    }

    triangles.push([
      vector1,
      vector2,
      vector3
    ]);
    trianglesXy.push(
      trianglePositionXy[i / 3]
    )
  }
  return {
    canvas,
    ctx,
    triangles,
    trianglesXy
  }
}
function hslToRgbHex(hue, saturation, luminance) {
  // normalize values
  hue /= 360;
  saturation /= 100;
  luminance /= 100;
  // edge of luminance is black & white
  if(luminance === 0) return HEX_BLACK;
  if(luminance === 1) return HEX_WHITE;
  if(saturation === 0) {
    const gray = Math.floor(luminance * 255);
    return rgbAsHex(gray, gray, gray);
  }
  const upper = luminance < 0.5 ? 
    luminance * (1 + saturation) : 
    luminance + saturation - luminance * saturation;
  const lower = 2 * luminance - upper;
  function channelIntensity(min, max, hueOffset) {
    hueOffset = (hueOffset + 1) % 1;
    let value = min;
    if (hueOffset < 1 / 6) value = min + (max - min) * 6 * hueOffset;
    else if (hueOffset < 1 / 2) value = max;
    else if (hueOffset < 2 / 3) value = min + (max - min) * (2 / 3 - hueOffset) * 6;
    return Math.round(value * 255);
  }
  return rgbAsHex(
    channelIntensity(lower, upper, hue + 1 / 3),
    channelIntensity(lower, upper, hue),
    channelIntensity(lower, upper, hue - 1 / 3)
  );
}
function calculateVerticalAngle(v1, v2, v3) {
  const normal = new THREE.Vector3().crossVectors(
    new THREE.Vector3().subVectors(v2, v1),
    new THREE.Vector3().subVectors(v3, v1)
  ).normalize();
  const angleRadians = Math.acos(normal.dot(new THREE.Vector3(0, 1, 0)));
  const value = (angleRadians / Math.PI) * 180;
  return 180 - value;
}
function calculateHorizontalAngle(v1, v2, v3) {
  const normal = new THREE.Vector3().crossVectors(
    new THREE.Vector3().subVectors(v2, v1),
    new THREE.Vector3().subVectors(v3, v1)
  ).normalize();
  const horizontalNormal = new THREE.Vector3(normal.x, 0, normal.z).normalize();
  const angleRadians = Math.atan2(horizontalNormal.x, horizontalNormal.z);
  let angleDegrees = THREE.MathUtils.radToDeg(angleRadians);
  if(angleDegrees < 0) angleDegrees += 360;
  return angleDegrees;
}
function createDynamicModelFaceAngleTexture() {
  const {
    canvas,
    ctx,
    triangles,
    trianglesXy
  } = prepareForDynamicTexture();
  const colors = [];
  for(let i = 0; i < triangles.length; i++) {
    const [vector1, vector2, vector3] = triangles[i];
    const horizontalAngle = calculateHorizontalAngle(vector1, vector2, vector3);
    const verticalAngle = calculateVerticalAngle(vector1, vector2, vector3);
    const hue = Math.floor(horizontalAngle);
    const luminance = Math.floor(100 * (verticalAngle / 180));
    colors.push(hslToRgbHex(hue, 100, luminance));
  };

  // draw triangles
  ctx.strokeStyle = 'black';
  ctx.lineWidth = canvas.width / 1024;
  for(let i = 0; i < trianglesXy.length; i++) {
    const [xy1, xy2, xy3] = trianglesXy[i];
    ctx.beginPath();
    ctx.moveTo(xy1.x, xy1.y);
    ctx.lineTo(xy2.x, xy2.y);
    ctx.lineTo(xy3.x, xy3.y);
    ctx.lineTo(xy1.x, xy1.y);
    ctx.closePath();
    ctx.fillStyle = colors[i];
    ctx.fill();
    ctx.stroke();
  }
  return canvas.toDataURL();
}
function createDynamicModelDistanceTexture() {
  const {
    canvas,
    ctx,
    triangles,
    trianglesXy
  } = prepareForDynamicTexture();
  const center = new THREE.Vector3(0, 0, 0);

  // calculate distance to center from each triangle
  const distances = [];
  for(let i = 0; i < triangles.length; i++) {
    const [vector1, vector2, vector3] = triangles[i];
    const distance = new THREE.Vector3(
      (vector1.x + vector2.x + vector3.x) / 3,
      (vector1.y + vector2.y + vector3.y) / 3,
      (vector1.z + vector2.z + vector3.z) / 3,
    ).distanceTo(center);
    distances.push(distance);
  };

  // get min/max/median
  const sorted = distances.slice().sort((a, b) => a-b);
  let min = sorted[0];
  if(min === 0) min = sorted[1];
  const max = sorted[sorted.length -1];

  const colors = dynamicColorScheme();
  const medianCount = Math.max(1, colors.length - 1);
  const medians = [];
  const segmentSize = distances.length / (medianCount + 1);
  for(let i = 0; i < medianCount; i++) {
    const segmentIndex = Math.floor((i + 1) * segmentSize);
    medians[i] = sorted[segmentIndex];
  }

  // draw triangles
  ctx.strokeStyle = 'black';
  ctx.lineWidth = canvas.width / 1024;
  for(let i = 0; i < trianglesXy.length; i++) {
    const [xy1, xy2, xy3] = trianglesXy[i];
    const distance = distances[i];
    const weight = getWeight(distance, {min, max, medians});
    const color = intColorAsHex(getWeightedIntColor(weight, colors));
    ctx.beginPath();
    ctx.moveTo(xy1.x, xy1.y);
    ctx.lineTo(xy2.x, xy2.y);
    ctx.lineTo(xy3.x, xy3.y);
    ctx.lineTo(xy1.x, xy1.y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.stroke();
  }
  return canvas.toDataURL();
}
function createDynamicModelDensityTexture() {
  const {
    canvas,
    ctx,
    triangles,
    trianglesXy
  } = prepareForDynamicTexture();

  // calculate area of each triangle
  const areas = [];
  for(let i = 0; i < triangles.length; i++) {
    const [vector1, vector2, vector3] = triangles[i];
    const edge1 = new THREE.Vector3().copy(vector2).sub(vector1);
    const edge2 = new THREE.Vector3().copy(vector3).sub(vector1);
    const crossProduct = new THREE.Vector3().crossVectors(edge1, edge2);
    areas.push(0.5 * crossProduct.length());    
  };

  // get min/max/median
  const sortedAreas = areas.slice().sort((a, b) => a-b);
  let min = sortedAreas[0];
  if(min === 0) min = sortedAreas[1];
  const max = sortedAreas[sortedAreas.length -1];

  const colors = dynamicColorScheme();
  const medianCount = Math.max(1, colors.length - 1);
  const medians = [];
  const areaSize = areas.length / (medianCount + 1);
  for(let i = 0; i < medianCount; i++) {
    const areaIndex = Math.floor((i + 1) * areaSize);
    medians[i] = sortedAreas[areaIndex];
  }

  // draw triangles
  ctx.strokeStyle = 'black';
  ctx.lineWidth = canvas.width / 1024;
  for(let i = 0; i < trianglesXy.length; i++) {
    const [xy1, xy2, xy3] = trianglesXy[i];
    const area = areas[i];
    const weight = getWeight(area, {min, max, medians});
    const color = intColorAsHex(getWeightedIntColor(weight, colors));
    ctx.beginPath();
    ctx.moveTo(xy1.x, xy1.y);
    ctx.lineTo(xy2.x, xy2.y);
    ctx.lineTo(xy3.x, xy3.y);
    ctx.lineTo(xy1.x, xy1.y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.stroke();
  }
  return canvas.toDataURL();
}
function vectorsAreEqual(vector1, vector2) {
  return vector1.x === vector2.x &&
    vector1.y === vector2.y &&
    vector1.z === vector2.z;
}
function rgbAreEqual(rgb1, rgb2) {
  return rgb1.r === rgb2.r &&
    rgb1.g === rgb2.g &&
    rgb1.b === rgb2.b;
}
function getWeightedIntColor(weight, colors) {
  const count = colors.length;
  if(weight <= 0) return colors[0];
  if(weight >= 1) return colors[count - 1];
  const segmentSize = 1 / (count - 1);
  const index = Math.floor(weight * (count - 1));
  const fromColor = colors[index];
  const toColor = colors[Math.min(index+1, count - 1)];
  const offset = segmentSize * index;
  const delta = weight - offset;
  const percent = delta / segmentSize;
  return intColorBetween(fromColor, toColor, percent);
}
function rgbAsHex(r, g, b) {
  return "#" + ((1 << 24) + rgbAsLong(r, g, b)).toString(16).slice(1);
}
function intColorAsHex(color) {
  return '#' + Math.min(Math.max(color, 0x000000), 0xFFFFFF).toString(16).padStart(6, '0');
}
function rgbAsLong(r, g, b) {
  return (r << 16) | (g << 8) | b;
}
function intColorBetween(color1, color2, percent) {
  const rgb1 = rgbIntToRgb(color1);
  const rgb2 = rgbIntToRgb(color2);
  const r = intValueBetween(rgb1.r, rgb2.r, percent);
  const g = intValueBetween(rgb1.g, rgb2.g, percent);
  const b = intValueBetween(rgb1.b, rgb2.b, percent);
  return rgbAsLong(r, g, b);
}
function intValueBetween(start, end, percent) {
  return Math.floor(start + (end - start) * percent);
}
function rgbIntToRgb(color) {
  return {
    r: (color >> 16) & 0xFF,
    g: (color >> 8) & 0xFF,
    b: color & 0xFF
  };
}
function getWeight(value, {min, max, medians}) {
  if(value <= min) return 0;
  if(value >= max) return 1;
  const SEGMENT_SIZE = 1 / (medians.length + 1);
  for(let i = 0; i <= medians.length; i++) {
    const median = i === medians.length ? max : medians[i];
    if(value <= median) {
      const minValue = i === 0 ? min : medians[i-1];
      const range = median - minValue;
      const v = value - minValue;
      return ((v/range) * SEGMENT_SIZE) + (SEGMENT_SIZE * i);
    }
  }
  return 1;
}

function scaleCoordinateWithOffsets(xy, source, target) {
  return {
    x: ((xy.x - source.minX) / (source.maxX - source.minX)) * target.width,
    y: ((xy.y - source.minY) / (source.maxY - source.minY)) * target.height,
  };  
}

let applyDynamicMapId;
function applyDynamicMap() {
  if(!isDynamicTexture()) return;
  const name = dynamicTextureName();
  if(applyDynamicMapId) {
    window.clearTimeout(applyDynamicMapId);
    applyDynamicMapId = undefined;
  }
  if(!pixels) {
    // race condition, or not loaded
    applyDynamicMapId = window.setTimeout(applyDynamicMap, 500);
    return;
  }

  let dataURL;
  switch(name) {
    case 'vertex':
      dataURL = createDynamicModelVertexTexture();
      break;
    case 'density':
      dataURL = createDynamicModelDensityTexture();
      break;
    case 'distance':
      dataURL = createDynamicModelDistanceTexture();
      break;
    case 'face-angle':
      dataURL = createDynamicModelFaceAngleTexture();
      break;
    default:
      dataURL = canvas2D.toDataURL();
  }
  textureImage.src = dataURL;
}
const handleDynamicMapChange = debounce(applyDynamicMap, 250);
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
  textureImage.src = dataURL;
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
function isModelLoaded() {
  return image2D && image2D.width !== 0 && image2D.height !== 0;
}
function loadTexture(textureUrl) {  
  textureImage.src = textureUrl;
}
let textureLoadedTimeoutId;
function handleTextureLoaded() {
  if(textureLoadedTimeoutId) window.clearTimeout(textureLoadedTimeoutId);
  if(!isModelLoaded()) {
    window.setTimeout(handleTextureLoaded, 50);
    return;
  }
  drawTexturePreview(getModelReadOptions(image2D));
  applyTextureToObjects();

}
function drawTexturePreview(options) {
  updateModelDataUnusedPixels(
    getModelCanvasContext(),
    options
  );
  const texturePreview = document.getElementById('texture-preview');
  texturePreview.width = textureImage.width;
  texturePreview.height = textureImage.height;
  const ctx = texturePreview.getContext('2d');
  ctx.clearRect(0, 0, texturePreview.width, texturePreview.height);
  ctx.drawImage(textureImage, 0, 0, texturePreview.width, texturePreview.height);
}
function handleTextureOpacityChange() {
  const opacity = parseFloat(document.getElementById('texture-opacity').value);
  [nurbsObject, modelObject].forEach(object => {
    if(object) {
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

function changeTextureOrientation() {
  const rotation = parseFloat(document.getElementById('texture-rotation').value);
  const flipX = document.getElementById('texture-flip-h').checked;
  const flipY = document.getElementById('texture-flip-v').checked;
  const repeatY = parseFloat(document.getElementById('texture-vertical-repeat').value)
  const repeatX = parseFloat(document.getElementById('texture-horizontal-repeat').value);
  const offsetX =  parseFloat(document.getElementById('texture-horizontal-offset').value);
  const offsetY =  parseFloat(document.getElementById('texture-vertical-offset').value);
  skin.rotation = rotation;
  skin.repeat.y = flipY ? repeatY * -1: repeatY;
  skin.repeat.x = flipX ? repeatX * -1: repeatX;
  skin.offset.x = offsetX;
  skin.offset.y = offsetY;
  skin.needsUpdate = true;
}
const handleTextureOrientation = debounce(changeTextureOrientation, 500);

function applyTextureToObjects() {
  const isEmissive = document.getElementById('show-texture-emissive').checked;
  const opacity = parseFloat(document.getElementById('texture-opacity').value);
  skin = new THREE.Texture(textureImage);
  skin.wrapS = THREE.RepeatWrapping;
  skin.wrapT = THREE.RepeatWrapping;
  skin.generateMipmaps = true;
  skin.minFilter = THREE.LinearMipmapLinearFilter;
  skin.maxFilter = THREE.LinearMipmapLinearFilter;
  handleTextureOrientation();
  skin.needsUpdate = true;
  [nurbsObject, modelObject].forEach(object => {
    if(object) {
      object.material.map = skin;
      object.material.emissive = new THREE.Color(isEmissive ? 0xffffff : 0x000000);
      object.material.emissiveMap = skin;
      object.material.transparent = true; // Always true to allow PNG alpha
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
function handleModelSelectorChange() {
  const imageSelector = document.getElementById('image-selector');
  loadModelData(imageSelector.value);
}
function loadModelData(url) {
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
  document.getElementById('save-image-width').value = image2D.width;
  document.getElementById('save-image-height').value = image2D.height;
  const ctx = getModelCanvasContext();
  ctx.drawImage(image2D, 0, 0);

  segments = downsampleSegments(image2D.width, image2D.height);
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

  let count = 0;
  let vectors = 'Coordinates of Vectors in image:<br>';
  let lastRow = '';
  const options = getModelReadOptions(image2D);
  let mismatchCount = 0;
  for(let y = 0; y < image2D.height; y++) {
    const xx = [];
    for(let x = 0; x < image2D.width; x++) {
      if(imageXyIsImageData(x, y, options)) {
        // console.log('loading %sx%s is valid - index %s', x, y, count);
        xx.push(x.toLocaleString());
        const rc = indexOfImageDataToRowAndColumn(count, options);
        const xy = indexOfImageDataToImageXy(count, options);
        if(xy.x !== x || xy.y !== y) {
          mismatchCount++;
          if(mismatchCount < 5) {
            console.log('mismatch %sx%s to %s (row: %s, col: %s) - got %sx%s', x, y, count, rc.row, rc.column, xy.x, xy.y);
          }
        }
        count++;
      }
    }
    if(xx.length !== 0) {
      let row = xx.join(', ');
      if(lastRow === row) {
        vectors += `Y ${y.toLocaleString()} X: same<br>`;
      } else {
        vectors += `Y ${y.toLocaleString()} X: ${xx.join(', ')}<br>`;
      }
      lastRow = row;
    }
  }
  if(count !== options.mapping.dataCount) {
    console.log('expected %s pieces of data - only got %s', options.mapping.dataCount, count);
  }

  document.getElementById('image-data-coordinates').innerHTML = count.toLocaleString() + ' ' + vectors;

  let grid = `Index 0 to ${options.mapping.dataCount-1} as Row/Columns:`;
  let row = 0;
  let lastColList = '';
  let cols = [];
  for(let i = 0; i < options.mapping.dataCount; i++) {
    const rc =   indexOfImageDataToRowAndColumn(i, options);
    const backToIndex = rowColumnToIndexOfVertex(rc.row, rc.column, options);
    if(i !== backToIndex) {
      console.log('Index %s (Row %s, Column %s) mismatch = %s',
        i, rc.row, rc.column, backToIndex
      );
    }
    if(rc.row !== row) {
      const colList = cols.join(', ');
      if(colList === lastColList) {
        grid += `<br>Row ${row}, Columns: same`;
      } else {
        grid += `<br>Row ${row}, Columns: ${colList}`;
      }
      lastColList = colList;
      cols = [];
      row = rc.row;
    }
    cols.push(rc.column.toLocaleString());
    
  }
  const colList = cols.join(', ');
  if(colList === lastColList) {
    grid += `<br>Row ${row}, Columns: same`;
  } else {
    grid += `<br>Row ${row}, Columns: ${colList}`;
  }

  document.getElementById('model-data-count').innerText = options.mapping.dataCount.toLocaleString() + ' === (isXyVertex: ' + count.toLocaleString() + ')';
  document.getElementById('model-data-vector-count').innerText = options.mapping.vectorCount.toLocaleString();

  document.getElementById('rows-and-columns').innerText = `${options.mapping.y}x${options.mapping.x}`;
  document.getElementById('rows-and-columns-data').innerHTML = grid;

  const imageData = getAllPixelColorsFromImageOfData(ctx, image2D.width, image2D.height);
  pixels = getPixelValuesFromModelData(imageData, options);
  nurbsControlVertices = pixels.map(rgbAsVertexAndColor);

  // Draw frame around selected pixel
  highlightSelectedVertexOnImageOfData();

  const vertexCount = nurbsControlVertices.length;
  const vertexIndexRangeInput = document.getElementById('vertex-index-range');
  const vertexIndexValueInput = document.getElementById('vertex-index-value');
  vertexIndexRangeInput.max = vertexCount - 1;
  vertexIndexValueInput.max = vertexCount - 1;
  drawObjects(nurbsControlVertices, options);

  // Dynamic texutres need to be updated
  if(isDynamicTexture()) {
    handleDynamicMapChange();
  }
}
function drawObjects(nurbsControlVertices, options) {
  buildModel(nurbsControlVertices, options);
  buildPointCloud(nurbsControlVertices);
  buildWireframeObject(nurbsControlVertices);
  drawNurbsSurfaceMesh(nurbsControlVertices, options);
  drawSelectionVertices(options);
  displayNewlySelectedVertex(options);
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
function rgbAsColor(rgb) {
  return new THREE.Color(rgbAsLong(rgb.r, rgb.g, rgb.b));
}
function bytePositionAsPixelRgb(x, y, z) {
  return { r: z, g: x, b: y };
}
function axisValueOfRgb(rgb, axis) { 
  const map = {
    x: 'g',
    y: 'b',
    z: 'r'
  };
  return rgb[map[axis]];
}
function rgbAsVector(rgb) {
  return new THREE.Vector3(
    mapByteToControlVectorValue(axisValueOfRgb(rgb, 'x')),
    mapByteToControlVectorValue(axisValueOfRgb(rgb, 'y')),
    mapByteToControlVectorValue(axisValueOfRgb(rgb, 'z'))    
  );
}
function rgbAsVertexAndColor(rgb) {
  const vector = rgbAsVector(rgb);
  return {
    color: rgbAsColor(rgb),
    vector,
    x: vector.x,
    y: vector.y,
    z: vector.z
  };
}
function rowColumnToTextureMapXy(row, column, options) {
  const powX =  Math.pow(2, options.hDown + 1);
  const powY = Math.pow(2, options.vDown + 1);
  let x = column * powX;
  let y = row * powY;
  if(row === options.rows) {
    y = getLastImageDataY(options);
  } else if(row !== 0) {
    y += -1;
  }
  return { x, y };  
}
function indexOfImageDataToImageXy(i, options) {
  const { row, column } = indexOfImageDataToRowAndColumn(i, options);
  return rowColumnToTextureMapXy(row, column, options);
}
function getLastImageDataY(options) {
  return options.height - 1;
}
function imageXyToClosestIndexOfImageData(x, y, options) {
  x = Math.floor(x);
  y = Math.floor(y);
  const column = Math.round((x / options.width) * options.columns);
  const row = Math.round((y / options.height) * options.rows);
  const index = rowColumnToIndexOfVertex(
    row,
    column,
    options
  );
  return index;
}
function imageXyIsImageData(x, y, options) {
  if(y === 0) return x === Math.floor(options.width / 2);
  const yMod = Math.pow(2, options.vDown + 1);
  const xMod = Math.pow(2, options.hDown + 1);
  const lastY = getLastImageDataY(options);
  if(y === lastY) {
    return x === Math.floor(options.width / 2);
  } else if(y > lastY) {
    return false;
  }
  y+=2;
  if(y % yMod !== 1) return false;
  if(x % xMod !== 0) return false;
  return true;
}
function indexOfImageDataToRowAndColumn(i, options) {
  if(i >= options.mapping.dataCount) {
    console.error('index %s out of range. Max %s', i, options.mapping.dataCount - 1);
    // return bottom pole
    return {
      row: options.rows - 1,
      column: Math.floor(options.columns / 2)
    };
  }
  if(i === 0) {
    // poles use center column
    i += Math.floor(options.columns / 2);
  } else if(i === options.mapping.dataCount -1) {
    // account for top pole with 1 column
    i += options.columns - 1;
    // bottom pole uses center column
    i += Math.floor(options.columns / 2);
  } else {
    // account for top pole with 1 column
    i += options.columns - 1;
  }
  const row = Math.floor(i / options.columns);
  let column = i % options.columns;
  return { row, column };
}
function downsampleSegments(width, height) {
  width /= 2;
  height /= 2;
  const segments = {
    horizontal: width,
    vertical: height,
    horizontalDownsample: 0,
    verticalDownsample: 0
  }
  while(segments.horizontal * segments.vertical > MAX_VERTECES) {
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
function getPixelValuesFromModelData(imageData, options = getModelReadOptions(image2D)) {
  const pixels = [];
  const PIXEL_SIZE = 4;
  for(let i = 0; i < options.mapping.dataCount; i++) {
    const { x, y } = indexOfImageDataToImageXy(i, options);
    const imageIndex = (x + (y * options.width)) * PIXEL_SIZE;
    pixels.push({
      r: imageData[imageIndex],
      g: imageData[imageIndex + 1],
      b: imageData[imageIndex + 2]
    });
  }
  return pixels;
}
function buildPointCloud(controlVertices) {
  removeObjectFromList(pointCloudObject);
  // const geometry = new THREE.BufferGeometry();
  // geometry.setAttribute('position', modelObject.geometry.getAttribute('position'));
  // const material = new THREE.PointsMaterial({ size: 0.04, color: 0xFF0000 });
  // pointCloudObject = new THREE.Points(geometry, material);
  // pointCloudObject.name = 'Point Cloud';
  pointCloudObject = new THREE.Object3D();
  pointCloudObject.name = 'Vertices';
  controlVertices.forEach(({ x, y, z, color}, index) => {
    // console.log(color);
    const geometry = new THREE.BoxGeometry( 0.01, 0.01, 0.01 );
    const material = new THREE.MeshBasicMaterial( { color } );
    const mesh = new THREE.Mesh( geometry, material );
    mesh.position.set(x, y, z);
    mesh.userData.index = index;
    pointCloudObject.add(mesh);
  });
  setTranslationToObject(pointCloudObject);
  scene.add( pointCloudObject );

  pointCloudObject.visible = document.getElementById('show-point-cloud').checked;
  addObjectToList(pointCloudObject);
}
function drawSelectionVertices(options) {  
  const vertices = pixels.map(rgbAsVertexAndColor);
  removeObjectFromList(selectedVerticesObject);
  const selectedIndex = parseInt(document.getElementById('vertex-index-range').value);
  const object = new THREE.Object3D();
  object.name = 'Vertices';
  vertices.forEach(({ x, y, z, color }, i) => {
    const {row, column} = indexOfImageDataToRowAndColumn(i, options);
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
function rowColumnToIndexOfVertex(row, column, options) {
  // handle poles
  if(row <= 0) return 0;
  if(row >= options.rows) return options.mapping.dataCount -1;
  
  // offset for top pole
  column;

  // stitch left/right
  column = column % options.columns + 1;

  return ((row - 1) * options.columns) + column;
}

function drawNurbsSurfaceMesh(controlVertices, options) {
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
      const index = rowColumnToIndexOfVertex(row, column, options);
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
    transparent: true,
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
function buildWireframeObject(vertices, options) {
  removeObjectFromList(wireframeObject);
  const controlMeshGeometry = createBufferGeometry(vertices, options);
  const controlMeshMaterial = new THREE.MeshStandardMaterial( { color: 0xFFFFFF, wireframe: true } );
  wireframeObject = new THREE.Mesh(controlMeshGeometry, controlMeshMaterial);
  wireframeObject.name = 'Wireframe';
  setTranslationToObject(wireframeObject);
  scene.add(wireframeObject);
  wireframeObject.visible = document.getElementById('show-control-mesh').checked;
  addObjectToList(wireframeObject);
}
function buildModel(controlVertices, options) {
  if(controlVertices.length !== options.mapping.dataCount) {
    console.error('Expected %s vertices, received %s',
      options.mapping.dataCount,
      controlVertices.length
    );
    return;
  }
  removeObjectFromList(modelObject);
  function getPoint(u, v, target) {
    let column = Math.floor(u * (options.columns));
    let row = Math.floor((1 - v) * (options.rows + 1));
    const index = rowColumnToIndexOfVertex(
      row,
      column, 
      options
    );
    if(index > options.mapping.dataCount) {
      console.error('Attempting to getPoint(u: %s, v: %s) for row %s col %s, but %s out of range (%s max)', 
        u.toFixed(2),
        v.toFixed(2),
        row,
        column,
        index,
        options.mapping.dataCount - 1
      );
      target.set(0, 0, 0);
    }
    const xyz = controlVertices[index];
    if(!xyz) {
      console.error('Control Vertices Index %s returned nothing', index, controlVertices)
    }
    target.set(xyz.x, xyz.y, xyz.z);
  }
  const geometry = new ParametricGeometry(getPoint, horizontalSegments, verticalSegments);
  geometry.computeVertexNormals();
  const isEmissive = document.getElementById('show-texture-emissive').checked;
  const opacity = parseFloat(document.getElementById('texture-opacity').value);
  const material = new THREE.MeshStandardMaterial({
    color: 'white',
    emissive: isEmissive ? 0xFFFFFF : 0x000000,
    transparent: true,
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
function createBufferGeometry(vertices, options = getModelReadOptions(image2D)) {
  const controlMeshGeometry = new THREE.BufferGeometry();
  const positions = createSphericalVertices(vertices, options.columns, options.rows);
  controlMeshGeometry.setAttribute('position', positions);
  const indexedTriangles = getIndexesOfTriangleVectorIndexes(options);
  controlMeshGeometry.setIndex(indexedTriangles);
  controlMeshGeometry.setDrawRange(0, indexedTriangles.length);
  controlMeshGeometry.computeVertexNormals();
  const uvs = createUvMappingForSphere(controlMeshGeometry.attributes.position.count, options.columns, options.rows);
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

function getIndexesOfTriangleVectorIndexes(options) {
  const {
    width,
    height,
    mapping: {
      x: columnCount, // 32
      y: rowCount // 33
    }
  } = options;
  var indexedTriangles = [];
  for(let column = 0; column < columnCount+1; column++) {
    for(let row = 0; row < rowCount; row++) {
      const centerIndex = rowColumnToIndexOfVertex(row, column, options);
      const bottomRightIndex = rowColumnToIndexOfVertex(row + 1, column + 1, options);
      const bottomIndex = rowColumnToIndexOfVertex(row + 1, column, options);
      const rightIndex = rowColumnToIndexOfVertex(row, column + 1, options);
      // Add triangles in counter-clockwise order
      if(row === 0) {
        // triangles at top pole
        indexedTriangles.push(centerIndex, bottomIndex, bottomRightIndex);
      } else if(row === options.rows - 1) {
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
function getTextureMapCoordinatesForTriangles({
  width,
  height,
  mapping: {
    x: columnCount, // 32
    y: rowCount // 33
  }
}) {
  var xyTriangles = [];
  const cellWidth = width / columnCount;
  const cellHeight = height / (rowCount - 1);
  for(let column = 0; column < columnCount+1; column++) {
    for(let row = 0; row < rowCount; row++) {
      const x = column * cellWidth;
      const y = row * cellHeight;
      const centerXy = {x, y};
      const bottomRightXy = {
        x: x + cellWidth,
        y: y + cellHeight
      };
      const bottomXy = {
        x,
        y: y + cellHeight
      };
      const rightXy = {
        x: x + cellWidth,
        y
      };
      // Add triangles in counter-clockwise order
      if(row === 0) {
        // triangles at top pole
        xyTriangles.push([
          centerXy,
          bottomXy,
          bottomRightXy
        ]);
      } else if(row === rowCount - 1) {
        // triangles at bottom pole
        xyTriangles.push([
          centerXy,
          bottomRightXy,
          rightXy
        ]);
      } else {
        // quads in the middle of poles
        xyTriangles.push([
          centerXy,
          bottomRightXy,
          rightXy
        ]);
        xyTriangles.push([
          centerXy,
          bottomXy,
          bottomRightXy
        ]);
      }
    }
  }
  return xyTriangles;
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
  pointCloudObject.visible = document.getElementById('show-point-cloud').checked;
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

function renderLiveSceneOnUnusedPixels() {
  updateModelDataUnusedPixels(
    getModelCanvasContext(),
    getModelReadOptions(image2D)
  );
}
const throttledRenderLiveSceneOnUnusedPixels = throttle(renderLiveSceneOnUnusedPixels, 100)
function render() {
  renderer.render( scene, camera );
  const unusedPixels = document.querySelector('input[name="unused-pixels"]:checked').value;
  if(unusedPixels === 'camera') {
    throttledRenderLiveSceneOnUnusedPixels();
  };
  stats.update();
}

function fileName(ext) {
  const imageSelector = document.getElementById('image-selector');
  const name = imageSelector.value
    .replace(/\.[^.]+$/i, '.') // remove ext
    .replace(/^.*\//, ''); // remove path
  let prefix = '';
  const showTime = document.getElementById('export-time').checked;
  const showDate = document.getElementById('export-date').checked;
  if(showDate || showTime) {
    prefix = dateAsLocalStamp(new Date(), showDate, showTime);
    prefix += ' ';
  }
  return sanitizeFileName(prefix + name + ext);
}
function dateAsLocalStamp(date, showDate, showTime) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  if(showDate) {
    if(showTime) {
      return `${year}-${month}-${day} ${hours}-${minutes}`;
    }
    return `${year}-${month}-${day}`;
  } else if(showTime) {
    return `${hours}-${minutes}`;
  }
  return '';
}
function sanitizeFileName(name) {
  return name.replace(/[\/\\:<>|"*?]/gi, '_');
}
function exportImage() {

  const width = parseInt(document.getElementById('save-image-width').value);
  const height = parseInt(document.getElementById('save-image-height').value);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, width, height);
  const options = getModelReadOptions({width, height})

  // redraw canvas without selected vertex
  updateModelDataUnusedPixels(ctx, options);
  applyVectorsToModelDataImage(ctx, options);

  downloadCanvasAsFile(fileName('png'), 'image/png', canvas);

  // display selected vertex
  highlightVertex(options);
}
function includeTextures() {
  return document.getElementById('export-texture').checked
}
function exportGltf(binary) {
  const gltfExporter = new GLTFExporter();
  const options = {
    includeTextures: includeTextures(),
    binary
  }
  function success(result) {
    if(result instanceof ArrayBuffer) {
      downloadBlobAsFile(fileName('glb'), 'model/gltf-binary', result);
    }
    else {
      const data = JSON.stringify(result, null, 2);
      downloadBlobAsFile(fileName('gltf'), 'model/gltf+json', data);
    }
  }
  function failed(error) {
    console.error('Failed to export GLTF', error);
  }
  gltfExporter.parse(modelObject, success, failed, options);
}
function exportObj() {
  const exporter = new OBJExporter();
  let data = exporter.parse(modelObject);

  // UV mapping
  const uvCoordinates = [];
  const uvArray = modelObject.geometry.attributes.uv.array;
  uvArray.forEach((uv, i) => {
    if(i % 2 === 0) {
      const u = uv.toFixed(6);
      const v = uvArray[i+1].toFixed(6);
      uvCoordinates.push(`vt ${u} ${v}`);
    }
  });
  data += "\n\n# UV Coordinates\n"
  data += uvCoordinates.join('\n');
  data += "\n";

  const textureFile = fileName('png');
  const materialFile = fileName('mtl');
  const objectFile = fileName('obj');

  if(includeTextures()) {
    data += "\n\n# Texture\n";
    data += `mtllib ${materialFile}\n`;
    data += `usemtl texture\n`;
    data += `map_Kd ${textureFile}\n`;
  }

  downloadBlobAsFile(objectFile, 'text/plain', data);

  if(includeTextures()) {
    downloadCanvasAsFile(
      textureFile,
      'image/png',
      document.getElementById('texture-preview')
    );

    let material = '';
    material += `newmtl texture\n`;
    material += `map_Kd ${textureFile}\n`;

    downloadBlobAsFile(
      materialFile,
      'text/plain',
      material
    );
  }
}
function exportStl() {
  const exporter = new STLExporter();
  const options = {
    binary: true
  };
  const data = exporter.parse(modelObject, options);
  downloadBlobAsFile(fileName('stl'), 'model/stl', data);
}
function downloadCanvasAsFile(fileName, contentType, canvas) {
  downloadUrlAsFile(fileName, canvas.toDataURL(contentType));
}
function downloadBlobAsFile(fileName, contentType, data) {
  const blob = new Blob([data], { type: contentType });
  const url = URL.createObjectURL(blob);
  downloadUrlAsFile(fileName, url);
}
function downloadUrlAsFile(fileName, url) {
  console.log('download', fileName);
  const link = document.createElement('a');
  document.body.appendChild(link);
  link.href = url;
  link.download = fileName;
  link.click();
  document.body.removeChild(link);
}

window.addEventListener('load', handleWindowLoad);


