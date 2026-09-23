Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { parts: Array, frameId: String, busy: Boolean, pressed: String, classic: Boolean },
  methods: {
    choose(event) {
      const part = this.data.parts[event.currentTarget.dataset.index];
      if (part?.anchorId && !this.data.busy) this.triggerEvent('branch', {
        frameId: this.data.frameId, anchorId: part.anchorId, ...(part.selection ? { selection: part.selection } : {}),
      });
    },
  },
});
