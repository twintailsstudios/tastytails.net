import { windowSize } from './utils.js';
import { createVoreList } from './ui.js';

export function getPlayerSprite(playerId, group) {
    return group.getChildren().find(child => child.playerId === playerId);
}

export function displayPlayers(self, playerInfo) {
    const localPlayerInfo = window.localPlayerInfo;
    console.log('[displayPlayers] Creating player with playerInfo:', playerInfo);
    console.log(`%c[displayPlayers] Creating player at: (${playerInfo.position.x}, ${playerInfo.position.y})`, 'color: cyan; font-weight: bold;');
    console.log('localPlayerInfo at displayPlayers Function = ', localPlayerInfo);

    const playerContainer = self.add.container(playerInfo.position.x, playerInfo.position.y);
    updateStruggleBar(playerContainer, playerInfo, self);

    // If the player is consumed, we hide their sprite entirely.
    // They are technically still there (for camera following), but invisible.
    if (playerInfo.consumedBy) {
        playerContainer.setVisible(false);
    }

    console.log('[displayPlayers] playerContainer created at:', playerContainer.x, playerContainer.y);
    playerContainer.setSize(60, 163);
    self.physics.world.enable(playerContainer);
    playerContainer.body.setSize(60, 30); // Match server collision box size
    playerContainer.body.setOffset(30, 66.5); // Match server collision box position (centered on y, x aligned)
    playerContainer.body.setCollideWorldBounds(false); // Prevent going off-map
    playerContainer.setInteractive(new Phaser.Geom.Rectangle(30, -81.5, 60, 163), Phaser.Geom.Rectangle.Contains);

    // Add colliders for all map layers that have blocked tiles
    if (self.mapLayers) {
        self.mapLayers.forEach(layer => {
            if (layer) {
                self.physics.add.collider(playerContainer, layer);
            }
        });
    }

    console.log('player coordinates are: X= ', playerInfo.position.x, 'Y= ', playerInfo.position.y);

    //----- the 30, -87 defines the placement of the sprite in the container -----//
    const playerContainerTail = self.add.sprite(30, -81.5, playerInfo.tail.sprite).setTint(playerInfo.tail.color).setName('tail');
    const playerContainersecondaryTail = self.add.sprite(30, -81.5, playerInfo.tail.secondarySprite).setTint(playerInfo.tail.secondaryColor).setName('secondaryTail');
    const playerContaineraccentTail = self.add.sprite(30, -81.5, playerInfo.tail.accentSprite).setTint(playerInfo.tail.accentColor).setName('accentTail');

    const playerContainerbody = self.add.sprite(30, -81.5, playerInfo.body.sprite).setTint(playerInfo.body.color).setName('body');
    const playerContainersecondaryBody = self.add.sprite(30, -81.5, playerInfo.body.secondarySprite).setTint(playerInfo.body.secondaryColor).setName('secondaryBody');
    const playerContaineraccentBody = self.add.sprite(30, -81.5, playerInfo.body.accentSprite).setTint(playerInfo.body.accentColor).setName('accentBody');
    const playerContainergenitles = self.add.sprite(30, -81.5, playerInfo.genitles.sprite).setName('genitles');
    const playerContainerHands = self.add.sprite(30, -81.5, playerInfo.hands.sprite).setTint(playerInfo.hands.color).setName('hands');
    const playerContainerFeet = self.add.sprite(30, -81.5, playerInfo.feet.sprite).setTint(playerInfo.feet.color).setName('feet');

    const playerContainerhead = self.add.sprite(30, -81.5, playerInfo.head.sprite).setTint(playerInfo.head.color).setName('head');
    const playerContainersecondaryHead = self.add.sprite(30, -81.5, playerInfo.head.secondarySprite).setTint(playerInfo.head.secondaryColor).setName('secondaryHead');
    const playerContaineraccentHead = self.add.sprite(30, -81.5, playerInfo.head.accentSprite).setTint(playerInfo.head.accentColor).setName('accentHead');

    const playerContainerBeak = self.add.sprite(30, -81.5, playerInfo.beak.sprite).setTint(playerInfo.beak.color).setName('beak');

    const playerContainerouterEar = self.add.sprite(30, -81.5, playerInfo.ear.outerSprite).setTint(playerInfo.ear.outerColor).setName('outerEar');
    const playerContainerinnerEar = self.add.sprite(30, -81.5, playerInfo.ear.innerSprite).setTint(playerInfo.ear.innerColor).setName('innerEar');

    const playerContainereyes = self.add.sprite(30, -81.5, playerInfo.eyes.outer).setName('eyes');
    const playerContaineriris = self.add.sprite(30, -81.5, playerInfo.eyes.iris).setTint(playerInfo.eyes.color).setName('iris');
    const playerContainerhair = self.add.sprite(30, -81.5, playerInfo.hair.sprite).setTint(playerInfo.hair.color).setName('hair');
    const playerContainerheadAccessories = self.add.sprite(30, -81.5, playerInfo.headAccessories.sprite).setTint(playerInfo.headAccessories.color).setName('headAccessories');

    playerContainer.add([
        playerContainerTail,
        playerContainersecondaryTail,
        playerContaineraccentTail,

        playerContainerbody,
        playerContainersecondaryBody,
        playerContaineraccentBody,
        playerContainergenitles,
        playerContainerHands,
        playerContainerFeet,

        playerContainerhead,
        playerContainersecondaryHead,
        playerContaineraccentHead,

        playerContainerBeak,

        playerContainereyes,
        playerContaineriris,
        playerContainerhair,
        playerContainerouterEar,
        playerContainerinnerEar,
        playerContainerheadAccessories
    ]);

    self.playerContainer = playerContainer;
    self.players.add(playerContainer);
    self.cameras.main.startFollow(self.playerContainer);
    createVoreList(playerInfo.voreTypes, self);
    window.avatarSelected = true;

    window.cam1 = self.cameras.main.setSize(windowSize().x, windowSize().y).startFollow(playerContainer).setName('Camera 1');
    console.log('cam1 width and height = ', window.cam1.width, window.cam1.height);

    document.getElementById('phaserApp').focus();

    playerContainer.playerInfo = playerInfo;
    window.avatarSelected = true;
}

export function displayOtherPlayers(self, playerInfo) {
    console.log("displayOtherPlayers function called");
    // Check for existing player to avoid duplicates
    const existingPlayer = getPlayerSprite(playerInfo.playerId, self.otherPlayersGroup);
    if (existingPlayer) {
        console.warn('Duplicate player detected in displayOtherPlayers. Destroying old one.', playerInfo.playerId);
        existingPlayer.destroy();
    }

    const otherPlayerContainer = self.add.container(playerInfo.position.x, playerInfo.position.y);
    otherPlayerContainer.setSize(60, 163);
    self.physics.world.enable(otherPlayerContainer);
    otherPlayerContainer.setInteractive(new Phaser.Geom.Rectangle(30, -81.5, 60, 163), Phaser.Geom.Rectangle.Contains);
    otherPlayerContainer.body.setOffset(30, -81.5);

    // If the player is consumed, we hide their sprite.
    if (playerInfo.consumedBy) {
        otherPlayerContainer.setVisible(false);
    }

    const playerContainertail = self.add.sprite(30, -81.5, playerInfo.tail.sprite).setName('tail');
    playerContainertail.setTint(playerInfo.tail.color);
    const playerContainersecondaryTail = self.add.sprite(30, -81.5, playerInfo.tail.secondarySprite).setName('secondaryTail');
    playerContainersecondaryTail.setTint(playerInfo.tail.secondaryColor);
    const playerContaineraccentTail = self.add.sprite(30, -81.5, playerInfo.tail.accentSprite).setName('accentTail');
    playerContaineraccentTail.setTint(playerInfo.tail.accentColor);
    const playerContainerbody = self.add.sprite(30, -81.5, playerInfo.body.sprite).setName('body');
    playerContainerbody.setTint(playerInfo.body.color);
    const playerContainersecondaryBody = self.add.sprite(30, -81.5, playerInfo.body.secondarySprite).setName('secondaryBody');
    playerContainersecondaryBody.setTint(playerInfo.body.secondaryColor);
    const playerContaineraccentBody = self.add.sprite(30, -81.5, playerInfo.body.accentSprite).setName('accentBody');
    playerContaineraccentBody.setTint(playerInfo.body.accentColor);
    const playerContainergenitles = self.add.sprite(30, -81.5, playerInfo.genitles.sprite).setName('genitles');
    const playerContainerHands = self.add.sprite(30, -81.5, playerInfo.hands.sprite).setName('hands');
    playerContainerHands.setTint(playerInfo.hands.color);
    const playerContainerFeet = self.add.sprite(30, -81.5, playerInfo.feet.sprite).setName('feet');
    playerContainerFeet.setTint(playerInfo.feet.color);
    const playerContainerhead = self.add.sprite(30, -81.5, playerInfo.head.sprite).setName('head');
    playerContainerhead.setTint(playerInfo.head.color);
    const playerContainersecondaryHead = self.add.sprite(30, -81.5, playerInfo.head.secondarySprite).setName('secondaryHead');
    playerContainersecondaryHead.setTint(playerInfo.head.secondaryColor);
    const playerContaineraccentHead = self.add.sprite(30, -81.5, playerInfo.head.accentSprite).setName('accentHead');
    playerContaineraccentHead.setTint(playerInfo.head.accentColor);
    const playerContainerhair = self.add.sprite(30, -81.5, playerInfo.hair.sprite).setName('hair');
    playerContainerhair.setTint(playerInfo.hair.color);
    const playerContainerouterEar = self.add.sprite(30, -81.5, playerInfo.ear.outerSprite).setName('outerEar');
    playerContainerouterEar.setTint(playerInfo.ear.outerColor);
    const playerContainerinnerEar = self.add.sprite(30, -81.5, playerInfo.ear.innerSprite).setName('innerEar');
    playerContainerinnerEar.setTint(playerInfo.ear.innerColor);
    const playerContainereyes = self.add.sprite(30, -81.5, playerInfo.eyes.outer).setName('eyes');
    const playerContaineriris = self.add.sprite(30, -81.5, playerInfo.eyes.iris).setName('iris');
    playerContaineriris.setTint(playerInfo.eyes.color);
    const playerContainerBeak = self.add.sprite(30, -81.5, playerInfo.beak.sprite).setName('beak');
    playerContainerBeak.setTint(playerInfo.beak.color);
    const playerContainerheadAccessories = self.add.sprite(30, -81.5, playerInfo.headAccessories.sprite).setName('headAccessories');
    playerContainerheadAccessories.setTint(playerInfo.headAccessories.color);

    otherPlayerContainer.add([
        playerContainertail,
        playerContainersecondaryTail,
        playerContaineraccentTail,
        playerContainerbody,
        playerContainersecondaryBody,
        playerContaineraccentBody,
        playerContainergenitles,
        playerContainerHands,
        playerContainerFeet,
        playerContainerhead,
        playerContainersecondaryHead,
        playerContaineraccentHead,
        playerContainerBeak,
        playerContainereyes,
        playerContaineriris,
        playerContainerhair,
        playerContainerouterEar,
        playerContainerinnerEar,
        playerContainerheadAccessories
    ]);
    otherPlayerContainer.sendToBack(playerContainertail);

    otherPlayerContainer.playerId = playerInfo.playerId;
    self.otherPlayersGroup.add(otherPlayerContainer);
    otherPlayerContainer.playerInfo = playerInfo;

    // Initial struggle bar render
    updateStruggleBar(otherPlayerContainer, playerInfo, self);
}

export function updateStruggleBar(playerContainer, playerInfo, scene) {
    if (!playerContainer.active) return;

    // Create struggleBar if it doesn't exist (as a separate scene object, not child)
    if (!playerContainer.struggleBar) {
        playerContainer.struggleBar = scene.add.graphics();
        // Ensure it's cleaned up when the player is destroyed
        playerContainer.on('destroy', () => {
            if (playerContainer.struggleBar) {
                playerContainer.struggleBar.destroy();
            }
        });
    }

    const bar = playerContainer.struggleBar;

    // Only show the struggle bar if the player is held AND gripped firmly.
    // Crucially, we do NOT show it if they are consumed (!playerInfo.consumedBy).
    // Consumed players have a different UI (the "Struggle" button).
    if (playerInfo.isHeld && playerInfo.grippedFirmly && !playerInfo.consumedBy) {
        bar.setVisible(true);
        bar.clear();

        // Sync position with player
        bar.x = playerContainer.x;
        bar.y = playerContainer.y;
        bar.depth = playerContainer.depth + 100; // Ensure it's above the player

        bar.fillStyle(0x000000);
        bar.fillRect(-30, -180, 60, 10);
        bar.fillStyle(0xff0000);
        const fillPercent = (playerInfo.struggleCount || 0) / 3;
        bar.fillRect(-30, -180, 60 * fillPercent, 10);
    } else {
        bar.setVisible(false);
    }
}
