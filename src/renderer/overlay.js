const textEl = document.getElementById('text');

window.clicky.onOverlayMessage((message) => {
  textEl.textContent = String(message);
});

