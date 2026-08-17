/**
 * @fileoverview CharacterCreatorApp.js - Character Creator Form & UI Controller
 *
 * @description
 * Orchestrates ledger form controls, dynamic dropdown option cascades, custom UI select wrappers,
 * rotation controls, and state binding between HTML form inputs and Phaser character engine.
 */

import { VoiceStudioPanel } from './VoiceStudioPanel.js';

window.CharacterCreatorApp = {
  initialSetup: true,
  isReady: false
};

// Helper: Convert integer color to Hex string (#RRGGBB)
function hex_from_int(color_int) {
  let red = (color_int >> 16) & 0xFF;
  let green = (color_int >> 8) & 0xFF;
  let blue = color_int & 0xFF;
  let hex_str = ((blue << 16) | (green << 8) | red).toString(16);
  while (hex_str.length < 6) hex_str = "0" + hex_str;
  return "#" + hex_str.toUpperCase();
}

// Ear Inner Sprite Lookup Map
const EAR_INNER_MAP = {
  'empty': 'empty',
  'ears_01-outer': 'ears_01-inner',
  'ears_02-outer': 'ears_02-inner',
  'ears_03-outer': 'ears_03-inner',
  'ears_04-outer': 'ears_04-inner',
  'ears_05-outer': 'ears_05-inner',
  'ears_06-outer': 'ears_06-inner',
  'ears_07-outer': 'ears_07-inner',
  'ears_08-outer': 'ears_08-inner',
  'ears_09-outer': 'ears_09-inner',
  'ears_10-outer': 'ears_10-inner',
  'ears_11-outer': 'ears_11-inner'
};

function getInnerEarSprite(outerSprite) {
  if (EAR_INNER_MAP[outerSprite]) return EAR_INNER_MAP[outerSprite];
  if (outerSprite && outerSprite.includes('-outer')) return outerSprite.replace('-outer', '-inner');
  return 'empty';
}
window.getInnerEarSprite = getInnerEarSprite;
if (window.CharacterCreatorApp) {
  window.CharacterCreatorApp.getInnerEarSprite = getInnerEarSprite;
}

// Master Kinks Configuration & Rating Spectrum (-2 to +2)
window.KINKS_CONFIG = [
  { key: 'ovStar', title: 'Oral Vore', category: 'vore', description: 'Prey being swallowed whole via the predator\'s mouth.' },
  { key: 'avStar', title: 'Anal Vore', category: 'vore', description: 'Prey being inserted into the predator\'s anus.' },
  { key: 'cvStar', title: 'Cock Vore', category: 'vore', description: 'Prey being inserted into the predator\'s penis.' },
  { key: 'ubStar', title: 'Unbirth', category: 'vore', description: 'Prey being inserted into the predator\'s vagina.' },
  { key: 'tvStar', title: 'Tail Vore', category: 'vore', description: 'Prey being consumed via a predator\'s cavernous, prehensile, or living tail.' },
  { key: 'absStar', title: 'Absorption', category: 'vore', description: 'Prey melting or merging directly into the predator\'s body mass, skin, or living flesh.' },
  { key: 'svStar', title: 'Soul Vore', category: 'vore', description: 'The prey\'s spiritual essence (or soul) being consumed or absorbed by the predator directly.' },
  { key: 'predStar', title: 'Being Pred', category: 'roleplay', description: 'You prefer being the one who is consuming prey.' },
  { key: 'preyStar', title: 'Being Prey', category: 'roleplay', description: 'You prefer being the one who is consumed by a predator.' },
  { key: 'softStar', title: 'Soft Vore', category: 'vore', description: 'Remaining whole, safe, and comfortable without physical harm or injury.' },
  { key: 'hardStar', title: 'Hard Vore', category: 'vore', description: 'Physical biting, chewing, or bodily damage during ingestion or during digestion. Often includes blood or broken bones.' },
  { key: 'digestionStar', title: 'Digestion', category: 'vore', description: 'Prey character will be digested in whatever fluid(s) are applicable.' },
  { key: 'disposalStar', title: 'Disposal', category: 'vore', description: 'Predator releases prey character as waste matter, either solid or liquid.' },
  { key: 'tfStar', title: 'Transformation', category: 'transformation', description: 'You enjoy the idea of a subjet being changed into a new form.' },
  { key: 'btfStar', title: 'Body Part Trans', category: 'transformation', description: 'Prey being transformed into or merged with specific parts of a predator\'s body such as their cock, boobs, pussy, or ass.' },
  { key: 'bsStar', title: 'Body Swap', category: 'transformation', description: 'Exchanging entire physical bodies, minds, or perspectives with someone else.' },
  { key: 'gStar', title: 'Gender Trans', category: 'transformation', description: 'Altering sex characteristics, pronouns, or physical gender presentation.' },
  { key: 'sStar', title: 'Species Trans', category: 'transformation', description: 'Morphing into a completely different animal, creature, or species.' },
  { key: 'iaoStar', title: 'Inanimate Object', category: 'transformation', description: 'Transforming into inanimate items such as sex toys, garments, or accessories.' },
  { key: 'shvStar', title: 'Sheath Vore', category: 'vore', description: 'Prey being inserted into the predator\'s penile sheath.' },
  { key: 'bvStar', title: 'Breast Vore', category: 'vore', description: 'Prey being swallowed or absorbed into a predator\'s breasts, cleavage, or mammary organs.' },
  { key: 'pvStar', title: 'Pouch Vore', category: 'vore', description: 'Prey being inserted into or held within a predator\'s abdominal body pouch.' },
  { key: 'uvStar', title: 'Udder Vore', category: 'vore', description: 'Prey being inserted into or held  within a predator\'s udder.' },
  { key: 'sfStar', title: 'Sentient Fat', category: 'transformation', description: 'Prey becoming a part of their predator\'s body fat and retaining their living awareness, will, or consciousness.' },
  { key: 'tatStar', title: 'Tattooification', category: 'transformation', description: 'Prey being flattened or transformed into living ink or a tattoo on a predator\'s skin.' },
  { key: 'wgStar', title: 'Weight Gain', category: 'transformation', description: 'Gaining soft body mass, expanding in size, or becoming pleasantly chubby as a consequence of vore.' },
  { key: 'microStar', title: 'Microphilia', category: 'roleplay', description: 'You enjoy the idea of characters that are impossibly and unrealistically small.' },
  { key: 'macroStar', title: 'Macrophilia', category: 'roleplay', description: 'You enjoy the idea of characters that are incredibly and unrealistically tall.' },
  { key: 'pawStar', title: 'Paw Play', category: 'roleplay', description: 'Affection for paws, toe beans, paw prints, and footpad-centric interactions.' },
  { key: 'burpStar', title: 'Belching / Burping', category: 'roleplay', description: 'You enjoy it when characters burp, either alone or in your presence.' },
  { key: 'fartStar', title: 'Farting', category: 'roleplay', description: 'You enjoy when characters pass gas' },
  { key: 'wsStar', title: 'Watersports', category: 'roleplay', description: 'You like when one character urinates on, or in, or on another character.' }
];

window.RATING_TIERS = [
  { val: -2, label: 'HATE IT', badgeClass: 'badge-hate', iconClass: 'fa-solid fa-heart-crack', title: 'Hate It (-2)' },
  { val: -1, label: 'MAYBE', badgeClass: 'badge-maybe', iconClass: 'sliver-heart', title: 'Maybe (-1)' },
  { val: 0, label: 'NEUTRAL', badgeClass: 'badge-neutral', iconClass: 'fa-regular fa-heart', title: 'Neutral (0)' },
  { val: 1, label: 'LIKE IT', badgeClass: 'badge-like', iconClass: 'fa-regular fa-heart-half-stroke', title: 'Like It (+1)' },
  { val: 2, label: 'LOVE IT', badgeClass: 'badge-love', iconClass: 'fa-solid fa-heart', title: 'Love It (+2)' }
];

function migrateRatingValue(val) {
  if (val === undefined || val === null) return 0;
  const num = Number(val);
  if (isNaN(num)) return 0;
  // Current rating scale (-2 to +2) takes precedence
  if (num >= -2 && num <= 2) return num;
  // Legacy 1-to-5 star scale conversion fallback
  if (num === 3) return 0;
  if (num === 4) return 1;
  if (num === 5) return 2;
  return 0;
}

window.CharacterCreatorApp.setupKinksUI = function () {
  const container = document.getElementById('kinksContainer');
  if (!container) return;

  container.innerHTML = '';
  const currentRatings = window.localPlayerInfo?.ratings || {};

  window.KINKS_CONFIG.forEach(kink => {
    const rawVal = currentRatings[kink.key];
    const currentVal = migrateRatingValue(rawVal);

    if (window.localPlayerInfo) {
      if (!window.localPlayerInfo.ratings) window.localPlayerInfo.ratings = {};
      window.localPlayerInfo.ratings[kink.key] = currentVal;
    }

    const card = document.createElement('div');
    card.className = 'kink-card';
    card.dataset.key = kink.key;
    card.dataset.category = kink.category;
    card.dataset.title = kink.title.toLowerCase();
    card.dataset.desc = kink.description.toLowerCase();

    const activeTier = window.RATING_TIERS.find(t => t.val === currentVal) || window.RATING_TIERS[2];

    card.innerHTML = `
      <div class="kink-card-header">
        <span class="kink-title">${kink.title}</span>
        <span class="kink-badge ${activeTier.badgeClass}" id="badge-${kink.key}">${activeTier.label}</span>
      </div>
      <div class="kink-description">${kink.description}</div>
      <div class="heart-rating-bar" data-kink="${kink.key}">
        ${window.RATING_TIERS.map(tier => `
          <label class="heart-btn ${tier.val === currentVal ? 'selected' : ''}" title="${tier.title}" data-val="${tier.val}">
            <input type="radio" name="${kink.key}" value="${tier.val}" ${tier.val === currentVal ? 'checked' : ''}>
            <span class="heart-icon-wrapper tier-${tier.val}">
              ${tier.val === -1 ? '<span class="sliver-heart-icon"></span>' : tier.val === 1 ? '<span class="half-heart-icon"></span>' : `<i class="${tier.iconClass}"></i>`}
            </span>
          </label>
        `).join('')}
      </div>
    `;

    container.appendChild(card);

    const ratingBar = card.querySelector('.heart-rating-bar');
    const badge = card.querySelector('.kink-badge');

    ratingBar.querySelectorAll('.heart-btn').forEach(btn => {
      btn.addEventListener('click', function (e) {
        const val = parseInt(this.dataset.val, 10);
        const radio = this.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;

        ratingBar.querySelectorAll('.heart-btn').forEach(b => b.classList.remove('selected'));
        this.classList.add('selected');

        const newTier = window.RATING_TIERS.find(t => t.val === val) || window.RATING_TIERS[2];
        badge.className = `kink-badge ${newTier.badgeClass}`;
        badge.textContent = newTier.label;

        if (window.localPlayerInfo) {
          if (!window.localPlayerInfo.ratings) window.localPlayerInfo.ratings = {};
          window.localPlayerInfo.ratings[kink.key] = val;
        }
      });
    });
  });

  const searchInput = document.getElementById('kinkSearch');
  if (searchInput) {
    searchInput.removeEventListener('input', filterKinkCards);
    searchInput.addEventListener('input', filterKinkCards);
  }

  const chipContainer = document.getElementById('kinkFilterChips');
  if (chipContainer) {
    chipContainer.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', function () {
        chipContainer.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        this.classList.add('active');
        filterKinkCards();
      });
    });
  }

  // Perform initial filter pass to display all cards
  filterKinkCards();
};

function filterKinkCards() {
  const query = (document.getElementById('kinkSearch')?.value || '').toLowerCase().trim();
  const activeChip = document.querySelector('.filter-chip.active')?.dataset.category || 'all';
  const cards = document.querySelectorAll('.kink-card');

  cards.forEach(card => {
    const matchesSearch = !query || card.dataset.title.includes(query) || card.dataset.desc.includes(query);
    const matchesCategory = activeChip === 'all' || card.dataset.category === activeChip;

    if (matchesSearch && matchesCategory) {
      card.style.display = 'flex';
    } else {
      card.style.display = 'none';
    }
  });
}

/**
 * Populates options for body secondary fur, accent fur, hands, and feet.
 */
window.CharacterCreatorApp.populateBodyOptions = function (type) {
  const secondarySelect = document.getElementById('bodySecondaryFur');
  const accentSelect = document.getElementById('bodyAccentFur');
  const handsSelect = document.getElementById('handsFur');
  const feetSelect = document.getElementById('feetFur');

  if (secondarySelect) secondarySelect.innerHTML = "";
  if (accentSelect) accentSelect.innerHTML = "";
  if (handsSelect) handsSelect.innerHTML = "";
  if (feetSelect) feetSelect.innerHTML = "";

  const secondaryOpts = [`${type}-empty|None`, `${type}-secondary_01|Belly`, `${type}-secondary_02|Chest to Thighs`, `${type}-secondary_03|Chest, Thighs and Underarms`, `${type}-secondary_04|Scales`];
  const accentOpts = [`${type}-empty|None`, `${type}-accent_01|Spots`, `${type}-accent_02|Stripes`, `${type}-accent_03|Stripe Down Back`];
  const handsOpts = [`${type}-empty|None`, `${type}-hands-secondary_01|Short "gloves"`, `${type}-hands-secondary_02|Long "gloves"`];
  const feetOpts = [`${type}-empty|None`, `${type}-feet-secondary_01|Short "socks"`, `${type}-feet-secondary_02|Long "socks"`];

  const populate = (selectEl, opts) => {
    if (!selectEl) return;
    opts.forEach(optStr => {
      const [val, text] = optStr.split("|");
      const trimmedVal = val.trim();
      const isUnavailable = window.UnavailableAssetKey?.isOptionUnavailable(selectEl.id, trimmedVal, text);
      const opt = document.createElement("option");
      opt.value = trimmedVal;
      if (isUnavailable) {
        opt.disabled = true;
        opt.textContent = window.UnavailableAssetKey.formatUnavailableText(text);
      } else {
        opt.textContent = text;
      }
      selectEl.options.add(opt);
    });
  };

  populate(secondarySelect, secondaryOpts);
  populate(accentSelect, accentOpts);
  populate(handsSelect, handsOpts);
  populate(feetSelect, feetOpts);
};

/**
 * Populates options for head secondary and accent fur.
 */
window.CharacterCreatorApp.populateHeadOptions = function (hVal) {
  const secSelect = document.getElementById('headSecondaryFur');
  const accSelect = document.getElementById('headAccentFur');
  if (secSelect) secSelect.innerHTML = "";
  if (accSelect) accSelect.innerHTML = "";

  const sneakyBeak = document.getElementById('sneakyBeak');
  if (hVal === 'head_05') {
    if (sneakyBeak) sneakyBeak.style.display = "block";
  } else {
    if (sneakyBeak) sneakyBeak.style.display = "none";
  }

  const opts = ["empty|None", `${hVal}-secondary_01|Half Mask`, `${hVal}-secondary_02|Full Mask`, `${hVal}-secondary_03|Single Stripe`, `${hVal}-secondary_04|Around Eyes`, `${hVal}-secondary_05|Snout Only`];
  opts.forEach(optStr => {
    const [val, text] = optStr.split("|");
    const trimmedVal = val.trim();
    const isSecUnavailable = window.UnavailableAssetKey?.isOptionUnavailable('headSecondaryFur', trimmedVal, text);
    const isAccUnavailable = window.UnavailableAssetKey?.isOptionUnavailable('headAccentFur', trimmedVal, text);

    if (secSelect) {
      const secOpt = new Option(isSecUnavailable ? window.UnavailableAssetKey.formatUnavailableText(text) : text, trimmedVal);
      if (isSecUnavailable) secOpt.disabled = true;
      secSelect.options.add(secOpt);
    }
    if (accSelect) {
      const accOpt = new Option(isAccUnavailable ? window.UnavailableAssetKey.formatUnavailableText(text) : text, trimmedVal);
      if (isAccUnavailable) accOpt.disabled = true;
      accSelect.options.add(accOpt);
    }
  });
};

/**
 * Populates options for tail secondary fur.
 */
window.CharacterCreatorApp.populateTailOptions = function (tVal) {
  const secSelect = document.getElementById('tailSecondaryFur');
  if (secSelect) {
    const currentSecVal = secSelect.value || 'empty';
    secSelect.innerHTML = "";

    const opts = ["empty|None", `${tVal}-secondary_01|Tiger Stripes`, `${tVal}-secondary_02|Racoon Stripes`, `${tVal}-secondary_03|Cheetah Spots`, `${tVal}-secondary_04|Tail Tip`, `${tVal}-secondary_05|Underside`, `${tVal}-secondary_06|Single Stripe`];
    opts.forEach(optStr => {
      const [val, text] = optStr.split("|");
      const trimmedVal = val.trim();
      const isUnavailable = window.UnavailableAssetKey?.isOptionUnavailable('tailSecondaryFur', trimmedVal, text);
      const displayText = isUnavailable ? window.UnavailableAssetKey.formatUnavailableText(text) : text;
      const opt = new Option(displayText, trimmedVal);
      if (isUnavailable) opt.disabled = true;
      secSelect.options.add(opt);
    });
    if (Array.from(secSelect.options).some(o => o.value === currentSecVal)) {
      secSelect.value = currentSecVal;
    }
  }

  window.CharacterCreatorApp.populateTailAccentOptions(tVal);
};

window.CharacterCreatorApp.populateTailAccentOptions = function (tVal) {
  const secSelect = document.getElementById('tailSecondaryFur');
  const accSelect = document.getElementById('tailAccentFur');
  if (!accSelect) return;

  const currentSecVal = secSelect ? secSelect.value : 'empty';
  const currentAccVal = accSelect.value || 'empty';

  accSelect.innerHTML = "";

  const allOpts = [
    { val: "empty", text: "None" },
    { val: `${tVal}-secondary_01`, text: "Tiger Stripes" },
    { val: `${tVal}-secondary_02`, text: "Racoon Stripes" },
    { val: `${tVal}-secondary_03`, text: "Cheetah Spots" },
    { val: `${tVal}-secondary_04`, text: "Tail Tip" },
    { val: `${tVal}-secondary_05`, text: "Underside" },
    { val: `${tVal}-secondary_06`, text: "Single Stripe" }
  ];

  const filteredOpts = allOpts.filter(opt => {
    if (opt.val === 'empty') return true;
    return opt.val !== currentSecVal;
  });

  filteredOpts.forEach(opt => {
    const isUnavailable = window.UnavailableAssetKey?.isOptionUnavailable('tailAccentFur', opt.val, opt.text);
    const displayText = isUnavailable ? window.UnavailableAssetKey.formatUnavailableText(opt.text) : opt.text;
    const option = new Option(displayText, opt.val);
    if (isUnavailable) option.disabled = true;
    accSelect.options.add(option);
  });

  const isStillValid = filteredOpts.some(opt => opt.val === currentAccVal);
  const newAccVal = isStillValid ? currentAccVal : 'empty';

  if (window.CharacterCreatorApp.updateSelectAndSyncUI) {
    window.CharacterCreatorApp.updateSelectAndSyncUI('tailAccentFur', newAccVal);
  }
  if (window.localPlayerInfo?.tail) {
    window.localPlayerInfo.tail.accentSprite = newAccVal;
  }
};

/**
 * Computes a matching pattern value for a new primary species prefix, retaining the user's selected pattern type.
 */
window.CharacterCreatorApp.getMatchingPatternValue = function (selectId, oldVal, newPrefix) {
  const select = document.getElementById(selectId);
  if (!select || !oldVal || oldVal === 'empty' || oldVal.endsWith('-empty')) {
    return null;
  }

  const dashIndex = oldVal.indexOf('-');
  if (dashIndex === -1) return null;
  const suffix = oldVal.substring(dashIndex);

  const candidateVal = newPrefix + suffix;
  const exists = Array.from(select.options).some(opt => opt.value === candidateVal);
  return exists ? candidateVal : null;
};

/**
 * Updates a select element value and silently synchronizes its custom select UI wrapper
 * without firing cascading DOM events or triggering multiple Phaser redraw passes.
 */
window.CharacterCreatorApp.updateSelectAndSyncUI = function (selectId, value) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.value = value;

  // Sync Pill Toggle Groups
  const pillGroup = document.querySelector(`.pill-toggle-group[data-target="${selectId}"]`);
  if (pillGroup) {
    pillGroup.querySelectorAll('.pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === value);
    });
  }

  // Sync Archetype Grid Cards
  const archetypeGrid = document.querySelector(`.archetype-grid-cards[data-target="${selectId}"]`);
  if (archetypeGrid) {
    archetypeGrid.querySelectorAll('.archetype-card').forEach(card => {
      card.classList.toggle('active', card.dataset.value === value);
    });
  }

  const wrapper = select.nextElementSibling;
  if (wrapper && wrapper.classList.contains('custom-select-wrapper')) {
    const customOptions = wrapper.querySelector('.custom-options');
    if (customOptions) {
      customOptions.innerHTML = '';
      Array.from(select.options).forEach(option => {
        const isUnavailable = option.disabled || window.UnavailableAssetKey?.isOptionUnavailable(selectId, option.value, option.text);
        if (isUnavailable) {
          option.disabled = true;
          if (!option.text.includes('(Unavailable)')) {
            option.text = window.UnavailableAssetKey.formatUnavailableText(option.text);
          }
        }

        const customOption = document.createElement('span');
        customOption.classList.add('custom-option');
        customOption.dataset.value = option.value;
        if (isUnavailable) {
          customOption.classList.add('unavailable');
          const cleanText = option.text.replace(/\s*\(Unavailable\)/g, '').trim();
          customOption.innerHTML = `${cleanText} <span class="unavailable-badge">(Unavailable)</span>`;
        } else {
          customOption.textContent = option.text;
        }
        if (option.value === select.value) customOption.classList.add('selected');

        customOption.addEventListener('click', function (e) {
          e.stopPropagation();
          if (isUnavailable || this.classList.contains('unavailable')) return;
          const triggerSpan = wrapper.querySelector('.select-trigger-text');
          if (triggerSpan) triggerSpan.textContent = this.textContent;
          customOptions.querySelectorAll('.custom-option').forEach(opt => opt.classList.remove('selected'));
          this.classList.add('selected');
          const customSelect = wrapper.querySelector('.custom-select');
          if (customSelect) customSelect.classList.remove('open');
          select.value = this.dataset.value;
          select.dispatchEvent(new Event('change'));
        });
        customOptions.appendChild(customOption);
      });
    }

    const selectedOption = select.options[select.selectedIndex];
    const triggerSpan = wrapper.querySelector('.select-trigger-text');
    if (triggerSpan && selectedOption) triggerSpan.textContent = selectedOption.text;
  }
};

function hideLoadingScreen() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    setTimeout(() => { overlay.style.display = 'none'; }, 500);
  }
  window.CharacterCreatorApp.isReady = true;
  window.CharacterCreatorApp.initialSetup = false;
}

function initCharacterData() {
  const charList = window.TASTY_TAILS_CHAR_DATA || 'new';

  if (charList === 'new') {
    window.localPlayerInfo = {
      Identifier: '', playerId: '', Username: '', Description: '',
      head: { sprite: 'head_01', color: '0xe0e0e0', secondarySprite: 'empty', secondaryColor: '0xffffff', accentSprite: 'empty', accentColor: '0x636363' },
      bodyShape: { sprite: 'F-' },
      body: { sprite: 'body_01', color: '0xe0e0e0', secondarySprite: 'body_01-empty', secondaryColor: '0xffffff', accentSprite: 'body_01-empty', accentColor: '0x636363' },
      hands: { sprite: 'body_01-empty', color: '0xe0e0e0' },
      feet: { sprite: 'body_01-empty', color: '0xe0e0e0' },
      tail: { sprite: 'tail_01', color: '0xe0e0e0', secondarySprite: 'empty', secondaryColor: '0xffffff', accentSprite: 'empty', accentColor: '0x636363' },
      eyes: { outer: 'eyes_02', iris: 'eyes_01', color: '0xfcf2f2' },
      hair: { sprite: 'empty', color: '0x636363' },
      headAccessories: { sprite: 'empty', color: '0xffffff' },
      ear: { outerSprite: 'ears_01-outer', innerSprite: 'ears_01-inner', outerColor: '0xe0e0e0', innerColor: '0x636363' },
      beak: { sprite: 'empty', color: '0xffffff' },
      genitals: { sprite: 'empty', secondarySprite: 'empty' },
      ratings: { ovStar: 0, avStar: 0, cvStar: 0, ubStar: 0, tvStar: 0, absStar: 0, svStar: 0, predStar: 0, preyStar: 0, softStar: 0, hardStar: 0, digestionStar: 0, disposalStar: 0, tfStar: 0, btfStar: 0, bsStar: 0, gStar: 0, sStar: 0, iaoStar: 0, shvStar: 0, bvStar: 0, pvStar: 0, uvStar: 0, sfStar: 0, tatStar: 0, wgStar: 0, microStar: 0, macroStar: 0, pawStar: 0, burpStar: 0, fartStar: 0, wsStar: 0 },
      specialList: [], spellInventory: [], consumedBy: '',
      input: { left: false, right: false, up: false, down: false }
    };
    // =========================================================================================================
    // CRITICAL: DO NOT MODIFY, TRUNCATE, OR SUMMARIZE THE TEXT AND DESCRIPTIONS IN THIS ARRAY WITHOUT
    // EXPLICIT USER INSTRUCTIONS. THE EXACT STRINGS AND DESCRIPTIONS IN THIS ARRAY MUST BE PRESERVED.
    // =========================================================================================================
    window.voreList = [
      { id: 1, graphNodeId: "1", type: "entrance", destination: "Maw", verb: "shoves", x: 25, y: 100, protoConnections: [3], destinationDescrip: "You are pulled between <pred>'s lips...", examineMsgDescrip: "<pred>'s cheeks are swollen with <prey>...", struggleInsideMsgDescrip: "You pry at the jaws...", struggleOutsideMsgDescrip: "<pred>'s cheeks puff out..." },
      { id: 2, graphNodeId: "2", type: "entrance", destination: "Anus", verb: "squelches", x: 25, y: 240, protoConnections: [4], destinationDescrip: "You can feel the slimy walls of <pred>'s anal canal rippling around you...", examineMsgDescrip: "<prey> is slowly being worked up into <pred>'s tight ass...", struggleInsideMsgDescrip: "You push against the tight ring...", struggleOutsideMsgDescrip: "<pred> groans as their ass tightens around the intruding prey..." },
      { id: 3, graphNodeId: "3", type: "path", destination: "Gullet", x: 165, y: 100, protoConnections: [5], destinationDescrip: "The tight tube squeezes you down...", examineMsgDescrip: "A bulge is working it's way down <pred>'s throat...", struggleInsideMsgDescrip: "The walls constrict tightly...", struggleOutsideMsgDescrip: "A bulge travels down <pred>'s throat..." },
      { id: 4, graphNodeId: "4", type: "path", destination: "Bowels", x: 165, y: 240, protoConnections: [5], destinationDescrip: "You feel the musky walls of <pred>'s digestive tract undulating around you as you are shoved up their ass.", examineMsgDescrip: "<pred>'s lower abdomen seems to be swollen out quite a lot...did something just move?", struggleInsideMsgDescrip: "Wriggling about only seems to make that tight fleshy tube squeeze tighter around your body.", struggleOutsideMsgDescrip: "The outline of a footprint forms against the surface of <pred>'s lower belly" },
      { id: 5, graphNodeId: "5", type: "destination", destination: "Stomach", digestionTimer: "120", x: 305, y: 100, protoConnections: [6], destinationDescrip: "TThe walls feel hot and slimy as they constrict around you.", examineMsgDescrip: "<pred>'s belly looks as though something inside is moving...", struggleInsideMsgDescrip: "Pressing against the slimy walls doesn't seem to get much of a reaction from <pred>.", struggleOutsideMsgDescrip: "<pred>'s belly bulges out with the outline of a hand print for a moment before returning to it's distended shape.", digestionInsideMsgDescrip: "The constant liquid churning inside<pred>'s stomach causes your form to contort and squirm uncomfortably until you can no longer recognize your own shape and your mind melts away into nothingness.", digestionOutsideMsgDescrip: "The constant movement inside <pred>'s middle finally goes still as a soft gurgling sound comes from their belly.", releaseMsgDescrip: "<pred> leans forward and heaves, forcing you back out into the light." },
      { id: 6, graphNodeId: "6", type: "exit", destination: "Anus", x: 445, y: 100, destinationDescrip: "You are squeezed into the lower intestines...", examineMsgDescrip: "<pred>'s anus bulges outward...", struggleInsideMsgDescrip: "There is little room to move...", struggleOutsideMsgDescrip: "<pred>'s lower belly churns..." },
      { id: 7, graphNodeId: "7", type: "entrance", destination: "Slit", verb: "presses", x: 25, y: 380, protoConnections: [8], destinationDescrip: "You are pulled past <pred>'s soft outer lips...", examineMsgDescrip: "<pred> is working <prey> in and out of their pussy...", struggleInsideMsgDescrip: "You struggle against the slick folds...", struggleOutsideMsgDescrip: "<pred>'s hips twitch as <prey> pushes from inside..." },
      { id: 8, graphNodeId: "8", type: "path", destination: "Canal", x: 165, y: 380, protoConnections: [9], destinationDescrip: "The tight, ribbed canal squeezes tightly around you...", examineMsgDescrip: "<pred>'s lower tummy is distended with the shape of <prey> sliding in deeper...", struggleInsideMsgDescrip: "The fleshy passage grips you firmly...", struggleOutsideMsgDescrip: "A visible bulge shifts along <pred>'s pelvis..." },
      { id: 9, graphNodeId: "9", type: "destination", destination: "Womb", mode: "Womb", digestionTimer: "120", x: 305, y: 380, protoConnections: [10], destinationDescrip: "You are wholly enveloped in a humid heat as you are deposited into a wet and slimy chamber. The air is filled with the scent of <pred>'s arousal and their heart can be heard beating just above.", examineMsgDescrip: "<pred>'s lower belly bulges warmly with life...", struggleInsideMsgDescrip: "Struggling seems to do little good, but you do feel the gentle rubbing of <pred>'s hand over your shape as they press the bulges you make back into their core.", struggleOutsideMsgDescrip: "<pred>'s distended belly seems to rock and sway on it's own, they coo softly and seem to rub over their middle affectionately.", digestionInsideMsgDescrip: "Your body seems to feel soggy and wet as the heat surrounding you grows more intense. The walls seem to flex down harder and harder until finally... splorsh! You succumb to <pred>'s arousal and are reduced to a pool of fem-cum.", digestionOutsideMsgDescrip: "<pred>'s middle suddenly compacts down noticeably and their face flushes red as they bite their lower lip. A muffled sloshing sound could be heard seemingly coming from their belly!", releaseMsgDescrip: "<pred>'s body convulses as they push you back out through their canal, birthing you back into freedom." },
      { id: 10, graphNodeId: "10", type: "exit", destination: "Slit", x: 445, y: 380, destinationDescrip: "You are birthed out through the slick slit...", examineMsgDescrip: "", struggleInsideMsgDescrip: "You press outward toward freedom...", struggleOutsideMsgDescrip: "<pred>'s slit widens as you push..." },
      { id: 11, graphNodeId: "11", type: "entrance", destination: "Cock", verb: "forces", x: 25, y: 520, protoConnections: [12], destinationDescrip: "You are forced into the tip of <pred>'s cock...", examineMsgDescrip: "<prey> is sliding inside the tip of <pred>'s cock...", struggleInsideMsgDescrip: "You squirm against the narrow opening...", struggleOutsideMsgDescrip: "<pred>'s cock twitches as <prey> slides in..." },
      { id: 12, graphNodeId: "12", type: "path", destination: "Shaft", x: 165, y: 520, protoConnections: [13], destinationDescrip: "The tight, throbbing shaft constricts around you...", examineMsgDescrip: "<prey> is sliding deeper into <pred>'s cock, making a visible bulge along it's length...", struggleInsideMsgDescrip: "The slick inner walls clamp tight...", struggleOutsideMsgDescrip: "A distinct bulge squirms along the underside of <pred>'s girth..." },
      { id: 13, graphNodeId: "13", type: "destination", destination: "Balls", mode: "Balls", digestionTimer: "120", x: 305, y: 520, protoConnections: [14], destinationDescrip: "You fall down into a thick, musky puddle of jizz that immediately starts coating your body as the wrinkly walls of <pred>'s scrotum tighten up to welcome you~", examineMsgDescrip: "A large bulge between <pred>'s thighs seems to shift and sway on it's own.", struggleInsideMsgDescrip: "The walls of your prison seem to give easily when you push out against them, but they always clench right back down the moment you relax...", struggleOutsideMsgDescrip: "A very clear imprint of someone's face bulges out from the side of <pred>'s nutsack.", digestionInsideMsgDescrip: "The walls around you suddenly cinch up tightly submerging your head completely in <pred>'s sperm before you finally melt, becoming one with the pool of seed you had been bathing in.", digestionOutsideMsgDescrip: "There are a few frantic garbled sounds seeming to come up from <pred>'s crotch before there was a sudden, thick sounding, GLORP and those frantic sounds were reduced to a soft sloshing.", releaseMsgDescrip: "With a powerful thrust, <pred> expels you from their sack, sending you sliding out into the world." },
      { id: 14, graphNodeId: "14", type: "exit", destination: "Cock", x: 445, y: 520, destinationDescrip: "You are ejaculated out from <pred>'s cock...", struggleInsideMsgDescrip: "You push outward down the shaft...", struggleOutsideMsgDescrip: "<pred>'s shaft throbs as you move..." }
    ];
  } else {
    window.localPlayerInfo = charList;

    // Safety Shim
    if (!charList.ratings) charList.ratings = {};
    if (!charList.head) charList.head = {};
    if (!charList.head.sprite) charList.head.sprite = 'head_01';
    if (!charList.head.color) charList.head.color = '0xe0e0e0';
    if (!charList.head.secondarySprite) charList.head.secondarySprite = 'empty';
    if (!charList.head.secondaryColor) charList.head.secondaryColor = '0xffffff';
    if (!charList.head.accentSprite) charList.head.accentSprite = 'empty';
    if (!charList.head.accentColor) charList.head.accentColor = '0x636363';
    if (!charList.bodyShape) charList.bodyShape = { sprite: 'F-' };
    if (!charList.body) charList.body = {};
    if (!charList.body.sprite) charList.body.sprite = 'body_01';
    if (!charList.body.color) charList.body.color = '0xe0e0e0';
    if (!charList.body.secondarySprite) charList.body.secondarySprite = 'body_01-empty';
    if (!charList.body.secondaryColor) charList.body.secondaryColor = '0xffffff';
    if (!charList.body.accentSprite) charList.body.accentSprite = 'body_01-empty';
    if (!charList.body.accentColor) charList.body.accentColor = '0x636363';
    if (!charList.hands) charList.hands = { sprite: 'body_01-empty', color: '0xe0e0e0' };
    if (!charList.feet) charList.feet = { sprite: 'body_01-empty', color: '0xe0e0e0' };
    if (!charList.tail) charList.tail = {};
    if (!charList.tail.sprite) charList.tail.sprite = 'tail_01';
    if (!charList.tail.color) charList.tail.color = '0xe0e0e0';
    if (!charList.tail.secondarySprite) charList.tail.secondarySprite = 'empty';
    if (!charList.tail.secondaryColor) charList.tail.secondaryColor = '0xffffff';
    if (!charList.tail.accentSprite) charList.tail.accentSprite = 'empty';
    if (!charList.tail.accentColor) charList.tail.accentColor = '0x636363';
    if (!charList.eyes) charList.eyes = { outer: 'eyes_02', iris: 'eyes_01', color: '0xfcf2f2' };
    if (!charList.eyes.outer) charList.eyes.outer = 'eyes_02';
    if (!charList.eyes.iris) charList.eyes.iris = 'eyes_01';
    if (!charList.hair) charList.hair = { sprite: 'empty', color: '0x636363' };
    if (!charList.headAccessories) charList.headAccessories = { sprite: 'empty', color: '0xffffff' };
    if (!charList.ear) charList.ear = { outerSprite: 'ears_01-outer', innerSprite: 'ears_01-inner', outerColor: '0xe0e0e0', innerColor: '0x636363' };
    if (!charList.ear.innerSprite) charList.ear.innerSprite = getInnerEarSprite(charList.ear.outerSprite);
    if (!charList.beak) charList.beak = { sprite: 'empty', color: '0xffffff' };
    if (!charList.genitals) charList.genitals = charList.genitles || { sprite: 'empty', secondarySprite: 'empty' };
    if (!charList.voreTypes) charList.voreTypes = [];

    // Populate About tab inputs
    if (document.getElementById('firstName')) document.getElementById('firstName').value = charList.firstName || '';
    if (document.getElementById('lastName')) document.getElementById('lastName').value = charList.lastName || '';
    if (document.getElementById('nickName')) document.getElementById('nickName').value = charList.nickName || '';
    if (document.getElementById('speciesName')) document.getElementById('speciesName').value = charList.speciesName || '';
    if (charList.pronouns === 1 && document.getElementById('she/her')) document.getElementById('she/her').checked = true;
    if (charList.pronouns === 2 && document.getElementById('he/his')) document.getElementById('he/his').checked = true;
    if (charList.pronouns === 3 && document.getElementById('they/them')) document.getElementById('they/them').checked = true;
    if (document.getElementById('icDescrip')) document.getElementById('icDescrip').value = charList.icDescrip || '';
    if (document.getElementById('oocDescrip')) document.getElementById('oocDescrip').value = charList.oocDescrip || '';

    window.voreList = charList.voreTypes;
  }

  // Ratings & Kinks UI Initialization (runs for both new & edit mode)
  if (window.CharacterCreatorApp.setupKinksUI) {
    window.CharacterCreatorApp.setupKinksUI();
  }

  // Always sync hidden input fields for eyes and innerEar to prevent submitting empty values
  if (document.getElementById('eyesOuter')) document.getElementById('eyesOuter').value = window.localPlayerInfo.eyes.outer || 'eyes_02';
  if (document.getElementById('eyesIris')) document.getElementById('eyesIris').value = window.localPlayerInfo.eyes.iris || 'eyes_01';
  if (document.getElementById('innerEar')) document.getElementById('innerEar').value = window.localPlayerInfo.ear.innerSprite || getInnerEarSprite(window.localPlayerInfo.ear.outerSprite);
}

function setupTabs() {
  const tabs = {
    identity: document.getElementById('identityPullout'),
    gender: document.getElementById('genderPullout'),
    about: document.getElementById('aboutPullout'),
    kinks: document.getElementById('kinksPullout'),
    vore: document.getElementById('vorePullout')
  };
  const buttons = {
    identity: document.getElementById('identity'),
    gender: document.getElementById('gender'),
    about: document.getElementById('about'),
    kinks: document.getElementById('kinks'),
    vore: document.getElementById('vore')
  };
  const navButtons = {
    next: document.getElementById('next'),
    next2: document.getElementById('next2'),
    next3: document.getElementById('next3'),
    next4: document.getElementById('next4'),
    finish: document.getElementById('finish')
  };

  function switchTab(name) {
    Object.values(tabs).forEach(el => { if (el) el.style.display = 'none'; });
    Object.values(buttons).forEach(el => { if (el) el.classList.remove('active-tab'); });
    Object.values(navButtons).forEach(el => { if (el) el.style.display = 'none'; });

    if (tabs[name]) tabs[name].style.display = 'block';
    if (buttons[name]) buttons[name].classList.add('active-tab');

    if (name === 'kinks' && window.CharacterCreatorApp.setupKinksUI) {
      window.CharacterCreatorApp.setupKinksUI();
    }

    if (name === 'identity' && navButtons.next) navButtons.next.style.display = 'block';
    else if (name === 'gender' && navButtons.next2) navButtons.next2.style.display = 'block';
    else if (name === 'about' && navButtons.next3) navButtons.next3.style.display = 'block';
    else if (name === 'kinks' && navButtons.next4) navButtons.next4.style.display = 'block';
    else if (name === 'vore' && navButtons.finish) navButtons.finish.style.display = 'block';
  }

  if (buttons.identity) buttons.identity.addEventListener('click', () => switchTab('identity'));
  if (buttons.gender) buttons.gender.addEventListener('click', () => switchTab('gender'));
  if (buttons.about) buttons.about.addEventListener('click', () => switchTab('about'));
  if (buttons.kinks) buttons.kinks.addEventListener('click', () => switchTab('kinks'));
  if (buttons.vore) buttons.vore.addEventListener('click', () => switchTab('vore'));

  if (navButtons.next) navButtons.next.addEventListener('click', () => switchTab('gender'));
  if (navButtons.next2) navButtons.next2.addEventListener('click', () => switchTab('about'));
  if (navButtons.next3) navButtons.next3.addEventListener('click', () => switchTab('kinks'));
  if (navButtons.next4) navButtons.next4.addEventListener('click', () => switchTab('vore'));
}

function setupIdentityControls() {
  const isKeyAvailable = () => typeof window.UnavailableAssetKey !== 'undefined';

  // 1. Pill Toggles (Shape & Anatomy)
  document.querySelectorAll('.pill-toggle-group').forEach(group => {
    const targetId = group.dataset.target;
    const select = document.getElementById(targetId);
    if (!select) return;

    group.querySelectorAll('.pill-btn').forEach(btn => {
      const val = btn.dataset.value;
      const text = btn.innerText || btn.textContent;
      const isUnavailable = isKeyAvailable() && window.UnavailableAssetKey.isOptionUnavailable(targetId, val, text);

      if (select) {
        const matchingOpt = Array.from(select.options).find(o => o.value === val);
        if (matchingOpt && isUnavailable) matchingOpt.disabled = true;
      }

      if (isUnavailable) {
        btn.classList.add('unavailable');
        btn.setAttribute('disabled', 'true');
        if (!btn.querySelector('.unavailable-badge')) {
          const badge = document.createElement('span');
          badge.className = 'unavailable-badge';
          badge.textContent = '(Unavailable)';
          btn.appendChild(badge);
        }
      }

      btn.addEventListener('click', function (e) {
        if (this.classList.contains('unavailable') || this.hasAttribute('disabled')) {
          e.stopPropagation();
          e.preventDefault();
          return;
        }
        group.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        select.value = this.dataset.value;
        select.dispatchEvent(new Event('change'));
      });
    });
  });

  // 2. Archetype Grid Cards (Body Type)
  document.querySelectorAll('.archetype-grid-cards').forEach(grid => {
    const targetId = grid.dataset.target;
    const select = document.getElementById(targetId);
    if (!select) return;

    grid.querySelectorAll('.archetype-card').forEach(card => {
      const val = card.dataset.value;
      const titleEl = card.querySelector('.archetype-title');
      const titleText = titleEl ? titleEl.textContent : '';
      const isUnavailable = isKeyAvailable() && window.UnavailableAssetKey.isOptionUnavailable(targetId, val, titleText);

      if (select) {
        const matchingOpt = Array.from(select.options).find(o => o.value === val);
        if (matchingOpt && isUnavailable) matchingOpt.disabled = true;
      }

      if (isUnavailable) {
        card.classList.add('unavailable');
        card.setAttribute('disabled', 'true');
        if (!card.querySelector('.unavailable-badge')) {
          const badge = document.createElement('div');
          badge.className = 'unavailable-badge';
          badge.textContent = '(Unavailable)';
          card.appendChild(badge);
        }
      }

      card.addEventListener('click', function (e) {
        if (this.classList.contains('unavailable') || this.hasAttribute('disabled')) {
          e.stopPropagation();
          e.preventDefault();
          return;
        }
        grid.querySelectorAll('.archetype-card').forEach(c => c.classList.remove('active'));
        this.classList.add('active');
        select.value = this.dataset.value;
        select.dispatchEvent(new Event('change'));
      });
    });
  });
}



function setupCollapsibles() {
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.collapsible');
    if (btn) {
      btn.classList.toggle("active");
      const content = btn.nextElementSibling;
      if (content) {
        content.classList.toggle('active');
      }
    }
  });
}

function setupFormListeners() {
  const info = window.localPlayerInfo;
  const updateScene = () => window.CharacterPreviewScene?.characterUpdated(info);
  const syncUI = window.CharacterCreatorApp.updateSelectAndSyncUI;
  const app = window.CharacterCreatorApp;

  // Body Shape
  const bodyShapeSelect = document.getElementById("bodyShape");
  if (bodyShapeSelect) {
    bodyShapeSelect.addEventListener("change", function (e) {
      info.bodyShape.sprite = e.target.value;
      updateScene();
    });
  }

  // Main Body Type Cascade
  const mainBodySelect = document.getElementById("mainBodyType");
  if (mainBodySelect) {
    mainBodySelect.addEventListener("change", function (e) {
      const type = e.target.value;
      const oldSec = info.body.secondarySprite;
      const oldAcc = info.body.accentSprite;
      const oldHands = info.hands.sprite;
      const oldFeet = info.feet.sprite;

      info.body.sprite = type;

      app.populateBodyOptions(type);

      const newSec = app.getMatchingPatternValue('bodySecondaryFur', oldSec, type) || `${type}-empty`;
      const newAcc = app.getMatchingPatternValue('bodyAccentFur', oldAcc, type) || `${type}-empty`;
      const newHands = app.getMatchingPatternValue('handsFur', oldHands, type) || `${type}-empty`;
      const newFeet = app.getMatchingPatternValue('feetFur', oldFeet, type) || `${type}-empty`;

      syncUI('bodySecondaryFur', newSec);
      syncUI('bodyAccentFur', newAcc);
      syncUI('handsFur', newHands);
      syncUI('feetFur', newFeet);

      info.body.secondarySprite = newSec;
      info.body.accentSprite = newAcc;
      info.hands.sprite = newHands;
      info.feet.sprite = newFeet;

      updateScene();
    });
  }

  // Outer Ear
  const outerEarSelect = document.getElementById("outerEar");
  if (outerEarSelect) {
    outerEarSelect.addEventListener("change", function (e) {
      info.ear.outerSprite = e.target.value;
      info.ear.innerSprite = getInnerEarSprite(e.target.value);
      if (document.getElementById('innerEar')) {
        document.getElementById('innerEar').value = info.ear.innerSprite;
      }
      updateScene();
    });
  }

  // Head Species Cascade
  const headSelect = document.getElementById("head");
  if (headSelect) {
    headSelect.addEventListener("change", function (e) {
      const hVal = e.target.value;
      const oldSec = info.head.secondarySprite;
      const oldAcc = info.head.accentSprite;

      info.head.sprite = hVal;

      app.populateHeadOptions(hVal);
      if (hVal === 'head_05') {
        info.beak.sprite = 'head_05_beak';
      } else {
        info.beak.sprite = 'empty';
      }
      if (document.getElementById('beakSprite')) {
        document.getElementById('beakSprite').value = info.beak.sprite;
      }

      const newSec = app.getMatchingPatternValue('headSecondaryFur', oldSec, hVal) || 'empty';
      const newAcc = app.getMatchingPatternValue('headAccentFur', oldAcc, hVal) || 'empty';

      syncUI('headSecondaryFur', newSec);
      syncUI('headAccentFur', newAcc);
      info.head.secondarySprite = newSec;
      info.head.accentSprite = newAcc;

      updateScene();
    });
  }

  // Individual part listeners
  const bindSimple = (id, propPath) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", (e) => {
      const parts = propPath.split(".");
      if (parts.length === 2) info[parts[0]][parts[1]] = e.target.value;
      else if (parts.length === 1) info[parts[0]] = e.target.value;
      updateScene();
    });
  };

  bindSimple("headSecondaryFur", "head.secondarySprite");
  bindSimple("headAccentFur", "head.accentSprite");
  bindSimple("headAccessories", "headAccessories.sprite");
  bindSimple("hair", "hair.sprite");
  bindSimple("bodySecondaryFur", "body.secondarySprite");
  bindSimple("bodyAccentFur", "body.accentSprite");
  bindSimple("handsFur", "hands.sprite");
  bindSimple("feetFur", "feet.sprite");

  // Tail Cascade
  const tailSelect = document.getElementById("tail");
  if (tailSelect) {
    tailSelect.addEventListener("change", function (e) {
      const tVal = e.target.value;
      const oldSec = info.tail.secondarySprite;

      info.tail.sprite = tVal;

      app.populateTailOptions(tVal);

      const newSec = app.getMatchingPatternValue('tailSecondaryFur', oldSec, tVal) || 'empty';

      syncUI('tailSecondaryFur', newSec);
      info.tail.secondarySprite = newSec;
      updateScene();
    });
  }

  const secTailSelect = document.getElementById("tailSecondaryFur");
  if (secTailSelect) {
    secTailSelect.addEventListener("change", function (e) {
      info.tail.secondarySprite = e.target.value;
      const tVal = info.tail.sprite || 'tail_01';
      app.populateTailAccentOptions(tVal);
      updateScene();
    });
  } else {
    bindSimple("tailSecondaryFur", "tail.secondarySprite");
  }
  bindSimple("tailAccentFur", "tail.accentSprite");

  // Rotation controls
  const rotateRight = document.getElementById("rotateRight");
  const rotateLeft = document.getElementById("rotateLeft");
  if (rotateRight) {
    rotateRight.addEventListener("click", () => {
      let r = window.CharacterPreviewScene.rotation;
      r = r < 4 ? r + 1 : 1;
      window.CharacterPreviewScene.rotation = r;
      updateScene();
    });
  }
  if (rotateLeft) {
    rotateLeft.addEventListener("click", () => {
      let r = window.CharacterPreviewScene.rotation;
      r = r > 1 ? r - 1 : 4;
      window.CharacterPreviewScene.rotation = r;
      updateScene();
    });
  }

  // Randomizer button
  const randomizerBtn = document.getElementById('randomizer');
  if (randomizerBtn) {
    randomizerBtn.addEventListener("click", () => {
      window.ColorPickerManager?.randomizeColors();
    });
  }
}

function initCustomSelects() {
  const selects = document.querySelectorAll('select');
  selects.forEach(select => {
    if (select.classList.contains('af-form-select')) return;

    // Skip selects managed by pill toggle groups or archetype card grids
    if (document.querySelector(`.pill-toggle-group[data-target="${select.id}"]`) ||
        document.querySelector(`.archetype-grid-cards[data-target="${select.id}"]`)) {
      select.style.setProperty('display', 'none', 'important');
      return;
    }

    select.style.setProperty('display', 'none', 'important');
    select.classList.add('hidden-native-select');
    if (select.nextElementSibling && select.nextElementSibling.classList.contains('custom-select-wrapper')) return;

    const wrapper = document.createElement('div');
    wrapper.classList.add('custom-select-wrapper');
    const customSelect = document.createElement('div');
    customSelect.classList.add('custom-select');
    const trigger = document.createElement('div');
    trigger.classList.add('custom-select__trigger');
    const selectedOption = select.options[select.selectedIndex];
    
    trigger.innerHTML = `
      <button type="button" class="select-step-btn prev-btn" title="Previous Option"><i class="fa-solid fa-chevron-left"></i></button>
      <span class="select-trigger-text">${selectedOption ? selectedOption.text : 'Select...'}</span>
      <button type="button" class="select-step-btn next-btn" title="Next Option"><i class="fa-solid fa-chevron-right"></i></button>
      <div class="arrow"></div>
    `;
    const customOptions = document.createElement('div');
    customOptions.classList.add('custom-options');

    function buildOptions() {
      customOptions.innerHTML = '';
      Array.from(select.options).forEach(option => {
        const isUnavailable = option.disabled || window.UnavailableAssetKey?.isOptionUnavailable(select.id, option.value, option.text);
        if (isUnavailable) {
          option.disabled = true;
          if (!option.text.includes('(Unavailable)')) {
            option.text = window.UnavailableAssetKey ? window.UnavailableAssetKey.formatUnavailableText(option.text) : `${option.text} (Unavailable)`;
          }
        }

        const customOption = document.createElement('span');
        customOption.classList.add('custom-option');
        customOption.dataset.value = option.value;

        if (isUnavailable) {
          customOption.classList.add('unavailable');
          const cleanText = option.text.replace(/\s*\(Unavailable\)/g, '').trim();
          customOption.innerHTML = `${cleanText} <span class="unavailable-badge">(Unavailable)</span>`;
        } else {
          customOption.textContent = option.text;
        }

        if (option.selected) customOption.classList.add('selected');

        customOption.addEventListener('click', function (e) {
          e.stopPropagation();
          if (isUnavailable || this.classList.contains('unavailable')) return;
          trigger.querySelector('.select-trigger-text').textContent = this.textContent;
          customOptions.querySelectorAll('.custom-option').forEach(opt => opt.classList.remove('selected'));
          this.classList.add('selected');
          customSelect.classList.remove('open');
          select.value = this.dataset.value;
          select.dispatchEvent(new Event('change'));
        });
        customOptions.appendChild(customOption);
      });
    }
    buildOptions();

    // Step Prev/Next buttons
    const prevBtn = trigger.querySelector('.prev-btn');
    const nextBtn = trigger.querySelector('.next-btn');

    const stepOption = (dir) => {
      const opts = Array.from(select.options);
      if (opts.length <= 1) return;
      let currentIndex = select.selectedIndex;
      if (currentIndex === -1) currentIndex = 0;
      let newIndex = currentIndex;
      let attempts = 0;
      do {
        newIndex += dir;
        if (newIndex < 0) newIndex = opts.length - 1;
        if (newIndex >= opts.length) newIndex = 0;
        attempts++;
      } while (attempts < opts.length && (opts[newIndex].disabled || window.UnavailableAssetKey?.isOptionUnavailable(select.id, opts[newIndex].value, opts[newIndex].text)));

      if (!opts[newIndex].disabled && !window.UnavailableAssetKey?.isOptionUnavailable(select.id, opts[newIndex].value, opts[newIndex].text)) {
        select.selectedIndex = newIndex;
        select.dispatchEvent(new Event('change'));
      }
    };

    if (prevBtn) {
      prevBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        stepOption(-1);
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        stepOption(1);
      });
    }

    select.addEventListener('change', function () {
      const updatedSelected = select.options[select.selectedIndex];
      const textSpan = trigger.querySelector('.select-trigger-text');
      if (textSpan) textSpan.textContent = updatedSelected ? updatedSelected.text : 'Select...';
      customOptions.querySelectorAll('.custom-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.value === select.value);
      });
    });

    customSelect.appendChild(trigger);
    customSelect.appendChild(customOptions);
    wrapper.appendChild(customSelect);
    select.parentNode.insertBefore(wrapper, select.nextSibling);

    trigger.addEventListener('click', function (e) {
      if (e.target.closest('.select-step-btn')) return;
      document.querySelectorAll('.custom-select').forEach(s => {
        if (s !== customSelect) s.classList.remove('open');
      });
      customSelect.classList.toggle('open');
      e.stopPropagation();
    });
  });

  window.addEventListener('click', function (e) {
    if (!e.target.closest('.custom-select')) {
      document.querySelectorAll('.custom-select').forEach(s => s.classList.remove('open'));
    }
  });
}

function setupAppearanceSubNav() {
  const subBtns = document.querySelectorAll('.sub-nav-btn');
  const subPanes = document.querySelectorAll('.sub-tab-pane');

  subBtns.forEach(btn => {
    btn.addEventListener('click', function () {
      const targetSub = this.dataset.sub;
      subBtns.forEach(b => b.classList.remove('active'));
      subPanes.forEach(p => p.classList.remove('active'));

      this.classList.add('active');
      const activePane = document.getElementById(targetSub);
      if (activePane) activePane.classList.add('active');
    });
  });
}

function setupAboutStudio() {
  const firstNameEl = document.getElementById('firstName');
  const lastNameEl = document.getElementById('lastName');
  const nickNameEl = document.getElementById('nickName');
  const speciesNameEl = document.getElementById('speciesName');
  const icDescripEl = document.getElementById('icDescrip');
  const oocDescripEl = document.getElementById('oocDescrip');

  const previewNameEl = document.getElementById('previewCharName');
  const previewSpeciesEl = document.getElementById('previewSpecies');
  const previewPronounsEl = document.getElementById('previewPronouns');
  const previewAliasEl = document.getElementById('previewAlias');
  const previewIcEl = document.getElementById('previewIcContent');
  const previewOocEl = document.getElementById('previewOocContent');

  // Pronoun Pill Toggles
  const pronounGroup = document.getElementById('pronounPillGroup');
  if (pronounGroup) {
    pronounGroup.querySelectorAll('.pill-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        pronounGroup.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const val = this.dataset.value;
        const radios = document.querySelectorAll('input[name="pronouns"]');
        radios.forEach(r => {
          r.checked = (r.value === val);
        });
        updateExamineCard();
      });
    });
  }

  // Sync pronoun pill toggles on initial load (support edit mode)
  const activeRadio = document.querySelector('input[name="pronouns"]:checked');
  if (activeRadio && pronounGroup) {
    const targetVal = activeRadio.value;
    pronounGroup.querySelectorAll('.pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === targetVal);
    });
  }

  // Formatting Toolbar Buttons
  document.querySelectorAll('.format-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const targetId = this.dataset.target;
      const format = this.dataset.format;
      const textarea = document.getElementById(targetId);
      if (!textarea) return;

      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const selectedText = textarea.value.substring(start, end) || 'text';
      let replacement = selectedText;

      if (format === 'bold') replacement = `**${selectedText}**`;
      else if (format === 'italic') replacement = `*${selectedText}*`;
      else if (format === 'quote') replacement = `\n> ${selectedText}\n`;
      else if (format === 'list') replacement = `\n- ${selectedText}\n`;
      else if (format === 'heading') replacement = `\n### ${selectedText}\n`;
      else if (format === 'warning') replacement = `\n> [!WARNING]\n> ${selectedText}\n`;

      textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
      textarea.focus();
      textarea.dispatchEvent(new Event('input'));
    });
  });

  // Grammar pronoun helper for smart template interpolation
  function getGrammarPronouns() {
    const checkedRadio = document.querySelector('input[name="pronouns"]:checked');
    const pVal = checkedRadio ? checkedRadio.value : '1';
    if (pVal === '2') {
      return { subject: 'he', Subject: 'He', object: 'him', possessive: 'his', Possessive: 'His', self: 'himself', verbCarries: 'carries' };
    }
    if (pVal === '3') {
      return { subject: 'they', Subject: 'They', object: 'them', possessive: 'their', Possessive: 'Their', self: 'themselves', verbCarries: 'carry' };
    }
    return { subject: 'she', Subject: 'She', object: 'her', possessive: 'her', Possessive: 'Her', self: 'herself', verbCarries: 'carries' };
  }

  // Examine Modal Preview Tab Switcher (Look vs OOC Notes)
  document.querySelectorAll('.examine-tab-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.examine-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.examine-pane').forEach(p => p.classList.remove('active'));
      this.classList.add('active');
      const targetPane = document.getElementById(this.dataset.tab);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // Smart Starter Templates with Name, Species, and Pronoun Interpolation
  const insertIcBtn = document.getElementById('insertIcTemplate');
  if (insertIcBtn && icDescripEl) {
    insertIcBtn.addEventListener('click', function () {
      if (icDescripEl.value.trim() !== '' && !confirm('Replace current IC description with the smart template?')) return;
      const fn = firstNameEl ? firstNameEl.value.trim() : '';
      const name = fn || 'Your character';
      const species = speciesNameEl ? speciesNameEl.value.trim() : '';
      const speciesStr = species ? ` ${species}` : '';
      const g = getGrammarPronouns();

      icDescripEl.value = `You would see ${name} strutting with a confident gait and a warm, playful smile. ${g.Possessive} sleek${speciesStr} fur is immaculate, and ${g.subject} ${g.verbCarries} ${g.self} with an open, friendly demeanor.

### Physical Features
- **Height & Build:** Medium athletic build with graceful posture.
- **Attire:** Wears stylish leather garments with subtle gold trim.
- **Presence & Aura:** Inviting, confident, and observant.`;
      icDescripEl.dispatchEvent(new Event('input'));
    });
  }

  const insertOocBtn = document.getElementById('insertOocTemplate');
  if (insertOocBtn && oocDescripEl) {
    insertOocBtn.addEventListener('click', function () {
      if (oocDescripEl.value.trim() !== '' && !confirm('Replace current OOC notes with the smart template?')) return;
      const fn = firstNameEl ? firstNameEl.value.trim() : '';
      const name = fn || 'this character';
      const g = getGrammarPronouns();

      oocDescripEl.value = `> [!WARNING]
> Please message OOC before initiating heavy predator scenes with ${name}.

### Roleplay Guidelines for ${name}
- **OOC Tone:** Friendly & communicative!
- **Boundaries:** No non-consensual scenes without prior discussion.
- **Preferences:** Enjoys playful interactions and consensual vore stories.`;
      oocDescripEl.dispatchEvent(new Event('input'));
    });
  }

  // Simple Markdown to HTML formatter for live preview
  function parseSimpleMarkdown(text) {
    if (!text || text.trim() === '') return '';

    // 1. Escape HTML special characters first so user input is safe
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\r\n/g, '\n');

    // 2. Extract &gt; [!WARNING] callout box (matches ONLY non-empty &gt; lines immediately following &gt; [!WARNING])
    html = html.replace(/(?:^|\n)&gt;\s*\[!WARNING\]\s*\n((?:&gt;\s*\S+.*(?:\n|$))+)/gi, (match, body) => {
      const content = body.split('\n')
        .map(line => line.replace(/^&gt;\s*/, '').trim())
        .filter(Boolean)
        .join(' ');
      return `\n<div class="warning-box"><i class="fa-solid fa-triangle-exclamation"></i> <strong>WARNING:</strong> ${content}</div>\n`;
    });

    // 3. Strip leftover leading blockquote markers (&gt; ) from non-warning content lines
    html = html.replace(/^&gt;\s?/gm, '');

    // 4. Format Markdown elements into trusted HTML
    html = html
      .replace(/### (.*)/g, '<strong style="color:var(--gold,#d4af37); display:block; margin-top:10px; margin-bottom:4px; font-size:0.9rem;">$1</strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^- (.*)/gm, '<li>$1</li>');

    if (html.includes('<li>')) {
      html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    }
    return html;
  }

  // Update Examine Profile Card
  function updateExamineCard() {
    const fn = firstNameEl ? firstNameEl.value.trim() : '';
    const ln = lastNameEl ? lastNameEl.value.trim() : '';
    const name = (fn || ln) ? `${fn} ${ln}`.trim() : 'Unnamed Character';
    if (previewNameEl) previewNameEl.textContent = name;

    const species = speciesNameEl ? speciesNameEl.value.trim() : '';
    if (previewSpeciesEl) {
      previewSpeciesEl.setAttribute('data-tooltip', 'Species');
      previewSpeciesEl.innerHTML = `<i class="fa-solid fa-paw"></i> ${species || 'Unknown Species'}`;
    }

    const nick = nickNameEl ? nickNameEl.value.trim() : '';
    if (previewAliasEl) {
      previewAliasEl.setAttribute('data-tooltip', 'Nickname');
      if (nick) {
        previewAliasEl.style.display = 'inline-flex';
        previewAliasEl.innerHTML = `<i class="fa-solid fa-tag"></i> "${nick}"`;
      } else {
        previewAliasEl.style.display = 'none';
      }
    }

    const checkedRadio = document.querySelector('input[name="pronouns"]:checked');
    const pVal = checkedRadio ? checkedRadio.value : '1';
    let pText = 'She / Her';
    let pIcon = 'fa-venus';
    if (pVal === '2') { pText = 'He / Him'; pIcon = 'fa-mars'; }
    if (pVal === '3') { pText = 'They / Them'; pIcon = 'fa-genderless'; }

    if (previewPronounsEl) {
      previewPronounsEl.setAttribute('data-tooltip', 'Pronouns');
      previewPronounsEl.innerHTML = `<i class="fa-solid ${pIcon}"></i> ${pText}`;
    }

    if (previewIcEl && icDescripEl) {
      const parsed = parseSimpleMarkdown(icDescripEl.value);
      previewIcEl.innerHTML = parsed || '<em>Your character\'s physical impression will appear here...</em>';
    }

    if (previewOocEl && oocDescripEl) {
      const parsed = parseSimpleMarkdown(oocDescripEl.value);
      previewOocEl.innerHTML = parsed || '<em>OOC guidelines and boundaries will appear here...</em>';
    }
  }

  [firstNameEl, lastNameEl, nickNameEl, speciesNameEl, icDescripEl, oocDescripEl].forEach(input => {
    if (input) {
      input.addEventListener('input', updateExamineCard);
      input.addEventListener('change', updateExamineCard);
    }
  });

  // Initial Examine Card Render
  updateExamineCard();
}

// On DOM Ready
document.addEventListener('DOMContentLoaded', function () {
  initCharacterData();
  setupTabs();
  setupCollapsibles();
  setupFormListeners();
  setupIdentityControls();
  setupAppearanceSubNav();
  setupAboutStudio();

  // Mount AnatomyForge if container exists
  if (typeof AnatomyForge !== 'undefined' && document.getElementById('anatomy-forge-container')) {
    const charList = window.TASTY_TAILS_CHAR_DATA || {};
    const initialData = charList.anatomyData || null;
    AnatomyForge.init('anatomy-forge-container', initialData, window.voreList);
  }

  // Mount VoiceStudioPanel if container exists
  const voiceContainer = document.getElementById('voiceStudioContainer');
  if (voiceContainer) {
    const charList = window.TASTY_TAILS_CHAR_DATA || {};
    const initialVoice = charList.voiceProfile || null;
    window.voiceStudioPanel = new VoiceStudioPanel(voiceContainer, initialVoice);
  }

  const syncAllColorInputs = () => {
    const info = window.localPlayerInfo;
    if (!info) return;
    const setHex = (id, val) => {
      const el = document.getElementById(id);
      if (el && val) el.value = val.replace("0x", "#");
    };
    setHex('primaryHeadHex', info.head?.color);
    setHex('beakHex', info.beak?.color);
    setHex('secondaryHeadHex', info.head?.secondaryColor);
    setHex('accentHeadHex', info.head?.accentColor);
    setHex('hairHex', info.hair?.color);
    setHex('outerEarHex', info.ear?.outerColor);
    setHex('innerEarHex', info.ear?.innerColor);
    setHex('eyesHex', info.eyes?.color);
    setHex('headAccessoriesHex', info.headAccessories?.color);
    setHex('bodyHex', info.body?.color);
    setHex('secondaryBodyHex', info.body?.secondaryColor);
    setHex('accentBodyHex', info.body?.accentColor);
    setHex('handsHex', info.hands?.color);
    setHex('feetHex', info.feet?.color);
    setHex('tailHex', info.tail?.color);
    setHex('secondaryTailHex', info.tail?.secondaryColor);
    setHex('accentTailHex', info.tail?.accentColor);
  };

  // Sync voice profile JSON & hidden color inputs on form submit
  const charForm = document.querySelector('form[action*="character"]');
  if (charForm) {
    charForm.addEventListener('submit', function () {
      if (window.voiceStudioPanel) {
        const voiceInput = document.getElementById('voiceProfileInput');
        if (voiceInput) {
          voiceInput.value = JSON.stringify(window.voiceStudioPanel.getProfileJSON());
        }
      }
      syncAllColorInputs();
    });
  }

  // Initialize Pickr color pickers
  if (window.ColorPickerManager) {
    window.ColorPickerManager.init();
  }

  // Initialize Custom Select Wrappers
  initCustomSelects();
  setTimeout(initCustomSelects, 100);

  // Mount Phaser Scene
  if (typeof Phaser !== 'undefined' && window.CharacterPreviewScene) {
    window.CharacterPreviewScene.gameInstance = new Phaser.Game(window.CharacterPreviewScene.config);
  }

  // Callback when Phaser scene finish initialization
  window.onPhaserReady = function () {
    const info = window.localPlayerInfo;
    const app = window.CharacterCreatorApp;

    // Populate option cascades FIRST so that option tags exist for all saved features
    if (app.populateBodyOptions && info.body?.sprite) app.populateBodyOptions(info.body.sprite);
    if (app.populateHeadOptions && info.head?.sprite) app.populateHeadOptions(info.head.sprite);
    if (app.populateTailOptions && info.tail?.sprite) app.populateTailOptions(info.tail.sprite);

    if (window.TASTY_TAILS_CHAR_DATA === 'new') {
      window.ColorPickerManager?.randomizeColors();
    } else {
      // Sync UI elements for edit character mode
      const u = app.updateSelectAndSyncUI;
      u('bodyShape', info.bodyShape.sprite);
      u('mainBodyType', info.body.sprite);
      u('genitals', info.genitals?.sprite || 'empty');
      u('head', info.head.sprite);
      u('headSecondaryFur', info.head.secondarySprite);
      u('headAccentFur', info.head.accentSprite);
      u('headAccessories', info.headAccessories.sprite);
      u('hair', info.hair.sprite);
      u('outerEar', info.ear.outerSprite);
      u('innerEar', info.ear.innerSprite);
      u('beakSprite', info.beak.sprite);
      u('bodySecondaryFur', info.body.secondarySprite);
      u('bodyAccentFur', info.body.accentSprite);
      u('handsFur', info.hands.sprite);
      u('feetFur', info.feet.sprite);
      u('tail', info.tail.sprite);
      u('tailSecondaryFur', info.tail.secondarySprite);
      u('tailAccentFur', info.tail.accentSprite);

      const p = window.ColorPickerManager?.pickers;
      if (p) {
        if (p.mainPrimary) p.mainPrimary.setColor(info.body.color.replace("0x", "#"));
        if (p.mainSecondary) p.mainSecondary.setColor(info.body.secondaryColor.replace("0x", "#"));
        if (p.mainAccent) p.mainAccent.setColor(info.body.accentColor.replace("0x", "#"));
        if (p.primaryHead) p.primaryHead.setColor(info.head.color.replace("0x", "#"));
        if (p.beak) p.beak.setColor(info.beak.color.replace("0x", "#"));
        if (p.secondaryHead) p.secondaryHead.setColor(info.head.secondaryColor.replace("0x", "#"));
        if (p.accentHead) p.accentHead.setColor(info.head.accentColor.replace("0x", "#"));
        if (p.hair) p.hair.setColor(info.hair.color.replace("0x", "#"));
        if (p.outerEar) p.outerEar.setColor(info.ear.outerColor.replace("0x", "#"));
        if (p.innerEar) p.innerEar.setColor(info.ear.innerColor.replace("0x", "#"));
        if (p.eyes) p.eyes.setColor(info.eyes.color.replace("0x", "#"));
        if (p.body) p.body.setColor(info.body.color.replace("0x", "#"));
        if (p.secondaryBody) p.secondaryBody.setColor(info.body.secondaryColor.replace("0x", "#"));
        if (p.accentBody) p.accentBody.setColor(info.body.accentColor.replace("0x", "#"));
        if (p.hands) p.hands.setColor(info.hands.color.replace("0x", "#"));
        if (p.feet) p.feet.setColor(info.feet.color.replace("0x", "#"));
        if (p.tail) p.tail.setColor(info.tail.color.replace("0x", "#"));
        if (p.secondaryTail) p.secondaryTail.setColor(info.tail.secondaryColor.replace("0x", "#"));
        if (p.accentTail) p.accentTail.setColor(info.tail.accentColor.replace("0x", "#"));
      }

      // Populate hidden inputs with saved character colors
      syncAllColorInputs();
    }

    // Force explicit initial tint pass on Phaser preview scene
    window.CharacterPreviewScene?.characterUpdated(info);

    setTimeout(hideLoadingScreen, 500);
  };
});
