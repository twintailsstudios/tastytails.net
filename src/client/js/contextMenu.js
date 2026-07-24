function initializeContextMenu(scene, socket) {
    // --- Global Variables & Setup ---
    var contextMenu = document.getElementById('contextMenu');
    var voreMenu = document.getElementById('voreMenu');

    window.onclick = hideContextMenu;
    window.onkeydown = listenKeys;

    // Pointer Long-Press & Drag tracking variables
    let holdTimer = null;
    let didHoldTrigger = false;
    let mouseDownPointer = null;
    let mouseDownCurrentlyOver = null;
    let mouseDownButton = 0; // Capture mouse button: 0=Left, 1=Middle, 2=Right
    let startX = 0;
    let startY = 0;
    let isPendingRadialQuery = false;

    // Prevent events from propagating to Phaser
    const stopPropagation = (e) => e.stopPropagation();
    if (contextMenu) {
        ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(event => {
            contextMenu.addEventListener(event, stopPropagation);
        });
    }

    // --- Global Functions (Attached to window for HTML access) ---

    window.showContextMenu = function (event) {
        contextMenu = document.getElementById('contextMenu');
        voreMenu = document.getElementById('voreMenu');

        if (voreMenu) {
            voreMenu.style.display = 'none';
        }
        return false;
    };

    function hideContextMenu(event) {
        if (event && contextMenu && contextMenu.contains(event.target)) {
            return;
        }
        isPendingRadialQuery = false;
        if (contextMenu) {
            contextMenu.style.display = 'none';
            contextMenu.className = ''; // Reset radial class
        }
        if (tooltipEl) {
            tooltipEl.style.display = 'none';
            tooltipEl.style.opacity = '0';
        }
        if (document.querySelector("#contextMenu > playermenu")) {
            const toRemove = document.querySelector("#contextMenu > playermenu");
            toRemove.remove();
        }
    };
    window.hideContextMenu = hideContextMenu;

    function listenKeys(event) {
        var keyCode = event.which || event.keyCode;
        if (keyCode == 27) {
            hideContextMenu();
        }
    }

    window.specialTestFunction = function (event) {
        if (voreMenu) voreMenu.style.display = 'block';
        return false;
    };

    window.specialMouseOut = function (event) {
        if (voreMenu) voreMenu.style.display = 'none';
        return false;
    };

    // Prevent browser default context menu
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    scene.input.on('pointerdown', function (pointer, currentlyOver) {
        if (pointer.interactionHandled) {
            console.log('Interaction handled by item/other, skipping Context Menu logic.');
            return;
        }

        mouseDownPointer = pointer;
        mouseDownCurrentlyOver = currentlyOver;
        didHoldTrigger = false;
        startX = pointer.x;
        startY = pointer.y;
        mouseDownButton = pointer.button; // Capture mouse button: 0=Left, 1=Middle, 2=Right

        // Right-Click OR Spacebar + click triggers radial menu instantly
        if (pointer.button === 2 || pointer.rightButtonDown() || window.spacebarPressed) {
            console.log('[ContextMenu] Right-click or Spacebar + click detected. Triggering radial menu.');
            didHoldTrigger = true;
            triggerRadialQuery(pointer, currentlyOver);
            return;
        }

        // Long Press timer (350ms hold)
        holdTimer = setTimeout(() => {
            console.log('[ContextMenu] Click-and-Hold detected. Triggering radial menu.');
            didHoldTrigger = true;
            triggerRadialQuery(pointer, currentlyOver);
        }, 350);
    });

    scene.input.on('pointermove', function (pointer) {
        if (holdTimer && mouseDownPointer) {
            // Cancel hold if dragged too far
            const dist = Phaser.Math.Distance.Between(startX, startY, pointer.x, pointer.y);
            if (dist > 10) {
                clearTimeout(holdTimer);
                holdTimer = null;
            }
        }
    });

    scene.input.on('pointerup', function (pointer) {
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }

        // If context menu is currently visible on screen or pending a radial socket response, do not trigger ground click
        const isMenuVisible = (contextMenu && contextMenu.style.display === 'block') || isPendingRadialQuery;
        if (isMenuVisible || !mouseDownPointer) {
            mouseDownPointer = null;
            mouseDownCurrentlyOver = null;
            didHoldTrigger = false;
            return;
        }

        // If mouse release occurred without triggering long-press, run standard click
        if (!didHoldTrigger && mouseDownPointer) {
            const hand = (mouseDownButton === 2) ? 'right' : 'left';
            executeHandClick(pointer, mouseDownCurrentlyOver, hand);
        }

        mouseDownPointer = null;
        mouseDownCurrentlyOver = null;
        didHoldTrigger = false;
    });

    function triggerRadialQuery(pointer, currentlyOver) {
        if (tooltipEl) {
            tooltipEl.style.display = 'none';
            tooltipEl.style.opacity = '0';
        }
        var clickedList = [];
        (currentlyOver || []).forEach(function (gameObject) {
            if (gameObject.playerInfo) {
                var playerClicked = {
                    Identifier: 'player',
                    playerId: gameObject.playerInfo.playerId,
                    name: gameObject.playerInfo.Username || (gameObject.playerInfo.firstName + ' ' + gameObject.playerInfo.lastName) || 'Unknown'
                }
                clickedList.push(playerClicked);
            } else if (gameObject.objectInfo) {
                var objectClicked = {
                    Identifier: 'mapObject',
                    uniqueId: gameObject.objectInfo.uniqueId,
                    name: gameObject.objectInfo.name,
                    description: gameObject.objectInfo.description
                }
                clickedList.push(objectClicked);
            }
        });

        // Ground / Self Fallback: If no interactive player or object was directly clicked
        if (clickedList.length === 0) {
            const worldX = (pointer.worldX !== undefined) ? pointer.worldX : pointer.x;
            const worldY = (pointer.worldY !== undefined) ? pointer.worldY : pointer.y;

            clickedList.push({
                Identifier: 'ground',
                uniqueId: `ground_${Math.round(worldX)}_${Math.round(worldY)}`,
                name: 'Ground',
                description: `Ground terrain at (${Math.round(worldX)}, ${Math.round(worldY)})`,
                worldX: worldX,
                worldY: worldY
            });

            const localId = window.localPlayerInfo ? (window.localPlayerInfo.id || window.localPlayerInfo.playerId) : socket.id;
            const localName = window.localPlayerInfo ? (window.localPlayerInfo.Username || (window.localPlayerInfo.firstName + ' ' + window.localPlayerInfo.lastName)) : 'Self';
            if (localId) {
                clickedList.push({
                    Identifier: 'player',
                    playerId: localId,
                    name: localName || 'Self',
                    isSelf: true
                });
            }
        }

        if (clickedList.length > 0) {
            var intent = window.currentIntent || 'friendly';
            isPendingRadialQuery = true;
            console.log('[ContextMenu] Querying radial menu details for target:', clickedList[0]);
            socket.emit('playerRightClicked', {
                rightClickedList: clickedList,
                playerIntent: intent,
                pointerX: pointer.event ? pointer.event.clientX : pointer.x,
                pointerY: pointer.event ? pointer.event.clientY : pointer.y
            });

            // Safety timeout to reset isPendingRadialQuery if server fails to respond
            setTimeout(() => {
                isPendingRadialQuery = false;
            }, 3000);

            if (window.completeTutorialTask) {
                window.completeTutorialTask('context_open');
            }
        } else {
            hideContextMenu();
        }
    }

    function executeHandClick(pointer, currentlyOver, hand) {
        var clickedList = [];
        (currentlyOver || []).forEach(function (gameObject) {
            if (gameObject.playerInfo) {
                var playerClicked = {
                    Identifier: 'player',
                    playerId: gameObject.playerInfo.playerId,
                    name: gameObject.playerInfo.Username || (gameObject.playerInfo.firstName + ' ' + gameObject.playerInfo.lastName) || 'Unknown'
                }
                clickedList.push(playerClicked);
            } else if (gameObject.objectInfo) {
                var objectClicked = {
                    Identifier: 'mapObject',
                    uniqueId: gameObject.objectInfo.uniqueId,
                    name: gameObject.objectInfo.name,
                    description: gameObject.objectInfo.description
                }
                clickedList.push(objectClicked);
            }
        });

        if (clickedList.length > 0) {
            var intent = window.currentIntent || 'friendly';
            const primaryTarget = clickedList[0];
            const targetId = (primaryTarget.Identifier === 'player') ? primaryTarget.playerId : primaryTarget.uniqueId;
            const targetType = (primaryTarget.Identifier === 'player') ? 'player' : 'object';

            checkReach(targetId, targetType, pointer.event || { clientX: pointer.x, clientY: pointer.y }, () => {
                if (intent === 'grabbing' && targetType === 'player' && (targetId === socket.id || primaryTarget.playerId === socket.id)) {
                    console.log('[ContextMenu] Cannot perform Grab action on yourself.');
                    return;
                }
                console.log(`[HandClick] Emitting playerHandClicked. Hand: ${hand}, Intent: ${intent}, targetZone: ${window.currentTargetZone}`);
                socket.emit('playerHandClicked', {
                    hand: hand,
                    clickedItem: primaryTarget,
                    playerIntent: intent,
                    targetZone: window.currentTargetZone || 'torso',
                    pointerX: pointer.event ? pointer.event.clientX : pointer.x,
                    pointerY: pointer.event ? pointer.event.clientY : pointer.y
                });

                if (intent === 'grabbing' && targetType === 'player') {
                    if (window.completeTutorialTask) {
                        window.completeTutorialTask('grab');
                    }
                }

                if (window.onActionExecuted) {
                    window.onActionExecuted();
                }
            });
        } else {
            // Clicked empty ground
            const clickedNode = hand === 'left' ? window.actionHands?.leftNode : window.actionHands?.rightNode;

            if (clickedNode && clickedNode.itemId === 'tool_hoe') {
                console.log('[Farming] Tilling ground at:', pointer.worldX, pointer.worldY, 'Hand:', hand);
                socket.emit('useToolOnGround', {
                    toolId: 'tool_hoe',
                    x: pointer.worldX,
                    y: pointer.worldY,
                    hand: hand
                });
            }
            hideContextMenu();
        }
    }

    // --- Socket Event Listeners ---

    // --- Handle the playerLeftClickedResponse event ---
    socket.on('playerLeftClickedResponse', function (data) {
        const { responseInfo, playerIntent, pointerX, pointerY } = data;
        console.log('Received playerLeftClickedResponse:', responseInfo);

        if (responseInfo.length > 1 && playerIntent === 'grabbing') {
            // Multi-target selection for grabbing
            console.log('Multiple targets for grabbing. Showing selection menu.');

            // Create or get selection menu container
            let selectionMenu = document.getElementById('targetSelectionMenu');
            if (!selectionMenu) {
                selectionMenu = document.createElement('div');
                selectionMenu.id = 'targetSelectionMenu';
                selectionMenu.style.position = 'absolute';
                selectionMenu.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
                selectionMenu.style.border = '1px solid white';
                selectionMenu.style.padding = '10px';
                selectionMenu.style.zIndex = '1000';
                selectionMenu.style.color = 'white';

                // Prevent events from propagating to Phaser
                ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(event => {
                    selectionMenu.addEventListener(event, (e) => e.stopPropagation());
                });

                document.body.appendChild(selectionMenu);
            }

            selectionMenu.innerHTML = '<h3>Select Target</h3>';

            if (pointerX !== undefined && pointerY !== undefined) {
                // selectionMenu is attached to body, so we need document coordinates (viewport + scroll)
                selectionMenu.style.left = (pointerX + window.scrollX) + 'px';
                selectionMenu.style.top = (pointerY + window.scrollY) + 'px';
            } else {
                // Fallback to center if coordinates missing
                const gameCanvas = document.getElementById('phaserApp');
                const rect = gameCanvas.getBoundingClientRect();
                selectionMenu.style.left = (rect.left + rect.width / 2 + window.scrollX) + 'px';
                selectionMenu.style.top = (rect.top + rect.height / 2 + window.scrollY) + 'px';
            }

            selectionMenu.style.display = 'block';

            responseInfo.forEach(target => {
                const btn = document.createElement('button');
                btn.innerText = target.name;
                btn.style.display = 'block';
                btn.style.margin = '5px 0';
                btn.style.width = '100%';
                btn.onclick = function () {
                    console.log('Selected target:', target);
                    socket.emit('playerPerformAction', {
                        targetId: target.playerId,
                        intent: playerIntent,
                        targetZone: window.currentTargetZone || 'torso'
                    });
                    selectionMenu.style.display = 'none';
                };
                selectionMenu.appendChild(btn);
            });

            // Close menu if clicked outside (simple implementation)
            const closeHandler = function (e) {
                if (!selectionMenu.contains(e.target)) {
                    selectionMenu.style.display = 'none';
                    document.removeEventListener('mousedown', closeHandler);
                }
            };
            // Timeout to avoid immediate closing from the current click
            setTimeout(() => {
                document.addEventListener('mousedown', closeHandler);
            }, 100);

        } else if (responseInfo.length > 0) {
            // Single target or not grabbing, perform action on the first/only target
            const target = responseInfo[0];
            socket.emit('playerPerformAction', {
                targetId: target.playerId,
                intent: playerIntent,
                targetZone: window.currentTargetZone || 'torso'
            });
        }
    });

    function checkReach(targetId, targetType, event, onReachCallback) {
        const scene = window.gameScene;
        if (!scene || !scene.playerContainer) {
            if (onReachCallback) onReachCallback();
            return true; // Safety
        }

        // Get the target object/player
        let targetSprite = null;
        let targetX = 0;
        let targetY = 0;
        let found = false;

        if (targetType === 'player') {
            targetSprite = scene.otherPlayersGroup ? scene.otherPlayersGroup.getChildren().find(p => p.playerId === targetId) : null;
            if (targetSprite) {
                targetX = targetSprite.x;
                targetY = targetSprite.y;
                found = true;
            }
        } else {
            // 1. Check window.itemManager.items
            const im = window.itemManager || (scene && scene.itemManager);
            if (im && im.items && im.items[targetId]) {
                const itemEntry = im.items[targetId];
                targetSprite = itemEntry.container || itemEntry.sprite || itemEntry;
                if (targetSprite) {
                    targetX = targetSprite.x;
                    targetY = targetSprite.y;
                    found = true;
                }
            }

            // 2. Check itemManager's itemsGroup
            if (!found && im && im.itemsGroup) {
                targetSprite = im.itemsGroup.getChildren().find(i => (i.objectInfo && i.objectInfo.uniqueId === targetId) || i.uid === targetId);
                if (targetSprite) {
                    targetX = targetSprite.x;
                    targetY = targetSprite.y;
                    found = true;
                }
            }

            // 3. Check scene.itemsGroup
            if (!found && scene.itemsGroup) {
                targetSprite = scene.itemsGroup.getChildren().find(i => i.uid === targetId || (i.objectInfo && i.objectInfo.uniqueId === targetId));
                if (targetSprite) {
                    targetX = targetSprite.x;
                    targetY = targetSprite.y;
                    found = true;
                }
            }

            // 4. Check scene.objectGroup
            if (!found && scene.objectGroup) {
                targetSprite = scene.objectGroup.getChildren().find(o => o.objectInfo && o.objectInfo.uniqueId === targetId || o.uid === targetId);
                if (targetSprite) {
                    targetX = targetSprite.x;
                    targetY = targetSprite.y;
                    found = true;
                }
            }
        }

        // Helper to check the actual AABB overlap with a safety buffer
        const runCheck = (playerX, playerY) => {
            const pCenterX = playerX + 30;
            const pCenterY = playerY;
            const reachHalf = 48; // reach buffer of 48px

            const playerBox = {
                left: pCenterX - reachHalf,
                right: pCenterX + reachHalf,
                top: pCenterY - reachHalf,
                bottom: pCenterY + reachHalf
            };

            let targetBox = null;
            if (targetType === 'player' && targetSprite) {
                const tX = targetSprite.x + 30;
                const tY = targetSprite.y;
                targetBox = {
                    left: tX - 30,
                    right: tX + 30,
                    top: tY - 165,
                    bottom: tY + 15
                };
            } else if (targetSprite) {
                if (targetSprite.body && targetSprite.body.width > 0) {
                    targetBox = {
                        left: targetSprite.body.x,
                        right: targetSprite.body.right,
                        top: targetSprite.body.y,
                        bottom: targetSprite.body.bottom
                    };
                } else {
                    const width = targetSprite.displayWidth || targetSprite.width || 32;
                    const height = targetSprite.displayHeight || targetSprite.height || 32;
                    const oX = (targetSprite.originX !== undefined) ? targetSprite.originX : 0.5;
                    const oY = (targetSprite.originY !== undefined) ? targetSprite.originY : 1.0;

                    const tX = targetSprite.x;
                    const tY = targetSprite.y;

                    targetBox = {
                        left: tX - (width * oX),
                        right: tX + (width * (1 - oX)),
                        top: tY - (height * oY),
                        bottom: tY + (height * (1 - oY))
                    };
                }
            }

            if (!targetBox) return true;

            return (
                playerBox.left < targetBox.right &&
                playerBox.right > targetBox.left &&
                playerBox.top < targetBox.bottom &&
                playerBox.bottom > targetBox.top
            );
        };

        // If event is null, we are just querying availability. Don't trigger walking.
        if (event === null) {
            return true;
        }

        const inReach = runCheck(scene.playerContainer.x, scene.playerContainer.y);

        if (inReach) {
            if (onReachCallback) onReachCallback();
            return true;
        }

        if (found && (targetSprite || targetX !== 0 || targetY !== 0)) {
            console.log(`[ContextMenu] Too far - Initiating Smart Walk for ${targetType}: ${targetId} at (${targetX}, ${targetY})`);
            scene.smartWalkTarget = {
                target: targetSprite,
                x: targetX,
                y: targetY,
                checkReach: runCheck,
                onReach: () => {
                    console.log(`[ContextMenu] Smart Walk reached target: ${targetId}`);
                    if (onReachCallback) onReachCallback();
                }
            };
        } else {
            if (event && window.showWorldToast) {
                window.showWorldToast(event.clientX, event.clientY, "out of reach");
            }
            if (window.addLocalSystemMessage) {
                window.addLocalSystemMessage("Target is too far away.");
            }
        }

        return false;
    }

    // --- Radial Menu Rendering & Option Mapping ---

    function getVoreIcon(label) {
        let iconClass = 'fa-solid fa-teeth-open';
        const nameLower = (label || '').toLowerCase();
        if (nameLower.includes('oral') || nameLower.includes('stomach') || nameLower.includes('swallow') || nameLower.includes('mouth')) {
            iconClass = 'fa-solid fa-drumstick-bite';
        } else if (nameLower.includes('unbirth') || nameLower.includes('womb') || nameLower.includes('heart') || nameLower.includes('breast')) {
            iconClass = 'fa-solid fa-heart';
        } else if (nameLower.includes('anal') || nameLower.includes('tail') || nameLower.includes('rear') || nameLower.includes('bowel') || nameLower.includes('cock')) {
            iconClass = 'fa-solid fa-snake';
        }
        return iconClass;
    }

    function describeAnnularSector(cx, cy, rInner, rOuter, startAngle, endAngle) {
        let sweepAngle = endAngle - startAngle;
        if (sweepAngle >= 360) sweepAngle = 359.99;

        const radStart = startAngle * (Math.PI / 180);
        const radEnd = (startAngle + sweepAngle) * (Math.PI / 180);

        const x1Out = (cx + rOuter * Math.cos(radStart)).toFixed(2);
        const y1Out = (cy + rOuter * Math.sin(radStart)).toFixed(2);
        const x2Out = (cx + rOuter * Math.cos(radEnd)).toFixed(2);
        const y2Out = (cy + rOuter * Math.sin(radEnd)).toFixed(2);

        const x2In = (cx + rInner * Math.cos(radEnd)).toFixed(2);
        const y2In = (cy + rInner * Math.sin(radEnd)).toFixed(2);
        const x1In = (cx + rInner * Math.cos(radStart)).toFixed(2);
        const y1In = (cy + rInner * Math.sin(radStart)).toFixed(2);

        const largeArcFlag = sweepAngle > 180 ? "1" : "0";

        return [
            `M ${x1In} ${y1In}`,
            `L ${x1Out} ${y1Out}`,
            `A ${rOuter} ${rOuter} 0 ${largeArcFlag} 1 ${x2Out} ${y2Out}`,
            `L ${x2In} ${y2In}`,
            `A ${rInner} ${rInner} 0 ${largeArcFlag} 0 ${x1In} ${y1In}`,
            "Z"
        ].join(" ");
    }

    // --- Handle the playerRightClickedResponse event ---
    socket.on('playerRightClickedResponse', function (data) {
        isPendingRadialQuery = false;
        const { responseInfo, predatorInfo, pointerX, pointerY } = data;

        if (tooltipEl) {
            tooltipEl.style.display = 'none';
            tooltipEl.style.opacity = '0';
        }

        const contextMenu = document.getElementById('contextMenu');
        if (!contextMenu) return;

        contextMenu.innerHTML = ''; // Clear existing content
        contextMenu.className = 'radial'; // Add radial styling class

        if (responseInfo && responseInfo.length > 0) {
            // Sort responseInfo so the local player's own name is always pushed to the bottom of the list
            const localId = window.localPlayerInfo ? (window.localPlayerInfo.id || window.localPlayerInfo.playerId) : null;
            responseInfo.sort((a, b) => {
                const aIsSelf = (a.Identifier === 'player' && (a.playerId === localId || a.isSelf));
                const bIsSelf = (b.Identifier === 'player' && (b.playerId === localId || b.isSelf));
                if (aIsSelf && !bIsSelf) return 1;
                if (!aIsSelf && bIsSelf) return -1;
                return 0;
            });

            let activeTargetIndex = 0;

            const ring = document.createElement('div');
            ring.className = 'radial-ring';

            // Center disc (Target Selector)
            const center = document.createElement('div');
            center.className = 'radial-center';
            ring.appendChild(center);

            // Re-render main radial menu layout whenever target changes
            const drawMainMenu = () => {
                // Clear existing SVG slices and outer arc
                const existingSvg = ring.querySelector('.radial-slices-svg');
                if (existingSvg) existingSvg.remove();

                const existingLabels = ring.querySelectorAll('.slice-label-container');
                existingLabels.forEach(el => el.remove());

                const existingArc = ring.querySelector('.radial-outer-arc');
                if (existingArc) existingArc.remove();

                const currentItem = responseInfo[activeTargetIndex];
                if (!currentItem) return;

                const targetId = (currentItem.Identifier === 'player') ? currentItem.playerId : currentItem.uniqueId;
                const targetType = (currentItem.Identifier === 'player') ? 'player' : 'object';

                // Update center disc HTML with target name and cycle controls
                const firstName = (currentItem.name || 'Unknown').split(' ')[0];
                if (responseInfo.length > 1) {
                    center.innerHTML = `
                        <div class="target-name">${firstName}</div>
                        <div class="target-type">${currentItem.Identifier}</div>
                        <div class="target-cycle-bar">
                            <div class="target-cycle-btn prev-target">&lt;</div>
                            <span class="target-counter">${activeTargetIndex + 1}/${responseInfo.length}</span>
                            <div class="target-cycle-btn next-target">&gt;</div>
                        </div>
                    `;
                    const prevBtn = center.querySelector('.prev-target');
                    const nextBtn = center.querySelector('.next-target');
                    if (prevBtn) {
                        prevBtn.onclick = (e) => {
                            e.stopPropagation();
                            activeTargetIndex = (activeTargetIndex - 1 + responseInfo.length) % responseInfo.length;
                            drawMainMenu();
                        };
                    }
                    if (nextBtn) {
                        nextBtn.onclick = (e) => {
                            e.stopPropagation();
                            activeTargetIndex = (activeTargetIndex + 1) % responseInfo.length;
                            drawMainMenu();
                        };
                    }
                } else {
                    center.innerHTML = `
                        <div class="target-name">${firstName}</div>
                        <div class="target-type">${currentItem.Identifier}</div>
                    `;
                }

                const actions = currentItem.availableActions || [];
                const hasHold = actions.includes('Hold');
                const hasGrip = actions.includes('Grip Firmly');
                const hasVore = actions.includes('Vore');
                const hasRelease = actions.includes('Release');
                const hasCraft = actions.includes('Craft');
                const hasUse = actions.includes('Use');
                const hasPickUp = actions.includes('Pick Up');
                const harvestAction = actions.find(a => ['chop', 'mine', 'gather'].includes(a.toLowerCase()));

                // Collect list of primary inner ring actions
                const innerActions = [];

                if (actions.includes('Examine')) {
                    innerActions.push({
                        label: 'Examine',
                        icon: 'fa-solid fa-eye',
                        onClick: () => socket.emit('examineClicked', currentItem)
                    });
                }

                const isSelf = currentItem.playerId === socket.id;

                if (hasHold && !isSelf) {
                    innerActions.push({
                        label: 'Hold',
                        icon: 'fa-solid fa-hand-back-fist',
                        onClick: (e) => checkReach(targetId, targetType, e, () => {
                            socket.emit('playerPerformAction', { targetId: currentItem.playerId, intent: 'grabbing', targetZone: window.currentTargetZone || 'torso' });
                        })
                    });
                } else if (hasGrip && !isSelf) {
                    innerActions.push({
                        label: 'Grip',
                        icon: 'fa-solid fa-handshake-simple',
                        onClick: (e) => checkReach(targetId, targetType, e, () => {
                            socket.emit('gripFirmly', currentItem);
                        })
                    });
                } else if (hasCraft) {
                    innerActions.push({
                        label: 'Craft',
                        icon: 'fa-solid fa-hammer',
                        onClick: (e) => checkReach(targetId, targetType, e, () => {
                            socket.emit('openCrafting', { stationId: currentItem.uniqueId, hand: (mouseDownButton === 2) ? 'right' : 'left' });
                        })
                    });
                } else if (hasUse) {
                    innerActions.push({
                        label: currentItem.verb || 'Use',
                        icon: 'fa-solid fa-hand-holding-water',
                        onClick: (e) => checkReach(targetId, targetType, e, () => {
                            socket.emit('useItemClicked', { uid: currentItem.uniqueId });
                        })
                    });
                }

                if (hasPickUp) {
                    innerActions.push({
                        label: 'Pick Up',
                        icon: 'fa-solid fa-hand-holding',
                        onClick: (e) => checkReach(targetId, targetType, e, () => {
                            socket.emit('playerHandClicked', {
                                hand: (mouseDownButton === 2) ? 'right' : 'left',
                                clickedItem: { Identifier: 'mapObject', uniqueId: currentItem.uniqueId },
                                playerIntent: window.currentIntent || 'friendly',
                                pointerX: pointerX,
                                pointerY: pointerY
                            });
                        })
                    });
                } else if (harvestAction) {
                    let icon = 'fa-hammer';
                    if (harvestAction.toLowerCase() === 'chop') icon = 'fa-axe';
                    if (harvestAction.toLowerCase() === 'gather') icon = 'fa-hand-holding';
                    innerActions.push({
                        label: harvestAction,
                        icon: 'fa-solid ' + icon,
                        onClick: (e) => checkReach(targetId, targetType, e, () => {
                            socket.emit('objectInteract', { type: 'resourceNode', id: currentItem.uniqueId, action: harvestAction.toLowerCase() });
                        })
                    });
                }

                if (actions.includes('Till')) {
                    innerActions.push({
                        label: 'Till',
                        icon: 'fa-solid fa-wheat-awn',
                        onClick: () => {
                            const hand = (mouseDownButton === 2) ? 'right' : 'left';
                            socket.emit('useToolOnGround', {
                                toolId: 'tool_hoe',
                                x: currentItem.worldX || pointerX,
                                y: currentItem.worldY || pointerY,
                                hand: hand
                            });
                        }
                    });
                }

                if (hasVore && !isSelf) {
                    innerActions.push({
                        label: 'Vore',
                        icon: 'fa-solid fa-teeth-open',
                        isVore: true,
                        onClick: (e) => e.stopPropagation()
                    });
                }

                if (hasRelease) {
                    innerActions.push({
                        label: 'Release',
                        icon: 'fa-solid fa-hand-sparkles',
                        onClick: () => socket.emit('releaseClicked', currentItem)
                    });
                } else if (actions.includes('Punch')) {
                    innerActions.push({
                        label: 'Punch',
                        icon: 'fa-solid fa-hand-fist',
                        onClick: () => socket.emit('playerPerformAction', { targetId: currentItem.playerId, intent: 'hostile', targetZone: window.currentTargetZone || 'torso' })
                    });
                } else if (actions.includes('Haunt')) {
                    innerActions.push({
                        label: 'Haunt',
                        icon: 'fa-solid fa-ghost',
                        onClick: (e) => checkReach(targetId, targetType, e, () => {
                            socket.emit('hauntClicked', currentItem);
                        })
                    });
                }

                // Add Cancel option
                innerActions.push({
                    label: 'Cancel',
                    icon: 'fa-solid fa-xmark',
                    onClick: () => hideContextMenu()
                });

                // Create SVG element for annular sector slices
                const svgNs = 'http://www.w3.org/2000/svg';
                const svg = document.createElementNS(svgNs, 'svg');
                svg.setAttribute('class', 'radial-slices-svg');
                svg.setAttribute('viewBox', '0 0 220 220');
                ring.appendChild(svg);

                // Create outer arc element if predator has vore types
                let outerArcEl = null;
                const voreTypes = predatorInfo ? (predatorInfo.voreTypes || []) : [];
                if (hasVore && voreTypes.length > 0) {
                    outerArcEl = document.createElement('div');
                    outerArcEl.className = 'radial-outer-arc';
                    ring.appendChild(outerArcEl);

                    // Render outer arc vore entrance nodes
                    const totalVore = voreTypes.length;
                    const arcStartDeg = totalVore > 4 ? -150 : -120;
                    const arcSpanDeg = totalVore > 4 ? 300 : 180;
                    const angleStep = totalVore > 1 ? arcSpanDeg / (totalVore - 1) : 0;
                    const outerRadiusPx = 138;

                    voreTypes.forEach((vore, idx) => {
                        const angleDeg = totalVore === 1 ? -45 : arcStartDeg + (angleStep * idx);
                        const label = vore.destination || vore.Verb || vore.verb || 'Vore';
                        const iconClass = getVoreIcon(label);

                        const petal = document.createElement('div');
                        petal.className = 'radial-item outer-petal';
                        petal.innerHTML = `<i class="${iconClass}"></i><span>${label}</span>`;

                        // Center of 320px outer-arc container is 160px
                        const rad = angleDeg * (Math.PI / 180);
                        const x = Math.round(160 + outerRadiusPx * Math.cos(rad) - 28);
                        const y = Math.round(160 + outerRadiusPx * Math.sin(rad) - 28);
                        petal.style.left = `${x}px`;
                        petal.style.top = `${y}px`;

                        petal.onclick = (e) => {
                            e.stopPropagation();
                            if (currentItem.playerId === socket.id) {
                                hideContextMenu();
                                return;
                            }
                            checkReach(currentItem.playerId, 'player', e, () => {
                                socket.emit('voreAction', { voreType: vore, targetId: currentItem.playerId });
                            });
                            hideContextMenu();
                        };

                        // Parchment preview tooltip for vore destination
                        petal.onmouseenter = (e) => {
                            if (tooltipEl) {
                                const entranceTitle = vore.entranceName || (vore.isEntrance ? vore.destination : 'Entrance');
                                const destName = vore.destinationName || (!vore.isEntrance ? vore.destination : 'Stomach');
                                const occupantCount = (vore.occupantCount !== undefined) ? vore.occupantCount : (vore.contents ? vore.contents.length : 0);
                                const maxCap = (vore.maxCapacity !== undefined) ? vore.maxCapacity : 3;
                                const power = vore.digestivePower || 'Normal';

                                tooltipEl.innerHTML = `
                                    <div class="context-tooltip-title">${entranceTitle}</div>
                                    <div class="context-tooltip-subtitle">Destination: ${destName}</div>
                                    <div class="context-tooltip-stat">Capacity: ${occupantCount} / ${maxCap} &bull; Power: ${power}</div>
                                `;
                                tooltipEl.style.display = 'block';
                                tooltipEl.style.opacity = '1';
                                tooltipEl.style.left = (e.clientX + 15) + 'px';
                                tooltipEl.style.top = (e.clientY + 15) + 'px';
                            }
                        };

                        petal.onmouseleave = () => {
                            if (tooltipEl) tooltipEl.style.display = 'none';
                        };

                        outerArcEl.appendChild(petal);
                    });

                    // Keep outer arc expanded when cursor is over outer arc
                    outerArcEl.onmouseenter = () => {
                        outerArcEl.classList.add('expanded');
                    };
                    outerArcEl.onmouseleave = () => {
                        outerArcEl.classList.remove('expanded');
                    };
                }

                // Render N SVG pie slices for innerActions
                const totalInner = innerActions.length;
                const sliceAngle = 360 / totalInner;

                innerActions.forEach((act, idx) => {
                    const startAngle = sliceAngle * idx - 90;
                    const endAngle = startAngle + sliceAngle;

                    const group = document.createElementNS(svgNs, 'g');
                    group.setAttribute('class', 'radial-slice-group');

                    const path = document.createElementNS(svgNs, 'path');
                    path.setAttribute('class', 'radial-slice-path');
                    path.setAttribute('d', describeAnnularSector(110, 110, 43, 101, startAngle, endAngle));

                    path.onclick = (e) => {
                        e.stopPropagation();
                        act.onClick(e);
                        if (!act.isVore) {
                            hideContextMenu();
                        }
                    };

                    // If this is the Vore slice, trigger hover expansion for outer arc
                    if (act.isVore && outerArcEl) {
                        path.onmouseenter = () => {
                            outerArcEl.classList.add('expanded');
                        };
                        path.onmouseleave = (e) => {
                            // Delay check to allow mouse to enter outerArcEl
                            setTimeout(() => {
                                if (outerArcEl && !outerArcEl.matches(':hover')) {
                                    outerArcEl.classList.remove('expanded');
                                }
                            }, 50);
                        };
                    }

                    group.appendChild(path);
                    svg.appendChild(group);

                    // Position text and icon label overlay at midpoint of sector
                    const midAngleRad = (startAngle + endAngle) / 2 * (Math.PI / 180);
                    const labelR = 72;
                    const labelX = Math.round(110 + labelR * Math.cos(midAngleRad));
                    const labelY = Math.round(110 + labelR * Math.sin(midAngleRad));

                    const labelDiv = document.createElement('div');
                    labelDiv.className = 'slice-label-container';
                    labelDiv.style.left = `${labelX}px`;
                    labelDiv.style.top = `${labelY}px`;
                    labelDiv.innerHTML = `<i class="${act.icon}"></i><span>${act.label}</span>`;
                    ring.appendChild(labelDiv);
                });
            };

            // Mouse wheel scroll to cycle targets when multiple entities are present
            ring.onwheel = (e) => {
                if (responseInfo.length > 1) {
                    e.preventDefault();
                    if (e.deltaY > 0) {
                        activeTargetIndex = (activeTargetIndex + 1) % responseInfo.length;
                    } else if (e.deltaY < 0) {
                        activeTargetIndex = (activeTargetIndex - 1 + responseInfo.length) % responseInfo.length;
                    }
                    drawMainMenu();
                }
            };

            drawMainMenu();
            contextMenu.appendChild(ring);

            contextMenu.style.display = 'block';
            contextMenu.style.visibility = 'hidden'; // Hide while measuring

            // Position the menu centered on pointer coordinates
            if (pointerX !== undefined && pointerY !== undefined) {
                let left = pointerX;
                let top = pointerY;

                const menuWidth = contextMenu.offsetWidth || 220;
                const menuHeight = contextMenu.offsetHeight || 220;
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                // Adjust to ensure it stays fully inside the screen
                if (left - menuWidth / 2 < 0) left = menuWidth / 2;
                if (left + menuWidth / 2 > viewportWidth) left = viewportWidth - menuWidth / 2;
                if (top - menuHeight / 2 < 0) top = menuHeight / 2;
                if (top + menuHeight / 2 > viewportHeight) top = viewportHeight - menuHeight / 2;

                contextMenu.style.left = left + 'px';
                contextMenu.style.top = top + 'px';
            }
            contextMenu.style.visibility = 'visible'; // Show after positioning
        }

        if (document.getElementById("voreDisplay")) document.getElementById("voreDisplay").style.display = "none";
        if (document.getElementById("optionsDisplay")) document.getElementById("optionsDisplay").style.display = "none";
    });

    // --- Contextual Hover Tooltip ---
    let tooltipEl = document.getElementById('context-tooltip');
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'context-tooltip';
        tooltipEl.className = 'context-tooltip';
        document.body.appendChild(tooltipEl);
    }

    function isIngredientForStation(itemId, stationType) {
        if (!itemId || !stationType || !window.itemData) return false;
        for (const [resItemId, itemDef] of Object.entries(window.itemData)) {
            if (itemDef.recipe && itemDef.recipe.station === stationType) {
                if (itemDef.recipe.ingredients.some(ing => ing.itemId === itemId)) {
                    return true;
                }
            }
        }
        return false;
    }

    scene.input.on('gameobjectover', function (pointer, gameObject) {
        // Prevent tooltip while radial/context menu is open
        if (contextMenu && contextMenu.style.display === 'block') {
            tooltipEl.style.display = 'none';
            return;
        }

        if (!gameObject || (!gameObject.objectInfo && !gameObject.playerInfo)) {
            tooltipEl.style.display = 'none';
            return;
        }

        let titleText = '';
        let descText = '';
        let actionText = '';

        if (gameObject.playerInfo) {
            titleText = gameObject.playerInfo.Username || 'Player';
            descText = gameObject.playerInfo.icDescrip || '';
            actionText = '<i class="fa-solid fa-hand-fist"></i> Hold Shift & click to Grab';
        } else if (gameObject.objectInfo) {
            const info = gameObject.objectInfo;
            titleText = info.name || 'Object';
            descText = info.description || '';

            const leftHandNode = window.actionHands?.leftNode;
            const rightHandNode = window.actionHands?.rightNode;

            if (info.gatherTool && info.gatherTool !== 'none') {
                const reqTool = info.gatherTool;
                const toolName = (window.itemData && window.itemData[reqTool]) ? window.itemData[reqTool].name : 'appropriate tool';
                const verb = info.interactType || 'harvest';

                const leftHas = leftHandNode && leftHandNode.itemId === reqTool;
                const rightHas = rightHandNode && rightHandNode.itemId === reqTool;

                if (leftHas && rightHas) {
                    actionText = `<i class="fa-solid fa-hammer"></i> L-click or R-click to ${verb}`;
                } else if (leftHas) {
                    actionText = `<i class="fa-solid fa-hammer"></i> L-click to ${verb}`;
                } else if (rightHas) {
                    actionText = `<i class="fa-solid fa-hammer"></i> R-click to ${verb}`;
                } else {
                    actionText = `<i class="fa-solid fa-triangle-exclamation" style="color: #ff9100;"></i> You need a ${toolName} to ${verb} this`;
                }
            } else if (info.interactType === 'gather') {
                actionText = '<i class="fa-solid fa-hand-holding"></i> L-click or R-click to gather';
            } else if (info.stationType) {
                const leftIsIng = leftHandNode && isIngredientForStation(leftHandNode.itemId, info.stationType);
                const rightIsIng = rightHandNode && isIngredientForStation(rightHandNode.itemId, info.stationType);

                if (leftIsIng && rightIsIng) {
                    actionText = '<i class="fa-solid fa-hammer"></i> L-click or R-click to deposit & craft';
                } else if (leftIsIng) {
                    actionText = '<i class="fa-solid fa-hammer"></i> L-click to deposit & craft';
                } else if (rightIsIng) {
                    actionText = '<i class="fa-solid fa-hammer"></i> R-click to deposit & craft';
                } else {
                    actionText = '<i class="fa-solid fa-hammer"></i> L-click or R-click to open Crafting';
                }
            } else if (info.uniqueId && info.uniqueId.startsWith('doors_')) {
                actionText = '<i class="fa-solid fa-door-open"></i> L-click to open/close';
            }
        }

        if (titleText) {
            let html = `<div class="context-tooltip-title">${titleText}</div>`;
            if (descText) {
                html += `<div class="context-tooltip-desc">${descText}</div>`;
            }
            if (actionText) {
                html += `<div class="context-tooltip-action">${actionText}</div>`;
            }
            tooltipEl.innerHTML = html;
            tooltipEl.style.display = 'block';
            tooltipEl.style.opacity = '1';
        } else {
            tooltipEl.style.display = 'none';
        }
    });

    scene.input.on('pointermove', function (pointer) {
        if (tooltipEl && tooltipEl.style.display === 'block') {
            tooltipEl.style.left = (pointer.event ? pointer.event.clientX : pointer.x) + 15 + 'px';
            tooltipEl.style.top = (pointer.event ? pointer.event.clientY : pointer.y) + 15 + 'px';
        }
    });

    scene.input.on('gameobjectout', function (pointer, gameObject) {
        if (tooltipEl) {
            tooltipEl.style.display = 'none';
        }
    });
}
