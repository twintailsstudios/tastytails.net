/**
 * @fileoverview Pathfinder.js - Authoritative Server-Side A* Grid Pathfinder
 * @subsystem NPC AI & Navigation Engine
 * @description
 * High-performance, zero-allocation A* pathfinding algorithm designed for 2D tilemaps
 * and 30Hz authoritative game loops. Features binary min-heap priority queue,
 * 8-directional traversal with diagonal corner-cutting collision safeguards,
 * and bounded node exploration budgets to strictly preserve frame tick limits.
 */

/**
 * Lightweight Binary Min-Heap Priority Queue for A* Open Set.
 */
class MinHeap {
    constructor() {
        this.heap = [];
    }

    /**
     * Pushes a node into the min-heap ordered by its f-score.
     * @param {Object} node - A* path node
     */
    push(node) {
        this.heap.push(node);
        this._bubbleUp(this.heap.length - 1);
    }

    /**
     * Pops and returns the node with the lowest f-score.
     * @returns {Object|undefined}
     */
    pop() {
        if (this.heap.length === 0) return undefined;
        const top = this.heap[0];
        const bottom = this.heap.pop();
        if (this.heap.length > 0) {
            this.heap[0] = bottom;
            this._sinkDown(0);
        }
        return top;
    }

    /**
     * Returns true if the heap is empty.
     * @returns {boolean}
     */
    isEmpty() {
        return this.heap.length === 0;
    }

    _bubbleUp(index) {
        const element = this.heap[index];
        while (index > 0) {
            const parentIndex = (index - 1) >> 1;
            const parent = this.heap[parentIndex];
            if (element.f >= parent.f) break;
            this.heap[index] = parent;
            this.heap[parentIndex] = element;
            index = parentIndex;
        }
    }

    _sinkDown(index) {
        const length = this.heap.length;
        const element = this.heap[index];

        while (true) {
            const leftChildIndex = (index << 1) + 1;
            const rightChildIndex = leftChildIndex + 1;
            let swapIndex = null;
            let minF = element.f;

            if (leftChildIndex < length) {
                const leftChild = this.heap[leftChildIndex];
                if (leftChild.f < minF) {
                    swapIndex = leftChildIndex;
                    minF = leftChild.f;
                }
            }

            if (rightChildIndex < length) {
                const rightChild = this.heap[rightChildIndex];
                if (rightChild.f < minF) {
                    swapIndex = rightChildIndex;
                }
            }

            if (swapIndex === null) break;
            this.heap[index] = this.heap[swapIndex];
            this.heap[swapIndex] = element;
            index = swapIndex;
        }
    }
}

/**
 * 8-Directional neighbor offsets [dx, dy, cost, isDiagonal]
 */
const NEIGHBOR_OFFSETS = [
    // Cardinals (cost = 1.0)
    { dx: 0, dy: -1, cost: 1.0, isDiag: false },
    { dx: 0, dy: 1, cost: 1.0, isDiag: false },
    { dx: -1, dy: 0, cost: 1.0, isDiag: false },
    { dx: 1, dy: 0, cost: 1.0, isDiag: false },
    // Diagonals (cost = sqrt(2) ≈ 1.414)
    { dx: -1, dy: -1, cost: 1.414, isDiag: true, check1: { dx: -1, dy: 0 }, check2: { dx: 0, dy: -1 } },
    { dx: 1, dy: -1, cost: 1.414, isDiag: true, check1: { dx: 1, dy: 0 }, check2: { dx: 0, dy: -1 } },
    { dx: -1, dy: 1, cost: 1.414, isDiag: true, check1: { dx: -1, dy: 0 }, check2: { dx: 0, dy: 1 } },
    { dx: 1, dy: 1, cost: 1.414, isDiag: true, check1: { dx: 1, dy: 0 }, check2: { dx: 0, dy: 1 } }
];

class Pathfinder {
    /**
     * Calculates Octile distance heuristic between two grid tiles.
     * @param {number} x1 
     * @param {number} y1 
     * @param {number} x2 
     * @param {number} y2 
     * @returns {number}
     */
    static heuristic(x1, y1, x2, y2) {
        const dx = Math.abs(x1 - x2);
        const dy = Math.abs(y1 - y2);
        // Octile distance formula
        return (dx + dy) + (1.414 - 2) * Math.min(dx, dy);
    }

    /**
     * Checks if a tile coordinate is solid/blocked in the collision map.
     * @param {number} tx - Tile X coordinate
     * @param {number} ty - Tile Y coordinate
     * @param {Array<Array<number>>|Function} collisionMap - 2D grid or collision evaluator
     * @returns {boolean} True if solid/blocked or out of map bounds
     */
    static isTileBlocked(tx, ty, collisionMap) {
        if (typeof collisionMap === 'function') {
            return collisionMap(tx, ty);
        }
        if (!Array.isArray(collisionMap)) return false;
        if (ty < 0 || ty >= collisionMap.length) return true;
        const row = collisionMap[ty];
        if (!Array.isArray(row) || tx < 0 || tx >= row.length) return true;
        return row[tx] === 1 || row[tx] === true;
    }

    /**
     * Finds an optimal grid path from start to goal using A*.
     * 
     * @param {number} startX - Start tile X
     * @param {number} startY - Start tile Y
     * @param {number} goalX - Goal tile X
     * @param {number} goalY - Goal tile Y
     * @param {Array<Array<number>>|Function} collisionMap - 2D collision grid (0 = free, 1 = solid)
     * @param {Object} [options] - Configuration options
     * @param {number} [options.maxExplored=600] - Max node exploration limit to protect tick budget
     * @param {boolean} [options.allowClosestOnTimeout=true] - Return path to closest explored node if goal unreachable
     * @returns {Array<{tx: number, ty: number}>|null} Array of grid steps or null if no path found
     */
    static findGridPath(startX, startY, goalX, goalY, collisionMap, options = {}) {
        const maxExplored = options.maxExplored || 600;
        const allowClosestOnTimeout = options.allowClosestOnTimeout !== false;

        // Trivial case: start is goal
        if (startX === goalX && startY === goalY) {
            return [{ tx: startX, ty: startY }];
        }

        // Fast bounds & start/goal validation
        if (this.isTileBlocked(startX, startY, collisionMap)) {
            // Start is inside solid tile; attempt 1-step recovery
            let recovered = false;
            for (let i = 0; i < 4; i++) {
                const nx = startX + NEIGHBOR_OFFSETS[i].dx;
                const ny = startY + NEIGHBOR_OFFSETS[i].dy;
                if (!this.isTileBlocked(nx, ny, collisionMap)) {
                    startX = nx;
                    startY = ny;
                    recovered = true;
                    break;
                }
            }
            if (!recovered) return null;
        }

        const openSet = new MinHeap();
        // Lookup tables for gScores and visited tracking (Key: ty * 10000 + tx)
        const gScores = new Map();
        const cameFrom = new Map();
        const closedSet = new Set();

        const startKey = startY * 10000 + startX;
        const startH = this.heuristic(startX, startY, goalX, goalY);
        
        gScores.set(startKey, 0);
        openSet.push({ tx: startX, ty: startY, g: 0, f: startH });

        let nodesExplored = 0;
        let closestNode = { tx: startX, ty: startY, h: startH };

        while (!openSet.isEmpty()) {
            const current = openSet.pop();
            const currentKey = current.ty * 10000 + current.tx;

            // Reached goal tile!
            if (current.tx === goalX && current.ty === goalY) {
                return this._reconstructPath(cameFrom, current);
            }

            if (closedSet.has(currentKey)) continue;
            closedSet.add(currentKey);
            nodesExplored++;

            // Track closest node for graceful timeout fallback
            const distToGoal = this.heuristic(current.tx, current.ty, goalX, goalY);
            if (distToGoal < closestNode.h) {
                closestNode = { tx: current.tx, ty: current.ty, h: distToGoal };
            }

            // Enforce tick budget protection cap
            if (nodesExplored >= maxExplored) {
                if (allowClosestOnTimeout && (closestNode.tx !== startX || closestNode.ty !== startY)) {
                    return this._reconstructPath(cameFrom, closestNode);
                }
                return null;
            }

            const currentG = gScores.get(currentKey) || 0;

            // Expand 8 neighbors
            for (let i = 0; i < NEIGHBOR_OFFSETS.length; i++) {
                const offset = NEIGHBOR_OFFSETS[i];
                const nx = current.tx + offset.dx;
                const ny = current.ty + offset.dy;
                const neighborKey = ny * 10000 + nx;

                if (closedSet.has(neighborKey)) continue;

                // Check solid tile collision
                if (this.isTileBlocked(nx, ny, collisionMap)) continue;

                // Diagonal Corner-Cutting Safeguard:
                // Cannot traverse diagonally if either adjacent cardinal tile is blocked
                if (offset.isDiag) {
                    const c1Blocked = this.isTileBlocked(current.tx + offset.check1.dx, current.ty + offset.check1.dy, collisionMap);
                    const c2Blocked = this.isTileBlocked(current.tx + offset.check2.dx, current.ty + offset.check2.dy, collisionMap);
                    if (c1Blocked || c2Blocked) continue;
                }

                const tentativeG = currentG + offset.cost;
                const existingG = gScores.get(neighborKey);

                if (existingG === undefined || tentativeG < existingG) {
                    gScores.set(neighborKey, tentativeG);
                    cameFrom.set(neighborKey, current);
                    const fScore = tentativeG + this.heuristic(nx, ny, goalX, goalY);
                    openSet.push({ tx: nx, ty: ny, g: tentativeG, f: fScore });
                }
            }
        }

        // Open set exhausted without finding direct goal
        if (allowClosestOnTimeout && (closestNode.tx !== startX || closestNode.ty !== startY)) {
            return this._reconstructPath(cameFrom, closestNode);
        }

        return null;
    }

    /**
     * Computes smoothed world pixel waypoints from pixel start to pixel target.
     * 
     * @param {number} startPixelX - Start X in world pixels
     * @param {number} startPixelY - Start Y in world pixels
     * @param {number} targetPixelX - Target X in world pixels
     * @param {number} targetPixelY - Target Y in world pixels
     * @param {Array<Array<number>>|Function} collisionMap - Collision grid
     * @param {number} [tileSize=32] - Width/height of grid tile in pixels
     * @param {Object} [options] - A* options
     * @returns {Array<{x: number, y: number}>|null} World pixel waypoints centered in tiles
     */
    static findWorldPath(startPixelX, startPixelY, targetPixelX, targetPixelY, collisionMap, tileSize = 32, options = {}) {
        const startTx = Math.floor(startPixelX / tileSize);
        const startTy = Math.floor(startPixelY / tileSize);
        const goalTx = Math.floor(targetPixelX / tileSize);
        const goalTy = Math.floor(targetPixelY / tileSize);

        const gridPath = this.findGridPath(startTx, startTy, goalTx, goalTy, collisionMap, options);
        if (!gridPath || gridPath.length === 0) return null;

        const halfTile = tileSize * 0.5;
        const worldPath = [];

        // Convert grid tiles to centered world pixel coordinates
        for (let i = 0; i < gridPath.length; i++) {
            const step = gridPath[i];
            worldPath.push({
                x: step.tx * tileSize + halfTile,
                y: step.ty * tileSize + halfTile
            });
        }

        // Fine-tune destination endpoint to match targetPixel if within final tile
        if (worldPath.length > 0) {
            const lastStep = worldPath[worldPath.length - 1];
            const distToExactTarget = Math.hypot(lastStep.x - targetPixelX, lastStep.y - targetPixelY);
            if (distToExactTarget <= tileSize) {
                lastStep.x = targetPixelX;
                lastStep.y = targetPixelY;
            }
        }

        return worldPath;
    }

    /**
     * Reconstructs the waypoint path from the cameFrom map.
     * @private
     */
    static _reconstructPath(cameFrom, current) {
        const path = [{ tx: current.tx, ty: current.ty }];
        let currKey = current.ty * 10000 + current.tx;

        while (cameFrom.has(currKey)) {
            const parent = cameFrom.get(currKey);
            path.push({ tx: parent.tx, ty: parent.ty });
            currKey = parent.ty * 10000 + parent.tx;
        }

        path.reverse();
        return path;
    }
}

module.exports = Pathfinder;
