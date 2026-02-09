
/**
 * Server-side Animal Entity
 * Handles AI, Movement, and State
 */
class Animal {
    constructor(id, x, y, properties, collisionCallback) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.startX = x;
        this.startY = y;
        this.properties = properties;
        this.checkCollision = collisionCallback;

        // Stats
        this.speed = properties.moveSpeed || 30;
        this.wanderRange = properties.wanderRange || 200; // Default range if not infinite (though user said infinite, good to have a tether option)
        this.isInfiniteWander = true; // User requested unlimited

        // State
        this.state = 'IDLE'; // IDLE, MOVE
        this.stateTimer = 0;

        this.targetX = x;
        this.targetY = y;
        this.velocityX = 0;
        this.velocityY = 0;

        // Tick initialization
        this.pickNewState();

        // Wool Mechanics
        this.isSheared = false;
        this.regrowthTimer = 0;
        this.regrowthDuration = 60 * 5; // 5 Minutes (assuming 60fps delta? No, usually delta is seconds. Let's assume delta is SECONDS based on update logic)
        // update(delta) usually assumes delta is in seconds.
        // Let's set it to 30 seconds for testing, or 300 seconds for gameplay.
        this.regrowthDuration = 60.0; // 1 minute for now
    }

    pickNewState() {
        // Active AI for testing: 80% Move, 20% Idle
        if (Math.random() < 0.2) {
            this.state = 'IDLE';
            this.stateTimer = 1 + Math.random() * 2; // 1-3s wait
            this.velocityX = 0;
            this.velocityY = 0;
            // console.log(`[Animal ${this.id}] State: IDLE (${this.stateTimer.toFixed(1)}s)`);
        } else {
            this.state = 'MOVE';
            this.moveTimer = 0; // Reset Move Timer
            this.maxMoveTime = 8.0; // Give up after 8 seconds

            // Pick random point
            // For now, unlimited range, but let's keep it somewhat local to avoid them walking 10 miles away immediately
            // Or truly random walk.
            const dist = 50 + Math.random() * 150;
            const angle = Math.random() * Math.PI * 2;

            this.targetX = this.x + Math.cos(angle) * dist;
            this.targetY = this.y + Math.sin(angle) * dist;
            // console.log(`[Animal ${this.id}] State: MOVE to (${this.targetX.toFixed(0)}, ${this.targetY.toFixed(0)})`);
        }
    }

    update(delta) {
        if (this.state === 'IDLE') {
            this.stateTimer -= delta;
            if (this.stateTimer <= 0) {
                this.pickNewState();
            }
        } else if (this.state === 'MOVE') {
            this.moveTimer += delta;
            if (this.moveTimer >= this.maxMoveTime) {
                // console.log(`[Animal ${this.id}] Move Timeout - Forcing IDLE`);
                this.state = 'IDLE';
                this.stateTimer = 1.0;
                return;
            }

            // Move towards target
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 5) {
                // Reached target
                this.x = this.targetX;
                this.y = this.targetY;
                this.pickNewState();
            } else {
                // Normalize and move
                const moveDist = this.speed * delta;
                const ratio = moveDist / dist;
                const moveX = dx * ratio;
                const moveY = dy * ratio;

                const nextX = this.x + moveX;
                const nextY = this.y + moveY;

                // Box Collision Check (80x15) - Assuming x,y is Bottom-Center
                const halfW = (this.properties.bodyWidth || 80) / 2;
                const h = (this.properties.bodyHeight || 15);

                // Separate Axis Collision (Sliding)
                // 1. Try X movement only
                let canMoveX = true;
                if (this.checkCollision(nextX - halfW, this.y) ||
                    this.checkCollision(nextX + halfW, this.y) ||
                    this.checkCollision(nextX - halfW, this.y - h) ||
                    this.checkCollision(nextX + halfW, this.y - h) ||
                    this.checkCollision(nextX, this.y) ||
                    this.checkCollision(nextX, this.y - h)) {
                    canMoveX = false;
                }

                // 2. Try Y movement only
                let canMoveY = true;
                if (this.checkCollision(this.x - halfW, nextY) ||
                    this.checkCollision(this.x + halfW, nextY) ||
                    this.checkCollision(this.x - halfW, nextY - h) ||
                    this.checkCollision(this.x + halfW, nextY - h) ||
                    this.checkCollision(this.x, nextY) ||
                    this.checkCollision(this.x, nextY - h)) {
                    canMoveY = false;
                }

                if (canMoveX && canMoveY) {
                    // Full Diagonal Move
                    this.x = nextX;
                    this.y = nextY;
                } else if (canMoveX) {
                    // Slide X
                    this.x = nextX;
                    // Retain Y (friction? or just stop Y)
                } else if (canMoveY) {
                    // Slide Y
                    this.y = nextY;
                } else {
                    // Totally Blocked - Stop
                    // Force a small IDLE wait to prevent rapid jitter
                    this.state = 'IDLE';
                    this.stateTimer = 1.0; // Wait 1 second before trying again
                }
            }
        }

        // Regrowth Logic
        if (this.isSheared) {
            this.regrowthTimer -= delta;
            if (this.regrowthTimer <= 0) {
                this.isSheared = false;
                // console.log(`[Animal ${this.id}] Wool regrown.`);
            }
        }
    }

    markSheared() {
        this.isSheared = true;
        this.regrowthTimer = this.regrowthDuration;
    }

    getData() {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            state: this.state,
            isSheared: this.isSheared, // [NEW] Send dynamic sheared state
            // type: 'animal', // Redundant if client knows ID convention? Keep for safety.
            // properties: this.properties // [OPTIMIZATION] REMOVED. Static data should be known by client from spawn.
        };
    }
}

module.exports = Animal;
