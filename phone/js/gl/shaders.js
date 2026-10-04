// GLSL for the clay renderer. One program draws every part: the fragment shader
// evaluates the part's implicit shape in its own local space, turns it into a height
// field (ellipsoid dome, rounded bevel or recessed bowl), and lights it like a soft
// vinyl/clay toy: wrapped key light, subsurface glow, rim light, gloss, floor bounce,
// ground occlusion and a touch of grain. Output is premultiplied alpha.

export const VERTEX = `#version 300 es
in vec2 aCorner;
uniform vec4 uBox;      // local-space box: centre xy, half extents zw
uniform vec3 uRow0;     // local → device px: x' = a x + c y + e
uniform vec3 uRow1;     //                    y' = b x + d y + f
uniform vec2 uRes;
out vec2 vLocal;
void main() {
  vLocal = uBox.xy + aCorner * uBox.zw;
  vec2 px = vec2(dot(uRow0, vec3(vLocal, 1.0)), dot(uRow1, vec3(vLocal, 1.0)));
  vec2 clip = px / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

export const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vLocal;
out vec4 outColor;

uniform int uShape;      // 0 blob, 1 ellipse, 2 rrect, 3 capsule, 4 balls, 5 ring, 6 rounded polygon
uniform int uMode;       // 0 dome, 1 bevel, 2 inset, 3 flat, 4 shadow, 5 glow
uniform vec4 uP0, uP1, uP2, uP3;   // shape parameters (polygon: up to 6 vertices, count, rounding)
uniform vec4 uBalls[8];
uniform int uNBalls;
uniform vec4 uBox;
uniform mat2 uN;         // local gradient → screen direction (scale removed)
uniform float uK;        // device px per local unit
uniform vec3 uColor, uColor2, uSss;
uniform vec4 uMatA;      // wrap, spec, shine, rim
uniform vec4 uMatB;      // ao, grain, emissive, alpha
uniform vec4 uMatC;      // depth, bevel, grad, sss amount

const vec3 L = normalize(vec3(-0.42, -0.72, 0.85));   // key light: upper left, in front (y is down)
const vec3 KEY = vec3(1.0, 0.97, 0.93);
const vec3 SKY = vec3(0.78, 0.82, 0.92);
const vec3 GROUND = vec3(0.95, 0.72, 0.62);
const vec3 BOUNCE = vec3(1.0, 0.78, 0.66);
const vec3 RIM = vec3(1.0, 0.95, 0.92);

float sdSuper(vec2 p) {
  // Superellipse with separate top/bottom exponents, bottom flare and top scale.
  vec2 q = p - uP0.xy;
  float top = q.y < 0.0 ? uP1.w : 1.0;
  float ny = q.y / (uP0.w * top);
  float n = q.y > 0.0 ? uP1.y : uP1.x;
  float a = uP0.z * (1.0 + uP1.z * clamp(ny, -1.0, 1.0));
  float X = abs(q.x) / max(a, 1e-4);
  float Y = abs(ny);
  return pow(pow(X, n) + pow(Y, n), 1.0 / n) - 1.0;
}

float sdEllipseR(vec2 p) {
  vec2 q = (p - uP0.xy) / uP0.zw;
  return length(q) - 1.0;
}

float sdRRect(vec2 p) {
  vec2 q = abs(p - uP0.xy) - uP0.zw + vec2(uP1.x);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uP1.x;
}

float sdCapsule(vec2 p) {
  vec2 a = uP0.xy, b = uP0.zw;
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h) - uP1.x;
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float sdBalls(vec2 p) {
  float d = 1e9;
  for (int i = 0; i < 8; i++) {
    if (i >= uNBalls) break;
    vec4 c = uBalls[i];
    d = smin(d, length(p - c.xy) - c.z, uP0.x);
  }
  return d;
}

float sdRing(vec2 p) {
  vec2 q = p - uP0.xy;
  float e = (length(q / uP0.zw) - 1.0) * min(uP0.z, uP0.w);
  float d = abs(e) - uP1.x * 0.5;
  // half = -1 keeps the far (upper) half, +1 the near (lower) half.
  if (uP1.y < -0.5) d = max(d, q.y);
  if (uP1.y > 0.5) d = max(d, -q.y);
  return d;
}

vec2 polyVertex(int i) {
  if (i == 0) return uP0.xy;
  if (i == 1) return uP0.zw;
  if (i == 2) return uP1.xy;
  if (i == 3) return uP1.zw;
  if (i == 4) return uP2.xy;
  return uP2.zw;
}

// Signed distance to a polygon (any winding), rounded by uP3.y.
float sdPoly(vec2 p) {
  int n = int(uP3.x);
  vec2 v0 = polyVertex(0);
  float d = dot(p - v0, p - v0);
  float s = 1.0;
  for (int i = 0; i < 6; i++) {
    if (i >= n) break;
    int j = i == 0 ? n - 1 : i - 1;
    vec2 vi = polyVertex(i), vj = polyVertex(j);
    vec2 e = vj - vi, w = p - vi;
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= vi.y, p.y < vj.y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s *= -1.0;
  }
  return s * sqrt(d) - uP3.y;
}

float field(vec2 p) {
  if (uShape == 6) return sdPoly(p);
  if (uShape == 0) return sdSuper(p);
  if (uShape == 1) return sdEllipseR(p);
  if (uShape == 2) return sdRRect(p);
  if (uShape == 3) return sdCapsule(p);
  if (uShape == 4) return sdBalls(p);
  return sdRing(p);
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 p = vLocal;
  vec2 rel = (p - uBox.xy) / uBox.zw;

  // Soft floor shadow and additive glow don't need a surface.
  if (uMode == 4 || uMode == 5) {
    float r = length((p - uP0.xy) / uP0.zw);
    if (uMode == 4) {
      float a = exp(-r * r * 2.6) * uMatB.w;
      outColor = vec4(uColor * a, a);
    } else {
      float a = pow(clamp(1.0 - r, 0.0, 1.0), 2.2) * uMatB.w;
      outColor = vec4(uColor * a, 0.0); // alpha 0 with premultiplied blending = additive
    }
    return;
  }

  // Field + gradient from one forward difference (half a pixel).
  float eps = 0.5 / uK;
  float f0 = field(p);
  vec2 g = vec2(field(p + vec2(eps, 0.0)) - f0, field(p + vec2(0.0, eps)) - f0) / eps;
  float gl = max(length(g), 1e-5);
  float d = f0 / gl;                    // signed distance (local units)
  float aa = clamp(0.5 - d * uK, 0.0, 1.0);
  if (aa <= 0.0) discard;
  vec2 dir = g / gl;                    // outward

  vec2 nl;
  if (uMode == 0 && (uShape == 0 || uShape == 1)) {
    // Ellipsoid-like dome on the normalised radius: smooth, no crease.
    float r = clamp(f0 + 1.0, 0.0, 0.9995);
    float s = sqrt(1.0 - r * r);
    nl = uMatC.x * r * g / s;
  } else if (uMode == 2) {
    // Recessed panel: the edge bowls inward (lit lower lip, shaded upper lip).
    float t = clamp(-d / uMatC.y, 0.0, 1.0);
    float gp = (1.0 - t) / sqrt(max(1.0 - (1.0 - t) * (1.0 - t), 1e-4));
    nl = -dir * min(gp, 6.0) * 0.55 + rel * uMatC.x;
  } else if (uMode == 3) {
    nl = vec2(0.0);
  } else {
    // Rounded bevel of width uMatC.y, flat-ish top.
    float t = clamp(-d / uMatC.y, 0.0, 1.0);
    float gp = (1.0 - t) / sqrt(max(1.0 - (1.0 - t) * (1.0 - t), 1e-4));
    nl = dir * min(gp, 8.0) + rel * uMatC.x * 0.6;
  }
  vec3 n = normalize(vec3(uN * nl, 1.0));

  // Albedo: gentle top→bottom tint.
  vec3 albedo = mix(uColor, uColor2, smoothstep(-1.0, 1.0, rel.y) * uMatC.z);

  float ndl = dot(n, L);
  float wrap = uMatA.x;
  float diff = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
  vec3 amb = mix(GROUND, SKY, 0.5 - 0.5 * n.y);
  vec3 col = albedo * (diff * KEY * 0.95 + amb * 0.42);

  // Subsurface: warm saturated light bleeding through near the terminator and thin edges.
  float term = clamp(1.0 - abs(ndl - 0.1) * 2.0, 0.0, 1.0);
  float thin = pow(1.0 - n.z, 2.0);
  col += uSss * (term * 0.28 + thin * 0.22) * uMatC.w;

  // Rim light from behind, upper right.
  vec2 nxy = n.xy / max(length(n.xy), 1e-4);
  float rim = pow(1.0 - n.z, 3.0) * clamp(dot(nxy, normalize(vec2(0.75, -0.66))) * 0.6 + 0.4, 0.0, 1.0);
  col += RIM * rim * uMatA.w * 0.5;

  // Floor bounce on downward-facing surfaces.
  col += BOUNCE * albedo * max(n.y, 0.0) * 0.32;

  // Ground occlusion toward the bottom of the part.
  col *= 1.0 - uMatB.x * smoothstep(0.15, 1.05, rel.y) * (0.6 + 0.4 * max(n.y, 0.0));

  // Gloss: a tight highlight plus a broad soft sheen (the "vinyl toy" look).
  vec3 h = normalize(L + vec3(0.0, 0.0, 1.0));
  float nh = max(dot(n, h), 0.0);
  col += vec3(1.0) * (pow(nh, uMatA.z) * uMatA.y + pow(nh, max(uMatA.z * 0.12, 2.0)) * uMatA.y * 0.26);

  // Recessed panel: soft shadow under the upper lip, a little light caught on the lower lip.
  if (uMode == 2) {
    float lip = 1.0 - smoothstep(0.0, uMatC.y * 3.2, -d);
    col *= 1.0 - lip * (0.06 + 0.34 * clamp(-dir.y, 0.0, 1.0));
    col += vec3(1.0, 0.96, 0.92) * lip * clamp(dir.y, 0.0, 1.0) * 0.07;
  }

  col += albedo * uMatB.z;                                  // emissive
  col *= 1.0 + (hash(floor(p * 700.0)) - 0.5) * uMatB.y;    // grain, fixed to the surface

  float alpha = aa * uMatB.w;
  outColor = vec4(toSrgb(max(col, 0.0)) * alpha, alpha);
}`;
