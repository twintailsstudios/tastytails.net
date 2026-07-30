/**
 * @fileoverview src/client/js/game/tutorial.js - In-Game Tutorial & Control Checklist Manager
 *
 * @description
 * Manages the dynamic in-game tutorial checklist dashboard overlay (`#tutorial-widget`),
 * tracks player completion of core gameplay mechanics (pickup, drop, grab, context menu, crafting),
 * persists completion state locally via `localStorage`, and renders a categorized control refresher
 * reference panel inside the options menu (`#tutorial-refresher-list`).
 *
 * Triggered by:
 * - Client boot sequence (`index.js` -> `TutorialManager.init()`)
 * - Global window hook calls (`window.completeTutorialTask('taskId')`)
 * - Custom DOM event dispatching (`document.dispatchEvent(new CustomEvent('tutorialTaskComplete', ...))`)
 * - User interactions on floating widget buttons and options menu toggle switches (`#tutorialToggle`)
 */

/**
 * Master registry of available tutorial tasks categorized by game feature area.
 * @type {Array<{id: string, text: string, category: string}>}
 */
const ALL_TASKS = [
    { id: 'left_pickup', text: 'Left-click a ground item to pick it up with your Left Hand', category: 'Hand Controls' },
    { id: 'right_pickup', text: 'Right-click a ground item to pick it up with your Right Hand', category: 'Hand Controls' },
    { id: 'left_drop', text: 'Left-click the drop button to drop your Left Hand item', category: 'Hand Controls' },
    { id: 'right_drop', text: 'Right-click the drop button to drop your Right Hand item', category: 'Hand Controls' },
    { id: 'grab', text: 'Hold Shift & click another player to Grab/Hold them', category: 'Interaction' },
    { id: 'context_open', text: 'Hold Spacebar & click anywhere to open Context Menu', category: 'Interaction' },
    { id: 'crafting_open', text: 'L-click or R-click a crafting station to open it', category: 'Crafting' },
    { id: 'pocket_deposit', text: 'Double-click an item in pockets to deposit into station', category: 'Crafting' }
];

/**
 * Singleton manager object controlling tutorial state, storage persistence, and UI widget rendering.
 */
export const TutorialManager = {
    /** @type {Array<string>} Array of completed task IDs. */
    completedTasks: [],

    /** @type {boolean} User preference flag indicating if the tutorial widget is hidden. */
    isDismissed: false,

    /** @type {HTMLElement | null} Cached DOM element reference for the floating tutorial widget. */
    widgetEl: null,

    /** @type {number | null} Active timeout timer handle for debouncing widget re-renders. */
    _renderTimer: null,

    /** @type {number | null} Active timeout timer handle for auto-dismissing widget upon full completion. */
    _dismissTimer: null,

    /**
     * Initializes tutorial manager state from browser LocalStorage, creates widget DOM elements,
     * attaches event listeners, performs initial renders, and registers global completion hooks.
     */
    init: function () {
        // 1. Load State safely from LocalStorage with defensive error boundaries
        try {
            const completed = localStorage.getItem('tastytails_tutorial_completed');
            this.completedTasks = completed ? JSON.parse(completed) : [];
        } catch (e) {
            console.warn('[Tutorial] Failed to load completed tasks from localStorage:', e);
            this.completedTasks = [];
        }

        try {
            this.isDismissed = localStorage.getItem('tastytails_tutorial_dismissed') === 'true';
        } catch (e) {
            this.isDismissed = false;
        }

        // 2. Build Checklist HTML Widget
        this.buildWidgetDOM();

        // 3. Setup Listeners
        this.bindOptionsUI();

        // 4. Render Initial View
        this.renderWidget();
        this.renderRefresher();

        // DECOUPLING / COMPATIBILITY: Expose global helper for backward compatibility with external game modules
        window.completeTutorialTask = (taskId) => {
            if (typeof taskId === 'string') {
                this.completeTask(taskId);
            }
        };

        // CustomEvent listener for modern decoupled event dispatching
        document.addEventListener('tutorialTaskComplete', (e) => {
            if (e.detail && e.detail.taskId) {
                this.completeTask(e.detail.taskId);
            }
        });
    },

    /**
     * Clears all pending setTimeout timer handles to prevent race conditions during rapid task completion.
     */
    clearTimers: function () {
        if (this._renderTimer) {
            clearTimeout(this._renderTimer);
            this._renderTimer = null;
        }
        if (this._dismissTimer) {
            clearTimeout(this._dismissTimer);
            this._dismissTimer = null;
        }
    },

    /**
     * Dynamically creates and injects the floating tutorial checklist widget DOM structure into Phaser container or body.
     */
    buildWidgetDOM: function () {
        if (document.getElementById('tutorial-widget')) return;

        this.widgetEl = document.createElement('div');
        this.widgetEl.id = 'tutorial-widget';
        this.widgetEl.className = 'tutorial-widget';
        this.widgetEl.innerHTML = `
            <!-- Structural Details (Rivets) -->
            <div class="rivet tl" style="width: 6px; height: 6px; background: var(--wood-dark); border-radius: 50%; position: absolute; top: 4px; left: 4px; box-shadow: inset 1px 1px 1px black;"></div>
            <div class="rivet tr" style="width: 6px; height: 6px; background: var(--wood-dark); border-radius: 50%; position: absolute; top: 4px; right: 4px; box-shadow: inset 1px 1px 1px black;"></div>
            <div class="rivet bl" style="width: 6px; height: 6px; background: var(--wood-dark); border-radius: 50%; position: absolute; bottom: 4px; left: 4px; box-shadow: inset 1px 1px 1px black;"></div>
            <div class="rivet br" style="width: 6px; height: 6px; background: var(--wood-dark); border-radius: 50%; position: absolute; bottom: 4px; right: 4px; box-shadow: inset 1px 1px 1px black;"></div>

            <div class="tutorial-widget-header">
                <span class="tutorial-widget-title"><i class="fa-solid fa-graduation-cap"></i> Practice Controls</span>
                <span class="tutorial-widget-close" id="tutorial-widget-close-btn">&times;</span>
            </div>
            <ul class="tutorial-task-list" id="tutorial-task-list"></ul>
            <div class="tutorial-widget-footer">
                <input type="checkbox" id="tutorial-dismiss-checkbox">
                <label for="tutorial-dismiss-checkbox">Don't show this again</label>
            </div>
        `;

        const phaserApp = document.getElementById('phaserApp');
        if (phaserApp) {
            phaserApp.appendChild(this.widgetEl);
        } else {
            document.body.appendChild(this.widgetEl);
        }

        // Bind inner widget events
        const closeBtn = document.getElementById('tutorial-widget-close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => this.dismissWidget(true);
        }

        const dismissChk = document.getElementById('tutorial-dismiss-checkbox');
        if (dismissChk) {
            dismissChk.checked = this.isDismissed;
            dismissChk.onchange = (e) => {
                this.dismissWidget(e.target.checked);
            };
        }
    },

    /**
     * Binds document-level event delegation for the options menu toggle switch (`#tutorialToggle`).
     */
    bindOptionsUI: function () {
        // OPTIMIZATION: Document-level event delegation ensures dynamic EJS re-renders retain listener bindings
        document.addEventListener('change', (e) => {
            if (e.target && e.target.id === 'tutorialToggle') {
                const checked = e.target.checked;
                this.dismissWidget(!checked);

                const footerChk = document.getElementById('tutorial-dismiss-checkbox');
                if (footerChk) footerChk.checked = !checked;
            }
        });

        // Initial sync if element is present on boot
        const toggle = document.getElementById('tutorialToggle');
        if (toggle) {
            toggle.checked = !this.isDismissed;
        }
    },

    /**
     * Renders active pending tutorial tasks (up to 3 items) inside the floating widget overlay.
     */
    renderWidget: function () {
        if (!this.widgetEl) return;

        if (this.isDismissed || this.getPendingTasks().length === 0) {
            this.widgetEl.style.display = 'none';
            return;
        }

        // OPTIMIZATION: Display a maximum of 3 pending tasks to keep HUD lightweight
        const activeTasks = this.getPendingTasks().slice(0, 3);
        const listContainer = document.getElementById('tutorial-task-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';
        activeTasks.forEach(task => {
            const li = document.createElement('li');
            li.className = 'tutorial-task-item';
            li.dataset.id = task.id;
            li.innerHTML = `
                <i class="fa-regular fa-square tutorial-task-icon" style="color: var(--wood-light); font-size: 0.95rem;"></i>
                <span class="tutorial-task-text">${task.text}</span>
            `;
            listContainer.appendChild(li);
        });

        this.widgetEl.style.display = 'block';
    },

    /**
     * Renders a categorized reference list of all tutorial tasks into the options menu (`#tutorial-refresher-list`).
     */
    renderRefresher: function () {
        const refresherList = document.getElementById('tutorial-refresher-list');
        if (!refresherList) return;

        refresherList.innerHTML = '';
        
        // Group tasks by category
        const categories = {};
        ALL_TASKS.forEach(task => {
            if (!categories[task.category]) categories[task.category] = [];
            categories[task.category].push(task);
        });

        for (const [catName, tasks] of Object.entries(categories)) {
            const catHeader = document.createElement('div');
            catHeader.className = 'tutorial-refresher-category-header';
            catHeader.innerText = catName;
            refresherList.appendChild(catHeader);

            tasks.forEach(task => {
                const isDone = this.completedTasks.includes(task.id);
                const taskRow = document.createElement('div');
                taskRow.className = `tutorial-refresher-item-row${isDone ? ' completed' : ''}`;

                const icon = isDone 
                    ? '<i class="fa-solid fa-square-check" style="color: green; margin-right: 8px;"></i>' 
                    : '<i class="fa-regular fa-square" style="margin-right: 8px;"></i>';

                taskRow.innerHTML = `
                    ${icon}
                    <span class="tutorial-refresher-item-text${isDone ? ' completed' : ''}">${task.text}</span>
                `;
                refresherList.appendChild(taskRow);
            });
        }
    },

    /**
     * Filters and returns all uncompleted tasks from `ALL_TASKS`.
     * @returns {Array<{id: string, text: string, category: string}>} Array of pending task objects
     */
    getPendingTasks: function () {
        return ALL_TASKS.filter(task => !this.completedTasks.includes(task.id));
    },

    /**
     * Marks a tutorial task as completed by ID, saves progress to LocalStorage, and animates UI checkoff.
     * @param {string} taskId - Unique task identifier
     */
    completeTask: function (taskId) {
        if (this.completedTasks.includes(taskId)) return;

        const task = ALL_TASKS.find(t => t.id === taskId);
        if (!task) return;

        console.log(`[Tutorial] Task Completed: ${taskId}`);

        // Update active array and persist safely
        this.completedTasks.push(taskId);
        try {
            localStorage.setItem('tastytails_tutorial_completed', JSON.stringify(this.completedTasks));
        } catch (e) {
            console.warn('[Tutorial] Failed to write completed tasks to localStorage:', e);
        }

        // Animate checkoff in the checklist if visible
        const taskItem = document.querySelector(`.tutorial-task-item[data-id="${taskId}"]`);
        if (taskItem) {
            const chk = taskItem.querySelector('.tutorial-task-icon');
            const txt = taskItem.querySelector('.tutorial-task-text');
            if (chk) {
                chk.className = 'fa-solid fa-square-check tutorial-task-icon';
                chk.style.color = '#2e7d32'; // RPG green checkmark
                chk.style.transform = 'scale(1.25)';
            }
            if (txt) txt.classList.add('completed');

            // OPTIMIZATION: Debounce widget re-render to prevent overlapping animation cycles
            if (this._renderTimer) clearTimeout(this._renderTimer);
            this._renderTimer = setTimeout(() => {
                this.renderWidget();
                this._renderTimer = null;
            }, 1000);
        } else {
            // Update widget immediately if not currently shown/rendered
            this.renderWidget();
        }

        // Refresh Options Refresher
        this.renderRefresher();

        // If all tasks completed:
        if (this.getPendingTasks().length === 0) {
            if (window.showWorldToast) {
                window.showWorldToast(window.innerWidth / 2, window.innerHeight / 2, "Tutorial Completed!");
            }
            if (this._dismissTimer) clearTimeout(this._dismissTimer);
            this._dismissTimer = setTimeout(() => {
                this.dismissWidget(true);
                this._dismissTimer = null;
            }, 1500);
        }
    },

    /**
     * Updates the tutorial widget's dismissed state and persists preference in LocalStorage.
     * @param {boolean} dismiss - True to hide the widget, false to show it
     */
    dismissWidget: function (dismiss) {
        this.clearTimers();
        this.isDismissed = dismiss;
        try {
            localStorage.setItem('tastytails_tutorial_dismissed', dismiss ? 'true' : 'false');
        } catch (e) {
            console.warn('[Tutorial] Failed to write dismissed status to localStorage:', e);
        }
        
        // Sync EJS Toggle Switch
        const toggle = document.getElementById('tutorialToggle');
        if (toggle) toggle.checked = !dismiss;

        // Render visibility
        this.renderWidget();
    }
};
