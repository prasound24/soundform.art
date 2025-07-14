vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

void mainSplatModifier(inout Gsplat gs) {
  ivec2 size = ivec2(iMeshSize.xy);
  int w = size.x, h = size.y, i = gs.index;
  vec2 p = vec2(i % w, i / w)/vec2(w,h);
  if (!iShowDots)
    p += fract(iTime)/vec2(w,h)*(vec2(iFrame % 5 > 0) - vec2(0,1));
  vec4 pos = texture(iMesh, p);
  float t = p.y;
  float s = t / (1.1 + pos.w);
  gs.center = s * pos.xzy;
  gs.scales = s / vec3(w);
  gs.rgba.rgb = 0.5 + 0.5 * cos(PI * 2. * (t + iColor.rgb));
  gs.rgba.a = iColor.a;
}