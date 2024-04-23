import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { NURBSSurface } from 'three/examples/jsm/curves/NURBSSurface.js';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import Stats from 'three/examples/jsm/libs/stats.module';

const defaultCameraAngle = 'front';
const defaultModel = 'tatara7 cube.png';
const defaultSkin = 'alignment-map-1024';

let image2D;
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
let modelMeshObject;
let nurbsControlVertices;
let cubeObject;
let boundariesObject;
let controlVerticesObject;
let controlMeshObject;
let nurbsMeshObject;
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
  renderer = new THREE.WebGLRenderer({ canvas: canvas3D});
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
  document.getElementById('reveal-vertices').addEventListener('change', handleImageSelectorChange);
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
      selectedPosValue.value = selectedPosRange.value;
      updateModelVertexPosition();
    });
    selectedPosValue.addEventListener('input', () => {
      selectedPosRange.value = selectedPosValue.value;
      updateModelVertexPosition();
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
      displayIndexAfterRowOrColumnChanged();
    });
    vertexValueInput.addEventListener('input', () => {
      vertexRangeInput.value = vertexValueInput.value;
      displayIndexAfterRowOrColumnChanged();
    });
  });
  const vertexIndexRangeInput = document.getElementById('vertex-index-range');
  const vertexIndexValueInput = document.getElementById('vertex-index-value');
  vertexIndexValueInput.value = vertexIndexRangeInput.value;
  vertexIndexRangeInput.addEventListener('input', () => {
    vertexIndexValueInput.value = vertexIndexRangeInput.value;
    displayRowAndColumnAfterIndexChanged();
  });
  vertexIndexValueInput.addEventListener('input', () => {
    vertexIndexRangeInput.value = vertexIndexValueInput.value;
    displayRowAndColumnAfterIndexChanged();
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
function moveModelToCenter() {
  modelMeshObject.position.set(0, 0, 0);
  modelPosition.set(0, 0, 0);
  synchronizeInputsAndModels();
  updateVerticyPositions();
}
function scaleModelToBoundingVolume() {
  const maxLength = 1; // 1x1x1 cube

  updateVerticyPositions();
  let boundingBox = new THREE.Box3().setFromObject(modelMeshObject);
  let size = boundingBox.getSize(new THREE.Vector3());

  "xyz".split('')
    .forEach(axis => {
      const length = size[axis];
      if(length === 1) return;
      // 0.5 should be multipled by 2 (1 / 0.5 = 2)
      // 1 should be multipled by 1 ( 1 / 1 = 1)
      // 0.1 should be multipled by 10 (1 / 0.1 = 10)
      // 2 should be multipled by 0.5 (1 / 2 = 0.5)
      const scale = maxLength / length;
      modelMeshObject.scale[axis] = scale * modelScale[axis];
      modelScale[axis] = scale;
    })
  synchronizeInputsAndModels();
  updateVerticyPositions();
};
function updateVerticyPositions() {
  const tempCanvas = document.createElement('canvas');
  const width = image2D.width;
  const height = image2D.height;
  tempCanvas.width = width;
  tempCanvas.height = height;
  const ctx = tempCanvas.getContext('2d', {willReadFrequently: true});
  ctx.drawImage(image2D, 0, 0);
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, width, height);
  let outOfBounds = false;
  const p = [];
  selectedVerticesObject.children.forEach(object => {
    const i = object.userData.index;
    const worldPosition = object.getWorldPosition(object.position);
    let xyz = "xyz".split('').map(axis => mapControlVectorValueAsByte(worldPosition[axis]))
    if(xyz.some(v => v < 0 || v > 255)) {
      outOfBounds = true;
      // console.log('out of bounds', object.userData, worldPosition, xyz);
      xyz = xyz.map(mapClamp(0, 255));
      // return;
    }
    const rgb = bytePositionAsPixelRgb(...xyz);
    const point = dataIndexToImageXY(i);
    if(!p.includes(point.x)) p.push(point.x);
    if(!p.includes(point.y)) p.push(point.y);
    const imageData = ctx.getImageData(point.x, point.y, 1, 1);
    imageData.data[0] = rgb.r;
    imageData.data[1] = rgb.g;
    imageData.data[2] = rgb.b;
    const hMax = Math.pow(2, segments.horizontalDownsample + 1);
    const vMax = Math.pow(2, segments.verticalDownsample + 1);
    ctx.putImageData(imageData, point.x, point.y+1);
    // for(let h = 0; h < hMax; h++) {
    //   for(let v = 0; v < vMax; v++) {
    //     ctx.putImageData(imageData, point.x + h, point.y + v);
    //   }
    // }
  });
  p.sort((a,b) => a-b);
  console.log(p.join(', '));
  // if(outOfBounds) {
  //   console.error('out of bounds');
  //   return;
  // }
  // reset scale/position/rotation
  modelScale.set(1, 1, 1);
  modelRotation.set(0, 0, 0);
  modelPosition.set(0, 0, 0);
  synchronizeInputsAndModels();
  image2D.src = tempCanvas.toDataURL();
}
function mapClamp(min, max) {
  return (value) => Math.min(max, Math.max(min, value));
}

function updateStatsLocation() {
  const bounds = renderer.domElement.getBoundingClientRect();
  stats.domElement.style.top = `${bounds.top}px`;
  stats.domElement.style.left = `${bounds.left}px`;
}
function synchronizeTransformControlsMode() {
  const tool = selectedTool();
  let enabled = ['rotate', 'scale', 'move'].includes(tool);
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
    const movement = 0.1; // mapByteToControlVectorValue(255) - mapByteToControlVectorValue(254);
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
  transformControls.setSize(transformControls.size * 3);
  transformControls.addEventListener('change', (e) => {
    if(modelMeshObject) {
      clampDimensions(transformControls.object);
    }
    render();
  });
  transformControls.addEventListener('dragging-changed', event => {
    if(cameraOrbitControls) cameraOrbitControls.enabled = !event.value;
    if(!event.value) {
      clampDimensions(transformControls.object);
    }
  });
  attachTransformControls(modelMeshObject);
  window.addEventListener('keydown', handleTranslationKeyDown);
  window.addEventListener('keyup', handleTranslationKeyUp);
  scene.add(transformControls);
  if(object) attachTransformControls(object);
  else attachTransformControls(modelMeshObject);
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

  // Clamp Scale
  if(maxXyz > maxLength) {
    const scaleDown = maxLength / maxXyz;
    source.scale.set(scaleDown, scaleDown, scaleDown);
    boundingBox = new THREE.Box3().setFromObject(source);
    size = boundingBox.getSize(new THREE.Vector3());
  }
  // Clamp position inside cube
  function clampAxis(axis) {
    const half = size[axis] / 2;
    source.position[axis] =THREE.MathUtils.clamp(source.position[axis], -0.5 + half, 0.5 - half);
  }
  "xyz".split('').forEach(clampAxis);

  modelPosition.copy(source.position);
  modelScale.copy(source.scale);
  modelRotation.copy(source.rotation);
  synchronizeInputsAndModels(source);
}
function synchronizeInputsAndModels() {  
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
  applyTransformationToObects();
  displayScaleValues();
  displayRotationValues();
}
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
  const point = dataIndexToImageXY(i);

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
  raycaster.intersectObject(modelMeshObject).forEach(intersects => {
    const { x, y } = intersects.uv;
    const index = getIndexByUV(x, y);
    setSelectedVertexByIndex(index);
  });
}
function setSelectedVertexByIndex(index) {
  document.getElementById('vertex-index-range').value = index;
  document.getElementById('vertex-index-value').value = index;
  displayRowAndColumnAfterIndexChanged();
}

function displayIndexAfterRowOrColumnChanged() {
  const i = sphericalIndex(
    parseInt(document.getElementById('vertex-column-range').value),
    parseInt(document.getElementById('vertex-row-range').value),
    horizontalSegments,
    verticalSegments
  );
  setSelectedVertexByIndex(i);
}
function dataIndexToRowAndColumn(i) {
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
function dataIndexToImageXY(i) {
  const { row, column } = dataIndexToRowAndColumn(i);
  return {
    x: column * Math.pow(2, segments.horizontalDownsample + 1),
    y: row * Math.pow(2, segments.verticalDownsample + 1)
  };
}
function getIndexByUV(u, v) {
  let column = u * horizontalSegments + 1;
  let row = (1 - v) * verticalSegments + 1;

  column = Math.floor(column - 0.5);
  row = Math.floor(row - 0.5);
  return sphericalIndex(column, row, horizontalSegments, verticalSegments);
}
function displayRowAndColumnAfterIndexChanged(){
  const i = parseInt(document.getElementById('vertex-index-range').value);
  const { row, column } = dataIndexToRowAndColumn(i);
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
  const i = sphericalIndex(
    column,
    row,
    horizontalSegments,
    verticalSegments
  );
  setSelectedVertexByIndex(i);
}
function displayNewlySelectedVertex() {
  const i = getSelectedIndex();
  const [r, g, b] = pixels[i];
  const data = r.toString(16).padStart(2, '0')
    + g.toString(16).padStart(2, '0')
    + b.toString(16).padStart(2, '0');
  "rgb".split('').forEach((channel, idx) => {
    const hex = pixels[i][idx].toString(16).padStart(2, '0');
    document.getElementById(`model-data-${channel}`).innerText = hex;
  });
  document.getElementById('vertex-color').style.backgroundColor = '#' + data;

  displayVertexPosition()
  drawModelCanvas();
}
function getSelectedIndex() {
  return sphericalIndex(
    parseInt(document.getElementById('vertex-column-range').value),
    parseInt(document.getElementById('vertex-row-range').value),
    horizontalSegments,
    verticalSegments
  );
}
function displayVertexPosition() {
  const i = getSelectedIndex();
  const [r, g, b] = pixels[i];
  const x = pixelValueForAxis('x', r, g, b);
  const y = pixelValueForAxis('y', r, g, b);
  const z = pixelValueForAxis('z', r, g, b);
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
  const ctx = getModelCanvasContext();
  canvas2D.width = image2D.width;
  canvas2D.height = image2D.height;
  ctx.drawImage(image2D, 0, 0);
  hideUnusedPixels(canvas2D, segments.horizontalDownsample, segments.verticalDownsample);
  highlightVertex();
}
function highlightVertex() {
  if(!pixels) return;
  const index = sphericalIndex(
    parseInt(document.getElementById('vertex-column-range').value),
    parseInt(document.getElementById('vertex-row-range').value),
    horizontalSegments,
    verticalSegments
  );

  // 2D selection
  highlightVertexOnCanvas();

  // 3D selection
  selectedVerticesObject.children.forEach(mesh => {
    mesh.visible = mesh.userData.index === index;
  });
  
}
function highlightVertexOnCanvas() {
  const index = sphericalIndex(
    parseInt(document.getElementById('vertex-column-range').value),
    parseInt(document.getElementById('vertex-row-range').value),
    horizontalSegments,
    verticalSegments
  );
  const [r, g, b] = pixels[index];
  const masked = document.getElementById('reveal-vertices').checked;
  const outlineColor = masked ? 'white' : getContrastingColor(r, g, b);

  const { x, y } = dataIndexToImageXY(index);
  const value = outlineColor === 'black' ? 0 : 255;
  for(let xx = x - 1; xx <= x + 1; xx++) {
    for(let yy = y - 1; yy <= y + 1; yy++) {
      if(xx === x && yy === y) continue;
      setModelCanvasPixel(xx, yy, value, value, value);
    }
  }
}
function setModelCanvasPixel(x, y, r, g, b) {
  const ctx = getModelCanvasContext();
  const imageData = ctx.getImageData(x, y, 1, 1);
  imageData.data[0] = r;
  imageData.data[1] = g;
  imageData.data[2] = b;
  ctx.putImageData(imageData, x, y);
}
function getModelCanvasContext() {
  return canvas2D.getContext('2d', {willReadFrequently: true});
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
    removeTexture(nurbsMeshObject, modelMeshObject);
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
    applyTextureToObjects(image, nurbsMeshObject, modelMeshObject);
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
    applyTextureToObjects(textureImage, nurbsMeshObject, modelMeshObject);
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
  [nurbsMeshObject, modelMeshObject].forEach(object => {
    if(object) {
      object.material.transparent = opacity < 1;
      object.material.opacity = opacity;
      object.material.needsUpdate = true;
    }
  });

}
function handleTextureEmissiveChange() {
  const isEmissive = document.getElementById('show-texture-emissive').checked;
  [nurbsMeshObject, modelMeshObject].forEach(object => {
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
  segments = downsampleSegments(image2D.width/2, image2D.height/2, 1024);
  horizontalSegments = segments.horizontal;
  verticalSegments = segments.vertical;

  drawModelCanvas();
  document.getElementById('image-size').innerText = `${image2D.width}x${image2D.height}`;
  const ctx = getModelCanvasContext();

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
  highlightVertexOnCanvas();

  const vertexCount = nurbsControlVertices.length;
  const vertexIndexRangeInput = document.getElementById('vertex-index-range');
  const vertexIndexValueInput = document.getElementById('vertex-index-value');
  vertexIndexRangeInput.max = vertexCount - 1;
  vertexIndexValueInput.max = vertexCount - 1;
  drawObjects(nurbsControlVertices);
}
function drawObjects(nurbsControlVertices) {
  drawControlVertices(nurbsControlVertices);
  drawSphericalControlMesh(nurbsControlVertices);
  drawModelMesh(nurbsControlVertices);
  drawNurbsSurfaceMesh(nurbsControlVertices);
  drawSelectionVertices();
  displayNewlySelectedVertex();
}
function hideUnusedPixels(canvas, skipH, skipV) {
  if(!document.getElementById('reveal-vertices').checked) return;
  const width = canvas.width;
  const height = canvas.height;
  for(let x = 0; x < width; x++) {
    for(let y = 0; y < height; y++) {
      if(canReadControlVertex(x, y, width, height, skipH, skipV)) continue;
      setModelCanvasPixel(x, y, 0, 0, 0);
    }
  }
}
function mapByteToControlVectorValue(byteValue) {
  return (byteValue / 255) - 0.5;
}
function mapControlVectorValueAsByte(position) {
  return Math.round((position + 0.5) * 255);
}
function rgbLong(r, g, b) {
  return (r << 16) | (g << 8) | b;
}
function bytePositionAsPixelRgb(x, y, z) {
  return { r: z, g: x, b: y };
}
function pixelValueForAxis(axis, r, g, b) { 
  if(axis === 'x') return g;
  if(axis === 'y') return b;
  return r;
}
function convertRgbToVertex(r, g, b) {
  return {
    color: rgbLong(r, g, b),
    x: mapByteToControlVectorValue(pixelValueForAxis('x', r, g, b)),
    y: mapByteToControlVectorValue(pixelValueForAxis('y', r, g, b)),
    z: mapByteToControlVectorValue(pixelValueForAxis('z', r, g, b))
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
function getModelPixels(imageData, segments) {
  const width = canvas2D.width;
  const height = canvas2D.height;
  const pixelDataBytes = 4;
  // get pixels in row major order, top to bottom, left to right as (r, g, b, a)
  const controlVertices = [];

  let lastRow = -1;
  let firstVirtex = null;

  for(let i = 0; i < imageData.length; i += pixelDataBytes) {
    const columnIndex = (i / pixelDataBytes) % width;
    const rowIndex = Math.floor((i / pixelDataBytes) / width);
    if(!canReadControlVertex(columnIndex, rowIndex, width, height, segments.horizontalDownsample, segments.verticalDownsample)) continue;

    if(rowIndex !== lastRow) {
      if(firstVirtex) controlVertices.push(firstVirtex);
      lastRow = rowIndex;
    }

    const vertex = imageData.slice(i, i + 3);
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
  removeObjectFromList(controlVerticesObject);
  controlVerticesObject = new THREE.Object3D();
  controlVerticesObject.name = 'Wirerame';
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
  setTranslationToObject(controlVerticesObject);
  scene.add( controlVerticesObject );

  controlVerticesObject.visible = document.getElementById('show-control-vertices').checked;
  addObjectToList(controlVerticesObject);
}
function drawSelectionVertices() {  
  const vertices = pixels.map(([r, g, b]) => convertRgbToVertex(r, g, b));
  removeObjectFromList(selectedVerticesObject);
  const selectedIndex = parseInt(document.getElementById('vertex-index-range').value);
  const object = new THREE.Object3D();
  object.name = 'Vertices';
  vertices.forEach(({ x, y, z, color }, i) => {
    const {row, column} = dataIndexToRowAndColumn(i);
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
function sphericalIndex(x, y, horizontalSegments, verticalSegments) {
  if(y >= verticalSegments || y <= 0) {
    // poles of top and bottom are centered
    x = Math.floor(horizontalSegments / 2);
  }
  // keep y within bounds
  if(y < 0) {
    y = 0;
  } else if(y >= verticalSegments) {
    // HACK: seems center pixel is not in the proper place?
    return ((horizontalSegments + 1) * verticalSegments);
    // y = verticalSegments - 1;
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
  removeObjectFromList(nurbsMeshObject);
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
      const index = sphericalIndex(column, row, horizontalSegments, verticalSegments);
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
  nurbsMeshObject = new THREE.Mesh(geometry, material);
  nurbsMeshObject.name = 'NURBS Surface';
  setTranslationToObject(nurbsMeshObject);
  scene.add(nurbsMeshObject);
  nurbsMeshObject.visible = document.getElementById('show-nurbs-mesh').checked;
  addObjectToList(nurbsMeshObject);
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
function drawSphericalControlMesh(controlVertices) {
  removeObjectFromList(controlMeshObject);
  const controlMeshGeometry = createSphericalControlGeometry(controlVertices, horizontalSegments, verticalSegments);
  const controlMeshMaterial = new THREE.MeshStandardMaterial( { color: 0xFFFFFF, wireframe: true } );
  controlMeshObject = new THREE.Mesh(controlMeshGeometry, controlMeshMaterial);
  controlMeshObject.name = 'Control Mesh/Wireframe';
  setTranslationToObject(controlMeshObject);
  scene.add(controlMeshObject);
  controlMeshObject.visible = document.getElementById('show-control-mesh').checked;
  addObjectToList(controlMeshObject);
}
function drawModelMesh(controlVertices) {
  removeObjectFromList(modelMeshObject);
  function getPoint(u, v, target) {
    
    let column = Math.floor(u * (horizontalSegments + 1));
    let row = Math.floor((1 - v) * (verticalSegments + 1));
    const index = sphericalIndex(
      column, 
      row, 
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
  modelMeshObject = new THREE.Mesh(geometry, material);
  modelMeshObject.name = 'Model';

  setTranslationToObject(modelMeshObject);
  scene.add(modelMeshObject);
  modelMeshObject.visible = document.getElementById('show-model-mesh').checked;
  attachTransformControls(modelMeshObject);
  addObjectToList(modelMeshObject);
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
  controlVerticesObject.visible = document.getElementById('show-control-vertices').checked;
}
function handleShowControlMeshChange() {
  controlMeshObject.visible = document.getElementById('show-control-mesh').checked;
}
function handleShowModelMeshChange() {
  modelMeshObject.visible = document.getElementById('show-model-mesh').checked;
}
function handleShowNurbsMeshChange() {
  nurbsMeshObject.visible = document.getElementById('show-nurbs-mesh').checked;
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
  if(!modelMeshObject) return;
  const rotation = modelMeshObject.rotation.clone();
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
  stats.update();
}

window.addEventListener('load', handleWindowLoad);


