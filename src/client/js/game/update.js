export function update(time, delta) {
    const chatFocused = window.chatFocused;
    const showDebug = this.showDebug;
    const playerDebugGraphics = this.playerDebugGraphics;
    const debugGraphics = this.debugGraphics;
    const serverBlockedTiles = window.serverBlockedTiles;

    if (!this.playerContainer || !this.cursors || chatFocused) {
        return;
    }
    // DEBUG: Check for multiple containers
    // console.log(`[DEBUG] Players group size: ${this.players.getChildren().length}`);
    // console.log(`[DEBUG] playerContainer ID: ${this.playerContainer.name || 'unnamed'}`);
    // console.log(`[DEBUG] playerContainer instance:`, this.playerContainer);
    // --- DIAGNOSTIC LOG ---
    // Log the position at the VERY START of the update loop.
    // console.log(`[UPDATE START] Pos: (${this.playerContainer.x.toFixed(2)}, ${this.playerContainer.y.toFixed(2)})`);

    const speed = 200;

    // Disable movement if consumed
    let inputPayload = {
        left: false,
        right: false,
        up: false,
        down: false
    };

    // Disable movement if consumed
    // If the player is consumed, we ignore their keyboard input for movement.
    // This prevents them from moving their invisible sprite around while inside someone.
    if (!this.playerContainer.playerInfo.consumedBy) {
        inputPayload = {
            left: this.cursors.left.isDown,
            right: this.cursors.right.isDown,
            up: this.cursors.up.isDown,
            down: this.cursors.down.isDown,
        };
    }

    this.playerContainer.body.setVelocity(0);

    if (inputPayload.left) {
        this.playerContainer.body.setVelocityX(-speed);
    } else if (inputPayload.right) {
        this.playerContainer.body.setVelocityX(speed);
    }

    if (inputPayload.up) {
        this.playerContainer.body.setVelocityY(-speed);
    } else if (inputPayload.down) {
        this.playerContainer.body.setVelocityY(speed);
    }

    this.playerContainer.depth = this.playerContainer.y;

    // Increment sequence number
    this.playerContainer.inputSequenceNumber++;
    inputPayload.sequence = this.playerContainer.inputSequenceNumber;
    inputPayload.clientTimestamp = Date.now();

    // Store input for reconciliation
    this.playerContainer.pendingInputs.push({
        sequence: inputPayload.sequence,
        input: inputPayload,
        delta: delta / 1000, // Convert ms to seconds
        clientTimestamp: Date.now()
    });

    this.socket.emit('playerInput', inputPayload);

    // --- NEW DIAGNOSTIC LOG ---
    // Log the position at the VERY END of the update loop.
    // Note: Velocity doesn't change position instantly, so this might not change much frame-to-frame,
    // but it will help us see if something is wrong within this function itself.
    // console.log(`[UPDATE END] Pos: (${this.playerContainer.x.toFixed(2)}, ${this.playerContainer.y.toFixed(2)})`);
    if (this.playerContainer.body) {
        const b = this.playerContainer.body;
        // console.log(`[Body Debug] Container: (${this.playerContainer.x}, ${this.playerContainer.y}), Body: (${b.x}, ${b.y}), Size: ${b.width}x${b.height}, Offset: ${b.offset.x}, ${b.offset.y}`);
    }

    // --- Player Collision Debug Drawing ---
    if (playerDebugGraphics) {
        playerDebugGraphics.clear();
        if (showDebug) {
            // Draw for local player
            if (this.playerContainer) {
                const width = (this.playerContainer.playerInfo && this.playerContainer.playerInfo.collisionBox) ? this.playerContainer.playerInfo.collisionBox.width : 24;
                const height = (this.playerContainer.playerInfo && this.playerContainer.playerInfo.collisionBox) ? this.playerContainer.playerInfo.collisionBox.height : 24;
                // Add 30 to x to account for sprite offset in container
                const x = this.playerContainer.x + 30 - width / 2;
                const y = this.playerContainer.y - height / 2;

                playerDebugGraphics.lineStyle(2, 0x00ff00, 1); // Green
                playerDebugGraphics.fillStyle(0x00ff00, 0.5); // Transparent Green Fill
                playerDebugGraphics.strokeRect(x, y, width, height);
                playerDebugGraphics.fillRect(x, y, width, height);
                playerDebugGraphics.setDepth(20000);
            }

            // Draw for other players
            if (this.otherPlayersGroup) {
                this.otherPlayersGroup.getChildren().forEach(otherPlayer => {
                    const width = (otherPlayer.playerInfo && otherPlayer.playerInfo.collisionBox) ? otherPlayer.playerInfo.collisionBox.width : 24;
                    const height = (otherPlayer.playerInfo && otherPlayer.playerInfo.collisionBox) ? otherPlayer.playerInfo.collisionBox.height : 24;
                    // Add 30 to x to account for sprite offset in container
                    const x = otherPlayer.x + 30 - width / 2;
                    const y = otherPlayer.y - height / 2;

                    playerDebugGraphics.lineStyle(2, 0x00ff00, 1);
                    playerDebugGraphics.fillStyle(0x00ff00, 0.5);
                    playerDebugGraphics.strokeRect(x, y, width, height);
                    playerDebugGraphics.fillRect(x, y, width, height);
                    playerDebugGraphics.setDepth(20000);
                });
            }
        }
    }

    // --- DEBUG DRAWING ---
    if (showDebug) {
        if (!this.debugGraphics) {
            this.debugGraphics = debugGraphics; // Assign global if missing (though we expect it on 'this')
        }
        if (this.debugGraphics) {
            this.debugGraphics.clear();

            // Draw Server Blocked Tiles (Orange Outlines)
            if (serverBlockedTiles && serverBlockedTiles.length > 0) {
                this.debugGraphics.lineStyle(2, 0xffa500, 1);
                serverBlockedTiles.forEach(tile => {
                    this.debugGraphics.strokeRect(tile.x, tile.y, 32, 32);
                    this.debugGraphics.setDepth(20000);
                });
            }

            // Draw Client Blocked Tiles (Transparent Orange Fill)
            if (this.mapLayers) {
                const debugColor = new Phaser.Display.Color(255, 165, 0, 100); // Transparent Orange
                this.mapLayers.forEach(layer => {
                    if (layer) {
                        // Ensure layer debug is drawn on top
                        layer.renderDebug(this.debugGraphics, {
                            tileColor: null, // Non-colliding tiles
                            collidingTileColor: debugColor, // Colliding tiles
                            faceColor: new Phaser.Display.Color(255, 165, 0, 255) // Colliding faces
                        });
                    }
                });
                this.debugGraphics.setDepth(30000); // Ensure it's on top of everything
            }

            // Draw coordinates for local player
            if (this.playerContainer) {
                const x = Math.round(this.playerContainer.x);
                const y = Math.round(this.playerContainer.y);
                const text = `X: ${x}, Y: ${y}`;

                if (!this.debugCoordsText) {
                    this.debugCoordsText = this.add.text(10, 10, text, {
                        font: '16px Arial',
                        fill: '#ffffff',
                        backgroundColor: '#000000'
                    });
                    this.debugCoordsText.setScrollFactor(0); // Fix to camera
                    this.debugCoordsText.setDepth(1000); // Ensure on top
                } else {
                    this.debugCoordsText.setText(text);
                    this.debugCoordsText.setVisible(true);
                }
            }
        }
    } else if (!showDebug && this.debugGraphics) {
        this.debugGraphics.clear();
        if (this.debugCoordsText) {
            this.debugCoordsText.setVisible(false);
        }
    }
}
