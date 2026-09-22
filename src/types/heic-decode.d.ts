declare module "heic-decode" {
  interface HeicBilde {
    width: number;
    height: number;
    /** RGBA, fire byte per piksel. */
    data: Uint8ClampedArray;
  }
  function decode(input: { buffer: ArrayBuffer | Uint8Array }): Promise<HeicBilde>;
  export default decode;
}
