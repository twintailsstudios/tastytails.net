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
        console.log('hiding Context Menu');
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
        console.log('clickHandler called');
        // console.log('currentlyOver: ', currentlyOver);

        // --- Loop through the currentlyOver array and check if the clicked object is a player ---
        currentlyOver.forEach(function (gameObject) {
            if (gameObject.playerInfo) {
                var playerClicked = {
                    Identifier: gameObject.playerInfo.Identifier,
                    playerId: gameObject.playerInfo.playerId,
                    name: gameObject.playerInfo.Username || (gameObject.playerInfo.firstName + ' ' + gameObject.playerInfo.lastName) || 'Unknown'
                }
                clickedList.push(playerClicked);
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
                        targetPlayerId: target.playerId,
                        playerIntent: playerIntent
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
                targetPlayerId: target.playerId,
                playerIntent: playerIntent
            });
        }
    });

    // --- Helper Functions for DOM Creation ---

    function createMenuItem(label, iconClass, onClick) {
        const li = document.createElement('li');
        li.innerHTML = `<span style="display:flex; align-items:center;"><i class="${iconClass} icon"></i> ${label}</span>`;
        li.onclick = (e) => {
            e.stopPropagation();
            onClick();
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

                const li = createMenuItem(type.destination, icon, () => {
                    console.log(`Clicked Vore Type: ${type.destination}`);
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
        console.log('info = ', responseInfo);
        console.log(`right click triggered from server`);

        const contextMenu = document.getElementById('contextMenu');
        if (!contextMenu) return;

        contextMenu.innerHTML = ''; // Clear existing content

        if (responseInfo.length > 0) {
            const rootUl = document.createElement('ul');

            responseInfo.forEach((playerInfo, index) => {
                const currentItem = {
                    Identifier: playerInfo.Identifier,
                    playerId: playerInfo.playerId
                };

                // 1. Create Action List for this target
                const actionsUl = document.createElement('ul');

                if (playerInfo.availableActions) {
                    playerInfo.availableActions.forEach(action => {
                        if (action === 'Examine') {
                            actionsUl.appendChild(createMenuItem('Examine', 'fa-solid fa-eye', () => socket.emit('examineClicked', currentItem)));
                        } else if (action === 'Hold') {
                            actionsUl.appendChild(createMenuItem('Hold', 'fa-solid fa-hand-back-fist', () => socket.emit('playerPerformAction', { targetPlayerId: currentItem.playerId, playerIntent: 'grabbing' })));
                        } else if (action === 'Release') {
                            actionsUl.appendChild(createMenuItem('Release', 'fa-solid fa-hand-sparkles', () => socket.emit('releaseClicked', currentItem)));
                        } else if (action === 'Grip Firmly') {
                            actionsUl.appendChild(createMenuItem('Grip Firmly', 'fa-solid fa-handshake-simple', () => socket.emit('gripFirmly', currentItem)));
                        } else if (action === 'Vore') {
                            actionsUl.appendChild(createVoreSubMenu(predatorInfo, playerInfo.name, currentItem));
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
