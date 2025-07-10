void mainSplatModifier(inout Gsplat gs) {
    ivec2 size = ivec2(iMeshSize.xy);
    int w = size.x, h = size.y, i = gs.index;
    vec2 p = vec2(i % w, i / w) / vec2(w, h);
    if (!iShowDots) p.y += fract(iTime) / float(h);
    vec4 pos = texture(iMesh, p);
    float t = p.y;
    float s = (t + 0.01) / (1.25 + pos.w);
    gs.center = s * pos.xzy;
    gs.scales = s / vec3(w);
    vec3 col = vec3(0.15, 0.27, 0.33);
    gs.rgba.rgb = 0.5 + 0.5 * cos(
        PI * 2. * (t + pos.w / 2. + col));
}
