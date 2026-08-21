/**
 * @fileoverview EnemySprite.js - Client-Side NPC Enemy Sprite & State Animation Controller
 * @subsystem Combat & Telegraph Engine
 * @description
 * Phaser 3 Arcade Sprite implementation for modular NPC enemies in TastyTails.net.
 * Supports multi-state directional spritesheets (/assets/enemies/{enemyName}/{status}_{enemyName}.png),
 * automatic 4-phase state animations (IDLE, ORBIT, WINDUP, FLASH, ACTIVE, RECOVERY),
 * smooth snapshot lerping, overhead health HUD, glowing weak-point highlights, and Target Doll integration.
 */

const STATE_TO_STATUS = {
    'IDLE': 'idle',
    'POSTURING': 'idle',
    'FLEEING': 'idle',
    'RETURN_TO_TERRITORY': 'idle',
    'SEEK_FOOD': 'idle',
    'EATING': 'idle',
    'SEEK_WATER': 'idle',
    'DRINKING': 'idle',
    'ORBIT_SPACING': 'orbit',
    'WINDUP': 'windup',
    'FLASH': 'flash',
    'ACTIVE': 'active',
    'RECOVERY': 'recovery',
    'DEAD': 'recovery'
};

export class EnemySprite extends Phaser.Physics.Arcade.Sprite {
    /**
     * Creates a new client-side EnemySprite instance.
     * @param {Phaser.Scene} scene - Active Phaser game scene
     * @param {number} x - Spawn X in world pixels
     * @param {number} y - Spawn Y in world pixels
     * @param {string} texture - Asset texture key (e.g. 'idle_test' or fallback)
     * @param {Object} data - Enemy snapshot payload { id, defId, enemyName, name, health, maxHealth, state, disposition, diet, ... }
     */
    constructor(scene, x, y, texture, data = {}) {
        const enemyName = data.enemyName || data.spriteFolder || 'test';
        const defaultTexture = (scene.textures && scene.textures.exists(`idle_${enemyName}`)) ? `idle_${enemyName}` : (texture || 'sheep');
        const validTexture = (scene.textures && scene.textures.exists(defaultTexture)) ? defaultTexture : 'sheep';
        super(scene, x, y, validTexture);

        this.scene = scene;
        this.id = data.id || `enemy_${Date.now()}`;
        this.defId = data.defId || 'test';
        this.enemyName = enemyName;
        this.mobName = data.name || 'Enemy';
        this.health = data.health || 100;
        this.maxHealth = data.maxHealth || 100;
        this.isEnraged = !!data.isEnraged;
        this.facingAngle = data.facingAngle || 0;
        this.serverState = data.state || 'IDLE';
        this.disposition = data.disposition || 'aggressive';
        this.diet = data.diet || 'none';
        this.eatingTargetType = data.eatingTargetType || null;
        this.limbGlow = null;
        this.fracturedLimbs = data.fracturedLimbs || [];
        this.warningRadius = data.warningRadius;
        this.breachRadius = data.breachRadius;
        this.leashRadius = data.leashRadius;
        this.fearRadius = data.fearRadius;
        this.foodSearchRadius = data.foodSearchRadius;
        this.description = data.description;

        // Vitals
        this.hydration = data.hydration !== undefined ? data.hydration : 100;
        this.maxHydration = data.maxHydration || 100;
        this.thirstThreshold = data.thirstThreshold || 40;
        this.hydrationDecayRate = data.hydrationDecayRate || 0.5;

        this.hunger = data.hunger !== undefined ? data.hunger : 100;
        this.maxHunger = data.maxHunger || 100;
        this.hungerThreshold = data.hungerThreshold || 40;
        this.hungerDecayRate = data.hungerDecayRate || 0.5;
        this.enableHunger = data.enableHunger !== false;

        // Context Menu & Entity Identification Tags
        this.isEnemy = true;
        this.enemyInfo = {
            id: this.id,
            defId: this.defId,
            name: this.mobName
        };

        // Animation State Cache
        this.lastDirection = 'Down';
        this.currentAnimKey = null;

        // Physics & Scene Registration
        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.body.setCollideWorldBounds(true);
        this.body.pushable = false;
        this.body.immovable = true;
        this.body.moves = false;

        // Position Lerp Targets
        this.targetX = x;
        this.targetY = y;
        this.targetAngle = this.facingAngle;

        // Visual Setup
        this.scale = data.scale || 1.0;
        this.setScale(this.scale);
        this.setOrigin(0.5, 0.5);
        this.setVisible(true);
        this.setActive(true);
        this.setDepth(this.y + 10);

        // Build Overhead HUD (Health Bar, Hunger & Thirst Bars, Status & Mood Badges)
        this.hudContainer = scene.add.container(x, y - (this.height * 0.6 + 24));
        this.hudContainer.setDepth(9999);

        this.hudBackground = scene.add.graphics();
        this.hudHealthFill = scene.add.graphics();
        this.hudHydrationFill = scene.add.graphics();
        this.hudHungerFill = scene.add.graphics();

        this.nameLabel = scene.add.text(0, -14, this.mobName, {
            fontFamily: 'Cinzel, Georgia, serif',
            fontSize: '11px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);

        this.moodBadgeLabel = scene.add.text(0, -26, '', {
            fontFamily: 'sans-serif',
            fontSize: '10px',
            fontStyle: 'bold',
            color: '#fbbf24',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);

        this.statusLabel = scene.add.text(0, 14, '', {
            fontFamily: 'sans-serif',
            fontSize: '9px',
            fontStyle: 'bold',
            color: '#ffcc00',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5);

        this.hydrationLabel = scene.add.text(0, 25, '', {
            fontFamily: 'sans-serif',
            fontSize: '8px',
            fontStyle: 'bold',
            color: '#38bdf8',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5);

        this.hudContainer.add([
            this.hudBackground,
            this.hudHealthFill,
            this.hudHydrationFill,
            this.hudHungerFill,
            this.nameLabel,
            this.moodBadgeLabel,
            this.statusLabel,
            this.hydrationLabel
        ]);
        this.updateHUD();

        // Pulsing Limb Glow Tween State
        this.glowTween = null;

        // Interactive Click Handling
        this.setInteractive({ cursor: 'crosshair' });
        this.on('pointerdown', this.onPointerDown, this);
    }

    /**
     * Processes server position and state snapshot updates.
     * @param {Object} data - Snapshot payload { x, y, facingAngle, state, enemyName, health, maxHealth, isEnraged, limbGlow, fracturedLimbs, disposition, diet, eatingTargetType, hunger, ... }
     */
    serverUpdate(data) {
        if (!this.active || !this.scene) return;

        if (typeof data.x === 'number') this.targetX = data.x;
        if (typeof data.y === 'number') this.targetY = data.y;
        if (typeof data.facingAngle === 'number') {
            this.targetAngle = data.facingAngle;
            this.facingAngle = data.facingAngle;
        }
        if (data.state) this.serverState = data.state;
        if (data.enemyName) this.enemyName = data.enemyName;
        if (data.disposition) this.disposition = data.disposition;
        if (data.diet) this.diet = data.diet;
        if (data.eatingTargetType !== undefined) this.eatingTargetType = data.eatingTargetType;
        if (typeof data.health === 'number') this.health = data.health;
        if (typeof data.maxHealth === 'number') this.maxHealth = data.maxHealth;
        if (data.isEnraged !== undefined) this.isEnraged = data.isEnraged;
        if (Array.isArray(data.fracturedLimbs)) this.fracturedLimbs = data.fracturedLimbs;
        if (data.warningRadius !== undefined) this.warningRadius = data.warningRadius;
        if (data.breachRadius !== undefined) this.breachRadius = data.breachRadius;
        if (data.leashRadius !== undefined) this.leashRadius = data.leashRadius;
        if (data.fearRadius !== undefined) this.fearRadius = data.fearRadius;
        if (data.foodSearchRadius !== undefined) this.foodSearchRadius = data.foodSearchRadius;
        if (data.description !== undefined) this.description = data.description;
        if (typeof data.hydration === 'number') this.hydration = data.hydration;
        if (typeof data.maxHydration === 'number') this.maxHydration = data.maxHydration;
        if (typeof data.thirstThreshold === 'number') this.thirstThreshold = data.thirstThreshold;
        if (typeof data.hydrationDecayRate === 'number') this.hydrationDecayRate = data.hydrationDecayRate;
        if (typeof data.hunger === 'number') this.hunger = data.hunger;
        if (typeof data.maxHunger === 'number') this.maxHunger = data.maxHunger;
        if (typeof data.hungerThreshold === 'number') this.hungerThreshold = data.hungerThreshold;
        if (typeof data.hungerDecayRate === 'number') this.hungerDecayRate = data.hungerDecayRate;
        if (data.enableHunger !== undefined) this.enableHunger = data.enableHunger;

        if (data.limbGlow) {
            this.setLimbGlow(data.limbGlow);
        } else if (data.limbGlow === null && this.limbGlow) {
            this.clearLimbGlow();
        }

        // Warp if displacement is massive
        const dist = Phaser.Math.Distance.Between(this.x, this.y, this.targetX, this.targetY);
        if (dist > 200) {
            this.setPosition(this.targetX, this.targetY);
            if (this.hudContainer) {
                this.hudContainer.setPosition(this.targetX, this.targetY - (this.height * 0.6 + 24));
            }
        }

        this.updateHUD();
    }

    /**
     * Pre-render frame update lifecycle hook.
     * Smoothly lerps position, updates multi-state directional animations, and syncs HUD container.
     */
    preUpdate(time, delta) {
        super.preUpdate(time, delta);

        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;

        // Smooth position interpolation
        const lerpFactor = Math.min(1.0, (delta / 1000) * 12);
        this.x += dx * lerpFactor;
        this.y += dy * lerpFactor;
        this.facingAngle = this.targetAngle;

        // Depth sorting
        this.setDepth(this.y + 10);

        // Multi-State Directional Animation Controller
        this.updateStateAnimation(dx, dy);

        // Sync Overhead HUD position
        if (this.hudContainer && this.hudContainer.active) {
            this.hudContainer.setPosition(this.x, this.y - (this.height * 0.6 + 24));
        }
    }

    /**
     * Resolves the appropriate directional state animation ({status}_{enemyName}{direction}).
     * @param {number} dx - Displacement delta X
     * @param {number} dy - Displacement delta Y
     */
    updateStateAnimation(dx, dy) {
        if (!this.scene || !this.scene.anims) return;

        const isCombatLock = this.serverState === 'WINDUP' || this.serverState === 'FLASH' || this.serverState === 'ACTIVE';
        const isMoving = Math.abs(dx) > 0.15 || Math.abs(dy) > 0.15;

        // Determine Direction
        if (isCombatLock) {
            // In combat lock, direction is driven by facingAngle towards target
            const cos = Math.cos(this.facingAngle);
            const sin = Math.sin(this.facingAngle);
            if (Math.abs(cos) > Math.abs(sin)) {
                this.lastDirection = cos > 0 ? 'Right' : 'Left';
            } else {
                this.lastDirection = sin > 0 ? 'Down' : 'Up';
            }
        } else if (isMoving) {
            if (Math.abs(dx) > Math.abs(dy)) {
                this.lastDirection = dx > 0 ? 'Right' : 'Left';
            } else {
                this.lastDirection = dy > 0 ? 'Down' : 'Up';
            }
        }

        const status = STATE_TO_STATUS[this.serverState] || 'idle';
        const statusPrefix = `${status}_${this.enemyName}`;

        // Select Animation Key
        let targetAnimKey = null;
        if (!isMoving && !isCombatLock && (this.serverState === 'IDLE' || this.serverState === 'RECOVERY' || this.serverState === 'POSTURING' || this.serverState === 'EATING')) {
            targetAnimKey = `${statusPrefix}Stop${this.lastDirection}`;
        } else {
            targetAnimKey = `${statusPrefix}${this.lastDirection}`;
        }

        // Check if animation exists, with graceful fallbacks
        if (this.scene.anims.exists(targetAnimKey)) {
            if (this.currentAnimKey !== targetAnimKey) {
                this.currentAnimKey = targetAnimKey;
                this.play(targetAnimKey, true);
            }
        } else if (this.scene.anims.exists(`${statusPrefix}Down`)) {
            if (this.currentAnimKey !== `${statusPrefix}Down`) {
                this.currentAnimKey = `${statusPrefix}Down`;
                this.play(`${statusPrefix}Down`, true);
            }
        } else if (this.scene.anims.exists(`idle_${this.enemyName}${isMoving ? this.lastDirection : `Stop${this.lastDirection}`}`)) {
            const fallbackKey = `idle_${this.enemyName}${isMoving ? this.lastDirection : `Stop${this.lastDirection}`}`;
            if (this.currentAnimKey !== fallbackKey) {
                this.currentAnimKey = fallbackKey;
                this.play(fallbackKey, true);
            }
        } else if (this.scene.anims.exists(`idle_${this.enemyName}${this.lastDirection}`)) {
            const fallbackKey = `idle_${this.enemyName}${this.lastDirection}`;
            if (this.currentAnimKey !== fallbackKey) {
                this.currentAnimKey = fallbackKey;
                this.play(fallbackKey, true);
            }
        } else if (this.scene.anims.exists(`idle_${this.enemyName}Down`)) {
            if (this.currentAnimKey !== `idle_${this.enemyName}Down`) {
                this.currentAnimKey = `idle_${this.enemyName}Down`;
                this.play(`idle_${this.enemyName}Down`, true);
            }
        }
    }

    /**
     * Updates overhead health bar, hunger/thirst vitals, and dynamic mood badge indicators.
     */
    updateHUD() {
        if (!this.hudBackground || !this.hudHealthFill) return;

        const barW = 54;
        const barH = 5;
        const halfW = barW / 2;

        // Draw HUD Background Frame
        this.hudBackground.clear();
        this.hudBackground.fillStyle(0x000000, 0.75);
        this.hudBackground.fillRoundedRect(-halfW - 1, -3, barW + 2, barH + 2, 2);
        this.hudBackground.lineStyle(1, 0x333333, 0.9);
        this.hudBackground.strokeRoundedRect(-halfW - 1, -3, barW + 2, barH + 2, 2);

        // Draw Health Bar Fill
        const ratio = Math.max(0, Math.min(1, this.health / (this.maxHealth || 1)));
        const fillW = Math.max(0, barW * ratio);
        let barColor = 0x22cc44; // Green
        if (this.isEnraged) {
            barColor = 0xff2200; // Enrage Crimson
        } else if (ratio < 0.35) {
            barColor = 0xdd2222; // Red
        } else if (ratio < 0.65) {
            barColor = 0xee9900; // Orange/Yellow
        }

        this.hudHealthFill.clear();
        if (fillW > 0) {
            this.hudHealthFill.fillStyle(barColor, 0.95);
            this.hudHealthFill.fillRoundedRect(-halfW, -2, fillW, barH, 2);
        }

        // Draw Hydration Bar (Cyan / Blue) under Health Bar
        const hydBarH = 3;
        const hydY = 4;
        this.hudBackground.fillRoundedRect(-halfW - 1, hydY - 1, barW + 2, hydBarH + 2, 1);
        this.hudBackground.strokeRoundedRect(-halfW - 1, hydY - 1, barW + 2, hydBarH + 2, 1);

        const currentHyd = (typeof this.hydration === 'number') ? this.hydration : 100;
        const maxHyd = this.maxHydration || 100;
        const hydRatio = Math.max(0, Math.min(1, currentHyd / maxHyd));
        const hydFillW = Math.max(0, barW * hydRatio);

        let hydColor = 0x38bdf8; // Sky blue
        if (currentHyd <= 15) {
            hydColor = 0xf87171; // Red - Parched
        } else if (currentHyd <= 40) {
            hydColor = 0xfbbf24; // Amber - Thirsty
        }

        this.hudHydrationFill.clear();
        if (hydFillW > 0) {
            this.hudHydrationFill.fillStyle(hydColor, 0.95);
            this.hudHydrationFill.fillRoundedRect(-halfW, hydY, hydFillW, hydBarH, 1);
        }

        // Draw Hunger Bar (Amber / Green) under Hydration Bar
        if (this.hudHungerFill) {
            this.hudHungerFill.clear();
            if (this.enableHunger) {
                const hngBarH = 3;
                const hngY = 9;
                this.hudBackground.fillRoundedRect(-halfW - 1, hngY - 1, barW + 2, hngBarH + 2, 1);
                this.hudBackground.strokeRoundedRect(-halfW - 1, hngY - 1, barW + 2, hngBarH + 2, 1);

                const currentHng = (typeof this.hunger === 'number') ? this.hunger : 100;
                const maxHng = this.maxHunger || 100;
                const hngRatio = Math.max(0, Math.min(1, currentHng / maxHng));
                const hngFillW = Math.max(0, barW * hngRatio);

                let hngColor = 0x10b981; // Emerald green
                if (currentHng <= 15) {
                    hngColor = 0xef4444; // Red - Starving
                } else if (currentHng <= 40) {
                    hngColor = 0xf59e0b; // Amber - Hungry
                }

                if (hngFillW > 0) {
                    this.hudHungerFill.fillStyle(hngColor, 0.95);
                    this.hudHungerFill.fillRoundedRect(-halfW, hngY, hngFillW, hngBarH, 1);
                }
            }
        }

        // Nameplate color & Enrage indicator
        if (this.nameLabel) {
            this.nameLabel.setColor(this.isEnraged ? '#ff4444' : '#ffffff');
            this.nameLabel.setText(this.isEnraged ? `⚡ ${this.mobName} ⚡` : this.mobName);
        }

        // Overhead Dynamic Mood Badges
        if (this.moodBadgeLabel) {
            let moodText = '';
            let moodColor = '#ffffff';

            switch (this.serverState) {
                case 'POSTURING':
                    moodText = '⚠️ POSTURING';
                    moodColor = '#f59e0b';
                    break;
                case 'FLEEING':
                    moodText = '💦 FLEEING';
                    moodColor = '#38bdf8';
                    break;
                case 'SEEK_FOOD':
                    if (this.eatingTargetType === 'meat' || this.diet === 'carnivore') {
                        moodText = '🍖 HUNTING MEAT';
                    } else {
                        moodText = '🌿 FORAGING FLORA';
                    }
                    moodColor = '#fbbf24';
                    break;
                case 'EATING':
                    if (this.eatingTargetType === 'meat' || this.diet === 'carnivore') {
                        moodText = '🍖 EATING MEAT...';
                    } else {
                        moodText = '🌿 GRAZING...';
                    }
                    moodColor = '#34d399';
                    break;
                case 'SEEK_WATER':
                    moodText = '💧 SEEKING WATER';
                    moodColor = '#38bdf8';
                    break;
                case 'DRINKING':
                    moodText = '💧 DRINKING...';
                    moodColor = '#34d399';
                    break;
                case 'RETURN_TO_TERRITORY':
                    moodText = '🏠 RETURNING HOME';
                    moodColor = '#94a3b8';
                    break;
                case 'ORBIT_SPACING':
                case 'WINDUP':
                case 'FLASH':
                case 'ACTIVE':
                    moodText = '❗ COMBAT';
                    moodColor = '#ef4444';
                    break;
                default:
                    moodText = '';
                    break;
            }

            if (moodText) {
                this.moodBadgeLabel.setText(moodText);
                this.moodBadgeLabel.setColor(moodColor);
                this.moodBadgeLabel.setVisible(true);
            } else {
                this.moodBadgeLabel.setVisible(false);
            }
        }

        // Status Badges ([Fractured Limbs])
        if (this.statusLabel) {
            const badges = [];
            if (this.fracturedLimbs.length > 0) {
                badges.push(`[${this.fracturedLimbs.length} Fractured]`);
            }
            if (badges.length > 0) {
                this.statusLabel.setText(badges.join(' '));
                this.statusLabel.setVisible(true);
            } else {
                this.statusLabel.setVisible(false);
            }
        }

        // Live Vitals Indicators
        if (this.hydrationLabel) {
            const currentHng = (typeof this.hunger === 'number') ? this.hunger : 100;
            let vitalsText = `💧 ${Math.round(currentHyd)}%`;
            if (this.enableHunger) {
                vitalsText += `  🍗 ${Math.round(currentHng)}%`;
            }
            this.hydrationLabel.setText(vitalsText);
            this.hydrationLabel.setVisible(window.showNpcVitals !== false);
        }
    }

    /**
     * Activates pulsating neon highlight on glowing weak-point limb during attack windup.
     * @param {string} limbName - Key of limb (e.g. 'snout', 'leftFrontLeg', 'leftArm')
     */
    setLimbGlow(limbName) {
        this.limbGlow = limbName;

        if (this.glowTween) {
            this.glowTween.stop();
        }

        // Pulsing warning tint / highlight
        this.glowTween = this.scene.tweens.add({
            targets: this,
            duration: 200,
            yoyo: true,
            repeat: -1,
            onYoyo: () => {
                this.setTint(0xffaa22);
            },
            onRepeat: () => {
                this.setTint(0xff2244);
            }
        });
    }

    /**
     * Clears pulsating weak-point glow.
     */
    clearLimbGlow() {
        this.limbGlow = null;
        if (this.glowTween) {
            this.glowTween.stop();
            this.glowTween = null;
        }
        this.clearTint();
    }

    /**
     * Pointer click handler: routes attacks with currently selected anatomical zone in Target Doll HUD.
     */
    onPointerDown(pointer) {
        if (window.spacebarPressed) return;
        // Allow right-click (button 2) to open radial context menu / examination
        if (pointer.button === 2) {
            return;
        }
        if (pointer.button !== 0) return;

        pointer.interactionHandled = true;

        // Trigger floating NPC Vitals & Hydration Inspector Card
        if (window.NpcVitalsUI) {
            window.NpcVitalsUI.inspect(this);
        }

        const targetZone = window.currentTargetZone || 'torso';
        const intent = window.currentIntent || 'hostile';
        const activeHand = 'left';

        // Emit playerPerformAction to server
        if (this.scene.socket) {
            this.scene.socket.emit('playerPerformAction', {
                targetId: this.id,
                intent: intent,
                targetZone: targetZone,
                hand: activeHand
            });
        }
    }

    /**
     * Cleanup on entity death / destruction.
     */
    destroy(fromScene) {
        if (this.glowTween) {
            this.glowTween.stop();
            this.glowTween = null;
        }
        if (this.hudContainer) {
            this.hudContainer.destroy();
            this.hudContainer = null;
        }
        super.destroy(fromScene);
    }
}

export default EnemySprite;
