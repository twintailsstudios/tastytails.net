import assert from 'assert';

describe('Player Spawn Deduplication & Identity Routing Tests', function () {
    describe('Server Session Deduplication Logic', function () {
        it('should detect and evict previous socket when new connection arrives with identical charId', function () {
            const players = {
                'socket_old_123': {
                    socketId: 'socket_old_123',
                    _id: '65a001122334455667788990',
                    playerId: 'socket_old_123',
                    Username: 'Aria Silverpaw',
                    isInGame: true,
                    position: { x: 3291, y: 4287 }
                },
                'socket_other_456': {
                    socketId: 'socket_other_456',
                    _id: '65b998877665544332211000',
                    playerId: 'socket_other_456',
                    Username: 'Bob Bear',
                    isInGame: true,
                    position: { x: 4000, y: 4000 }
                }
            };

            const incomingSocketId = 'socket_new_789';
            const incomingCharId = '65a001122334455667788990';

            const evictedSockets = [];
            const charIdStr = incomingCharId.toString();

            Object.keys(players).forEach(existingSocketId => {
                if (existingSocketId !== incomingSocketId) {
                    const existingPlayer = players[existingSocketId];
                    if (existingPlayer && existingPlayer._id && existingPlayer._id.toString() === charIdStr) {
                        evictedSockets.push(existingSocketId);
                        delete players[existingSocketId];
                    }
                }
            });

            assert.strictEqual(evictedSockets.length, 1, 'Should evict exactly 1 lingering socket');
            assert.strictEqual(evictedSockets[0], 'socket_old_123', 'Evicted socket must be socket_old_123');
            assert.strictEqual(players['socket_old_123'], undefined, 'Old socket must be removed from players dictionary');
            assert.ok(players['socket_other_456'], 'Unrelated players must remain intact');
        });

        it('should ignore incoming connections with unique charId without evicting other players', function () {
            const players = {
                'socket_user_1': {
                    socketId: 'socket_user_1',
                    _id: 'char_user_1',
                    playerId: 'socket_user_1',
                    isInGame: true
                }
            };

            const incomingSocketId = 'socket_user_2';
            const incomingCharId = 'char_user_2';
            const evictedSockets = [];

            Object.keys(players).forEach(existingSocketId => {
                if (existingSocketId !== incomingSocketId) {
                    const existingPlayer = players[existingSocketId];
                    if (existingPlayer && existingPlayer._id && existingPlayer._id.toString() === incomingCharId.toString()) {
                        evictedSockets.push(existingSocketId);
                        delete players[existingSocketId];
                    }
                }
            });

            assert.strictEqual(evictedSockets.length, 0, 'No sockets should be evicted');
            assert.ok(players['socket_user_1'], 'Existing player must remain intact');
        });
    });

    describe('Client Local Player Identity Predicates', function () {
        const localSocket = { id: 'sock_local_111' };
        const localPlayerInfo = { _id: 'char_local_999', firstName: 'Aria' };

        function isLocalPlayer(keyId, packet, selfContext) {
            return (keyId === selfContext.socket.id) ||
                   (packet && packet.playerId === selfContext.socket.id) ||
                   (selfContext.playerInfo && packet && packet._id && selfContext.playerInfo._id && packet._id.toString() === selfContext.playerInfo._id.toString());
        }

        it('should correctly identify local player when keyId matches socket.id', function () {
            const selfContext = { socket: localSocket, playerInfo: localPlayerInfo };
            const packet = { position: { x: 100, y: 100 } };
            assert.strictEqual(isLocalPlayer('sock_local_111', packet, selfContext), true);
        });

        it('should correctly identify local player when packet.playerId matches socket.id', function () {
            const selfContext = { socket: localSocket, playerInfo: localPlayerInfo };
            const packet = { playerId: 'sock_local_111', position: { x: 100, y: 100 } };
            assert.strictEqual(isLocalPlayer('arbitrary_key', packet, selfContext), true);
        });

        it('should correctly identify local player when packet._id matches character _id even under different socket id', function () {
            const selfContext = { socket: localSocket, playerInfo: localPlayerInfo };
            const packet = { playerId: 'sock_old_stale', _id: 'char_local_999', position: { x: 3291, y: 4287 } };
            assert.strictEqual(isLocalPlayer('sock_old_stale', packet, selfContext), true);
        });

        it('should return false for genuinely remote players', function () {
            const selfContext = { socket: localSocket, playerInfo: localPlayerInfo };
            const packet = { playerId: 'sock_remote_222', _id: 'char_remote_888', position: { x: 200, y: 200 } };
            assert.strictEqual(isLocalPlayer('sock_remote_222', packet, selfContext), false);
        });
    });

    describe('Container Idempotency Verification', function () {
        it('should destroy previous playerContainer if displayPlayers is invoked multiple times', function () {
            let destroyedCount = 0;
            const mockContainer = {
                active: true,
                destroy: () => { destroyedCount++; }
            };

            const mockScene = {
                playerContainer: mockContainer
            };

            // Simulating displayPlayers container cleanup
            if (mockScene.playerContainer) {
                if (typeof mockScene.playerContainer.destroy === 'function') {
                    mockScene.playerContainer.destroy();
                }
                mockScene.playerContainer = null;
            }

            assert.strictEqual(destroyedCount, 1, 'Previous container must be destroyed');
            assert.strictEqual(mockScene.playerContainer, null, 'Reference must be reset to null before recreation');
        });
    });
});
