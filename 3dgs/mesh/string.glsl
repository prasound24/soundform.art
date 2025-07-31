const float PI2 = radians(360.);

float murmur11(float x) {
    const uint M = 0x5bd1e995u;
    uint h = 1190494759u;
    uint src = floatBitsToUint(x);
    src *= M; src ^= src>>24u; src *= M;
    h *= M; h ^= src;
    h ^= h>>13u; h *= M; h ^= h>>15u;
    return uintBitsToFloat(h & 0x007fffffu | 0x3f800000u) - 1.0;
}

vec4 murmur41(float x) {
  vec4 p = vec4(x)*vec4(1.013, 1.015, 0.0943, 0.0942);
  return vec4(murmur11(p.x), murmur11(p.y), murmur11(p.z), murmur11(p.w));
}

vec4 bspline(float s) {
  const mat4 BSPLINE = 1./6.*mat4(-1, 3,-3, 1, 3,-6, 3, 0, -3, 0, 3, 0, 1, 4, 1, 0);
  return BSPLINE*vec4(s*s*s,s*s,s,1);
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
    vec4 bs = bspline(murmur11(fract(iTime)));
    pos = mat4(a,b,c,d)*bs;
    p = ps*bs;
  }

  //pos += (murmur41(fract(iTime)) - 0.5)/length(vec2(w,h));
  
  float t = p.y, s = t / (1.1 + pos.w);
  float r = s / float(w);
  gs.center = s * pos.xzy;
  gs.scales = vec3(r);
  gs.center += r*0.02*(murmur41(iTime).xyz - 0.5);
  //gs.rgba = vec4(1);
  //gs.rgba += t*iColor;
  gs.rgba = cos(PI2*(pos.w*0.5 - t + iColor))*0.5 + 0.5;
  gs.rgba.a = iColor.a; // *exp(-t*0.0);
  //gs.flags = uint(fract(iTime*0.01) > t);
}