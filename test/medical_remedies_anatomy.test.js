const assert = require('assert');
const { createDefaultBodyParts, applyAnatomyDamage } = require('../src/server/mechanics/anatomyDamage.js');
const { applyRemedy } = require('../src/server/mechanics/remedies.js');

describe('Medical Status & Paper Doll Anatomy Mechanics', () => {
    it('should initialize all 16 anatomical body parts in createDefaultBodyParts', () => {
        const parts = createDefaultBodyParts();
        const expectedKeys = [
            'leftEar', 'rightEar', 'head', 'eyes', 'mouth', 'torso', 'groin', 'tail',
            'leftArm', 'rightArm', 'leftHand', 'rightHand',
            'leftLeg', 'rightLeg', 'leftFoot', 'rightFoot'
        ];
        for (const key of expectedKeys) {
            assert.ok(parts[key], `Missing body part key: ${key}`);
        }
    });

    it('should route sub-part damage to parent HP pool while tracking localized status and sensory impairment', () => {
        const dummyPlayer = {
            firstName: 'Aria',
            stats: {
                health: 100,
                maxHealth: 100,
                stamina: 100,
                maxStamina: 100,
                bloodVolume: 5000,
                maxBloodVolume: 5000,
                bleedingRate: 0,
                sensory: { eyeDamage: 0, earDamage: 0 },
                bodyParts: createDefaultBodyParts()
            }
        };

        // Apply brute damage to eyes
        applyAnatomyDamage(dummyPlayer, 20, 'brute', 'eyes');

        assert.strictEqual(dummyPlayer.stats.bodyParts.head.hp, 80, 'Head HP should reduce by 20');
        assert.strictEqual(dummyPlayer.stats.bodyParts.eyes.brute, 20, 'Eyes sub-part should record 20 brute damage');
        assert.ok(dummyPlayer.stats.sensory.eyeDamage > 0, 'Eye sensory damage should increase');

        // Apply burn damage to groin
        applyAnatomyDamage(dummyPlayer, 25, 'burn', 'groin');
        assert.strictEqual(dummyPlayer.stats.bodyParts.torso.hp, 75, 'Torso HP should reduce by 25');
        assert.strictEqual(dummyPlayer.stats.bodyParts.groin.burn, 25, 'Groin sub-part should record 25 burn damage');
    });

    it('should apply remedies to sub-parts and cleanse sensory impairment', () => {
        const dummyPlayer = {
            firstName: 'Aria',
            stats: {
                health: 80,
                maxHealth: 100,
                stamina: 100,
                maxStamina: 100,
                bloodVolume: 5000,
                maxBloodVolume: 5000,
                bleedingRate: 0,
                sensory: { eyeDamage: 40, earDamage: 40 },
                bodyParts: createDefaultBodyParts()
            }
        };

        // Set damage on eyes and ears
        dummyPlayer.stats.bodyParts.head.hp = 60;
        dummyPlayer.stats.bodyParts.head.burn = 40;
        dummyPlayer.stats.bodyParts.eyes.burn = 40;
        dummyPlayer.stats.bodyParts.leftEar.brute = 20;

        // Apply salve to eyes
        const salveRes = applyRemedy(dummyPlayer, 'salve', 'eyes');
        assert.strictEqual(salveRes.success, true);
        assert.strictEqual(dummyPlayer.stats.sensory.eyeDamage, 0, 'Eye sensory damage should be cleansed');
        assert.strictEqual(dummyPlayer.stats.bodyParts.head.hp, 90, 'Head HP should recover by 30');

        // Apply bandage to left ear
        const bandageRes = applyRemedy(dummyPlayer, 'bandage', 'leftEar');
        assert.strictEqual(bandageRes.success, true);
        assert.strictEqual(dummyPlayer.stats.sensory.earDamage, 0, 'Ear sensory damage should be cleansed');
    });
});
