function initializeContextMenu(scene, socket) {
    // --- Global Variables & Setup ---
    var contextMenu = document.getElementById('contextMenu');
    var voreMenu = document.getElementById('voreMenu');

    window.onclick = hideContextMenu;
    window.onkeydown = listenKeys;

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

        if (contextMenu) {
            // contextMenu is inside #phaserApp (relative), so we need coordinates relative to #phaserApp
            // We do NOT set position here anymore, as it conflicts with the server response logic
            // which handles boundary checks. This function now primarily prevents the default menu.
        }

        if (voreMenu) {
            voreMenu.style.display = 'none';
        }
        return false;
    };

    function hideContextMenu(event) {
        // const contextMenu = document.getElementById('contextMenu');
        if (event && contextMenu && contextMenu.contains(event.target)) {
            return;
        }
        // console.log('hiding Context Menu');
        if (contextMenu) contextMenu.style.display = 'none';
        // contextMenu.remove();
        if (document.querySelector("#contextMenu > playermenu")) {
            const toRemove = document.querySelector("#contextMenu > playermenu");
            toRemove.remove();
        }
    };
    window.hideContextMenu = hideContextMenu;

    function listenKeys(event) {
        var keyCode = event.which || event.keyCode;
        // console.log('listenkeys function keyCode = ', keyCode);
        if (keyCode == 27) {
            hideContextMenu();
        }
    }

    window.specialTestFunction = function (event) {
        //alert("You did a hover thingy!");
        if (voreMenu) voreMenu.style.display = 'block';
        //voreMenu.style.left = event.clientX + 'px';
        //voreMenu.style.top = event.clientY + 'px';
        return false;
    };

    window.specialMouseOut = function (event) {
        if (voreMenu) voreMenu.style.display = 'none';
        return false;
    };

    // --- Phaser Input Handling ---

    scene.input.on('pointerdown', function (pointer, currentlyOver) {
        clickHandler(pointer, currentlyOver);
    });

    function clickHandler(pointer, currentlyOver) {
        var clickedList = [];
        if (pointer.interactionHandled) {
            console.log('Interaction handled by item/other, skipping Context Menu logic.');
            return;
        }
        console.log('clickHandler called. currentlyOver length:', currentlyOver.length);

        // --- Loop through the currentlyOver array and check if the clicked object is a player or map object ---
        // WITH TOP-ONLY INPUT, WE SHOULD ONLY PROCESS THE FIRST VALID TARGET
        // But to be safe and support 'topOnly' logic manually if needed:
        // const topObjects = currentlyOver.slice(0, 1); // This line is removed

        currentlyOver.forEach(function (gameObject) { // Changed from topObjects.forEach
            console.log('Checking object:', gameObject.name, gameObject.type);
            if (gameObject.playerInfo) {
                var playerClicked = {
                    Identifier: gameObject.playerInfo.Identifier,
                    playerId: gameObject.playerInfo.playerId,
                    name: gameObject.playerInfo.Username || (gameObject.playerInfo.firstName + ' ' + gameObject.playerInfo.lastName) || 'Unknown'
                }
                clickedList.push(playerClicked);
            } else if (gameObject.objectInfo) {
                console.log('Found Map Object:', gameObject.objectInfo);
                // Handle Map Objects (Signs, Furniture, etc.)
                var objectClicked = {
                    Identifier: gameObject.objectInfo.Identifier, // 'mapObject'
                    uniqueId: gameObject.objectInfo.uniqueId,
                    name: gameObject.objectInfo.name,
                    description: gameObject.objectInfo.description
                }
                clickedList.push(objectClicked);
            }
        });

        // --- Emit the clicked list to the server ---
        if (clickedList.length > 0) {
            // Access global currentIntent
            var intent = window.currentIntent || 'friendly';
            if (pointer.rightButtonDown()) {
                console.log('Right clicked on: ', clickedList, ' with intent: ', intent);
                socket.emit('playerRightClicked', {
                    rightClickedList: clickedList,
                    playerIntent: intent,
                    pointerX: pointer.event.clientX,
                    pointerY: pointer.event.clientY
                });
            } else {
                // Always emit query first to get correct names
                console.log('Left clicked on: ', clickedList, ' with intent: ', intent);
                socket.emit('playerLeftClicked', {
                    clickedList: clickedList,
                    playerIntent: intent,
                    pointerX: pointer.event.clientX,
                    pointerY: pointer.event.clientY
                });
            }
        } else {
            console.log('No targets clicked (list empty).');
            // No targets clicked, hide context menu if it's open
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
    function checkReach(targetId, targetType, event) {
        const scene = window.gameScene;
        if (!scene || !scene.playerContainer) return true; // Safety

        // Player Reach Box: 96x96 centered on Player
        // Player Center = x + 30, y
        const pCenterX = scene.playerContainer.x + 30;
        const pCenterY = scene.playerContainer.y;
        const reachHalf = 48;

        const playerBox = {
            left: pCenterX - reachHalf,
            right: pCenterX + reachHalf,
            top: pCenterY - reachHalf,
            bottom: pCenterY + reachHalf
        };

        let targetBox = null;
        let targetName = "Target";
        let found = false;

        if (targetType === 'player') {
            const target = scene.otherPlayersGroup.getChildren().find(p => p.playerId === targetId);
            if (target) {
                // Create a FULL BODY box for the target player
                // Sprite visual height is approx 163px. Anchored at feet (y).
                // So Y-163 is top. Y is bottom.
                // We add a little buffer.
                const tX = target.x + 30; // Center X
                const tY = target.y;      // Center Y (feet)

                targetBox = {
                    left: tX - 30, // Full width (60) center-offset
                    right: tX + 30,
                    top: tY - 165, // Full height upwards
                    bottom: tY + 15 // A bit below feet
                };
                targetName = target.playerInfo ? (target.playerInfo.Username || target.playerInfo.firstName) : 'Target';
                found = true;
            }
        } else if (targetType === 'item') {
            const target = scene.itemsGroup ? scene.itemsGroup.getChildren().find(i => i.uid === targetId || (i.objectInfo && i.objectInfo.uniqueId === targetId)) : null;
            if (target) {
                // Items usually originate at bottom center or similar. 
                // Let's use a small box around their origin
                targetBox = {
                    left: target.x - 16,
                    right: target.x + 16,
                    top: target.y - 32, // Height approx
                    bottom: target.y
                };
                targetName = (target.objectInfo && target.objectInfo.name) ? target.objectInfo.name : 'Item';
                found = true;
            }
        } else {
            // mapObject
            const target = scene.objectGroup.getChildren().find(o => o.objectInfo && o.objectInfo.uniqueId === targetId);
            if (target) {
                // Use Physics Body if available for best accuracy
                if (target.body) {
                    targetBox = {
                        left: target.body.x,
                        right: target.body.right,
                        top: target.body.y,
                        bottom: target.body.bottom
                    };
                } else {
                    // Fallback to Sprite dimensions (Origin is 0,1 Bottom-Left usually)
                    // originX=0, originY=1
                    const tX = target.x - (target.width * target.originX);
                    const tY = target.y - (target.height * target.originY);

                    targetBox = {
                        left: tX,
                        right: tX + target.width,


                        top: tY,
                        bottom: tY + target.height
                    };
                }

                targetName = target.objectInfo.name || 'Object';
                found = true;
            }
        }



        if (!found) {
            // If we can't find it visually, we assume it's OK/Server will handle, or fail?
            // Usually if it's in the clicked list, it SHOULD be found.
            return true;
        }

        // AABB Intersection Test
        // Returns true if boxes overlap
        const intersects = (
            playerBox.left < targetBox.right &&
            playerBox.right > targetBox.left &&
            playerBox.top < targetBox.bottom &&
            playerBox.bottom > targetBox.top
        );

        if (intersects) {
            return true;
        }

        // Fail
        // console.log(`[Reach] Out of range of ${targetName}!`);
        // console.log('PlayerBox:', playerBox);
        // console.log('TargetBox:', targetBox);

        if (event && window.showWorldToast) {
            window.showWorldToast(event.clientX, event.clientY, "out of reach");
        } else if (window.showWorldToast) {
            // Use player screen coords
            const cam = scene.cameras.main;
            const sx = (scene.playerContainer.x - cam.scrollX) * cam.zoom;
            const sy = (scene.playerContainer.y - 40 - cam.scrollY) * cam.zoom;
            // window.showWorldToast(sx, sy, "out of reach");
        }

        if (window.addLocalSystemMessage) {
            window.addLocalSystemMessage(`${targetName} is too far away.`);
        }
        return false;
    }

    // --- Helper Functions for DOM Creation ---

    function createMenuItem(label, iconClass, onClick) {
        const li = document.createElement('li');
        li.innerHTML = `<span style="display:flex; align-items:center;"><i class="${iconClass} icon"></i> ${label}</span>`;
        li.onclick = (e) => {
            e.stopPropagation();
            onClick(e); // Pass Event
            hideContextMenu();
        };
        return li;
    }

    function createSubMenuParent(label, iconClass, subMenuList) {
        const li = document.createElement('li');
        li.innerHTML = `<span style="display:flex; align-items:center;"><i class="${iconClass} icon"></i> ${label}</span> <i class="fa-solid fa-caret-right arrow"></i>`;

        const subContainer = document.createElement('div');
        subContainer.className = 'subMenu';
        subContainer.appendChild(subMenuList);

        li.appendChild(subContainer);
        return li;
    }

    function createVoreSubMenu(predatorInfo, targetName, targetItem) {
        const ul = document.createElement('ul');

        // Header
        const header = document.createElement('div');
        header.className = 'sub-header';
        header.textContent = `${targetName} will go into your...`;
        ul.appendChild(header);

        if (predatorInfo.voreTypes && predatorInfo.voreTypes.length > 0) {
            predatorInfo.voreTypes.forEach(type => {
                let icon = 'fa-solid fa-utensils';
                if (type.destination === 'Stomach') icon = 'fa-solid fa-drumstick-bite';
                if (type.destination === 'Womb') icon = 'fa-solid fa-heart';
                if (type.destination === 'Tail') icon = 'fa-solid fa-snake';

                const li = createMenuItem(type.destination, icon, (e) => {
                    console.log(`Clicked Vore Type: ${type.destination}`);
                    if (!checkReach(targetItem.playerId, 'player', e)) return;
                    socket.emit('voreAction', {
                        voreType: type,
                        targetId: targetItem.playerId
                    });
                });
                ul.appendChild(li);
            });
        } else {
            const emptyLi = document.createElement('li');
            emptyLi.textContent = 'No vore types available';
            emptyLi.style.padding = '5px 10px';
            emptyLi.style.fontStyle = 'italic';
            ul.appendChild(emptyLi);
        }

        return createSubMenuParent('Vore', 'fa-solid fa-teeth-open', ul);
    }

    // --- Handle the playerRightClickedResponse event ---
    socket.on('playerRightClickedResponse', function (data) {
        const { responseInfo, predatorInfo, pointerX, pointerY } = data;
        // console.log('info = ', responseInfo);
        // console.log(`right click triggered from server`);

        const contextMenu = document.getElementById('contextMenu');
        if (!contextMenu) return;

        contextMenu.innerHTML = ''; // Clear existing content

        if (responseInfo.length > 0) {
            const rootUl = document.createElement('ul');

            responseInfo.forEach((playerInfo, index) => {
                const currentItem = {
                    Identifier: playerInfo.Identifier,
                    playerId: playerInfo.playerId,
                    uniqueId: playerInfo.uniqueId,
                    name: playerInfo.name,
                    description: playerInfo.description,
                    verb: playerInfo.verb,
                    flavor: playerInfo.flavor
                };

                // ID for range check: playerId for players, uniqueId for mapObjects
                const targetId = (currentItem.Identifier === 'player') ? currentItem.playerId : currentItem.uniqueId;
                const targetType = (currentItem.Identifier === 'player') ? 'player' : 'object';

                // 1. Create Action List for this target
                const actionsUl = document.createElement('ul');
                // console.log(`[ContextMenu] Building actions for target: ${targetId} (${targetType})`);

                if (playerInfo.availableActions) {
                    playerInfo.availableActions.forEach(action => {
                        try {
                            // console.log(`[ContextMenu] Processing action: ${action}`);
                            if (action === 'Examine') {
                                actionsUl.appendChild(createMenuItem('Examine', 'fa-solid fa-eye', (e) => socket.emit('examineClicked', currentItem)));
                            } else if (action === 'Hold') {
                                if (checkReach(targetId, targetType, null)) {
                                    actionsUl.appendChild(createMenuItem('Hold', 'fa-solid fa-hand-back-fist', (e) => {
                                        if (!checkReach(targetId, targetType, e)) return;
                                        socket.emit('playerPerformAction', { targetId: currentItem.playerId, intent: 'grabbing' });
                                    }));
                                }
                            } else if (action === 'Release') {
                                actionsUl.appendChild(createMenuItem('Release', 'fa-solid fa-hand-sparkles', (e) => socket.emit('releaseClicked', currentItem)));
                            } else if (action === 'Grip Firmly') {
                                actionsUl.appendChild(createMenuItem('Grip Firmly', 'fa-solid fa-handshake-simple', (e) => {
                                    if (!checkReach(targetId, targetType, e)) return;
                                    socket.emit('gripFirmly', currentItem);
                                }));
                            } else if (action === 'Craft') {
                                actionsUl.appendChild(createMenuItem('Craft', 'fa-solid fa-hammer', (e) => {
                                    if (!checkReach(targetId, targetType, e)) return;
                                    socket.emit('openCrafting', { stationId: currentItem.uniqueId });
                                }));
                            } else if (action === 'Use') {
                                const useLabel = currentItem.verb || 'Use';
                                actionsUl.appendChild(createMenuItem(useLabel, 'fa-solid fa-hand-holding-water', (e) => {
                                    if (!checkReach(targetId, targetType, e)) return;
                                    socket.emit('useItemClicked', { uid: currentItem.uniqueId });
                                }));
                            } else if (action === 'Vore') {
                                actionsUl.appendChild(createVoreSubMenu(predatorInfo, playerInfo.name, currentItem));
                            }
                        } catch (err) {
                            // console.error(`[ContextMenu] Error processing action '${action}' for ${targetId}:`, err);
                        }
                    });
                }

                // 2. Handle Logic: Stacked vs Single
                if (responseInfo.length > 1) {
                    // Stacked: Target Name is the Parent Item -> Hover reveals actions
                    const targetLi = createSubMenuParent(playerInfo.name, 'fa-solid fa-user', actionsUl);
                    rootUl.appendChild(targetLi);

                    // Divider
                    if (index < responseInfo.length - 1) {
                        const sep = document.createElement('li');
                        sep.className = 'seperator';
                        rootUl.appendChild(sep);
                    }
                } else {
                    // Single: Name is a Header -> Actions are direct children
                    const header = document.createElement('li');
                    header.className = 'header';
                    header.innerHTML = `<i class="fa-solid fa-user icon"></i> ${playerInfo.name}`;
                    rootUl.appendChild(header);

                    // Move children up
                    while (actionsUl.firstChild) {
                        rootUl.appendChild(actionsUl.firstChild);
                    }
                }
            });

            contextMenu.appendChild(rootUl);

            contextMenu.style.display = 'block';
            contextMenu.style.visibility = 'hidden'; // Hide while measuring

            // Position the menu
            if (pointerX !== undefined && pointerY !== undefined) {
                // Since contextMenu is now a direct child of body, we use client coordinates directly
                let left = pointerX;
                let top = pointerY;

                const menuWidth = contextMenu.offsetWidth;
                const menuHeight = contextMenu.offsetHeight;
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                // Boundary Check: If menu goes off right edge, shift it left
                if (left + menuWidth > viewportWidth) {
                    left -= menuWidth;
                }

                // Boundary Check: If menu goes off bottom edge, shift it up
                if (top + menuHeight > viewportHeight) {
                    top -= menuHeight;
                }

                // Ensure it doesn't go off the left or top edges after adjustment
                if (left < 0) left = 0;
                if (top < 0) top = 0;

                contextMenu.style.left = left + 'px';
                contextMenu.style.top = top + 'px';
            }
            contextMenu.style.visibility = 'visible'; // Show after positioning
        }

        if (document.getElementById("voreDisplay")) document.getElementById("voreDisplay").style.display = "none";
        if (document.getElementById("optionsDisplay")) document.getElementById("optionsDisplay").style.display = "none";
    });
}
