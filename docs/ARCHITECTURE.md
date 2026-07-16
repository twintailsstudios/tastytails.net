# TastyTails Architecture Specification

This document provides a technical overview of the systems driving the **TastyTails authoritative game server** and its client-server network architecture.

---

## 1. The Authoritative Server Game Loop

The server maintains authoritative control over all game physics, positions, collisions, and gameplay states. Clients are input-senders that render the server's processed output state.

### Loop Synchronization & Ticks
*   **Tick Rate:** The loop operates at a fixed tick rate of **30 updates per second** (roughly every 33.3ms) using standard precision intervals in [server-loop.js](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/src/server-loop.js).
*   **Input Queuing:** High-frequency movement inputs (`playerInput` socket events) are pushed into a per-player `inputQueue`.
*   **Sequential Processing:** During the update tick, the server shifts all pending inputs from the queue. It evaluates each movement step using the client's provided frame delta time to ensure movement speed is independent of packet rates.

### Movement & Sliding Collision
*   **Axis Separation:** When applying velocity, the server tests coordinates separately on the X and Y axes:
    1.  Propose X movement and evaluate bounding box colliders. If clear, update X.
    2.  Propose Y movement and evaluate bounding box colliders. If clear, update Y.
*   **Sliding Effect:** This separation enables players to slide smoothly along diagonal walls rather than getting completely stuck.
*   **Colliders:** Bounding checks evaluate:
    *   Tile-based constraints using the parsed Tiled `.json` map data ([mapConfig.js](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/src/server/mapConfig.js)).
    *   Dynamic/Static object bounds (like tables and doors) indexed in a grid-based spatial hash at startup.

### Zone Mapping & Transitions
*   **Zone Matrix:** The map includes a dedicated "zones" layer. The server parses this layer at startup, generating a 2D grid matrix of zone names.
*   **Transition Events:** The server monitors player grid coordinates. When a player crosses a boundary, it updates their current zone and emits a `zoneUpdate` socket event, triggering client-side biome music or interface changes.

---

## 2. Network & Performance Optimizations

To scale multiplayer performance, the server employs several techniques to minimize bandwidth and CPU overhead.

### Area of Interest (AOI) Grids
*   **Spatial Hash:** The world is divided into virtual grid cells of size $400\text{px} \times 400\text{px}$.
*   **Entity Lookup:** Rather than running $O(N^2)$ checks for every player in the world, the server updates each entity's grid bucket position as they move.
*   **Observer Filtering:** For any given observer, the server checks only their 5x5 neighboring grid cells to build a set of local visible players and entities, dropping communication overhead significantly.

### Level of Detail (LOD) Throttling
*   **Distance-Based Rate Limits:** If a player is far from an observer (>400px Manhattan distance), their state update is throttled. Updates are sent only on **every 3rd tick (10Hz)** instead of 30Hz.
*   **Visual State Priority:** If a far player triggers a critical state change (e.g. changing rotation direction, dying, or starting/stopping movement), the LOD throttle is bypassed, forcing an immediate packet send to prevent visible stutter.

### Raycast Shadowcasting & Line of Sight (LoS)
*   **Edge Optimization:** The server translates tile block constraints into optimized wall line-segments at startup.
*   **Occlusion Computation:** The server utilizes the `visibility-polygon` library to compile a polygon describing the observer's line of sight within a 600px radius.
*   **Anti-Cheat Visibility Filtering:** If a player's coordinates fall outside the calculated visibility polygon, the server excludes their update packets entirely. The client does not receive data for obscured players, preventing cheat tools from revealing hidden entities.

---

## 3. Database Resilience Layer

To safeguard database performance and tolerate unexpected connection losses, Mongoose writes are routed through [DatabaseResilience.js](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/src/classes/DatabaseResilience.js).

### Write-Behind Cache
*   **Batching writes:** Instead of writing to MongoDB every time a player moves, takes damage, or updates an item, updates (mostly `$set` and `$inc` operators) are cached in memory.
*   **Interval Flush:** Every 30 seconds, the resilience engine batches all modified documents and issues optimized `bulkWrite` requests, minimizing network latency and write lock contention.

### Offline Buffering & Backups
*   **State Detection:** The resilience module listens to Mongoose connection hooks (`connected`, `reconnected`, `disconnected`).
*   **Offline Queue:** If MongoDB goes offline, the server switches to a resilient state, routing all database queries into a memory buffer.
*   **JSON Dumps:** If the database remains disconnected for more than 60 seconds (or the memory queue exceeds 10,000 operations), the server writes emergency backup dumps into the `backups/` folder and initiates a graceful server shutdown. These dumps are automatically restored and re-executed upon server restart.

---

## 4. Hosting & Deployment

*   **Runtime:** Node.js Express server with Socket.io running on **Railway**.
*   **Database:** A hosted instance of **MongoDB Atlas** (currently utilizing the free sandbox tier).
*   **Legacy configuration:** Google App Engine and GCP dependencies (`app.yaml`, `.gcloudignore`, `@geckos.io/phaser-on-nodejs`) are legacy relics and have been removed.
