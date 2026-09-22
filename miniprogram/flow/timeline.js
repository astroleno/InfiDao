const CELL = 512;
// Fling tuning: Lenis-like glide — exponential decay, gentle settle handoff.
const FLING_START = CELL * 0.3;
const FLING_STOP = CELL * 0.03;
const FLING_CAP = CELL * 8;
const FLING_DAMPING = 3.2;
const FLOW_RAMP = 2.4;

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
    this.flinging = false;
    this.velocity = 0;
    this.flow = 1;
    this.needsSettle = false;
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
    if (!this.visible || this.dragging) {
      this.flow = 0;
      return false;
    }
    // A released flick keeps gliding with exponential decay, even while
    // paused; when it dies out we ask the page for a gentle detent settle.
    if (this.flinging) {
      this.position = modulo(this.position + this.velocity * dt, this.count * CELL);
      this.velocity *= Math.exp(-FLING_DAMPING * dt);
      this.elapsed += dt;
      if (Math.abs(this.velocity) < FLING_STOP) {
        this.flinging = false;
        this.velocity = 0;
        this.needsSettle = true;
      }
      return true;
    }
    if (this.paused) {
      this.flow = 0;
      return false;
    }
    // Auto-flow ramps back up smoothly after any pause or drag instead of
    // snapping to full speed.
    this.flow += (1 - this.flow) * (1 - Math.exp(-FLOW_RAMP * dt));
    const phase = modulo(this.position, CELL) / CELL;
    const reading = Math.exp(-Math.pow((phase - 0.42) / 0.22, 2));
    this.position = modulo(this.position + dt * (44 - 22 * reading) * this.speed * this.flow, this.count * CELL);
    this.elapsed += dt;
    return true;
  }

  setVisible(visible) {
    this.visible = visible;
    this.lastTime = null;
  }

  scrub(deltaPixels, screenPitch, dtSeconds) {
    const pitch = Math.max(screenPitch, 1);
    this.position = modulo(this.position - deltaPixels * CELL / pitch, this.count * CELL);
    // Low-passed finger velocity, for the release fling.
    if (dtSeconds > 0.001 && dtSeconds < 0.5) {
      const instant = -deltaPixels * CELL / pitch / dtSeconds;
      this.velocity = Math.max(-FLING_CAP, Math.min(FLING_CAP, this.velocity * 0.7 + instant * 0.3));
    }
  }

  release() {
    this.flinging = Math.abs(this.velocity) > FLING_START;
    if (!this.flinging) this.velocity = 0;
    return this.flinging;
  }

  cancelFling() {
    this.flinging = false;
    this.velocity = 0;
  }

  move(direction) {
    this.position = modulo((Math.round(this.position / CELL - 0.46) + direction + 0.46) * CELL, this.count * CELL);
  }
}

module.exports = { CELL, FlowTimeline, modulo };
