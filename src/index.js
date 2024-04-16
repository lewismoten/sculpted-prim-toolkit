let image2D;
let imagePreview;

function handleWindowLoad() {
  imagePreview = document.getElementById('image-preview');
  document.getElementById('image-selector').addEventListener('change', handleImageSelectorChange);
  handleImageSelectorChange();
}
function handleImage2DLoad() {
  const ctx = imagePreview.getContext('2d');
  imagePreview.width = image2D.width;
  imagePreview.height = image2D.height;
  ctx.drawImage(image2D, 0, 0);
}
function handleImageSelectorChange() {
  const imageSelector = document.getElementById('image-selector');
  const imageUrl = imageSelector.value;
  image2D = new Image();
  image2D.src = imageUrl;
  image2D.onload = handleImage2DLoad
}

window.addEventListener('load', handleWindowLoad);
