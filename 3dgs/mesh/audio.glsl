void mainSplatModifier(inout Gsplat gs) {
  int w = int(iAmpSize.x), h = int(iAmpSize.y);
  int i = gs.index;
  vec2 p = vec2(i % w, i / w) / vec2(w, h);
  p += fract(iTime) * vec2(0, 1) / vec2(w, h);

  int ww = int(iDrumShape.x), hh = int(iDrumShape.y);
  vec2 pp = (vec2(i % w % ww, i % w / ww) + vec2(0.5)) / vec2(ww, hh);

  float s = sqrt(texture(iSum, p).x / iSumMax);
  float a = pp.x * PI;
  float b = (pp.y - 0.5) * PI;
  gs.center = s * vec3(cos(a) * cos(b), sin(a) * cos(b), sin(b));
  gs.scales = s * PI / vec3(ww);
  gs.center.z -= s*s*0.5;
  gs.center.z /= 1.0 + s*s;

  float amp = texture(iAmp, p).x;
  gs.rgba.rgb = mix(vec3(2,1,4), vec3(4,2,1), s);
  gs.rgba *= amp*0.7;
  gs.scales *= amp * (1.0 - s);
}
