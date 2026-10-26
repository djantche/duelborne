// Surface de cartes tessellée : chaque sommet subit une attraction et une torsion autour du même centre.
// WebGL natif, contexte temporaire et budget de pixels borné ; le DOM sert de repli si le GPU est indisponible.
import { getPlaybackRate } from './anim.ts'

const VERTEX = `
precision mediump float;
attribute vec2 a_point;
attribute vec2 a_uv;
uniform vec2 u_size;
uniform vec2 u_center;
uniform float u_progress;
uniform float u_background;
varying vec2 v_uv;
void main() {
  vec2 point = a_point;
  if (u_background < 0.5) {
    vec2 delta = point - u_center;
    float radius = length(delta);
    float p = u_progress;
    // Le bord intérieur part avant le bord extérieur : la carte s’étire en ruban puis se replie.
    float pull = pow(p, 1.25) * (0.65 + 130.0 / (radius + 130.0));
    float collapse = pow(max(0.0, 1.0 - p), 0.55);
    float angle = pull * 5.8 + p * p * 180.0 / (radius + 80.0);
    mat2 spin = mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
    point = u_center + spin * delta * collapse * exp(-pull * 0.65);
  }
  gl_Position = vec4(point / u_size * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
  v_uv = a_uv;
}`
const FRAGMENT = `
precision mediump float;
uniform sampler2D u_card;
uniform float u_progress;
uniform float u_background;
uniform vec2 u_size;
uniform vec2 u_center;
uniform float u_ratio;
varying vec2 v_uv;
void main() {
  if (u_background > 0.5) {
    vec2 point = vec2(gl_FragCoord.x, u_size.y * u_ratio - gl_FragCoord.y) / u_ratio - u_center;
    float radius = length(point);
    float hole = min(u_size.x, u_size.y) * 0.045;
    float angle = atan(point.y, point.x);
    float glow = exp(-abs(radius - hole * 1.25) / (hole * 0.45));
    float spiral = pow(0.5 + 0.5 * sin(angle * 3.0 + radius * 0.045 - u_progress * 13.0), 3.0);
    float disk = exp(-radius / (hole * 3.0)) * smoothstep(hole * 0.8, hole * 1.4, radius);
    vec3 light = mix(vec3(0.2, 0.35, 1.0), vec3(0.85, 0.35, 1.0), spiral);
    float core = 1.0 - smoothstep(hole * 0.8, hole, radius);
    float fade = smoothstep(0.0, 0.12, u_progress) * (1.0 - smoothstep(0.82, 1.0, u_progress));
    gl_FragColor = vec4(light * (glow + spiral * disk), max(core * 0.98, min(0.85, glow + disk * 0.7)) * fade);
  } else {
    vec4 card = texture2D(u_card, v_uv);
    float edge = smoothstep(0.0, 0.012, min(min(v_uv.x, 1.0-v_uv.x), min(v_uv.y, 1.0-v_uv.y)));
    float fade = 1.0 - smoothstep(0.78, 0.98, u_progress);
    vec2 point = vec2(gl_FragCoord.x, u_size.y * u_ratio - gl_FragCoord.y) / u_ratio - u_center;
    float hole = min(u_size.x, u_size.y) * 0.045;
    float swallowed = mix(1.0, smoothstep(hole * 0.8, hole * 1.1, length(point)), smoothstep(0.0, 0.15, u_progress));
    gl_FragColor = vec4(card.rgb * (1.0 + u_progress * 0.35), card.a * edge * fade * swallowed);
  }
}`

interface MaterialFace { image: HTMLImageElement; x: number; y: number; height: number }
export interface FusionVortex { play(duration: number, current: () => boolean): Promise<void>; dispose(): void }

/** Retourne null sans toucher aux copies DOM si une image ou WebGL manque. */
export async function createFusionVortex(root: HTMLElement, width: number, height: number, center: { x: number; y: number }, faces: MaterialFace[]): Promise<FusionVortex | null> {
  const loaded = await Promise.all(faces.map(({ image }) => Promise.race([
    image.decode().then(() => true, () => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 500)),
  ])))
  if (loaded.some((value) => !value) || !root.isConnected) return null
  const canvas = document.createElement('canvas')
  canvas.className = 'fusion-warp'
  const ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(1_600_000 / (width * height)))
  canvas.width = Math.max(1, Math.round(width * ratio))
  canvas.height = Math.max(1, Math.round(height * ratio))
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false, powerPreference: 'low-power' })
  if (!gl) return null
  const shaders: WebGLShader[] = [], buffers: WebGLBuffer[] = [], textures: WebGLTexture[] = []
  let program: WebGLProgram | null = null
  let frame = 0
  let finish = (): void => {}
  let disposed = false
  const dispose = (): void => {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frame)
    document.removeEventListener('visibilitychange', hidden)
    canvas.removeEventListener('webglcontextlost', lost)
    buffers.forEach((buffer) => gl.deleteBuffer(buffer))
    textures.forEach((texture) => gl.deleteTexture(texture))
    shaders.forEach((shader) => gl.deleteShader(shader))
    gl.deleteProgram(program)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    canvas.remove()
    finish()
  }
  const hidden = (): void => { if (document.hidden) dispose() }
  const lost = (event: Event): void => { event.preventDefault(); dispose() }
  try {
    const compile = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('shader')
      shaders.push(shader)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('shader compilation')
      return shader
    }
    program = gl.createProgram()
    if (!program) throw new Error('program')
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('shader link')
    gl.useProgram(program)
    const point = gl.getAttribLocation(program, 'a_point'), uv = gl.getAttribLocation(program, 'a_uv')
    const uniform = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(program!, name)
    const progress = uniform('u_progress'), background = uniform('u_background')
    gl.uniform2f(uniform('u_size'), width, height)
    gl.uniform2f(uniform('u_center'), center.x, center.y)
    gl.uniform1f(uniform('u_ratio'), ratio)
    gl.uniform1i(uniform('u_card'), 0)
    const buffer = (data: number[]): WebGLBuffer => {
      const value = gl.createBuffer()
      if (!value) throw new Error('buffer')
      buffers.push(value)
      gl.bindBuffer(gl.ARRAY_BUFFER, value)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW)
      return value
    }
    const quad = buffer([0,0,0,0, width,0,1,0, 0,height,0,1, 0,height,0,1, width,0,1,0, width,height,1,1])
    const meshes = faces.map((face) => {
      const vertices: number[] = []
      const columns = 28, rows = 40
      for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
        for (const [dx, dy] of [[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]]) {
          const u = (x + dx!) / columns, v = (y + dy!) / rows
          vertices.push(face.x + (u - .5) * face.height * 206 / 300, face.y + (v - .5) * face.height, u, v)
        }
      }
      const mesh = buffer(vertices)
      const texture = gl.createTexture()
      if (!texture) throw new Error('texture')
      textures.push(texture)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, face.image)
      return { mesh, texture, count: vertices.length / 4 }
    })
    const draw = (mesh: WebGLBuffer, count: number): void => {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh)
      gl.enableVertexAttribArray(point)
      gl.enableVertexAttribArray(uv)
      gl.vertexAttribPointer(point, 2, gl.FLOAT, false, 16, 0)
      gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8)
      gl.drawArrays(gl.TRIANGLES, 0, count)
    }
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    canvas.addEventListener('webglcontextlost', lost)
    document.addEventListener('visibilitychange', hidden)
    return {
      dispose,
      play(duration, current) {
        if (disposed) return Promise.resolve()
        root.append(canvas)
        return new Promise<void>((resolve) => {
          finish = resolve
          let previous = performance.now(), elapsed = 0
          const tick = (now: number): void => {
            if (!current() || document.hidden || disposed) { dispose(); return }
            elapsed += Math.min(80, now - previous) * getPlaybackRate()
            previous = now
            const p = Math.min(1, elapsed / duration)
            gl.clear(gl.COLOR_BUFFER_BIT)
            gl.uniform1f(progress, p)
            gl.uniform1f(background, 1)
            draw(quad, 6)
            gl.uniform1f(background, 0)
            for (const mesh of meshes) {
              gl.bindTexture(gl.TEXTURE_2D, mesh.texture)
              draw(mesh.mesh, mesh.count)
            }
            if (p < 1) frame = requestAnimationFrame(tick)
            else dispose()
          }
          frame = requestAnimationFrame(tick)
        })
      },
    }
  } catch {
    dispose()
    return null
  }
}
