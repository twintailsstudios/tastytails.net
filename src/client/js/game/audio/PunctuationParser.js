/**
 * @fileoverview RP Message Punctuation & Dialogue Syntax Parser for TastyTails.net
 * 
 * @description
 * Analyzes incoming Roleplay (RP) chat text strings to extract spoken dialogue,
 * separate physical action text (*...*), and detect punctuation syntax (!, ?, ~, ..., CAPS, comma).
 * Generates structured inflection directives for VoiceSynthEngine.js.
 */

export class PunctuationParser {
    /**
     * Parses an RP message string into structured dialogue clauses with vocal inflection directives.
     * 
     * @param {string} text - Raw input message from chat/RP
     * @returns {{
     *   hasDialogue: boolean,
     *   isPureAction: boolean,
     *   clauses: Array<{
     *     text: string,
     *     punctuation: string,
     *     pitchModifier: number,
     *     volumeModifier: number,
     *     rateModifier: number,
     *     glissando: boolean,
     *     vibrato: boolean,
     *     pauseAfterMs: number
     *   }>
     * }}
     */
    parseMessage(text) {
        if (typeof text !== 'string' || !text.trim()) {
            return {
                hasDialogue: false,
                isPureAction: false,
                clauses: []
            };
        }

        const trimmed = text.trim();

        // 1. Check if message is entirely enclosed in action asterisks (e.g. *gives a hug*)
        const isPureActionPattern = /^\*[^*]+\*$/;
        if (isPureActionPattern.test(trimmed)) {
            return {
                hasDialogue: false,
                isPureAction: true,
                clauses: []
            };
        }

        // 2. Extract dialogue quotes if quotes are present ("...", “...”, «...»)
        const quoteRegex = /["“«]([^"”»]+)["”»]/g;
        const dialogueSegments = [];
        let match;

        while ((match = quoteRegex.exec(trimmed)) !== null) {
            if (match[1] && match[1].trim()) {
                dialogueSegments.push(match[1].trim());
            }
        }

        // If no quotation marks were found, text is not spoken dialogue
        if (dialogueSegments.length === 0) {
            return {
                hasDialogue: false,
                isPureAction: false,
                clauses: []
            };
        }

        // 3. Process each dialogue segment into individual clauses based on sentence punctuation
        const clauses = [];
        for (const segment of dialogueSegments) {
            const parsedClauses = this._splitSegmentIntoClauses(segment);
            clauses.push(...parsedClauses);
        }

        return {
            hasDialogue: clauses.length > 0,
            isPureAction: false,
            clauses
        };
    }

    /**
     * Splits a dialogue segment into clauses and evaluates punctuation inflections for each.
     * 
     * @private
     * @param {string} segment 
     * @returns {Array<Object>}
     */
    _splitSegmentIntoClauses(segment) {
        // Split by major punctuation boundaries while retaining the boundary punctuation
        const clauseRegex = /([^.!?~,]+(?:(?:\.\.\.)|[.!?~,])?)/g;
        const rawMatches = segment.match(clauseRegex) || [segment];

        const result = [];

        for (const rawClause of rawMatches) {
            const trimmedClause = rawClause.trim();
            if (!trimmedClause) continue;

            const inflection = this._evaluateClauseInflection(trimmedClause);
            result.push(inflection);
        }

        return result;
    }

    /**
     * Tokenizes a text string into Animalese phoneme keys ('a'-'z', 'ch', 'sh', 'th', 'ph', 'wh', 'dot').
     * 
     * @param {string} text 
     * @returns {Array<string>} Array of phoneme keys
     */
    /**
     * Tokenizes a text string into Animalese phoneme keys ('a'-'z', 'ch', 'sh', 'th', 'ph', 'wh', 'dot').
     * Expands compound letters ('x', 'q', 'w') and filters silent trailing 'e's.
     * 
     * @param {string} text 
     * @returns {Array<string>} Array of phoneme keys
     */
    tokenizePhonemes(text) {
        if (typeof text !== 'string' || !text.trim()) return [];

        const words = text.toLowerCase().split(/\s+/).filter(Boolean);
        const digraphs = ['ch', 'sh', 'th', 'ph', 'wh'];
        const fallbackVowels = ['a', 'e', 'i', 'o', 'u'];
        const tokens = [];

        for (const word of words) {
            // Filter trailing silent 'e' on words with 3+ characters (e.g. "make" -> "mak")
            let processedWord = word;
            if (word.length >= 3 && word.endsWith('e') && !word.endsWith('ee') && !word.endsWith('the')) {
                processedWord = word.slice(0, -1);
            }

            let i = 0;
            while (i < processedWord.length) {
                const char = processedWord[i];

                // Check 2-letter digraphs first
                if (i < processedWord.length - 1) {
                    const pair = processedWord.substr(i, 2);
                    if (digraphs.includes(pair)) {
                        tokens.push(pair);
                        i += 2;
                        continue;
                    }
                }

                // Check compound phonetics ('x' -> 'k','s'; 'q' -> 'k','w'; 'w' -> 'u','a')
                if (char === 'x') {
                    tokens.push('k', 's');
                    i++;
                    continue;
                }
                if (char === 'q') {
                    tokens.push('k', 'w');
                    i++;
                    continue;
                }
                if (char === 'w') {
                    tokens.push('u', 'a');
                    i++;
                    continue;
                }

                // Check single alphabetic letters
                if (/[a-z]/.test(char)) {
                    tokens.push(char);
                    i++;
                    continue;
                }

                // Period / dot
                if (char === '.') {
                    tokens.push('dot');
                    i++;
                    continue;
                }

                // Numbers & other non-alphabetic symbols -> map to fallback vowels
                if (/\d/.test(char)) {
                    const idx = char.charCodeAt(0) % fallbackVowels.length;
                    tokens.push(fallbackVowels[idx]);
                    i++;
                    continue;
                }

                // Skip unknown symbols
                i++;
            }
        }

        return tokens;
    }

    /**
     * Tokenizes a text string into Consonant-Vowel (CV) syllable objects for smooth speech binding.
     * 
     * @param {string} text 
     * @returns {Array<{ consonant: string|null, vowel: string, trailingConsonant: string|null }>}
     */
    tokenizeCVSyllables(text) {
        if (typeof text !== 'string' || !text.trim()) return [];

        const tokens = this.tokenizePhonemes(text);
        if (tokens.length === 0) return [];

        const vowels = ['a', 'e', 'i', 'o', 'u', 'y'];
        const syllables = [];
        let i = 0;

        while (i < tokens.length) {
            let token = tokens[i];

            if (token === 'dot') {
                syllables.push({ consonant: null, vowel: 'o', trailingConsonant: 't' });
                i++;
                continue;
            }

            const isVowel = vowels.includes(token);

            if (!isVowel) {
                const consonant = token;
                i++;
                let vowel = 'a';
                if (i < tokens.length && vowels.includes(tokens[i])) {
                    vowel = tokens[i];
                    i++;
                }
                let trailingConsonant = null;
                if (i < tokens.length && !vowels.includes(tokens[i]) && tokens[i] !== 'dot') {
                    if (i + 1 >= tokens.length || !vowels.includes(tokens[i + 1])) {
                        trailingConsonant = tokens[i];
                        i++;
                    }
                }
                syllables.push({ consonant, vowel, trailingConsonant });
            } else {
                const vowel = token;
                i++;
                let trailingConsonant = null;
                if (i < tokens.length && !vowels.includes(tokens[i]) && tokens[i] !== 'dot') {
                    if (i + 1 >= tokens.length || !vowels.includes(tokens[i + 1])) {
                        trailingConsonant = tokens[i];
                        i++;
                    }
                }
                syllables.push({ consonant: null, vowel, trailingConsonant });
            }
        }

        return syllables;
    }

    /**
     * Evaluates a single clause string for punctuation markers and uppercase emphasis.
     * 
     * @private
     * @param {string} clauseText 
     * @returns {Object} Inflection directive object
     */
    _evaluateClauseInflection(clauseText) {
        let pitchModifier = 1.0;
        let volumeModifier = 1.0;
        let rateModifier = 1.0;
        let glissando = false;
        let vibrato = false;
        let pauseAfterMs = 0;
        let punctuation = 'normal';

        const phonemeTokens = this.tokenizePhonemes(clauseText);
        const cvSyllables = this.tokenizeCVSyllables(clauseText);

        // Check for ALL CAPS (more than 3 alpha chars and all uppercase)
        const alphaChars = clauseText.replace(/[^a-zA-Z]/g, '');
        const isAllCaps = alphaChars.length >= 3 && alphaChars === alphaChars.toUpperCase();

        if (isAllCaps) {
            volumeModifier *= 1.35;
            pitchModifier *= 1.15;
            rateModifier *= 1.10;
        }

        // Check for specific punctuation endings
        if (clauseText.endsWith('...')) {
            punctuation = 'ellipsis';
            pitchModifier *= 0.85;
            rateModifier *= 0.70;
            pauseAfterMs = 120;
        } else if (clauseText.endsWith('!')) {
            punctuation = 'exclamation';
            pitchModifier *= 1.25;
            volumeModifier *= 1.30;
            rateModifier *= 1.15;
        } else if (clauseText.endsWith('?')) {
            punctuation = 'question';
            glissando = true;
            pitchModifier *= 1.10;
        } else if (clauseText.endsWith('~')) {
            punctuation = 'tilde';
            vibrato = true;
            rateModifier *= 0.90;
            pauseAfterMs = 100;
        } else if (clauseText.endsWith(',')) {
            punctuation = 'comma';
            pauseAfterMs = 60;
        }

        return {
            text: clauseText,
            punctuation,
            pitchModifier: Number(pitchModifier.toFixed(3)),
            volumeModifier: Number(volumeModifier.toFixed(3)),
            rateModifier: Number(rateModifier.toFixed(3)),
            glissando,
            vibrato,
            pauseAfterMs,
            phonemeTokens,
            cvSyllables
        };
    }
}

if (typeof window !== 'undefined') {
    window.PunctuationParser = PunctuationParser;
}
