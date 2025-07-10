const meshes = {}, shaders = {};

self.onmessage = async (e) => {
    let { type, name, txid, cw, ch, args } = e.data;
    if (type != 'mesh')
        throw new Error('Invalid command: ' + type);
    if (!/^\w+$/.test(name))
        throw new Error('Invalid mesh: ' + name);
    meshes[name] = meshes[name] ||
        await import('./mesh/' + name + '.js');
    shaders[name] = shaders[name] ||
        await (await fetch('./mesh/' + name + '.glsl')).text();
    let uniforms = meshes[name].createShader(cw, ch, args);
    let shader = shaders[name];
    postMessage({ txid, shader, uniforms });
};
