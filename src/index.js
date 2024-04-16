let image2D;
let imagePreview;

function handleWindowLoad() {
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
  readControlVertices();
}
function readControlVertices() {
  const ctx = imagePreview.getContext('2d');
  let pixels = ctx.getImageData(0, 0, imagePreview.width, imagePreview.height).data;
  let controlVertices = [];
  for(let i = 0; i < pixels.length; i += 4) {
    controlVertices.push({
      x: pixels[i],
      y: pixels[i + 1],
      z: pixels[i + 2]
    })
  }
  console.log(controlVertices);
}

window.addEventListener('load', handleWindowLoad);
