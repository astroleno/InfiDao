// CanvasTouch uses local x/y; image/WebView Touch uses clientX/clientY.
// Keep one page-coordinate space for hit testing, dragging and snapshots.
function touchPoint(touch, canvasTop) {
  if (Number.isFinite(touch?.clientX) && Number.isFinite(touch?.clientY)) {
    return { x: touch.clientX, y: touch.clientY };
  }
  if (Number.isFinite(touch?.x) && Number.isFinite(touch?.y)) {
    return { x: touch.x, y: touch.y + canvasTop };
  }
  return null;
}
module.exports = { touchPoint };
