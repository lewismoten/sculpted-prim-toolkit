
function handleWindowLoad() {
  document.getElementById('image-selector').addEventListener('change', handleImageSelectorChange);
}
function handleImageSelectorChange() {
  const imageSelector = document.getElementById('image-selector');
  const imagePreview = document.getElementById('image-preview');
  imagePreview.src = imageSelector.value;
}

window.addEventListener('load', handleWindowLoad);
