/**
 * @fileoverview UnavailableAssetKey.js - Registry of currently unavailable character creator assets.
 *
 * @description
 * Acts as a central "Key" listing character customization pieces that currently lack sprite artwork.
 * Options registered in this key automatically become greyed out, unclickable, and visually marked
 * as "(Unavailable)" in the Character Creator UI.
 *
 * DEVELOPER INSTRUCTIONS:
 * When new sprite assets are created and added to the asset pipeline, simply remove or comment out
 * the corresponding entry in the `UNAVAILABLE_ASSETS` registry below. The Character Creator will
 * automatically render the option as enabled, active, and selectable upon page load.
 */

(function () {
  /**
   * Registry of unavailable asset options categorized by form field / target ID.
   * Items can specify:
   * - `value`: Exact option value string (e.g., 'M-', 'penis', 'body_02', 'ears_04-outer')
   * - `suffix`: Substring or pattern suffix to match dynamic option values (e.g., 'accent_01', 'secondary_03')
   * - `label`: Human-readable display label matching (case-insensitive substring or exact match)
   * - `matchAllExcept`: If array is provided, matches any value except those listed (e.g. ['empty', 'none'])
   */
  const UNAVAILABLE_ASSETS = {
    // 1. Presentation & Body Shape
    bodyShape: [
      { value: 'M-', label: 'Masculine' }
    ],

    // 2. Reproductive Anatomy
    genitals: [
      { value: 'penis', label: 'Penis' },
      { value: 'both', label: 'Both' }
    ],

    // 3. Body Plan & Archetype
    mainBodyType: [
      { value: 'body_02', label: 'Taur' },
      { value: 'body_03', label: 'Naga' },
      { value: 'body_04', label: 'Drider' }
    ],

    // 4. Ear Choices
    outerEar: [
      { value: 'ears_04-outer', label: 'Long and Loppy' },
      { value: 'ears_08-outer', label: 'Deer/Cow' },
      { value: 'ears_09-outer', label: 'Mouse/Rat' },
      { value: 'ears_10-outer', label: 'Squirrel' },
      { value: 'ears_11-outer', label: 'Lynx' }
    ],

    // 5. Body Accent Fur
    bodyAccentFur: [

    ],

    // 6. Tail Secondary Fur
    tailSecondaryFur: [
      { suffix: 'secondary_01', label: 'Tiger Stripes' },
      { suffix: 'secondary_03', label: 'Cheetah Spots' }
    ],

    // 7. Tail Accent Fur
    tailAccentFur: [
      { suffix: 'secondary_01', label: 'Tiger Stripes' },
      { suffix: 'secondary_03', label: 'Cheetah Spots' }
    ],

    // 8. Hair Styles (All hair options except None are currently unavailable)
    hair: [
      { matchAllExcept: ['empty', 'none', ''] }
    ]
  };

  /**
   * Helper object exposing methods to query asset availability across the character creator.
   */
  window.UnavailableAssetKey = {
    /**
     * Direct reference to the asset registry for inspection or external extensions.
     */
    registry: UNAVAILABLE_ASSETS,

    /**
     * Checks whether a specific option for a field is currently unavailable.
     *
     * @param {string} fieldId - Form field or select element ID (e.g., 'bodyShape', 'outerEar')
     * @param {string} value - Option value attribute (e.g., 'M-', 'ears_04-outer')
     * @param {string} [label] - Option visible text label (e.g., 'Masculine', 'Long and Loppy')
     * @returns {boolean} True if the asset option is listed as unavailable, false otherwise.
     */
    isOptionUnavailable: function (fieldId, value, label) {
      if (!fieldId || !UNAVAILABLE_ASSETS[fieldId]) {
        return false;
      }

      const list = UNAVAILABLE_ASSETS[fieldId];
      const normVal = (value || '').trim();
      const normLabel = (label || '').trim().toLowerCase();

      return list.some(item => {
        // Match All Except Rule (e.g., for Hair Styles)
        if (item.matchAllExcept) {
          const isAllowed = item.matchAllExcept.some(allowed =>
            normVal.toLowerCase() === allowed.toLowerCase() ||
            normLabel === allowed.toLowerCase()
          );
          if (!isAllowed) return true;
        }

        // Exact Value Match
        if (item.value && item.value === normVal) {
          return true;
        }

        // Value Suffix / Pattern Match
        if (item.suffix && normVal.endsWith(item.suffix)) {
          return true;
        }

        // Label Match
        if (item.label && normLabel) {
          const targetLabel = item.label.trim().toLowerCase();
          if (normLabel === targetLabel || normLabel.startsWith(targetLabel)) {
            return true;
          }
        }

        return false;
      });
    },

    /**
     * Appends "(Unavailable)" suffix to a text label if it's not already tagged.
     *
     * @param {string} text - Raw option label string
     * @returns {string} Formatted label string with (Unavailable) tag
     */
    formatUnavailableText: function (text) {
      if (!text) return text;
      if (text.includes('(Unavailable)')) return text;
      return `${text} (Unavailable)`;
    }
  };
})();
