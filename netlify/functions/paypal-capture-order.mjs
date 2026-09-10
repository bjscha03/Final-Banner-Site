// Compatibility route delegates to the complete deployed capture wrapper,
// including customer recovery, decline cleanup and once-only fulfillment
// queueing. It cannot reach the retired browser-authored capture code.
export { default } from './paypal-capture-minimal.mjs';
