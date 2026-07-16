# TastyTails Anatomy Forge & Traversal Specification

This document describes the design, nodes, serialization, and database structure of the **Anatomy Forge** system, which allows players to customize their character's internal anatomy graph.

---

## 1. Node Types & Attributes

The Anatomy Forge compiles an editor-defined node graph consisting of several distinct node classifications:

| Node Type | Gameplay Purpose | Key Attributes |
| :--- | :--- | :--- |
| **entrance** | The point of entry (e.g. Mouth). Triggers initial ingestion. | `verb` (default: "eats") |
| **path** | An intermediate transit tube (e.g. Throat, Esophagus). | `destinationDescrip` |
| **destination** | A stable holding chamber (e.g. Stomach, Crop). Can hold occupants. | `mode`, `digestivePower` |
| **exit** | A departure node (e.g. Disposal, Regurgitation). | `audioExit` |

---

## 2. Serialization & Database Layout

To optimize bandwidth and storage space, the graph is serialized into two separate formats during a save operation in [anatomy_forge.js](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/src/client/js/anatomy_forge.js):

### A. The Lightweight Visual Graph (`anatomyData`)
*   **Purpose:** Restores the visual layout of nodes and connection lines in the editor UI.
*   **Format:** A serialized JSON string stored in the character's `anatomyData` database field.
*   **Content:** Strips all gameplay attributes to keep the size small:
    ```json
    {
      "nodes": [
        { "id": 1, "type": "entrance", "x": 150, "y": 250, "properties": { "name": "Mouth", "icon": "fa-mouth" } },
        { "id": 2, "type": "destination", "x": 150, "y": 450, "properties": { "name": "Stomach", "icon": "fa-circle" } }
      ],
      "links": [
        { "from": 1, "to": 2 }
      ],
      "nextId": 3
    }
    ```

### B. The Gameplay Runtime List (`voreTypes`)
*   **Purpose:** Loaded by the server authoritative loop to evaluate transit choices, struggle messages, and digestion ticks.
*   **Format:** A subdocument array stored in the character's `voreTypes` database field.
*   **Content:** Contains full gameplay descriptions and configuration parameters:
    ```javascript
    {
      graphNodeId: "1",               // Matches the visual node ID
      destination: "Stomach",         // Display name
      type: "destination",            // Node type
      verb: "eats",                   // Ingestion verb
      digestivePower: "Normal",       // Digestion speed/intensity
      mode: "Digest",                 // Hold vs Digest
      destinationDescrip: "You drop into a warm, churning belly...",
      examineMsgDescrip: "Their stomach swells noticeably...",
      struggleInsideMsgDescrip: "You press against the soft stomach walls...",
      struggleOutsideMsgDescrip: "Their stomach shifts as they struggle...",
      digestionInsideMsgDescrip: "The acidic stomach juices dissolve you...",
      digestionOutsideMsgDescrip: "Their belly gurgles contentedly...",
      audioEntry: "swallow_01",
      audioAmbient: "belly_gurgle",
      audioStruggle: "muffled_thump",
      audioExit: "burp_01",
      contents: []                    // Array of player names currently inside this node
    }
    ```

---

## 3. Work-In-Progress (TBD) Features

The following features are planned for future updates to the Anatomy Forge:

### Graph Validation Rules
*   **Status:** **TBD (To Be Determined / On To-Do List)**
*   **Target:** Restrict visual connections to prevent orphan nodes, ensure there is at least one active entrance node, and validate cycle logic.

### Audio Asset Mapping
*   **Status:** **TBD (To Be Determined)**
*   **Target:** Rules mapping node audio fields (e.g. `audioEntry`) to audio file paths and preloading them on the client.

### Traversal & Interactions animations
*   **Status:** **TBD (To Be Determined)**
*   **Target:** Map vore stage updates (Stage 1 = Entrance, Stage 2 = Path, Stage 3 = Destination) to specific Phaser sprite animations on both the predator and prey models.
