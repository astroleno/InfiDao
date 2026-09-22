const CELL = 512;
const CENTER_PHASE = 0.46;
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
    this.position = CELL * CENTER_PHASE;
    this.rowOffset = 0;
    this.paused = false;
    this.visible = true;
    this.dragging = false;
    this.flinging = false;
    this.velocity = 0;
    this.flow = 0;
    this.needsSettle = false;
    this.speed = 1;
    this.lastTime = null;
    this.elapsed = 0;
    this.ambientPhase = 0;
  }

  get index() {
    return modulo(Math.round(this.position / CELL - CENTER_PHASE), this.count);
  }

  get paused() { return this._paused; }
  set paused(value) {
    this._paused = value;
    // The render loop stops on pause: reset here, not in a tick that never runs.
    if (value) this.flow = 0;
  }

  get dragging() { return this._dragging; }
  set dragging(value) {
    this._dragging = value;
    if (value) this.flow = 0;
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
      const step = this.velocity * dt;
      this.advancePosition(step);
      this.advanceAmbient(step, dt);
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
    const step = dt * (44 - 22 * reading) * this.speed * this.flow;
    this.advancePosition(step);
    this.advanceAmbient(step, dt);
    this.elapsed += dt;
    return true;
  }

  // Accumulate real travel instead of a separate decorative clock. The phase
  // freezes on pause/background and survives renderer recreation. Cap its pace
  // during a fast fling so a gesture can never turn the breathing into flicker.
  advanceAmbient(distance, dt) {
    this.ambientPhase = modulo(this.ambientPhase + Math.min(Math.abs(distance), 44 * dt) / (CELL * 1.5), 1);
  }

  advancePosition(distance) {
    const period = this.count * CELL, next = this.position + distance;
    this.rowOffset += Math.floor(next / period) * this.count;
    this.position = modulo(next, period);
  }

  setVisible(visible) {
    this.visible = visible;
    this.lastTime = null;
    if (!visible) { this.flow = 0; this.cancelFling(); }
  }

  scrub(deltaPixels, screenPitch, dtSeconds) {
    const pitch = Math.max(screenPitch, 1);
    this.advancePosition(-deltaPixels * CELL / pitch);
    // Low-passed finger velocity, for the release fling.
    if (dtSeconds > 0.001 && dtSeconds < 0.5) {
      const instant = -deltaPixels * CELL / pitch / dtSeconds;
      this.velocity = Math.max(-FLING_CAP, Math.min(FLING_CAP, this.velocity * 0.7 + instant * 0.3));
      if (this.visible) this.advanceAmbient(deltaPixels * CELL / pitch, Math.min(dtSeconds, 0.064));
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
    this.needsSettle = false;
  }

  move(direction) {
    const target = (Math.round(this.position / CELL - CENTER_PHASE) + direction + CENTER_PHASE) * CELL;
    this.advancePosition(target - this.position);
  }
}

module.exports = { CELL, CENTER_PHASE, FlowTimeline, modulo };
