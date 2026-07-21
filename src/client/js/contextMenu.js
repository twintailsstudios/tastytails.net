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
        if (contextMenu) {
            contextMenu.style.display = 'none';
            contextMenu.className = ''; // Reset radial class
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

    // --- Phaser Input Handling ---

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

        // Spacebar + click triggers radial menu instantly
        if (window.spacebarPressed) {
            console.log('[ContextMenu] Spacebar + click detected. Triggering radial menu.');
            didHoldTrigger = true;
            triggerRadialQuery(pointer, currentlyOver);
            return;
        }

        // Long Press timer (200ms hold)
        holdTimer = setTimeout(() => {
            console.log('[ContextMenu] Click-and-Hold detected. Triggering radial menu.');
            didHoldTrigger = true;
            triggerRadialQuery(pointer, currentlyOver);
        }, 200);
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
        var clickedList = [];
        currentlyOver.forEach(function (gameObject) {
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
            console.log('[ContextMenu] Querying radial menu details for target:', clickedList[0]);
            socket.emit('playerRightClicked', {
                rightClickedList: clickedList,
                playerIntent: intent,
                pointerX: pointer.event ? pointer.event.clientX : pointer.x,
                pointerY: pointer.event ? pointer.event.clientY : pointer.y
            });
            if (window.completeTutorialTask) {
                window.completeTutorialTask('context_open');
            }
        } else {
            hideContextMenu();
        }
    }

    function executeHandClick(pointer, currentlyOver, hand) {
        var clickedList = [];
        currentlyOver.forEach(function (gameObject) {
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
                console.log(`[HandClick] Emitting playerHandClicked. Hand: ${hand}, Intent: ${intent}`);
                socket.emit('playerHandClicked', {
                    hand: hand,
                    clickedItem: primaryTarget,
                    playerIntent: intent,
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
                        intent: playerIntent
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
                intent: playerIntent
            });
        }
    });

    // --- Helper for Range Check ---
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
            targetSprite = scene.otherPlayersGroup.getChildren().find(p => p.playerId === targetId);
            if (targetSprite) {
                targetX = targetSprite.x;
                targetY = targetSprite.y;
                found = true;
            }
        } else if (targetType === 'item') {
            targetSprite = scene.itemsGroup ? scene.itemsGroup.getChildren().find(i => i.uid === targetId || (i.objectInfo && i.objectInfo.uniqueId === targetId)) : null;
            if (targetSprite) {
                targetX = targetSprite.x;
                targetY = targetSprite.y;
                found = true;
            }
        } else {
            // mapObject
            targetSprite = scene.objectGroup.getChildren().find(o => o.objectInfo && o.objectInfo.uniqueId === targetId);
            if (targetSprite) {
                targetX = targetSprite.x;
                targetY = targetSprite.y;
                found = true;
            }
        }

        // Helper to check the actual AABB overlap with a tightened safety buffer (24px instead of 48px)
        const runCheck = (playerX, playerY) => {
            const pCenterX = playerX + 30;
            const pCenterY = playerY;
            const reachHalf = 32; // buffer of 32px to prevent network lag rejections while allowing left/right collision overlap (requires > 30px)

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
            } else if (targetType === 'item' && targetSprite) {
                targetBox = {
                    left: targetSprite.x - 16,
                    right: targetSprite.x + 16,
                    top: targetSprite.y - 32,
                    bottom: targetSprite.y
                };
            } else if (targetSprite) {
                if (targetSprite.body) {
                    targetBox = {
                        left: targetSprite.body.x,
                        right: targetSprite.body.right,
                        top: targetSprite.body.y,
                        bottom: targetSprite.body.bottom
                    };
                } else {
                    const tX = targetSprite.x - (targetSprite.width * targetSprite.originX);
                    const tY = targetSprite.y - (targetSprite.height * targetSprite.originY);
                    targetBox = {
                        left: tX,
                        right: tX + targetSprite.width,
                        top: tY,
                        bottom: tY + targetSprite.height
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
            // Allow actions to show even if slightly out of bounds to trigger smart walk on selection
            return true;
        }

        const inReach = runCheck(scene.playerContainer.x, scene.playerContainer.y);

        if (inReach) {
            if (onReachCallback) onReachCallback();
            return true;
        }

        if (found && targetSprite) {
            console.log(`[ContextMenu] Too far - Initiating Smart Walk for ${targetType}: ${targetId}`);
            scene.smartWalkTarget = {
                target: targetSprite,
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

    function createRadialItem(position, label, iconClass, onClick, autoClose = true) {
        const item = document.createElement('div');
        item.className = `radial-item pos-${position}`;
        item.innerHTML = `<i class="${iconClass}"></i><span>${label}</span>`;
        item.onclick = (e) => {
            e.stopPropagation();
            onClick(e);
            if (autoClose) {
                hideContextMenu();
            }
        };
        return item;
    }

    function renderVoreSubRing(ring, target, predatorInfo, onBack) {
        // Clear all radial-items
        const items = ring.querySelectorAll('.radial-item');
        items.forEach(it => it.remove());

        const voreTypes = predatorInfo.voreTypes || [];

        // We can place up to 3 vore options at 'up', 'right', and 'down' positions
        const positions = ['up', 'right', 'down'];
        
        voreTypes.forEach((vore, index) => {
            if (index >= positions.length) return; // Limit to 3 options for layout sanity
            
            const pos = positions[index];
            const label = vore.destination || vore.Verb || vore.verb || 'Vore';
            
            // Choose an icon based on name
            let iconClass = 'fa-solid fa-teeth-open';
            const nameLower = label.toLowerCase();
            if (nameLower.includes('oral') || nameLower.includes('stomach') || nameLower.includes('swallow') || nameLower.includes('mouth')) {
                iconClass = 'fa-solid fa-drumstick-bite';
            } else if (nameLower.includes('unbirth') || nameLower.includes('womb') || nameLower.includes('heart') || nameLower.includes('breast')) {
                iconClass = 'fa-solid fa-heart';
            } else if (nameLower.includes('anal') || nameLower.includes('tail') || nameLower.includes('rear') || nameLower.includes('bowel') || nameLower.includes('cock')) {
                iconClass = 'fa-solid fa-snake';
            }

            const it = createRadialItem(pos, label, iconClass, (e) => {
                checkReach(target.playerId, 'player', e, () => {
                    socket.emit('voreAction', { voreType: vore, targetId: target.playerId });
                });
            });
            ring.appendChild(it);
        });

        // Back Option on the Left (does not auto-close)
        const backBtn = createRadialItem('left', 'Back', 'fa-solid fa-arrow-left', (e) => {
            e.stopPropagation();
            onBack();
        }, false);
        ring.appendChild(backBtn);
    }

    // --- Handle the playerRightClickedResponse event ---
    socket.on('playerRightClickedResponse', function (data) {
        const { responseInfo, predatorInfo, pointerX, pointerY } = data;

        const contextMenu = document.getElementById('contextMenu');
        if (!contextMenu) return;

        contextMenu.innerHTML = ''; // Clear existing content
        contextMenu.className = 'radial'; // Add radial styling class

        if (responseInfo.length > 0) {
            const playerInfo = responseInfo[0];
            const currentItem = {
                Identifier: playerInfo.Identifier,
                playerId: playerInfo.playerId,
                uniqueId: playerInfo.uniqueId,
                name: playerInfo.name,
                description: playerInfo.description,
                verb: playerInfo.verb,
                flavor: playerInfo.flavor
            };

            const targetId = (currentItem.Identifier === 'player') ? currentItem.playerId : currentItem.uniqueId;
            const targetType = (currentItem.Identifier === 'player') ? 'player' : 'object';

            const ring = document.createElement('div');
            ring.className = 'radial-ring';

            // Center element naming the target
            const center = document.createElement('div');
            center.className = 'radial-center';
            center.innerHTML = `${currentItem.name.split(' ')[0]}<br><span>${currentItem.Identifier}</span>`;
            ring.appendChild(center);

            const actions = playerInfo.availableActions || [];
            const hasHold = actions.includes('Hold');
            const hasGrip = actions.includes('Grip Firmly');
            const hasVore = actions.includes('Vore');
            const hasRelease = actions.includes('Release');
            const hasCraft = actions.includes('Craft');
            const hasUse = actions.includes('Use');

            // Render main radial layout
            const drawMainMenu = () => {
                // Clear any existing radial items
                const items = ring.querySelectorAll('.radial-item');
                items.forEach(it => it.remove());

                // UP: Examine
                if (actions.includes('Examine')) {
                    const it = createRadialItem('up', 'Examine', 'fa-solid fa-eye', (e) => {
                        socket.emit('examineClicked', currentItem);
                    });
                    ring.appendChild(it);
                }

                // RIGHT: Progression action
                if (hasHold) {
                    const it = createRadialItem('right', 'Hold', 'fa-solid fa-hand-back-fist', (e) => {
                        checkReach(targetId, targetType, e, () => {
                            socket.emit('playerPerformAction', { targetId: currentItem.playerId, intent: 'grabbing' });
                        });
                    });
                    ring.appendChild(it);
                } else if (hasGrip) {
                    const it = createRadialItem('right', 'Grip', 'fa-solid fa-handshake-simple', (e) => {
                        checkReach(targetId, targetType, e, () => {
                            socket.emit('gripFirmly', currentItem);
                        });
                    });
                    ring.appendChild(it);
                } else if (hasVore) {
                    const it = createRadialItem('right', 'Vore', 'fa-solid fa-teeth-open', (e) => {
                        e.stopPropagation();
                        renderVoreSubRing(ring, currentItem, predatorInfo, drawMainMenu);
                    }, false);
                    ring.appendChild(it);
                } else if (hasCraft) {
                    const it = createRadialItem('right', 'Craft', 'fa-solid fa-hammer', (e) => {
                        checkReach(targetId, targetType, e, () => {
                            socket.emit('openCrafting', { 
                                stationId: currentItem.uniqueId,
                                hand: (mouseDownButton === 2) ? 'right' : 'left'
                            });
                        });
                    });
                    ring.appendChild(it);
                } else if (hasUse) {
                    const useLabel = currentItem.verb || 'Use';
                    const it = createRadialItem('right', useLabel, 'fa-solid fa-hand-holding-water', (e) => {
                        checkReach(targetId, targetType, e, () => {
                            socket.emit('useItemClicked', { uid: currentItem.uniqueId });
                        });
                    });
                    ring.appendChild(it);
                } else {
                    // Check dynamic actions: Chop, Mine, Gather
                    const harvestAction = actions.find(a => ['chop', 'mine', 'gather'].includes(a.toLowerCase()));
                    if (harvestAction) {
                        let icon = 'fa-hammer';
                        if (harvestAction.toLowerCase() === 'chop') icon = 'fa-axe';
                        if (harvestAction.toLowerCase() === 'gather') icon = 'fa-hand-holding';
                        const it = createRadialItem('right', harvestAction, 'fa-solid ' + icon, (e) => {
                            checkReach(targetId, targetType, e, () => {
                                socket.emit('objectInteract', { type: 'resourceNode', id: currentItem.uniqueId, action: harvestAction.toLowerCase() });
                            });
                        });
                        ring.appendChild(it);
                    }
                }

                // DOWN: Release, Punch, or Haunt
                if (hasRelease) {
                    const it = createRadialItem('down', 'Release', 'fa-solid fa-hand-sparkles', (e) => {
                        socket.emit('releaseClicked', currentItem);
                    });
                    ring.appendChild(it);
                } else if (actions.includes('Punch')) {
                    const it = createRadialItem('down', 'Punch', 'fa-solid fa-hand-fist', (e) => {
                        socket.emit('playerPerformAction', { targetId: currentItem.playerId, intent: 'hostile' });
                    });
                    ring.appendChild(it);
                } else if (actions.includes('Haunt')) {
                    const it = createRadialItem('down', 'Haunt', 'fa-solid fa-ghost', (e) => {
                        checkReach(targetId, targetType, e, () => {
                            socket.emit('hauntClicked', currentItem);
                        });
                    });
                    ring.appendChild(it);
                }

                // LEFT: Cancel
                const cancelBtn = createRadialItem('left', 'Cancel', 'fa-solid fa-xmark', (e) => {
                    hideContextMenu();
                });
                ring.appendChild(cancelBtn);
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
