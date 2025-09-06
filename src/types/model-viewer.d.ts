declare namespace JSX {
  interface IntrinsicElements {
    'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      src?: string;
      'ios-src'?: string;
      ar?: boolean;
      'ar-modes'?: string;
      'ar-scale'?: string;
      'ar-placement'?: string;
      'camera-controls'?: boolean;
      exposure?: string;
      'environment-image'?: string;
      'shadow-intensity'?: string;
      alt?: string;
      loading?: string;
    };
  }
}
