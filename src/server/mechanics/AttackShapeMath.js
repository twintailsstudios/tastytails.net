/**
 * @fileoverview AttackShapeMath.js - Pure Zero-Allocation 2D Geometric Intersection Engine
 * @subsystem Combat & Telegraph Engine
 * @description
 * High-performance 2D collision detection helpers for telegraphed combat attacks in TastyTails.net.
 * Designed for execution inside the 30Hz authoritative server tick loop with zero heap allocations.
 * 
 * Supports 5 core archetypes:
 * 1. linear_runway (Oriented Bounding Box corridor)
 * 2. conical (Sector/Pie slice)
 * 3. radial (Circle / Donut ring)
 * 4. targeted_mortar (Ground circle target)
 * 5. directional_bullet (Point/Circle projectile)
 */

/**
 * Normalizes an angle in degrees or radians to radians in the range [-PI, PI].
 * @param {number} angle - Angle in radians (or degrees if > 2*PI)
 * @returns {number} Angle in radians in [-PI, PI]
 */
function normalizeAngle(angle) {
    let rad = angle;
    // Auto-convert degrees if value exceeds 2*PI
    if (Math.abs(angle) > Math.PI * 2) {
        rad = (angle * Math.PI) / 180;
    }
    // Normalize to [-PI, PI]
    rad = (rad + Math.PI) % (Math.PI * 2);
    if (rad < 0) rad += Math.PI * 2;
    return rad - Math.PI;
}

/**
 * Converts degree or radian arc angle to normalized positive radian angle.
 * @param {number} arcAngle - Angle in radians or degrees
 * @returns {number} Arc angle in radians
 */
function toRadians(arcAngle) {
    if (Math.abs(arcAngle) > Math.PI * 2) {
        return (Math.abs(arcAngle) * Math.PI) / 180;
    }
    return Math.abs(arcAngle);
}

/**
 * Checks circular overlap between two circles.
 * Zero heap allocations.
 * 
 * @param {number} x1 - Circle 1 Center X
 * @param {number} y1 - Circle 1 Center Y
 * @param {number} r1 - Circle 1 Radius
 * @param {number} x2 - Circle 2 Center X
 * @param {number} y2 - Circle 2 Center Y
 * @param {number} r2 - Circle 2 Radius
 * @returns {boolean} True if circles overlap
 */
function checkCircleOverlap(x1, y1, r1, x2, y2, r2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const radSum = (r1 || 0) + (r2 || 0);
    return (dx * dx + dy * dy) <= (radSum * radSum);
}

/**
 * Checks overlap between an annular ring / donut (inner radius to outer radius) and a target circle.
 * Zero heap allocations.
 * 
 * @param {number} centerX - Donut Center X
 * @param {number} centerY - Donut Center Y
 * @param {number} innerR - Inner safe radius (0 for solid circle)
 * @param {number} outerR - Outer damage radius
 * @param {number} targetX - Target Center X
 * @param {number} targetY - Target Center Y
 * @param {number} targetR - Target Bounding Radius
 * @returns {boolean} True if target circle intersects the donut damage ring
 */
function checkDonutOverlap(centerX, centerY, innerR, outerR, targetX, targetY, targetR) {
    const dx = targetX - centerX;
    const dy = targetY - centerY;
    const distSq = dx * dx + dy * dy;
    const tR = targetR || 0;
    const inner = Math.max(0, innerR || 0);
    const outer = Math.max(inner, outerR || 0);

    const dist = Math.sqrt(distSq);

    // Target circle spans [dist - tR, dist + tR]
    // Donut spans [inner, outer]
    return (dist + tR >= inner) && (dist - tR <= outer);
}

/**
 * Checks overlap between a 2D pie-slice cone sector and a target bounding circle.
 * Handles target circle radius buffer so grazing hits are accurately resolved.
 * Zero heap allocations.
 * 
 * @param {number} originX - Cone Origin X
 * @param {number} originY - Cone Origin Y
 * @param {number} directionAngle - Facing angle in radians (or degrees)
 * @param {number} arcAngle - Total cone spread angle in radians or degrees (e.g. 90 deg / Math.PI/2)
 * @param {number} radius - Cone outer reach radius
 * @param {number} targetX - Target Center X
 * @param {number} targetY - Target Center Y
 * @param {number} targetR - Target Bounding Radius
 * @returns {boolean} True if target circle intersects the cone
 */
function checkConeOverlap(originX, originY, directionAngle, arcAngle, radius, targetX, targetY, targetR) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const distSq = dx * dx + dy * dy;
    const tR = targetR || 0;
    const maxReach = radius + tR;

    // 1. Broadphase radius check
    if (distSq > maxReach * maxReach) {
        return false;
    }

    // 2. Proximity check: Target circle overlaps origin directly
    if (distSq <= tR * tR) {
        return true;
    }

    const dist = Math.sqrt(distSq);
    const facingRad = normalizeAngle(directionAngle);
    const spreadRad = toRadians(arcAngle);
    const halfArc = spreadRad * 0.5;

    // Angle from origin to target
    const targetAngle = Math.atan2(dy, dx);
    let angleDiff = targetAngle - facingRad;

    // Normalize angleDiff to [-PI, PI]
    angleDiff = (angleDiff + Math.PI) % (Math.PI * 2);
    if (angleDiff < 0) angleDiff += Math.PI * 2;
    angleDiff = Math.abs(angleDiff - Math.PI);

    // Calculate angular buffer based on target radius as viewed from origin
    const angularBuffer = tR >= dist ? Math.PI * 0.5 : Math.asin(Math.min(1.0, tR / dist));

    // Check if target angle falls within the cone angle + angular tolerance
    if (angleDiff <= halfArc + angularBuffer) {
        // Also verify distance along cone boundary
        return (dist - tR) <= radius;
    }

    return false;
}

/**
 * Checks overlap between an Oriented Bounding Box (linear runway corridor) and a target circle.
 * The runway starts at (originX, originY) and extends along directionAngle for 'length' pixels,
 * with lateral width 'width' (spanning -width/2 to +width/2 perpendicular to heading).
 * Zero heap allocations.
 * 
 * @param {number} originX - Runway Start X
 * @param {number} originY - Runway Start Y
 * @param {number} directionAngle - Runway heading in radians (or degrees)
 * @param {number} length - Runway forward length (L)
 * @param {number} width - Runway corridor width (W)
 * @param {number} targetX - Target Center X
 * @param {number} targetY - Target Center Y
 * @param {number} targetR - Target Bounding Radius
 * @returns {boolean} True if target circle intersects the runway corridor
 */
function checkOBBOverlap(originX, originY, directionAngle, length, width, targetX, targetY, targetR) {
    const heading = normalizeAngle(directionAngle);
    const cosH = Math.cos(heading);
    const sinH = Math.sin(heading);

    const dx = targetX - originX;
    const dy = targetY - originY;

    // Transform target into runway local coordinates:
    // localX = longitudinal axis (along heading [0, length])
    // localY = lateral axis (perpendicular [-width/2, width/2])
    const localX = dx * cosH + dy * sinH;
    const localY = -dx * sinH + dy * cosH;

    const halfW = (width || 0) * 0.5;
    const len = length || 0;

    // Find closest point on the local AABB
    const clampedX = Math.max(0, Math.min(len, localX));
    const clampedY = Math.max(-halfW, Math.min(halfW, localY));

    const distX = localX - clampedX;
    const distY = localY - clampedY;
    const tR = targetR || 0;

    return (distX * distX + distY * distY) <= (tR * tR);
}

/**
 * Checks ground mortar / reticle impact overlap against a target bounding circle.
 * @param {number} targetX - Impact Reticle X
 * @param {number} targetY - Impact Reticle Y
 * @param {number} radius - Mortar Blast Radius
 * @param {number} entityX - Target Center X
 * @param {number} entityY - Target Center Y
 * @param {number} entityR - Target Bounding Radius
 * @returns {boolean} True if target is within blast radius
 */
function checkMortarOverlap(targetX, targetY, radius, entityX, entityY, entityR) {
    return checkCircleOverlap(targetX, targetY, radius, entityX, entityY, entityR);
}

/**
 * Checks bullet / projectile circle collision against an entity bounding circle.
 * @param {number} bulletX - Bullet X
 * @param {number} bulletY - Bullet Y
 * @param {number} bulletR - Bullet Radius
 * @param {number} entityX - Target X
 * @param {number} entityY - Target Y
 * @param {number} entityR - Target Radius
 * @returns {boolean} True if bullet collides with entity
 */
function checkBulletOverlap(bulletX, bulletY, bulletR, entityX, entityY, entityR) {
    return checkCircleOverlap(bulletX, bulletY, bulletR, entityX, entityY, entityR);
}

module.exports = {
    normalizeAngle,
    toRadians,
    checkCircleOverlap,
    checkDonutOverlap,
    checkConeOverlap,
    checkOBBOverlap,
    checkMortarOverlap,
    checkBulletOverlap
};
