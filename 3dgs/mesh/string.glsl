const mat4 BSPLINE = 1./6. * mat4(
    -1, 3,-3, 1, 
     3,-6, 0, 4, 
    -3, 3, 3, 1, 
     1, 0, 0, 0);

vec4 bspline(float s) {
  return transpose(BSPLINE)*pow(vec4(s), vec4(3,2,1,0));
} 

void mainSplatModifier(inout Gsplat gs) {
  ivec2 size = ivec2(iMeshSize.xy);
  int w = size.x, h = size.y, i = gs.index;
  vec2 p = vec2(i % w, i / w)/vec2(w,h);
  vec4 pos = texture(iMesh, p);

  //if (!iShowDots) {
  //  p += fract(iTime)/vec2(w,h)*vec2(1,0);
  //  pos = texture(iMesh, p);
  //}

  if (!iShowDots) {
    vec2 dp = vec2(0,1)/vec2(w,h);
    mat4x2 ps = mat4x2(p-dp, p, p+dp, p+dp+dp);
    vec4 a = texture(iMesh, ps[0]);
    vec4 b = texture(iMesh, ps[1]);
    vec4 c = texture(iMesh, ps[2]);
    vec4 d = texture(iMesh, ps[3]);
    vec4 bs = bspline(fract(iTime));
    pos = mat4(a,b,c,d)*bs;
    p = ps*bs;
  }
  
  float t = p.y;
  float s = t / (1.1 + pos.w);
  gs.center = s * pos.xzy;
  gs.scales = (s + 0.05) / vec3(w);
  gs.rgba.rgb = 0.5 + 
    0.5 * cos(PI * 2. * (t + pos.z + pos.w + iColor.rgb));
  //gs.rgba.rgb = abs(pos.w)*iColor.rgb;
  //gs.rgba.rgb = iColor.rgb;
  gs.rgba.a = iColor.a*exp(-t*0.5);
}