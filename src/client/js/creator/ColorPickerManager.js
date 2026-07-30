/**
 * @fileoverview ColorPickerManager.js - Pickr System & Palette Engine for Character Creator
 *
 * @description
 * Manages Pickr color picker instances, HEX/Int color mapping, master palette controls,
 * individual part color pickers, and the 36-color palette preset randomizer engine.
 */

window.ColorPickerManager = {
  pickers: {},

  bodyColorSets: [
    { id: 1, primary: '#fefdfd', secondary: '#ffc6d7', accent: '#b46ed1', hair: '#fafaff', eyes: '#fff46c', description: 'Cotton Candy' },
    { id: 2, primary: '#454545', secondary: '#e5e5e5', accent: '#ef819e', hair: '#5d3558', eyes: '#d119af', description: 'Smokey Plum' },
    { id: 3, primary: '#54434d', secondary: '#d9cbd8', accent: '#ff7506', hair: '#212121', eyes: '#7ecd88', description: 'Halloween Night' },
    { id: 4, primary: '#d06d32', secondary: '#e8c1a4', accent: '#3a110d', hair: '#69371c', eyes: '#7ecd88', description: 'Pumpkin Spice' },
    { id: 5, primary: '#f7941d', secondary: '#ffeecc', accent: '#603913', hair: '#603913', eyes: '#00aeef', description: 'Desert Sunset' },
    { id: 6, primary: '#603f1e', secondary: '#cfba85', accent: '#8e5238', hair: '#8e5238', eyes: '#56a1f2', description: 'Desert Sand' },
    { id: 7, primary: '#32859f', secondary: '#e3ffff', accent: '#d13541', hair: '#532600', eyes: '#bce3e8', description: 'Ocean on Fire' },
    { id: 8, primary: '#7ec6ee', secondary: '#f4feff', accent: '#49443c', hair: '#152941', eyes: '#baa224', description: 'Ocean Depths' },
    { id: 9, primary: '#3f96f7', secondary: '#f2e6f2', accent: '#c07ce0', hair: '#ff62bf', eyes: '#ffd761', description: 'Berry Blast' },
    { id: 10, primary: '#55343d', secondary: '#897668', accent: '#402418', hair: '#ab5c3b', eyes: '#3b6223', description: 'Cinnamon Swirl' },
    { id: 11, primary: '#ffffff', secondary: '#93eef3', accent: '#1a446c', hair: '#1a446c', eyes: '#37cbff', description: 'Winter Wonderland' },
    { id: 12, primary: '#ffebcb', secondary: '#ffffff', accent: '#cca986', hair: '#997f63', eyes: '#3be2e2', description: 'Vanilla Bean' },
    { id: 13, primary: '#464646', secondary: '#b9af8c', accent: '#6edee5', hair: '#b9af8c', eyes: '#ffcc04', description: 'Stonewashed Oasis' },
    { id: 14, primary: '#e2c8ad', secondary: '#f9f1ea', accent: '#875747', hair: '#724a3d', eyes: '#ffc87c', description: 'Caramel Macchiato' },
    { id: 15, primary: '#fda75f', secondary: '#f6f0f0', accent: '#454444', hair: '#724a3d', eyes: '#2ab7fe', description: 'Dirty Peaches' },
    { id: 16, primary: '#b6f0f0', secondary: '#fffdec', accent: '#ffeeff', hair: '#ffeeff', eyes: '#6a166d', description: 'Pastel Goth' },
    { id: 17, primary: '#72a8cb', secondary: '#ddfff9', accent: '#3f3f3f', hair: '#134b7a', eyes: '#70bcee', description: 'Cloudy Sky' },
    { id: 18, primary: '#e579c5', secondary: '#e5e4d0', accent: '#419dce', hair: '#439fd0', eyes: '#e77dc7', description: 'Vaporwave' },
    { id: 19, primary: '#766462', secondary: '#ecebe9', accent: '#f0f002', hair: '#463e3c', eyes: '#fffd94', description: 'Bumblebee' },
    { id: 20, primary: '#524574', secondary: '#735BB2', accent: '#9028c5', hair: '#372d52', eyes: '#4afb15', description: 'Grape Soda' },
    { id: 21, primary: '#424954', secondary: '#edff5f', accent: '#3e933b', hair: '#313c4c', eyes: '#4dcc00', description: 'Limeade' },
    { id: 22, primary: '#5e4054', secondary: '#04fbf5', accent: '#6d245d', hair: '#301260', eyes: '#32fccc', description: 'Electric Blackberry' },
    { id: 23, primary: '#48495A', secondary: '#fafafa', accent: '#469c9b', hair: '#4f9597', eyes: '#4c5d6d', description: 'Moonlit Ocean' },
    { id: 24, primary: '#434343', secondary: '#353A43', accent: '#0972c3', hair: '#353A43', eyes: '#5942f9', description: 'Dark Matter' },
    { id: 25, primary: '#ae02c0', secondary: '#e1c1e3', accent: '#3c3e3c', hair: '#3a333b', eyes: '#00e600', description: 'Royal Purple Haze' },
    { id: 26, primary: '#00636d', secondary: '#cbe6e1', accent: '#17ad58', hair: '#cb7083', eyes: '#ffad0b', description: 'Sea Kelpy' },
    { id: 27, primary: '#8b0000', secondary: '#ffb6c1', accent: '#e75480', hair: '#5c4033', eyes: '#ffbf00', description: 'Strawberry Shortcake' },
    { id: 28, primary: '#19466C', secondary: '#add8e6', accent: '#20B2AA', hair: '#2f4f4f', eyes: '#8e7618', description: 'Deep Sea and Sky' },
    { id: 29, primary: '#556b2f', secondary: '#ffffcc', accent: '#8b4513', hair: '#3c341f', eyes: '#32cd32', description: 'Forest Moss' },
    { id: 30, primary: '#996515', secondary: '#ffefd5', accent: '#4682b4', hair: '#654321', eyes: '#daa520', description: 'Desert Mirage' },
    { id: 31, primary: '#58305E', secondary: '#d8bfd8', accent: '#9400d3', hair: '#551a8b', eyes: '#ee82ee', description: 'Starlight Nebula' },
    { id: 32, primary: '#006400', secondary: '#98fb98', accent: '#008b8b', hair: '#43362b', eyes: '#90ee90', description: 'Shamrock Shake' },
    { id: 33, primary: '#ff8c00', secondary: '#ffff99', accent: '#C00A0A', hair: '#ff5722', eyes: '#daa520', description: 'Solar Flare' },
    { id: 34, primary: '#ffb6c1', secondary: '#fff0f5', accent: '#ff69b4', hair: '#db7093', eyes: '#d2b48c', description: 'Sugar Plum Dream' },
    { id: 35, primary: '#d2b48c', secondary: '#ffffcc', accent: '#734F2C', hair: '#8b7355', eyes: '#b0e0e6', description: 'Espresso' },
    { id: 36, primary: '#FF7F00', secondary: '#00FF7F', accent: '#800080', hair: '#F5F5F5', eyes: '#FFFFAA', description: 'Neon Nightmare' }
  ]
};

const pickrSettings = {
  container: '.colorContainer',
  theme: 'classic',
  default: '',
  comparison: false,
  padding: 10,
  position: 'top',
  lockOpacity: false,
  defaultRepresentation: 'HEX',
  swatches: [
    'rgba(169, 169, 169, 1)', 'rgba(101, 67, 33, 1)', 'rgba(51, 47, 47, 1)', 'rgba(21, 21, 144, 1)',
    'rgba(34, 139, 34, 1)', 'rgba(210, 180, 140, 1)', 'rgba(105, 105, 105, 1)', 'rgba(255, 127, 80, 1)',
    'rgba(128, 0, 128, 1)', 'rgba(240, 240, 240, 1)', 'rgba(255, 253, 208, 1)', 'rgba(193, 25, 25, 1)',
    'rgba(173, 216, 230, 1)', 'rgba(152, 251, 152, 1)', 'rgba(255, 245, 225, 1)', 'rgba(51, 51, 51, 1)',
    'rgba(255, 255, 153, 1)', 'rgba(216, 191, 216, 1)', 'rgba(30, 144, 255, 1)', 'rgba(255, 215, 0, 1)',
    'rgba(176, 176, 176, 1)', 'rgba(255, 255, 153, 1)', 'rgba(255, 165, 0, 1)', 'rgba(255, 127, 80, 1)',
    'rgba(57, 255, 20, 1)', 'rgba(248, 248, 255, 1)', 'rgba(255, 182, 193, 1)'
  ],
  components: {
    preview: false, opacity: false, hue: true,
    interaction: { hex: true, rgba: true, hsla: false, hsva: false, cmyk: false, input: true }
  }
};

function createColorPicker(selector, onUpdate) {
  const el = document.querySelector(selector);
  if (!el) return null;
  const p = Pickr.create({ el: selector, ...pickrSettings });
  p.on('change', (color) => {
    const rawColor = "#" + color.toHEXA()[0] + color.toHEXA()[1] + color.toHEXA()[2];
    const gameColorCode = rawColor.replace("#", "0x");
    p.getRoot().button.style.setProperty('--pcr-color', rawColor);
    if (onUpdate) onUpdate(gameColorCode, rawColor);
  });
  return p;
}

window.ColorPickerManager.init = function () {
  const p = window.ColorPickerManager.pickers;
  const info = window.localPlayerInfo;
  const notifyUpdated = () => window.CharacterPreviewScene?.characterUpdated(info);

  p.mainPrimary = createColorPicker('.mainPrimaryColorBtn', (gameColor, rawColor) => {
    info.head.color = gameColor; info.ear.outerColor = gameColor; info.body.color = gameColor; info.tail.color = gameColor;
    if (p.outerEar) p.outerEar.setColor(rawColor);
    if (p.primaryHead) p.primaryHead.setColor(rawColor);
    if (p.body) p.body.setColor(rawColor);
    if (p.tail) p.tail.setColor(rawColor);
    notifyUpdated();
  });

  p.mainSecondary = createColorPicker('#mainSecondaryColorBtn', (gameColor, rawColor) => {
    info.head.secondaryColor = gameColor; info.ear.innerColor = gameColor; info.body.secondaryColor = gameColor;
    info.hands.color = gameColor; info.feet.color = gameColor; info.tail.secondaryColor = gameColor;
    if (p.secondaryHead) p.secondaryHead.setColor(rawColor);
    if (p.innerEar) p.innerEar.setColor(rawColor);
    if (p.secondaryBody) p.secondaryBody.setColor(rawColor);
    if (p.hands) p.hands.setColor(rawColor);
    if (p.feet) p.feet.setColor(rawColor);
    if (p.secondaryTail) p.secondaryTail.setColor(rawColor);
    notifyUpdated();
  });

  p.mainAccent = createColorPicker('#mainAccentColorBtn', (gameColor, rawColor) => {
    info.head.accentColor = gameColor; info.beak.color = gameColor; info.body.accentColor = gameColor;
    info.tail.accentColor = gameColor; info.headAccessories.color = gameColor;
    if (p.accentHead) p.accentHead.setColor(rawColor);
    if (p.beak) p.beak.setColor(rawColor);
    if (p.accentBody) p.accentBody.setColor(rawColor);
    if (p.accentTail) p.accentTail.setColor(rawColor);
    if (p.headAccessories) p.headAccessories.setColor(rawColor);
    notifyUpdated();
  });

  p.primaryHead = createColorPicker('#headColorBtn', (gameColor, rawColor) => {
    info.head.color = gameColor; document.getElementById('primaryHeadHex').value = rawColor; notifyUpdated();
  });
  p.beak = createColorPicker('#beakColorBtn', (gameColor, rawColor) => {
    info.beak.color = gameColor; document.getElementById('beakHex').value = gameColor; notifyUpdated();
  });
  p.secondaryHead = createColorPicker('#secondaryHeadColorBtn', (gameColor, rawColor) => {
    info.head.secondaryColor = gameColor; document.getElementById('secondaryHeadHex').value = rawColor; notifyUpdated();
  });
  p.accentHead = createColorPicker('#accentHeadColorBtn', (gameColor, rawColor) => {
    info.head.accentColor = gameColor; document.getElementById('accentHeadHex').value = rawColor; notifyUpdated();
  });
  p.hair = createColorPicker('#hairColorBtn', (gameColor, rawColor) => {
    info.hair.color = gameColor; document.getElementById('hairHex').value = rawColor; notifyUpdated();
  });
  p.outerEar = createColorPicker('#outerEarColorBtn', (gameColor, rawColor) => {
    info.ear.outerColor = gameColor; document.getElementById('outerEarHex').value = rawColor; notifyUpdated();
  });
  p.innerEar = createColorPicker('#innerEarColorBtn', (gameColor, rawColor) => {
    info.ear.innerColor = gameColor; document.getElementById('innerEarHex').value = rawColor; notifyUpdated();
  });
  p.eyes = createColorPicker('#eyeColorBtn', (gameColor, rawColor) => {
    info.eyes.color = gameColor; document.getElementById('eyesHex').value = rawColor; notifyUpdated();
  });
  p.headAccessories = createColorPicker('#headAccessoriesColorBtn', (gameColor, rawColor) => {
    info.headAccessories.color = gameColor; document.getElementById('headAccessoriesHex').value = rawColor; notifyUpdated();
  });
  p.body = createColorPicker('#bodyColorBtn', (gameColor, rawColor) => {
    info.body.color = gameColor; document.getElementById('bodyHex').value = rawColor; notifyUpdated();
  });
  p.secondaryBody = createColorPicker('#secondaryBodyColorBtn', (gameColor, rawColor) => {
    info.body.secondaryColor = gameColor; document.getElementById('secondaryBodyHex').value = rawColor; notifyUpdated();
  });
  p.accentBody = createColorPicker('#accentBodyColorBtn', (gameColor, rawColor) => {
    info.body.accentColor = gameColor; document.getElementById('accentBodyHex').value = rawColor; notifyUpdated();
  });
  p.hands = createColorPicker('#handsColorBtn', (gameColor, rawColor) => {
    info.hands.color = gameColor; document.getElementById('handsHex').value = gameColor; notifyUpdated();
  });
  p.feet = createColorPicker('#feetColorBtn', (gameColor, rawColor) => {
    info.feet.color = gameColor; document.getElementById('feetHex').value = gameColor; notifyUpdated();
  });
  p.tail = createColorPicker('#tailColorBtn', (gameColor, rawColor) => {
    info.tail.color = gameColor; document.getElementById('tailHex').value = rawColor; notifyUpdated();
  });
  p.secondaryTail = createColorPicker('#secondaryTailColorBtn', (gameColor, rawColor) => {
    info.tail.secondaryColor = gameColor; document.getElementById('secondaryTailHex').value = rawColor; notifyUpdated();
  });
  p.accentTail = createColorPicker('#accentTailColorBtn', (gameColor, rawColor) => {
    info.tail.accentColor = gameColor; document.getElementById('accentTailHex').value = rawColor; notifyUpdated();
  });
};

function getSafeOptionValue(selectId, index) {
  const el = document.getElementById(selectId);
  if (!el || !el.options || el.options.length === 0) return null;
  const safeIndex = Math.min(Math.max(0, index), el.options.length - 1);
  return el.options[safeIndex] ? el.options[safeIndex].value : null;
}

window.ColorPickerManager.randomizeColors = function () {
  const p = window.ColorPickerManager.pickers;
  const sets = window.ColorPickerManager.bodyColorSets;
  const randomChoice = Math.floor(Math.random() * sets.length);
  const choice = sets[randomChoice];

  const randomBody = 0;
  const randomGenitals = Math.floor(Math.random() * 2);
  const randomHead = Math.floor(Math.random() * 6);
  const randomHeadSecondaryFur = Math.floor(Math.random() * 6);
  const randomHeadAccentFur = Math.floor(Math.random() * 1);
  const randomHeadAccessories = Math.floor(Math.random() * 6);
  const randomHair = Math.floor(Math.random() * 4);

  let randomEars = 1;
  if (randomHead === 5) {
    randomEars = Math.floor(Math.random() * 2) === 1 ? 0 : 7;
  } else {
    randomEars = Math.floor(Math.random() * 11) + 1;
  }

  const randomBodySecondaryFur = Math.floor(Math.random() * 4);
  const randomBodyAccentFur = Math.floor(Math.random() * 4);
  const randomHandsFur = Math.floor(Math.random() * 3);
  const randomFeetFur = Math.floor(Math.random() * 3);
  const randomTail = Math.floor(Math.random() * 7);
  const randomSecondaryTail = Math.floor(Math.random() * 7);
  const randomSecondaryTailCheck = randomSecondaryTail === 0 ? 7 : 6;
  const randomAccentTail = Math.floor(Math.random() * randomSecondaryTailCheck);

  if (window.CharacterCreatorApp?.updateSelectAndSyncUI) {
    const u = window.CharacterCreatorApp.updateSelectAndSyncUI;

    const bodyShapeVal = getSafeOptionValue('bodyShape', randomBody);
    if (bodyShapeVal) u('bodyShape', bodyShapeVal);

    const mainBodyVal = getSafeOptionValue('mainBodyType', randomBody);
    if (mainBodyVal) {
      const mainBodyEl = document.getElementById('mainBodyType');
      if (mainBodyEl) {
        mainBodyEl.value = mainBodyVal;
        mainBodyEl.dispatchEvent(new Event('change'));
      }
    }

    const genitalsVal = getSafeOptionValue('genitals', randomGenitals);
    if (genitalsVal) u('genitals', genitalsVal);

    const headVal = getSafeOptionValue('head', randomHead);
    if (headVal) {
      const headEl = document.getElementById('head');
      if (headEl) {
        headEl.value = headVal;
        headEl.dispatchEvent(new Event('change'));
      }
    }

    const secHeadVal = getSafeOptionValue('headSecondaryFur', randomHeadSecondaryFur);
    if (secHeadVal) {
      u('headSecondaryFur', secHeadVal);
      if (window.localPlayerInfo?.head) window.localPlayerInfo.head.secondarySprite = secHeadVal;
    }

    const accHeadVal = getSafeOptionValue('headAccentFur', randomHeadAccentFur);
    if (accHeadVal) {
      u('headAccentFur', accHeadVal);
      if (window.localPlayerInfo?.head) window.localPlayerInfo.head.accentSprite = accHeadVal;
    }

    const accHeadAccVal = getSafeOptionValue('headAccessories', randomHeadAccessories);
    if (accHeadAccVal) {
      u('headAccessories', accHeadAccVal);
      if (window.localPlayerInfo?.headAccessories) window.localPlayerInfo.headAccessories.sprite = accHeadAccVal;
    }

    const hairVal = getSafeOptionValue('hair', randomHair);
    if (hairVal) {
      u('hair', hairVal);
      if (window.localPlayerInfo?.hair) window.localPlayerInfo.hair.sprite = hairVal;
    }

    const outerEarVal = getSafeOptionValue('outerEar', randomEars);
    if (outerEarVal) {
      u('outerEar', outerEarVal);
      const innerVal = (typeof getInnerEarSprite === 'function') ? getInnerEarSprite(outerEarVal) : 'ears_01-inner';
      if (window.localPlayerInfo?.ear) {
        window.localPlayerInfo.ear.outerSprite = outerEarVal;
        window.localPlayerInfo.ear.innerSprite = innerVal;
      }
      if (document.getElementById('innerEar')) document.getElementById('innerEar').value = innerVal;
    }

    if (window.localPlayerInfo?.eyes) {
      window.localPlayerInfo.eyes.outer = window.localPlayerInfo.eyes.outer || 'eyes_02';
      window.localPlayerInfo.eyes.iris = window.localPlayerInfo.eyes.iris || 'eyes_01';
    }
    if (document.getElementById('eyesOuter')) document.getElementById('eyesOuter').value = window.localPlayerInfo?.eyes?.outer || 'eyes_02';
    if (document.getElementById('eyesIris')) document.getElementById('eyesIris').value = window.localPlayerInfo?.eyes?.iris || 'eyes_01';

    const secBodyVal = getSafeOptionValue('bodySecondaryFur', randomBodySecondaryFur);
    if (secBodyVal) {
      u('bodySecondaryFur', secBodyVal);
      if (window.localPlayerInfo?.body) window.localPlayerInfo.body.secondarySprite = secBodyVal;
    }

    const accBodyVal = getSafeOptionValue('bodyAccentFur', randomBodyAccentFur);
    if (accBodyVal) {
      u('bodyAccentFur', accBodyVal);
      if (window.localPlayerInfo?.body) window.localPlayerInfo.body.accentSprite = accBodyVal;
    }

    const handsVal = getSafeOptionValue('handsFur', randomHandsFur);
    if (handsVal) {
      u('handsFur', handsVal);
      if (window.localPlayerInfo?.hands) window.localPlayerInfo.hands.sprite = handsVal;
    }

    const feetVal = getSafeOptionValue('feetFur', randomFeetFur);
    if (feetVal) {
      u('feetFur', feetVal);
      if (window.localPlayerInfo?.feet) window.localPlayerInfo.feet.sprite = feetVal;
    }

    const tailVal = getSafeOptionValue('tail', randomTail);
    if (tailVal) {
      const tailEl = document.getElementById('tail');
      if (tailEl) {
        tailEl.value = tailVal;
        tailEl.dispatchEvent(new Event('change'));
      }
    }

    const secTailVal = getSafeOptionValue('tailSecondaryFur', randomSecondaryTail);
    if (secTailVal) {
      u('tailSecondaryFur', secTailVal);
      if (window.localPlayerInfo?.tail) window.localPlayerInfo.tail.secondarySprite = secTailVal;
      if (window.CharacterCreatorApp?.populateTailAccentOptions) {
        window.CharacterCreatorApp.populateTailAccentOptions(tailVal || window.localPlayerInfo?.tail?.sprite || 'tail_01');
      }
    }

    const accTailVal = getSafeOptionValue('tailAccentFur', randomAccentTail);
    if (accTailVal) {
      u('tailAccentFur', accTailVal);
      if (window.localPlayerInfo?.tail) window.localPlayerInfo.tail.accentSprite = accTailVal;
    }
  }

  if (p.mainPrimary) p.mainPrimary.setColor(choice.primary);
  if (p.mainSecondary) p.mainSecondary.setColor(choice.secondary);
  if (p.mainAccent) p.mainAccent.setColor(choice.accent);
  if (p.primaryHead) p.primaryHead.setColor(choice.primary);
  if (p.beak) p.beak.setColor(choice.accent);
  if (p.secondaryHead) p.secondaryHead.setColor(choice.secondary);
  if (p.accentHead) p.accentHead.setColor(choice.accent);
  if (p.hair) p.hair.setColor(choice.hair);
  if (p.outerEar) p.outerEar.setColor(choice.primary);
  if (p.innerEar) p.innerEar.setColor(choice.secondary);
  if (p.eyes) p.eyes.setColor(choice.eyes);
  if (p.body) p.body.setColor(choice.primary);
  if (p.secondaryBody) p.secondaryBody.setColor(choice.secondary);
  if (p.accentBody) p.accentBody.setColor(choice.accent);
  if (p.hands) p.hands.setColor(choice.secondary);
  if (p.feet) p.feet.setColor(choice.secondary);
  if (p.tail) p.tail.setColor(choice.primary);
  if (p.secondaryTail) p.secondaryTail.setColor(choice.secondary);
  if (p.accentTail) p.accentTail.setColor(choice.accent);

  window.CharacterPreviewScene?.characterUpdated(window.localPlayerInfo);
};
