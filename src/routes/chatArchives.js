const router = require('express').Router();
const verify = require('./verifyToken');
const Chats = require('../model/Chat');
const User = require('../model/User');
const log = require('../logger');
const mongoose = require('mongoose');

const ChatArchive = require('../model/ChatArchive');

// Helper to escape regex special characters
function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// GET /api/chat-archives/my-characters
// Fetch the list of characters belonging to the logged-in user
router.get('/my-characters', verify, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Return characters array (contains _id, firstName, lastName, etc.)
        log.debug(`[ChatArchive] Fetching characters for UserID: ${req.user._id}. Found ${user.characters.length} characters.`);
        res.json(user.characters);
    } catch (err) {
        log.error('Error in /api/chat-archives/my-characters', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// GET /api/chat-archives/zones
// Fetch list of available map zones
router.get('/zones', verify, (req, res) => {
    log.debug('[ChatArchive] GET /zones called');
    try {
        const serverGame = require('../server-loop');

        if (typeof serverGame.getAvailableZones !== 'function') {
            log.error('[ChatArchive] getAvailableZones is NOT a function');
            // Attempt to debug exports
            log.error('serverGame exports keys:', Object.keys(serverGame));
            return res.status(500).json({ error: 'Server initialization error' });
        }

        const zones = serverGame.getAvailableZones();
        log.debug(`[ChatArchive] Sending zones: ${zones.join(', ')}`);
        res.json(zones);
    } catch (err) {
        log.error('Error in /api/chat-archives/zones', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/chat-archives/search
router.post('/search', verify, async (req, res) => {
    try {
        const { characterId, filters, page = 1, limit = 50 } = req.body;
        const skip = (page - 1) * limit;

        // Security Check: Ensure the user actually owns this character
        // req.user is populated by 'verify' middleware (contains _id)
        const user = await User.findOne({ _id: req.user._id, 'characters._id': characterId });
        if (!user) {
            return res.status(403).json({ error: 'Access denied: Character not found or not owned by user.' });
        }

        // --- Build Query ---
        log.debug(`[ChatArchive] Search Request for CharID: ${characterId}`);
        log.debug(`[ChatArchive] Filters: ${JSON.stringify(filters)}`);

        const query = {
            $and: [
                { excludedPlayers: { $ne: characterId } },
                {
                    $or: [
                        { 'identifier.character': characterId }, // Messages I sent
                        { visibleTo: characterId }               // Messages explicitly visible to me (Local, Private, etc.)
                        // Note: We intentionally exclude { visibleTo: { $size: 0 } } (Global Public)
                        // because we cannot track if the user was actually online/present to see them.
                        // This fixes the issue of seeing global chats from times when the character wasn't logged in.
                    ]
                }
            ]
        };

        // 1. Date Range
        if (filters.startDate || filters.endDate) {
            query.createdAt = {};
            if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
            if (filters.endDate) {
                // Set to End of Day
                const end = new Date(filters.endDate);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }

        // 2. Content Search (Text)
        if (filters.content) {
            const regex = new RegExp(escapeRegex(filters.content), 'gi');
            query['message.content'] = regex;
        }



        // 4. Partner Gender/Species - This is HARD because chat messages don't store sender stats.
        // We would need to look up players. For now, we will skip this or implement a slower lookup.
        // Strategy: Find all Character IDs matching the species/gender, then filter chats by those identifier.character
        if (filters.partnerSpecies || filters.partnerGender) {
            // This is expensive. We might need to do a two-step lookup.
            // Step A: Find users/characters matching the description
            // For now, let's implement basic text search if they typed it, or note limitation.
            // If they want to search by Species, we can try to join, but Mongodb aggregations are complex here.
            // *Optimization*: For this MVP, we might defer deep species search or do a pre-lookup.

            // Let's do a pre-lookup if simpler.
            /*
            const charQuery = {};
            if (filters.partnerSpecies) charQuery['characters.speciesName'] = new RegExp(escapeRegex(filters.partnerSpecies), 'gi');
            // ... find matching characters ...
            // query['identifier.character'] = { $in: matchingCharIds };
            */
        }

        // 5. Location
        if (filters.location) {
            // Search BOTH title and zone? 
            // User requested: "uses this new `zone` property"
            // Let's assume the filter value IS the zone name (since we populate dropdown from zones).
            // But legacy messages might only have title.
            // Let's search OR condition: title match OR zone match.
            // Actually, if dropdown is populated by zones, we search zone.
            // But we can fallback to title if needed.
            // Let's just search zone field if it exists, and title as backup?

            query.$or = [
                { 'gameState.location_context.zone': new RegExp(escapeRegex(filters.location), 'gi') },
                { 'gameState.location_context.title': new RegExp(escapeRegex(filters.location), 'gi') }
            ];

            // Wait, we already have an $or in the main query for visibility.
            // We can't add another top-level $or easily without wrapping in an $and.
            // The existing query structure is: { $and: [..., { $or: [...] }] }
            // So we can push another object to the $and array.

            query.$and.push({
                $or: [
                    { 'gameState.location_context.zone': new RegExp(escapeRegex(filters.location), 'gi') },
                    { 'gameState.location_context.title': new RegExp(escapeRegex(filters.location), 'gi') }
                ]
            });
        }

        // 6. Keywords/Context filters (Vore Types, etc.)
        // Since we don't store them as tags, we adhere to the plan: Text Search helper.
        const specialKeywords = [];
        if (filters.voreType) specialKeywords.push(filters.voreType);
        if (filters.size) specialKeywords.push(filters.size); // 'Micro', 'Macro'

        if (specialKeywords.length > 0) {
            // Add to the message content regex or create a new $and condition
            const keywordRegex = new RegExp(specialKeywords.map(escapeRegex).join('|'), 'gi');
            // If we already have a content query, we need to AND it
            if (query['message.content']) {
                // Convert to $and if not already
                // query.$and.push({ 'message.content': keywordRegex });
                // Actually existing logic handles 'message.content' as property.
                // We can use $and for multiple content checks
                query.$and.push({ 'message.content': keywordRegex });
            } else {
                query['message.content'] = keywordRegex;
            }
        }


        // Allow searching by "Found Message" ID? matching the prompt
        // "browse the full message history accessible to their character starting from a particular 'Found message'."
        // This suggests we might just want to find *around* a message.
        // If a specific message ID is requested to "jump to", handled by frontend "load around"?
        // For now, standard pagination.

        log.debug(`[ChatArchive] MongoDB Query: ${JSON.stringify(query)}`);
        const total = await Chats.countDocuments(query);
        const sortOrder = filters.sort === 'asc' ? 1 : -1;

        const messages = await Chats.find(query)
            .sort({ createdAt: sortOrder })
            .skip(skip)
            .limit(parseInt(limit))
            .lean(); // Faster

        res.json({
            data: messages, // Return in requested order
            // "Browse full message history" implies standard chat view. Let's return as is (Newest First in find, reversed for display usually).
            // Actually, for a *search result list*, newest first is often better.
            // For a *chat history view*, oldest first is better.
            // Let's return them in the order found (Newest First) and let frontend reverse if needed.
            // Wait, existing chat.js reverses them.

            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });

    } catch (err) {
        log.error('Error in /api/chat-archives/search', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/chat-archives/save
// Save a list of message IDs as a "Favorited RP"
router.post('/save', verify, async (req, res) => {
    try {
        const { characterId, messageIds, title, rangeMode, rangeStartId, rangeEndId, filters } = req.body;

        // Common validation
        if (!characterId || !title) {
            return res.status(400).json({ error: 'Missing required fields.' });
        }

        const user = await User.findOne({ _id: req.user._id, 'characters._id': characterId });
        if (!user) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        let idsToSave = [];

        if (rangeMode) {
            // Range Mode Logic
            if (!rangeStartId || !rangeEndId) {
                return res.status(400).json({ error: 'Range Start and End IDs required.' });
            }

            // Fetch start/end messages to get timestamps
            const rangeMsgs = await Chats.find({ _id: { $in: [rangeStartId, rangeEndId] } });
            if (rangeMsgs.length !== 2) {
                // If they are the same message, length is 1. If one missing, length 1.
                if (rangeStartId === rangeEndId && rangeMsgs.length === 1) {
                    // Single message range, fine.
                } else {
                    return res.status(404).json({ error: 'Start or End message not found.' });
                }
            }

            // Sort by time
            rangeMsgs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            const startTime = rangeMsgs[0].createdAt;
            const endTime = rangeMsgs[rangeMsgs.length - 1].createdAt;

            // Build Query (Similar to Search but simplified/adapted)
            const query = {
                $and: [
                    { excludedPlayers: { $ne: characterId } },
                    {
                        $or: [
                            { 'identifier.character': characterId },
                            { visibleTo: characterId }
                        ]
                    },
                    { createdAt: { $gte: startTime, $lte: endTime } }
                ]
            };

            // Apply Filters provided in request
            if (filters) {
                // Content
                if (filters.content) {
                    query['message.content'] = new RegExp(escapeRegex(filters.content), 'gi');
                }

                // Partners (Sender Name)
                if (filters.includedPartners && filters.includedPartners.length > 0) {
                    query.name = { $in: filters.includedPartners };
                }

                // Excluded Partners (Sender Name)
                if (filters.excludedPartners && filters.excludedPartners.length > 0) {
                    // If name query exists, we merge, but $in and $nin can coexist
                    if (query.name) {
                        query.name.$nin = filters.excludedPartners;
                    } else {
                        query.name = { $nin: filters.excludedPartners };
                    }
                }

                // Location
                if (filters.location) {
                    query.$and.push({
                        $or: [
                            { 'gameState.location_context.zone': new RegExp(escapeRegex(filters.location), 'gi') },
                            { 'gameState.location_context.title': new RegExp(escapeRegex(filters.location), 'gi') }
                        ]
                    });
                }
            }

            // Excluded Message IDs (Manual deselection)
            if (req.body.excludedMessageIds && Array.isArray(req.body.excludedMessageIds) && req.body.excludedMessageIds.length > 0) {
                query._id = { $nin: req.body.excludedMessageIds };
            }

            const messages = await Chats.find(query).select('_id').lean();
            idsToSave = messages.map(m => m._id);

        } else {
            // Normal Mode
            idsToSave = messageIds;
            if (!idsToSave || !Array.isArray(idsToSave) || idsToSave.length === 0) {
                return res.status(400).json({ error: 'No messages selected.' });
            }
        }

        // Add to ChatArchive collection
        const archive = new ChatArchive({
            userId: req.user._id,
            characterId: characterId,
            title: title,
            messageIds: idsToSave,
            savedAt: new Date()
        });

        await archive.save();

        res.json({ success: true, message: `Log saved successfully with ${idsToSave.length} messages.` });

    } catch (err) {
        log.error('Error in /api/chat-archives/save', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
