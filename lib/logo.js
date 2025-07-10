export async function createLogoTexture(text = 'soundform.art', em = 25) {
  const font = new FontFace("DancingScript", "url(/create/DancingScript-Regular.ttf)");
  document.fonts.add(font);
  await font.load();
  //await document.fonts.ready;

  let canvas = document.createElement('canvas');
  let ctx2d = canvas.getContext('2d');
  let ch = em; // tm.actualBoundingBoxAscent - tm.actualBoundingBoxDescent;
  let cw = em * 20; // tm.width;
  canvas.height = ch;
  canvas.width = cw;
  ctx2d.font = em + 'px DancingScript';
  ctx2d.textBaseline = 'middle';
  let tm = ctx2d.measureText(text);
  //console.debug(tm);
  canvas.width = tm.width + em;

  //ctx2d.fillStyle = '#000';
  //ctx2d.fillRect(0, 0, canvas.width, canvas.height);
  ctx2d.font = em + 'px DancingScript';
  ctx2d.fillStyle = '#fff';
  ctx2d.textBaseline = 'middle';
  ctx2d.fillText(text, em / 2, ch / 2);

  let img = ctx2d.getImageData(0, 0, canvas.width, canvas.height);
  img.canvas = canvas;
  return img;
}
