/**
 * Compile a single WebGL shader from source.
 *
 * @param gl - WebGL rendering context.
 * @param type - Shader type: `gl.VERTEX_SHADER` or `gl.FRAGMENT_SHADER`.
 * @param src - GLSL source code.
 * @returns Compiled WebGLShader.
 */
const compileShader = (
  gl: WebGLRenderingContext,
  type: number,
  src: string,
): WebGLShader => {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("[webgl] Shader compile error:", gl.getShaderInfoLog(shader));
  }
  return shader;
};

/**
 * Compile and link a WebGL program from vertex and fragment shader sources.
 *
 * @param gl - WebGL rendering context.
 * @param vertSrc - GLSL vertex shader source.
 * @param fragSrc - GLSL fragment shader source.
 * @returns Linked WebGLProgram, or `null` if linking fails.
 */
export const createProgram = (
  gl: WebGLRenderingContext,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram | null => {
  const program = gl.createProgram()!;
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  return program;
};

/**
 * Create a GPU buffer containing a full-screen quad as two triangles.
 *
 * The quad covers the full clip space from (-1, -1) to (1, 1), which means the fragment shader will run for every pixel in the output canvas.
 *
 * @param gl - WebGL rendering context.
 * @returns WebGLBuffer containing the quad vertices.
 */
export const createQuadBuffer = (gl: WebGLRenderingContext): WebGLBuffer => {
  const buffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  return buffer;
};

/**
 * Upload an image to a GPU texture with linear filtering and edge clamping.
 *
 * @param gl - WebGL rendering context.
 * @param image - Source image to upload.
 * @returns WebGLTexture containing the uploaded image.
 */
export const uploadTexture = (
  gl: WebGLRenderingContext,
  image: HTMLImageElement,
): WebGLTexture => {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  return texture;
};
