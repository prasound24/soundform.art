void mainSplatModifier(inout Gsplat gs) {
    int w = int(iAmpSize.x), h = int(iAmpSize.y);
    int i = gs.index;
    vec2 p = vec2(i % w, i / w) / vec2(w, h);
    p += fract(iTime) * vec2(0, 1) / vec2(w, h);

    int ww = int(iMemShape.x), hh = int(iMemShape.y);
    vec2 pp = (vec2(i % w % ww, i % w / ww) + vec2(0.5)) / vec2(ww, hh); 

    float t = p.y, a = pp.x * PI, b = pp.y * PI - PI * 0.5;
    gs.center = t*vec3(cos(a)*cos(b), sin(a)*cos(b), sin(b));
    gs.scales = vec3(t*PI) / vec3(ww);

    gs.rgba = vec4(4,2,1,1.0/float(hh));
    gs.rgba *= texture(iAmp, p).x;
}
