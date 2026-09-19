// Chrome's isolated content-script world has no usable custom-element registry.
// Only patch Custom Elements: native Shadow DOM must remain intact for Lit.
import "@webcomponents/webcomponentsjs/bundles/webcomponents-ce.js";
import "lit/polyfill-support.js";
