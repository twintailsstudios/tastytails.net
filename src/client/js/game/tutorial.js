/**
 * tutorial.js
 * Controls the dynamic in-game tutorial checklist dashboard,
 * handles task completions, options menu bindings, and refresher lists.
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

export const TutorialManager = {
    completedTasks: [],
    isDismissed: false,
    widgetEl: null,

    init: function () {
        // 1. Load State from LocalStorage
        try {
            const completed = localStorage.getItem('tastytails_tutorial_completed');
            this.completedTasks = completed ? JSON.parse(completed) : [];
        } catch (e) {
            this.completedTasks = [];
        }

        this.isDismissed = localStorage.getItem('tastytails_tutorial_dismissed') === 'true';

        // 2. Build Checklist HTML Widget
        this.buildWidgetDOM();

        // 3. Setup Listeners
        this.bindOptionsUI();

        // 4. Render Initial View
        this.renderWidget();
        this.renderRefresher();

        // Expose helper globally
        window.completeTutorialTask = (taskId) => this.completeTask(taskId);
    },

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

    bindOptionsUI: function () {
        const toggle = document.getElementById('tutorialToggle');
        if (toggle) {
            // Checked if NOT dismissed
            toggle.checked = !this.isDismissed;
            toggle.onchange = (e) => {
                const checked = e.target.checked;
                this.dismissWidget(!checked);
                
                // Keep the widget footer checkbox in sync
                const footerChk = document.getElementById('tutorial-dismiss-checkbox');
                if (footerChk) footerChk.checked = !checked;
            };
        }
    },

    renderWidget: function () {
        if (!this.widgetEl) return;

        if (this.isDismissed || this.getPendingTasks().length === 0) {
            this.widgetEl.style.display = 'none';
            return;
        }

        // Get max 3 active pending tasks
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
            catHeader.style.fontWeight = 'bold';
            catHeader.style.marginTop = '10px';
            catHeader.style.marginBottom = '4px';
            catHeader.style.color = 'var(--wood-light)';
            catHeader.innerText = catName;
            refresherList.appendChild(catHeader);

            tasks.forEach(task => {
                const isDone = this.completedTasks.includes(task.id);
                const taskRow = document.createElement('div');
                taskRow.style.display = 'flex';
                taskRow.style.alignItems = 'center';
                taskRow.style.marginBottom = '4px';
                taskRow.style.paddingLeft = '5px';
                taskRow.style.opacity = isDone ? '0.7' : '1';

                const icon = isDone 
                    ? '<i class="fa-solid fa-square-check" style="color: green; margin-right: 8px;"></i>' 
                    : '<i class="fa-regular fa-square" style="margin-right: 8px;"></i>';

                taskRow.innerHTML = `
                    ${icon}
                    <span style="${isDone ? 'text-decoration: line-through; color: #555;' : ''}">${task.text}</span>
                `;
                refresherList.appendChild(taskRow);
            });
        }
    },

    getPendingTasks: function () {
        return ALL_TASKS.filter(task => !this.completedTasks.includes(task.id));
    },

    completeTask: function (taskId) {
        if (this.completedTasks.includes(taskId)) return;

        const task = ALL_TASKS.find(t => t.id === taskId);
        if (!task) return;

        console.log(`[Tutorial] Task Completed: ${taskId}`);

        // Update active array
        this.completedTasks.push(taskId);
        localStorage.setItem('tastytails_tutorial_completed', JSON.stringify(this.completedTasks));

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

            // Brief fadeout transition delay
            setTimeout(() => {
                this.renderWidget();
            }, 1000);
        } else {
            // Update widget immediately if not currently shown/rendered
            this.renderWidget();
        }

        // Refresh Options Refresher
        this.renderRefresher();

        // If that was the last task:
        if (this.getPendingTasks().length === 0) {
            if (window.showWorldToast) {
                window.showWorldToast(window.innerWidth / 2, window.innerHeight / 2, "Tutorial Completed!");
            }
            setTimeout(() => {
                this.dismissWidget(true);
            }, 1500);
        }
    },

    dismissWidget: function (dismiss) {
        this.isDismissed = dismiss;
        localStorage.setItem('tastytails_tutorial_dismissed', dismiss ? 'true' : 'false');
        
        // Sync EJS Toggle Switch
        const toggle = document.getElementById('tutorialToggle');
        if (toggle) toggle.checked = !dismiss;

        // Render visibility
        this.renderWidget();
    }
};
