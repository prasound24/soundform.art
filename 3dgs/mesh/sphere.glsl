vec4 texelFetch1D(sampler2D tex, int i) {
    ivec2 s = textureSize(tex, 0);
    ivec2 p = ivec2(i%s.x, i/s.x);
    return texelFetch(tex, p, 0); 
}

void mainSplatModifier(inout Gsplat gs) {
    vec4 pos = texelFetch1D(iMesh, gs.index);
    gs.center = pos.xyz;
    gs.scales = pos.w * vec3(1);
    gs.rgba = texelFetch1D(iRgba, gs.index);
}
