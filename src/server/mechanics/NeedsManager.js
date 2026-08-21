/**
 * @fileoverview NeedsManager.js - Modular Utility AI & Desire Engine for NPCs
 * @subsystem NPC AI & Ecology Engine
 * @description
 * Manages autonomous biological needs (Hydration, Hunger, Energy) with dynamic decay,
 * utility score evaluations, urgency tiers (Quenched -> Thirsty -> Parched), and
 * replenishment lifecycles. Decoupled and extensible for future desires.
 */

class NeedsManager {
    /**
     * Creates a new NeedsManager instance for an NPC.
     * @param {Object} [config] - Initial stat and rate overrides
     */
    constructor(config = {}) {
        // Hydration Need Configuration
        this.hydration = {
            current: typeof config.initialHydration === 'number' ? config.initialHydration : 100.0,
            max: config.maxHydration || 100.0,
            decayRate: typeof config.hydrationDecayRate === 'number' ? config.hydrationDecayRate : 0.5, // 0.5 points/sec (~200s full decay)
            desireThreshold: config.thirstThreshold || 40.0,  // Thirst begins at <= 40%
            criticalThreshold: config.parchedThreshold || 15.0, // Urgent thirst at <= 15%
            drinkSpeed: config.drinkSpeed || 35.0 // Points restored per second while drinking
        };

        // Hunger Need Configuration (Extensible for upcoming Hunger feature)
        this.hunger = {
            current: typeof config.initialHunger === 'number' ? config.initialHunger : 100.0,
            max: config.maxHunger || 100.0,
            decayRate: typeof config.hungerDecayRate === 'number' ? config.hungerDecayRate : 0.2,
            desireThreshold: config.hungerThreshold || 35.0,
            criticalThreshold: config.starvingThreshold || 10.0,
            eatSpeed: config.eatSpeed || 25.0
        };

        // Optional enable/disable flags
        this.enableHydration = config.enableHydration !== false;
        this.enableHunger = config.enableHunger !== false;
    }

    /**
     * Updates biological need values based on elapsed frame delta time.
     * @param {number} delta - Frame delta in seconds (e.g. 0.033 for 30Hz loop)
     */
    update(delta) {
        if (delta <= 0) return;

        // 1. Decay Hydration
        if (this.enableHydration && this.hydration.current > 0) {
            this.hydration.current = Math.max(0, this.hydration.current - (this.hydration.decayRate * delta));
        }

        // 2. Decay Hunger
        if (this.enableHunger && this.hunger.current > 0) {
            this.hunger.current = Math.max(0, this.hunger.current - (this.hunger.decayRate * delta));
        }
    }

    /**
     * Evaluates whether the NPC is thirsty enough to seek water.
     * @returns {boolean} True if hydration is at or below the desire threshold
     */
    isThirsty() {
        return this.enableHydration && this.hydration.current <= this.hydration.desireThreshold;
    }

    /**
     * Evaluates whether the NPC is critically parched (high-urgency desire).
     * @returns {boolean} True if hydration is at or below the critical threshold
     */
    isParched() {
        return this.enableHydration && this.hydration.current <= this.hydration.criticalThreshold;
    }

    /**
     * Evaluates whether the NPC is hungry.
     * @returns {boolean}
     */
    isHungry() {
        return this.enableHunger && this.hunger.current <= this.hunger.desireThreshold;
    }

    /**
     * Evaluates whether the NPC is critically starving (high-urgency desire).
     * @returns {boolean} True if hunger is at or below the critical threshold
     */
    isStarving() {
        return this.enableHunger && this.hunger.current <= this.hunger.criticalThreshold;
    }

    /**
     * Evaluates and returns the highest priority desire currently driving the NPC.
     * @returns {{ need: 'hydration'|'hunger'|null, score: number, urgent: boolean }}
     */
    getStrongestDesire() {
        let bestNeed = null;
        let highestScore = 0;
        let isUrgent = false;

        // Evaluate Hydration Desire Score (0.0 to 1.0)
        if (this.enableHydration) {
            const thirstScore = (this.hydration.max - this.hydration.current) / this.hydration.max;
            if (this.isThirsty() && thirstScore > highestScore) {
                highestScore = thirstScore;
                bestNeed = 'hydration';
                isUrgent = this.isParched();
            }
        }

        // Evaluate Hunger Desire Score (0.0 to 1.0)
        if (this.enableHunger) {
            const hungerScore = (this.hunger.max - this.hunger.current) / this.hunger.max;
            if (this.isHungry() && hungerScore > highestScore) {
                highestScore = hungerScore;
                bestNeed = 'hunger';
                isUrgent = this.isStarving();
            }
        }

        return {
            need: bestNeed,
            score: highestScore,
            urgent: isUrgent
        };
    }

    /**
     * Applies drinking replenishment over a time step.
     * @param {number} delta - Frame delta in seconds
     * @returns {boolean} True if hydration has reached maximum (fully quenched)
     */
    drink(delta) {
        if (!this.enableHydration) return true;

        const gain = this.hydration.drinkSpeed * delta;
        this.hydration.current = Math.min(this.hydration.max, this.hydration.current + gain);
        return this.hydration.current >= this.hydration.max;
    }

    /**
     * Instantly satisfies hydration to maximum capacity.
     */
    satisfyHydration() {
        this.hydration.current = this.hydration.max;
    }

    /**
     * Applies food consumption replenishment.
     * @param {number} [amount] - Points of hunger replenished (defaults to max)
     * @returns {boolean} True if hunger is fully satisfied
     */
    eat(amount) {
        const gain = typeof amount === 'number' ? amount : this.hunger.max;
        this.hunger.current = Math.min(this.hunger.max, this.hunger.current + gain);
        return this.hunger.current >= this.hunger.max;
    }

    /**
     * Instantly satisfies hunger to maximum capacity.
     */
    satisfyHunger() {
        this.hunger.current = this.hunger.max;
    }

    /**
     * Generates lightweight network/DTO snapshot of need vitals.
     * @returns {{ hydration: number, maxHydration: number, hunger: number, maxHunger: number, enableHydration: boolean, enableHunger: boolean }}
     */
    getSnapshot() {
        return {
            hydration: Math.round(this.hydration.current * 10) / 10,
            maxHydration: this.hydration.max,
            thirstThreshold: this.hydration.desireThreshold,
            hydrationDecayRate: this.hydration.decayRate,
            hunger: Math.round(this.hunger.current * 10) / 10,
            maxHunger: this.hunger.max,
            hungerThreshold: this.hunger.desireThreshold,
            hungerDecayRate: this.hunger.decayRate,
            enableHydration: this.enableHydration,
            enableHunger: this.enableHunger
        };
    }
}

module.exports = NeedsManager;
