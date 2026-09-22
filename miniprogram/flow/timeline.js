const CELL = 512;

function modulo(value, size) {
  return ((value % size) + size) % size;
}

// Logical texture pixels; independent of device refresh rate and resolution.
class FlowTimeline {
  constructor(count) {
    this.count = count;
    this.position = CELL * 0.46;
    this.paused = false;
    this.visible = true;
    this.dragging = false;
    this.speed = 1;
    this.lastTime = null;
    this.elapsed = 0;
  }

  get index() {
    return modulo(Math.round(this.position / CELL - 0.46), this.count);
  }

  get offset() {
    return modulo(this.position, this.count * CELL);
  }

  tick(now) {
    if (this.lastTime === null) {
      this.lastTime = now;
      return false;
    }
    const dt = Math.max(0, Math.min((now - this.lastTime) / 1000, 0.064));
    this.lastTime = now;
    if (this.paused || !this.visible || this.dragging) return false;
    const phase = modulo(this.position, CELL) / CELL;
    const reading = Math.exp(-Math.pow((phase - 0.42) / 0.22, 2));
    this.position = modulo(this.position + dt * (44 - 22 * reading) * this.speed, this.count * CELL);
    this.elapsed += dt;
    return true;
  }

  setVisible(visible) {
    this.visible = visible;
    this.lastTime = null;
  }

  scrub(deltaPixels, screenPitch) {
    this.position = modulo(this.position - deltaPixels * CELL / Math.max(screenPitch, 1), this.count * CELL);
  }

  move(direction) {
    this.position = modulo((Math.round(this.position / CELL - 0.46) + direction + 0.46) * CELL, this.count * CELL);
  }
}

module.exports = { CELL, FlowTimeline, modulo };
