Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { parts: Array, frameId: String, busy: Boolean, pressed: String },
  methods: {
    choose(event) {
      const anchorId = event.currentTarget.dataset.anchor;
      if (anchorId && !this.data.busy) this.triggerEvent('branch', { frameId: this.data.frameId, anchorId });
    },
  },
});
