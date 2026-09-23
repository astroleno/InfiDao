Component({
  options: { styleIsolation: 'apply-shared' },
  properties: { frame: Object, busy: Boolean, pressed: String },
  methods: {
    choose(event) {
      if (!this.data.busy) this.triggerEvent('branch', event.detail);
    },
  },
});
