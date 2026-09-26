class WebGL2DRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: false }) ||
              canvas.getContext('experimental-webgl', { alpha: false, antialias: false, preserveDrawingBuffer: false });

    if (!this.gl) return;

    this.maxQuads = 65536;
    this.vertsPerQuad = 6;
    this.floatsPerVert = 6;
    this.bufferSize = this.maxQuads * this.vertsPerQuad * this.floatsPerVert;
    this.vertexData = new Float32Array(this.bufferSize);
    this.quadCount = 0;

    this.initShaders();
    this.initBuffers();
  }

  initShaders() {
    const gl = this.gl;
    const vsSource = `
      attribute vec2 a_position;
      attribute vec4 a_color;
      uniform vec2 u_resolution;
      uniform vec2 u_camera;
      uniform float u_zoom;
      varying vec4 v_color;

      void main() {
        vec2 screenPos = (a_position * u_zoom) - u_camera;
        vec2 zeroToOne = screenPos / u_resolution;
        vec2 zeroToTwo = zeroToOne * 2.0;
        vec2 clipSpace = zeroToTwo - 1.0;
        gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);
        v_color = a_color;
      }
    `;

    const fsSource = `
      precision mediump float;
      varying vec4 v_color;

      void main() {
        gl_FragColor = v_color;
      }
    `;

    const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);

    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    this.aPosition = gl.getAttribLocation(this.program, 'a_position');
    this.aColor = gl.getAttribLocation(this.program, 'a_color');
    this.uResolution = gl.getUniformLocation(this.program, 'u_resolution');
    this.uCamera = gl.getUniformLocation(this.program, 'u_camera');
    this.uZoom = gl.getUniformLocation(this.program, 'u_zoom');
  }

  compileShader(type, source) {
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    return s;
  }

  initBuffers() {
    const gl = this.gl;
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.byteLength, gl.DYNAMIC_DRAW);

    gl.useProgram(this.program);
    const stride = 24;
    gl.enableVertexAttribArray(this.aPosition);
    gl.vertexAttribPointer(this.aPosition, 2, gl.FLOAT, false, stride, 0);

    gl.enableVertexAttribArray(this.aColor);
    gl.vertexAttribPointer(this.aColor, 4, gl.FLOAT, false, stride, 8);
  }

  begin(viewportW, viewportH, cameraX, cameraY, zoom) {
    if (!this.gl) return;
    const gl = this.gl;

    gl.viewport(0, 0, viewportW, viewportH);
    gl.clearColor(0.06, 0.3, 0.5, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.program);
    gl.uniform2f(this.uResolution, viewportW, viewportH);
    gl.uniform2f(this.uCamera, cameraX, cameraY);
    gl.uniform1f(this.uZoom, zoom);

    this.quadCount = 0;
  }

  pushQuad(x, y, w, h, r, g, b, a = 1.0) {
    if (this.quadCount >= this.maxQuads) this.flush();

    const idx = this.quadCount * 36;
    const x2 = x + w;
    const y2 = y + h;

    this.vertexData[idx + 0] = x;
    this.vertexData[idx + 1] = y;
    this.vertexData[idx + 2] = r;
    this.vertexData[idx + 3] = g;
    this.vertexData[idx + 4] = b;
    this.vertexData[idx + 5] = a;

    this.vertexData[idx + 6] = x2;
    this.vertexData[idx + 7] = y;
    this.vertexData[idx + 8] = r;
    this.vertexData[idx + 9] = g;
    this.vertexData[idx + 10] = b;
    this.vertexData[idx + 11] = a;

    this.vertexData[idx + 12] = x;
    this.vertexData[idx + 13] = y2;
    this.vertexData[idx + 14] = r;
    this.vertexData[idx + 15] = g;
    this.vertexData[idx + 16] = b;
    this.vertexData[idx + 17] = a;

    this.vertexData[idx + 18] = x;
    this.vertexData[idx + 19] = y2;
    this.vertexData[idx + 20] = r;
    this.vertexData[idx + 21] = g;
    this.vertexData[idx + 22] = b;
    this.vertexData[idx + 23] = a;

    this.vertexData[idx + 24] = x2;
    this.vertexData[idx + 25] = y;
    this.vertexData[idx + 26] = r;
    this.vertexData[idx + 27] = g;
    this.vertexData[idx + 28] = b;
    this.vertexData[idx + 29] = a;

    this.vertexData[idx + 30] = x2;
    this.vertexData[idx + 31] = y2;
    this.vertexData[idx + 32] = r;
    this.vertexData[idx + 33] = g;
    this.vertexData[idx + 34] = b;
    this.vertexData[idx + 35] = a;

    this.quadCount++;
  }

  flush() {
    if (this.quadCount === 0 || !this.gl) return;
    const gl = this.gl;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertexData.subarray(0, this.quadCount * 36));
    gl.drawArrays(gl.TRIANGLES, 0, this.quadCount * 6);
    this.quadCount = 0;
  }

  end() {
    this.flush();
  }
}
