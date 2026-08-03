/**
 * @fileoverview contextMenu.js - Context Menu & Interactive Pointer Input System
 * 
 * @description
 * Manages player mouse and touch gestures, short-click hand action dispatching (left/right hand),
 * long-press / spacebar radial context menu queries, target reach verification with automated smart walking,
 * multi-target grab selection modals, and GPU-accelerated contextual hover tooltips.
 * 
 * Triggered by:
 * - Phaser scene lifecycle: initializeContextMenu(scene, socket) called in create.js
 * - Phaser pointer events: pointerdown, pointermove, pointerup, gameobjectover, gameobjectout
 * - Socket events: playerLeftClickedResponse, playerRightClickedResponse
 */

/**
 * Initializes context menu input handlers, socket listeners, and UI overlays for a Phaser scene.
 * @param {Phaser.Scene} scene - Active Phaser game scene
 * @param {SocketIO.Socket} socket - Client WebSocket connection
 */
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

    /**
     * Hides the active radial context menu and resets tooltip RAF state.
     * @param {Event} [event] - Optional click event to check target containment
     */
    function hideContextMenu(event) {
        if (event && contextMenu && contextMenu.contains(event.target)) {
            return;
        }
        isPendingRadialQuery = false;
        if (typeof cancelPendingTooltip === 'function') {
            cancelPendingTooltip();
        }
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

    /**
     * Mouse Interaction & Context Menu Event Listeners
     * - Left Click (button 0): Executes Left Hand action ('left').
     * - Right Click (button 2): Executes Right Hand action ('right').
     * - Radial Context Menu: Only triggered via Spacebar + Click or Long-Press (>350ms hold).
     */
    function isClickOnUI(pointer) {
        if (window.isPointerDownOnUI) return true;
        if (!pointer) return false;
        const evt = pointer.event;

        // 1. Direct target check from native browser event
        if (evt && evt.target && evt.target.tagName !== 'CANVAS') {
            return true;
        }

        // 2. Viewport clientX/clientY check with document.elementFromPoint
        let clientX = null;
        let clientY = null;

        if (evt) {
            if (evt.clientX !== undefined) {
                clientX = evt.clientX;
                clientY = evt.clientY;
            } else if (evt.touches && evt.touches.length > 0) {
                clientX = evt.touches[0].clientX;
                clientY = evt.touches[0].clientY;
            } else if (evt.changedTouches && evt.changedTouches.length > 0) {
                clientX = evt.changedTouches[0].clientX;
                clientY = evt.changedTouches[0].clientY;
            }
        }

        if (clientX !== null && clientY !== null) {
            const el = document.elementFromPoint(clientX, clientY);
            if (el && el.tagName !== 'CANVAS') {
                return true;
            }
        }

        return false;
    }

    scene.input.on('pointerdown', function (pointer, currentlyOver) {
        if (isClickOnUI(pointer)) {
            return;
        }

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

        // Long Press timer (350ms hold triggers radial menu)
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

        if (isClickOnUI(pointer)) {
            mouseDownPointer = null;
            mouseDownCurrentlyOver = null;
            didHoldTrigger = false;
            return;
        }

        // If context menu is currently visible on screen or pending a radial socket response, do not trigger ground click
        const isMenuVisible = (contextMenu && contextMenu.style.display === 'block') || isPendingRadialQuery;
        if (isMenuVisible || !mouseDownPointer) {
            mouseDownPointer = null;
            mouseDownCurrentlyOver = null;
            didHoldTrigger = false;
            return;
        }

        // Standard Click: Left Click (Button 0) = Left Hand | Right Click (Button 2) = Right Hand
        if (!didHoldTrigger && mouseDownPointer) {
            const hand = (mouseDownButton === 2) ? 'right' : 'left';
            executeHandClick(pointer, mouseDownCurrentlyOver, hand);
        }

        mouseDownPointer = null;
        mouseDownCurrentlyOver = null;
        didHoldTrigger = false;
    });

    /**
     * OPTIMIZATION: Consolidated helper function to parse clicked Phaser game objects into standardized target DTOs.
     * Avoids duplicate object iteration loops across triggerRadialQuery and executeHandClick.
     * @param {Array<Phaser.GameObjects.GameObject>} currentlyOver - Objects under pointer
     * @returns {Array<Object>} List of target entities ({ Identifier, playerId/uniqueId, name })
     */
    function extractTargetList(currentlyOver) {
        var clickedList = [];
        (currentlyOver || []).forEach(function (gameObject) {
            if (gameObject.playerInfo) {
                var playerClicked = {
                    Identifier: 'player',
                    playerId: gameObject.playerInfo.playerId,
                    name: gameObject.playerInfo.Username || (gameObject.playerInfo.firstName + ' ' + gameObject.playerInfo.lastName) || 'Unknown'
                };
                clickedList.push(playerClicked);
            } else if (gameObject.objectInfo) {
                var objectClicked = {
                    Identifier: 'mapObject',
                    uniqueId: gameObject.objectInfo.uniqueId,
                    name: gameObject.objectInfo.name,
                    description: gameObject.objectInfo.description
                };
                clickedList.push(objectClicked);
            }
        });
        return clickedList;
    }

    /**
     * Triggers radial context menu query over WebSocket for entities under pointer (or fallback ground/self).
     * @param {Phaser.Input.Pointer} pointer - Active Phaser pointer
     * @param {Array<Phaser.GameObjects.GameObject>} currentlyOver - Objects under pointer
     */
    function triggerRadialQuery(pointer, currentlyOver) {
        if (tooltipEl) {
            tooltipEl.style.display = 'none';
            tooltipEl.style.opacity = '0';
        }
        var clickedList = extractTargetList(currentlyOver);

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

    /**
     * Executes direct short-click hand interaction (Left Hand = Button 0, Right Hand = Button 2).
     * Enforces reach checks via checkReach() prior to emitting playerHandClicked over WebSocket.
     * @param {Phaser.Input.Pointer} pointer - Active Phaser pointer
     * @param {Array<Phaser.GameObjects.GameObject>} currentlyOver - Objects under pointer
     * @param {string} hand - Active hand ('left' or 'right')
     */
    function executeHandClick(pointer, currentlyOver, hand) {
        var clickedList = extractTargetList(currentlyOver);

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
                console.log(`[HandClick DEBUG] Emitting playerHandClicked. Hand: ${hand}, Button: ${mouseDownButton}, Intent: ${intent}, targetZone: ${window.currentTargetZone || 'torso'}, Target:`, primaryTarget);
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
                } else if (targetType === 'object') {
                    if (window.completeTutorialTask) {
                        window.completeTutorialTask(hand === 'left' ? 'left_pickup' : 'right_pickup');
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

    let currentSelectionCloseHandler = null;

    /**
     * OPTIMIZATION / SAFETY: Encapsulates targetSelectionMenu destruction and listener removal.
     * Prevents document mousedown event listener leaks across target selection cycles.
     */
    function destroySelectionMenu() {
        if (currentSelectionCloseHandler) {
            document.removeEventListener('mousedown', currentSelectionCloseHandler);
            currentSelectionCloseHandler = null;
        }
        const selectionMenu = document.getElementById('targetSelectionMenu');
        if (selectionMenu) {
            selectionMenu.style.display = 'none';
        }
    }

    // --- Handle the playerLeftClickedResponse event ---
    socket.on('playerLeftClickedResponse', function (data) {
        const { responseInfo, playerIntent, pointerX, pointerY } = data;
        console.log('Received playerLeftClickedResponse:', responseInfo);
        destroySelectionMenu();

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
                        targetZone: window.currentTargetZone || 'torso',
                        hand: (mouseDownButton === 2) ? 'right' : 'left'
                    });
                    destroySelectionMenu();
                };
                selectionMenu.appendChild(btn);
            });

            // Close menu if clicked outside (simple implementation)
            currentSelectionCloseHandler = function (e) {
                if (selectionMenu && !selectionMenu.contains(e.target)) {
                    destroySelectionMenu();
                }
            };
            // Timeout to avoid immediate closing from the current click
            setTimeout(() => {
                if (currentSelectionCloseHandler) {
                    document.addEventListener('mousedown', currentSelectionCloseHandler);
                }
            }, 100);

        } else if (responseInfo.length > 0) {
            // Single target or not grabbing, perform action on the first/only target
            const target = responseInfo[0];
            socket.emit('playerPerformAction', {
                targetId: target.playerId,
                intent: playerIntent,
                targetZone: window.currentTargetZone || 'torso',
                hand: (mouseDownButton === 2) ? 'right' : 'left'
            });
        }
    });

    // Reusable bounding box structures to eliminate Garbage Collection allocations in hot checks
    // OPTIMIZATION: Static pool objects prevent GC pauses during continuous movement checks.
    const _playerBox = { left: 0, right: 0, top: 0, bottom: 0 };
    const _targetBox = { left: 0, right: 0, top: 0, bottom: 0 };

    /**
     * OPTIMIZATION: Resolves target game object sprites via O(1) spatial index or item manager lookup.
     * Enforces sprite active validation and falls back to group scanning if un-indexed.
     * @param {string} targetId - Unique entity identifier or player ID
     * @param {string} targetType - Entity type ('player' or 'object')
     * @returns {Phaser.GameObjects.GameObject|null} Active sprite or null
     */
    function findTargetSprite(targetId, targetType) {
        const scene = window.gameScene;
        if (!scene) return null;

        if (targetType === 'player') {
            const player = scene.otherPlayersGroup ? scene.otherPlayersGroup.getChildren().find(p => p.playerId === targetId) : null;
            return (player && player.active !== false) ? player : null;
        }

        // 1. Direct itemManager map lookup (O(1))
        const im = window.itemManager || scene.itemManager;
        const itemEntry = im?.items?.[targetId];
        let sprite = itemEntry?.container || itemEntry?.sprite || itemEntry;
        if (sprite && sprite.active !== false) return sprite;

        // 2. Spatial Index lookup with active state check (O(1))
        if (scene.objectsById && scene.objectsById.has(targetId)) {
            sprite = scene.objectsById.get(targetId);
            if (sprite && sprite.active !== false) return sprite;
        }

        // 3. Fallback: Group scan for unindexed or legacy tiled objects
        const searchGroup = (group) => group?.getChildren().find(i =>
            (i.active !== false) && ((i.objectInfo && i.objectInfo.uniqueId === targetId) || i.uid === targetId)
        );
        return searchGroup(im?.itemsGroup) || searchGroup(scene.itemsGroup) || searchGroup(scene.objectGroup) || null;
    }

    /**
     * Evaluates spatial reach between local player container and target sprite box (48px buffer).
     * If out of range, configures scene.smartWalkTarget to pathfind player to target before executing callback.
     * @param {string} targetId - Target identifier
     * @param {string} targetType - Target type ('player' or 'object')
     * @param {Event|null} event - Triggering browser event or null for availability query
     * @param {Function} onReachCallback - Action callback executed when target is reached
     * @returns {boolean} True if in reach or querying, false if smart walking initiated
     */
    function checkReach(targetId, targetType, event, onReachCallback) {
        const scene = window.gameScene;
        if (!scene || !scene.playerContainer) {
            if (onReachCallback) onReachCallback();
            return true; // Safety
        }

        const targetSprite = findTargetSprite(targetId, targetType);
        let targetX = 0;
        let targetY = 0;
        let found = false;

        if (targetSprite) {
            targetX = targetSprite.x;
            targetY = targetSprite.y;
            found = true;
        }

        // Helper to check the actual AABB overlap with a safety buffer
        const runCheck = (playerX, playerY) => {
            const pCenterX = playerX + 30;
            const pCenterY = playerY;
            const reachHalf = 48; // reach buffer of 48px

            _playerBox.left = pCenterX - reachHalf;
            _playerBox.right = pCenterX + reachHalf;
            _playerBox.top = pCenterY - reachHalf;
            _playerBox.bottom = pCenterY + reachHalf;

            let hasTargetBox = false;
            if (targetType === 'player' && targetSprite) {
                const tX = targetSprite.x + 30;
                const tY = targetSprite.y;
                _targetBox.left = tX - 30;
                _targetBox.right = tX + 30;
                _targetBox.top = tY - 165;
                _targetBox.bottom = tY + 15;
                hasTargetBox = true;
            } else if (targetSprite) {
                if (targetSprite.body && targetSprite.body.width > 0) {
                    _targetBox.left = targetSprite.body.x;
                    _targetBox.right = targetSprite.body.right;
                    _targetBox.top = targetSprite.body.y;
                    _targetBox.bottom = targetSprite.body.bottom;
                    hasTargetBox = true;
                } else {
                    const width = targetSprite.displayWidth || targetSprite.width || 32;
                    const height = targetSprite.displayHeight || targetSprite.height || 32;
                    const oX = (targetSprite.originX !== undefined) ? targetSprite.originX : 0.5;
                    const oY = (targetSprite.originY !== undefined) ? targetSprite.originY : 1.0;

                    const tX = targetSprite.x;
                    const tY = targetSprite.y;

                    _targetBox.left = tX - (width * oX);
                    _targetBox.right = tX + (width * (1 - oX));
                    _targetBox.top = tY - (height * oY);
                    _targetBox.bottom = tY + (height * (1 - oY));
                    hasTargetBox = true;
                }
            }

            if (!hasTargetBox) return true;

            return (
                _playerBox.left < _targetBox.right &&
                _playerBox.right > _targetBox.left &&
                _playerBox.top < _targetBox.bottom &&
                _playerBox.bottom > _targetBox.top
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
                            socket.emit('playerPerformAction', { targetId: currentItem.playerId, intent: 'grabbing', targetZone: window.currentTargetZone || 'torso', hand: (mouseDownButton === 2) ? 'right' : 'left' });
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
                    const stationCfg = (window.craftingStations && currentItem.stationType) ? window.craftingStations[currentItem.stationType] : null;
                    const actionLabel = stationCfg && stationCfg.interactionVerb ? stationCfg.interactionVerb : 'Craft';
                    const iconClass = (stationCfg && stationCfg.defaultRecipeIcon) ? (stationCfg.defaultRecipeIcon.includes('fa-') ? stationCfg.defaultRecipeIcon : `fa-solid ${stationCfg.defaultRecipeIcon}`) : 'fa-solid fa-hammer';
                    innerActions.push({
                        label: actionLabel,
                        icon: iconClass,
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
                            const targetHand = (mouseDownButton === 2) ? 'right' : 'left';
                            socket.emit('playerHandClicked', {
                                hand: targetHand,
                                clickedItem: { Identifier: 'mapObject', uniqueId: currentItem.uniqueId },
                                playerIntent: window.currentIntent || 'friendly',
                                pointerX: pointerX,
                                pointerY: pointerY
                            });
                            if (window.completeTutorialTask) {
                                window.completeTutorialTask(targetHand === 'left' ? 'left_pickup' : 'right_pickup');
                            }
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
                            const targetHand = (mouseDownButton === 2) ? 'right' : 'left';
                            const uid = currentItem.uniqueId || '';
                            const isAnim = uid.toLowerCase().includes('animal') || uid.toLowerCase().includes('sheep');
                            socket.emit('objectInteract', { 
                                type: isAnim ? 'animal' : 'resourceNode', 
                                id: uid, 
                                action: harvestAction.toLowerCase(),
                                hand: targetHand
                            });
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
                        onClick: () => socket.emit('playerPerformAction', { targetId: currentItem.playerId, intent: 'hostile', targetZone: window.currentTargetZone || 'torso', hand: (mouseDownButton === 2) ? 'right' : 'left' })
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
    });

    // --- Contextual Hover Tooltip ---
    let tooltipEl = document.getElementById('context-tooltip');
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'context-tooltip';
        tooltipEl.className = 'context-tooltip';
        document.body.appendChild(tooltipEl);
    }

    let cachedIngredientMap = null;
    let cachedItemDataRef = null;

    function getStationIngredientSet(stationType) {
        if (!cachedIngredientMap || cachedItemDataRef !== window.itemData) {
            cachedItemDataRef = window.itemData;
            cachedIngredientMap = {};
            if (window.itemData) {
                Object.values(window.itemData).forEach(def => {
                    if (def?.recipe?.station && Array.isArray(def.recipe.ingredients)) {
                        if (!cachedIngredientMap[def.recipe.station]) {
                            cachedIngredientMap[def.recipe.station] = new Set();
                        }
                        def.recipe.ingredients.forEach(ing => {
                            if (ing.itemId) cachedIngredientMap[def.recipe.station].add(ing.itemId);
                        });
                    }
                });
            }
        }
        return cachedIngredientMap[stationType];
    }

    function isIngredientForStation(itemId, stationType) {
        if (!itemId || !stationType || !window.itemData) return false;
        const stationSet = getStationIngredientSet(stationType);
        return stationSet ? stationSet.has(itemId) : false;
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
                const stationCfg = window.craftingStations ? window.craftingStations[info.stationType] : null;
                const verb = stationCfg && stationCfg.interactionVerb ? stationCfg.interactionVerb.toLowerCase() : 'craft';
                const leftIsIng = leftHandNode && isIngredientForStation(leftHandNode.itemId, info.stationType);
                const rightIsIng = rightHandNode && isIngredientForStation(rightHandNode.itemId, info.stationType);

                if (leftIsIng && rightIsIng) {
                    actionText = `<i class="fa-solid fa-hammer"></i> L-click or R-click to deposit & ${verb}`;
                } else if (leftIsIng) {
                    actionText = `<i class="fa-solid fa-hammer"></i> L-click to deposit & ${verb}`;
                } else if (rightIsIng) {
                    actionText = `<i class="fa-solid fa-hammer"></i> R-click to deposit & ${verb}`;
                } else {
                    actionText = `<i class="fa-solid fa-hammer"></i> L-click or R-click to open ${info.name || 'Crafting'}`;
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

    let pendingTooltipFrame = null;

    function cancelPendingTooltip() {
        if (pendingTooltipFrame !== null) {
            cancelAnimationFrame(pendingTooltipFrame);
            pendingTooltipFrame = null;
        }
    }

    scene.input.on('pointermove', function (pointer) {
        if (tooltipEl && tooltipEl.style.display === 'block') {
            const clientX = (pointer.event ? pointer.event.clientX : pointer.x) + 15;
            const clientY = (pointer.event ? pointer.event.clientY : pointer.y) + 15;
            if (!pendingTooltipFrame) {
                pendingTooltipFrame = requestAnimationFrame(() => {
                    tooltipEl.style.left = '0px';
                    tooltipEl.style.top = '0px';
                    tooltipEl.style.transform = `translate3d(${clientX}px, ${clientY}px, 0)`;
                    pendingTooltipFrame = null;
                });
            }
        }
    });

    scene.input.on('gameobjectout', function (pointer, gameObject) {
        cancelPendingTooltip();
        if (tooltipEl) {
            tooltipEl.style.display = 'none';
        }
    });
}
