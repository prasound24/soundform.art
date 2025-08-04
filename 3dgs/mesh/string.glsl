const float PI2 = radians(360.);

float hash(float x) {
    const uint M = 0x5bd1e995u;
    uint h = 1190494759u;
    uint src = floatBitsToUint(x);
    src *= M; src ^= src>>24u; src *= M;
    h *= M; h ^= src;
    h ^= h>>13u; h *= M; h ^= h>>15u;
    return uintBitsToFloat(h & 0x007fffffu | 0x3f800000u) - 1.0;
}

vec4 hash4(float x) {
  vec4 p = vec4(x)*vec4(1.013, 1.015, 0.0943, 0.0942);
  return vec4(hash(p.x), hash(p.y), hash(p.z), hash(p.w));
}

vec4 bspline(float s) {
  const mat4 BSPLINE = 1./6.*mat4(-1, 3,-3, 1, 3,-6, 3, 0, -3, 0, 3, 0, 1, 4, 1, 0);
  return BSPLINE*vec4(s*s*s,s*s,s,1);
}

void mainTextureUpdate(out vec4 o, vec2 p) {
  if (int(p.y) > 0) {
    o = texelFetch(iMesh, ivec2(p) - ivec2(0,1), 0);
    return;
  }

  float dt2 = iDT*iDT, dx2 = iDX*iDX;

  #define T(p) texture(iMesh, (p)/vec2(iMeshSize.xy))
  vec4 curr = T(p), prev = T(p + vec2(0,1));
  vec4 l = T(p - vec2(1,0)), r = T(p + vec2(1,0));
  //vec4 l2 = T(p - vec2(2,0)), r2 = T(p + vec2(2,0));

  vec4 ds = curr - prev;
  ds += dt2/dx2*(l + r - 2.*curr);
  ds += iDT*iDamping*prev;
  //ds += dt2 * 30. * curr * vec4(1,1,0,0);
  o = curr + ds;
  o /= 1. + iDT*iDamping;
  o /= length(o);
}

void mainSplatModifier(inout Gsplat gs) {
  ivec2 size = ivec2(iMeshSize.xy);
  int w = size.x, h = size.y, i = gs.index;
  vec2 p = (0.5 + vec2(i % w, i / w))/vec2(w,h);
  vec4 pos = texture(iMesh, p);

  if (length(iDxDy) > 0.) {
    vec2 dp = iDxDy/vec2(w,h);
    mat4x2 ps = mat4x2(p-dp, p, p+dp, p+dp+dp);
    vec4 a = texture(iMesh, ps[0]);
    vec4 b = texture(iMesh, ps[1]);
    vec4 c = texture(iMesh, ps[2]);
    vec4 d = texture(iMesh, ps[3]);
    vec4 bs = bspline(hash(fract(iTime)));
    pos = mat4(a,b,c,d)*bs;
    p = ps*bs;
  }
  
  float t = p.y;
  float g = exp(3.5*(t - 1.0));
  float s = g / (1.1 + pos.w);
  float r = s / float(w);
  gs.center = s * pos.xzy;
  gs.scales = vec3(r);
  //gs.center += r*0.02*(hash4(iTime).xyz - 0.5);
  //gs.rgba = iColor; // vec4(1)
  gs.rgba = cos(PI2*(-t + iColor))*0.5 + 0.5;
  gs.rgba.a = iColor.a;
  //gs.rgba *= 1.0 - t*t;
}
