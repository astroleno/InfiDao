Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { frame: Object, busy: Boolean },
  methods: {
    choose(event) {
      const anchorId = event.currentTarget.dataset.anchor;
      if (!anchorId || this.data.busy) return;
      this.triggerEvent('branch', { frameId: this.data.frame.id, anchorId });
    },
  },
});
