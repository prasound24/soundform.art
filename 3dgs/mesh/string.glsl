const float PI2 = radians(360.);
const mat4 BSPLINE = 1./6. * mat4(-1, 3,-3, 1, 3,-6, 3, 0, -3, 0, 3, 0, 1, 4, 1, 0);

vec4 bspline(float s) {
  return BSPLINE*vec4(s*s*s,s*s,s,1);
}

void mainSplatModifier(inout Gsplat gs) {
  ivec2 size = ivec2(iMeshSize.xy);
  int w = size.x, h = size.y, i = gs.index;
  vec2 p = vec2(i % w, i / w)/vec2(w,h);
  vec4 pos = texture(iMesh, p);

  if (length(iDxDy) > 0.) {
    vec2 dp = iDxDy/vec2(w,h);
    mat4x2 ps = mat4x2(p-dp, p, p+dp, p+dp+dp);
    vec4 a = texture(iMesh, ps[0]);
    vec4 b = texture(iMesh, ps[1]);
    vec4 c = texture(iMesh, ps[2]);
    vec4 d = texture(iMesh, ps[3]);
    vec4 bs = bspline(fract(iTime));
    pos = mat4(a,b,c,d)*bs;
    p = ps*bs;
  }
  
  float s = p.y / (1.1 + pos.w);
  gs.center = s * pos.xzy;
  gs.scales = (s + 0.05) / vec3(w);
  gs.rgba = vec4(0);
  gs.rgba += cos(PI2*(pos.z + pos.w + iColor))*0.5 + 0.5;
  gs.rgba.a = iColor.a*exp(-p.y*0.5);
}