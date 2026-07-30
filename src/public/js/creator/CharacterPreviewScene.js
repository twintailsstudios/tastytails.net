/**
 * @fileoverview CharacterPreviewScene.js - Phaser 3 Preview Engine for Character Creator
 *
 * @description
 * Manages the live 2D Phaser game engine canvas inside #preview container.
 * Handles modular sprite loading, container depth sorting, lazy animation creation,
 * direction rotation (Down, Right, Up, Left), and real-time color tinting.
 */

window.CharacterPreviewScene = {
  config: {
    type: Phaser.AUTO,
    parent: 'preview',
    width: 200,
    height: 300,
    backgroundColor: '#4488aa',
    physics: {
      default: 'arcade',
      arcade: {
        debug: false,
        gravity: { y: 0 }
      }
    },
    scene: {
      preload: preload,
      create: create,
      update: update
    }
  },

  rotation: 1,
  isReady: false,
  gameInstance: null
};

function preload() {
  const scene = this;

  // Progress Bar Listener
  scene.load.on('progress', function (value) {
    const percent = Math.floor(value * 100);
    const bar = document.getElementById('loading-bar-fill');
    const text = document.getElementById('loading-percent');
    if (bar) bar.style.width = percent + '%';
    if (text) text.innerText = percent + '%';
  });

  scene.spritesToAnimate = [];

  const assetConfig = {
    singles: [
      'empty',
      'body_01',
      'body_01-empty', 'body_02-empty', 'body_03-empty', 'body_04-empty',
      'head_05_beak'
    ],
    groups: [
      { prefix: 'body_01-secondary_', count: 4 },
      { prefix: 'body_01-accent_', count: 3 },
      { prefix: 'body_01-hands-secondary_', count: 2 },
      { prefix: 'body_01-feet-secondary_', count: 2 },
      { prefix: 'ears_', count: 11, suffixes: ['-outer', '-inner'] },
      { prefix: 'eyes_', count: 2 },
      { prefix: 'headAccessories_', count: 5 },
      {
        customLoop: true,
        run: (s) => {
          for (let i = 1; i <= 6; i++) {
            const headKey = `head_0${i}`;
            s.load.spritesheet(headKey, `./../assets/spritesheets/${headKey}.png`, { frameWidth: 215, frameHeight: 198 });
            s.spritesToAnimate.push(headKey);
            for (let j = 1; j <= 5; j++) {
              const secKey = `${headKey}-secondary_0${j}`;
              s.load.spritesheet(secKey, `./../assets/spritesheets/${secKey}.png`, { frameWidth: 215, frameHeight: 198 });
              s.spritesToAnimate.push(secKey);
            }
          }
        }
      },
      {
        customLoop: true,
        run: (s) => {
          for (let i = 1; i <= 10; i++) {
            const tailNum = i < 10 ? `0${i}` : i;
            const tailKey = `tail_${tailNum}`;
            s.load.spritesheet(tailKey, `./../assets/spritesheets/${tailKey}.png`, { frameWidth: 215, frameHeight: 198 });
            s.spritesToAnimate.push(tailKey);
            for (let j = 1; j <= 6; j++) {
              const secKey = `${tailKey}-secondary_0${j}`;
              s.load.spritesheet(secKey, `./../assets/spritesheets/${secKey}.png`, { frameWidth: 215, frameHeight: 198 });
              s.spritesToAnimate.push(secKey);
            }
          }
        }
      },
      { prefix: 'hair-front_', count: 3 }
    ]
  };

  // Load Singles
  assetConfig.singles.forEach(key => {
    let path = `./../assets/spritesheets/${key}.png`;
    if (key.includes('empty')) path = './../assets/spritesheets/empty.png';
    const dims = key.includes('empty') ? { frameWidth: 109, frameHeight: 220 } : { frameWidth: 215, frameHeight: 198 };
    scene.load.spritesheet(key, path, dims);
    scene.spritesToAnimate.push(key);
  });

  // Load Groups
  assetConfig.groups.forEach(group => {
    if (group.customLoop) {
      group.run(scene);
    } else {
      const suffixes = group.suffixes || [''];
      for (let i = 1; i <= group.count; i++) {
        const num = i < 10 ? `0${i}` : i;
        suffixes.forEach(suffix => {
          const key = `${group.prefix}${num}${suffix}`;
          scene.load.spritesheet(key, `./../assets/spritesheets/${key}.png`, { frameWidth: 215, frameHeight: 198 });
          scene.spritesToAnimate.push(key);
        });
      }
    }
  });
}

function create() {
  const self = this;
  window.CharacterPreviewScene.sceneInstance = self;

  if (typeof io !== 'undefined') {
    self.socket = io();
    self.socket.on('currentPlayers', function (players) {
      Object.keys(players).forEach(function (id) {
        if (players[id].playerId === self.socket.id) {
          addPlayer(self, players[id]);
        }
      });
    });
  } else {
    addPlayer(self, { playerId: 'local_player' });
  }
}

function update() { }

/**
 * Plays animation safely with lazy animation creation and texture existence checks.
 */
/**
 * Synchronizes a sprite's animation frame index, accumulator timer, and texture frame
 * with a master reference animation frame state.
 */
function syncSpriteFrameAndAccumulator(targetSprite, masterRelIndex, masterAccumulator) {
  if (!targetSprite || !targetSprite.anims || !targetSprite.anims.currentAnim) return;
  const frames = targetSprite.anims.currentAnim.frames;
  if (!frames || frames.length === 0) return;

  const safeIndex = Math.abs(masterRelIndex) % frames.length;
  const targetFrameObj = frames[safeIndex];
  if (!targetFrameObj) return;

  targetSprite.anims.currentFrame = targetFrameObj;
  targetSprite.anims.accumulator = masterAccumulator || 0;
  if (targetSprite.setFrame && targetFrameObj.frame) {
    const frameName = typeof targetFrameObj.frame === 'object' ? targetFrameObj.frame.name : targetFrameObj.frame;
    if (frameName !== undefined && frameName !== null) {
      targetSprite.setFrame(frameName);
    }
  }
}

/**
 * Plays animation safely with lazy animation creation, texture existence checks,
 * and exact frame index/accumulator synchronization across composite avatar sprite layers.
 */
function playSafeAnimation(spriteInstance, scene, key, direction, masterSync = null) {
  if (!spriteInstance) return;
  if (!key || key === 'empty' || key.includes('empty')) {
    spriteInstance.setVisible(false);
    return;
  }
  spriteInstance.setVisible(true);

  const animKey = `${key}${direction}`;
  if (!scene.anims.exists(animKey)) {
    if (!scene.textures.exists(key)) {
      return;
    }

    let frameConfig = { start: 1, end: 8 };
    if (direction === 'Right') frameConfig = { start: 10, end: 17 };
    if (direction === 'Left') frameConfig = { start: 19, end: 26 };
    if (direction === 'Up') frameConfig = { start: 28, end: 35 };

    scene.anims.create({
      key: animKey,
      frames: scene.anims.generateFrameNumbers(key, frameConfig),
      frameRate: 8,
      repeat: -1
    });
  }

  const isNewAnim = !spriteInstance.anims.currentAnim || spriteInstance.anims.currentAnim.key !== animKey;
  spriteInstance.play(animKey, true);

  if (isNewAnim && masterSync) {
    syncSpriteFrameAndAccumulator(spriteInstance, masterSync.relIndex, masterSync.accumulator);
  }
}

/**
 * Updates sprite container depth and plays direction animation.
 */
window.CharacterPreviewScene.rotationfunct = function (self, rotation) {
  if (!self || !self.container) return;
  let direction = 'Down';

  if (rotation === 1) {
    direction = 'Down';
    self.container.sendToBack(self.accentTail);
    self.container.sendToBack(self.secondaryTail);
    self.container.sendToBack(self.tail);
    self.container.bringToTop(self.headAccessories);
  } else if (rotation === 2) {
    direction = 'Right';
    self.container.bringToTop(self.tail);
    self.container.bringToTop(self.secondaryTail);
    self.container.bringToTop(self.accentTail);
    self.container.bringToTop(self.headAccessories);
  } else if (rotation === 3) {
    direction = 'Up';
    self.container.bringToTop(self.tail);
    self.container.bringToTop(self.secondaryTail);
    self.container.bringToTop(self.accentTail);
    self.container.sendToBack(self.headAccessories);
  } else if (rotation === 4) {
    direction = 'Left';
    self.container.bringToTop(self.tail);
    self.container.bringToTop(self.secondaryTail);
    self.container.bringToTop(self.accentTail);
    self.container.bringToTop(self.headAccessories);
  }

  const pInfo = window.localPlayerInfo;
  if (!pInfo) return;

  let masterSync = null;
  const refSprites = [self.body, self.head, self.tail, self.outerEar, self.hair];
  for (let s of refSprites) {
    if (s && s.anims && s.anims.currentAnim && s.anims.currentFrame) {
      const anim = s.anims.currentAnim;
      const startFrameIdx = (anim.frames && anim.frames[0]) ? anim.frames[0].index : 0;
      const relIndex = s.anims.currentFrame.index - startFrameIdx;
      const accumulator = s.anims.accumulator || 0;
      masterSync = { relIndex: Math.max(0, relIndex), accumulator };
      break;
    }
  }

  playSafeAnimation(self.head, self, pInfo.head.sprite, direction, masterSync);
  playSafeAnimation(self.beak, self, pInfo.beak.sprite, direction, masterSync);
  playSafeAnimation(self.secondaryHead, self, pInfo.head.secondarySprite, direction, masterSync);
  playSafeAnimation(self.accentHead, self, pInfo.head.accentSprite, direction, masterSync);
  playSafeAnimation(self.headAccessories, self, pInfo.headAccessories.sprite, direction, masterSync);
  playSafeAnimation(self.body, self, pInfo.body.sprite, direction, masterSync);
  playSafeAnimation(self.secondaryBody, self, pInfo.body.secondarySprite, direction, masterSync);
  playSafeAnimation(self.accentBody, self, pInfo.body.accentSprite, direction, masterSync);
  playSafeAnimation(self.tail, self, pInfo.tail.sprite, direction, masterSync);
  playSafeAnimation(self.secondaryTail, self, pInfo.tail.secondarySprite, direction, masterSync);
  playSafeAnimation(self.accentTail, self, pInfo.tail.accentSprite, direction, masterSync);
  playSafeAnimation(self.hair, self, pInfo.hair.sprite, direction, masterSync);
  playSafeAnimation(self.outerEar, self, pInfo.ear.outerSprite, direction, masterSync);
  playSafeAnimation(self.innerEar, self, pInfo.ear.innerSprite, direction, masterSync);
  playSafeAnimation(self.eyes, self, pInfo.eyes.outer, direction, masterSync);
  playSafeAnimation(self.iris, self, pInfo.eyes.iris, direction, masterSync);
  playSafeAnimation(self.genitals, self, (pInfo.genitals?.sprite || pInfo.genitles?.sprite || 'empty'), direction, masterSync);
  playSafeAnimation(self.hands, self, pInfo.hands.sprite, direction, masterSync);
  playSafeAnimation(self.feet, self, pInfo.feet.sprite, direction, masterSync);
};

/**
 * Updates sprite tints when localPlayerInfo changes.
 */
window.CharacterPreviewScene.characterUpdated = function (playerInfo) {
  const self = window.CharacterPreviewScene.sceneInstance;
  if (!self) return;

  window.CharacterPreviewScene.rotationfunct(self, window.CharacterPreviewScene.rotation);

  if (self.head) self.head.setTint(playerInfo.head.color);
  if (self.beak) self.beak.setTint(playerInfo.beak.color);
  if (self.secondaryHead) self.secondaryHead.setTint(playerInfo.head.secondaryColor);
  if (self.accentHead) self.accentHead.setTint(playerInfo.head.accentColor);
  if (self.headAccessories) self.headAccessories.setTint(playerInfo.headAccessories.color);
  if (self.body) self.body.setTint(playerInfo.body.color);
  if (self.secondaryBody) self.secondaryBody.setTint(playerInfo.body.secondaryColor);
  if (self.accentBody) self.accentBody.setTint(playerInfo.body.accentColor);
  if (self.hands) self.hands.setTint(playerInfo.hands.color);
  if (self.feet) self.feet.setTint(playerInfo.feet.color);
  if (self.tail) self.tail.setTint(playerInfo.tail.color);
  if (self.secondaryTail) self.secondaryTail.setTint(playerInfo.tail.secondaryColor);
  if (self.accentTail) self.accentTail.setTint(playerInfo.tail.accentColor);
  if (self.hair) self.hair.setTint(playerInfo.hair.color);
  if (self.outerEar) self.outerEar.setTint(playerInfo.ear.outerColor);
  if (self.innerEar) self.innerEar.setTint(playerInfo.ear.innerColor);
  if (self.iris) self.iris.setTint(playerInfo.eyes.color);
};

function addPlayer(self, playerInfo) {
  const pInfo = window.localPlayerInfo;

  self.container = self.add.container(0, 0).setSize(70, 170).setInteractive().setScale(1.5);

  self.head = self.physics.add.sprite(0, 0, pInfo.head.sprite).setInteractive();
  self.head.setTint(pInfo.head.color);
  self.beak = self.physics.add.sprite(0, 0, pInfo.beak.sprite).setInteractive();
  self.beak.setTint(pInfo.beak.color);
  self.secondaryHead = self.physics.add.sprite(0, 0, pInfo.head.secondarySprite).setInteractive();
  self.secondaryHead.setTint(pInfo.head.secondaryColor);
  self.accentHead = self.physics.add.sprite(0, 0, pInfo.head.accentSprite).setInteractive();
  self.accentHead.setTint(pInfo.head.accentColor);
  self.headAccessories = self.physics.add.sprite(0, 0, pInfo.headAccessories.sprite).setInteractive();
  self.headAccessories.setTint(pInfo.headAccessories.color);

  self.body = self.physics.add.sprite(0, 0, pInfo.body.sprite).setInteractive();
  self.body.setTint(pInfo.body.color);
  self.secondaryBody = self.physics.add.sprite(0, 0, pInfo.body.secondarySprite).setInteractive();
  self.secondaryBody.setTint(pInfo.body.secondaryColor);
  self.accentBody = self.physics.add.sprite(0, 0, pInfo.body.accentSprite).setInteractive();
  self.accentBody.setTint(pInfo.body.accentColor);
  self.hands = self.physics.add.sprite(0, 0, pInfo.hands.sprite).setInteractive();
  self.hands.setTint(pInfo.hands.color);
  self.feet = self.physics.add.sprite(0, 0, pInfo.feet.sprite).setInteractive();
  self.feet.setTint(pInfo.feet.color);

  self.tail = self.physics.add.sprite(0, 0, pInfo.tail.sprite).setInteractive();
  self.tail.setTint(pInfo.tail.color);
  self.secondaryTail = self.physics.add.sprite(0, 0, pInfo.tail.secondarySprite).setInteractive();
  self.secondaryTail.setTint(pInfo.tail.secondaryColor);
  self.accentTail = self.physics.add.sprite(0, 0, pInfo.tail.accentSprite).setInteractive();
  self.accentTail.setTint(pInfo.tail.accentColor);

  self.hair = self.physics.add.sprite(0, 0, pInfo.hair.sprite).setInteractive();
  self.hair.setTint(pInfo.hair.color);

  self.outerEar = self.physics.add.sprite(0, 0, pInfo.ear.outerSprite).setInteractive();
  self.outerEar.setTint(pInfo.ear.outerColor);
  self.innerEar = self.physics.add.sprite(0, 0, pInfo.ear.innerSprite).setInteractive();
  self.innerEar.setTint(pInfo.ear.innerColor);

  self.eyes = self.physics.add.sprite(0, 0, pInfo.eyes.outer).setInteractive();
  self.iris = self.physics.add.sprite(0, 0, pInfo.eyes.iris).setInteractive();
  self.iris.setTint(pInfo.eyes.color);

  self.genitals = self.physics.add.sprite(0, 0, (pInfo.genitals?.sprite || 'empty')).setInteractive();

  self.container.add([
    self.tail, self.secondaryTail, self.accentTail,
    self.body, self.secondaryBody, self.accentBody, self.genitals, self.hands, self.feet,
    self.head, self.secondaryHead, self.accentHead, self.beak,
    self.eyes, self.iris, self.hair, self.outerEar, self.innerEar, self.headAccessories
  ]);

  window.CharacterPreviewScene.rotationfunct(self, window.CharacterPreviewScene.rotation);

  self.cameras.main.setSize(200, 300).startFollow(self.container).setName('Camera 1');

  if (window.onPhaserReady) {
    window.onPhaserReady();
  }
}
