/**
 * Focus Mode Screen
 * 
 * Features:
 * - Distraction-free deep work environment
 * - Task selection (or focused commitment from board)
 * - Start, pause, resume, stop controls
 * - Large digital elapsed/remaining time display with circular SVG progress ring
 * - Optional flow session notes
 * - Architectural Guarantee: Does not automatically mark tasks completed when timer ends;
 *   prompts user with explicit choice to complete or keep in progress.
 * - Clean return to task board
 */

import { tasksService } from '../services/tasks-service.js';
import { toastManager } from '../components/toast.js';
import { formatDuration, formatPriority } from '../utils/formatters.js';
import { router } from '../services/router.js';

class FocusModeController {
  constructor() {
    this.selectedTaskId = null;
    this.selectedTask = null;
    this.tasks = [];
    this.isLoading = false;

    // Timer State
    this.timerMode = 'pomodoro'; // 'pomodoro' | 'stopwatch'
    this.isRunning = false;
    this.isPaused = false;
    this.elapsedSeconds = 0;
    this.targetSeconds = 25 * 60; // 25 minutes default
    this.timerInterval = null;

    // Notes
    this.sessionNotes = '';
    this.showCompletionPrompt = false;

    this._container = null;
  }

  setContainer(container) {
    this._container = container;
  }

  async loadTasks(initialTaskId = null) {
    this.isLoading = true;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const allTasks = await tasksService.listTasks({ scheduled_date: todayStr });
      this.tasks = allTasks.filter((t) => t.status !== 'cancelled' && t.status !== 'completed');

      if (initialTaskId) {
        this.selectedTaskId = initialTaskId;
      } else if (!this.selectedTaskId && this.tasks.length > 0) {
        this.selectedTaskId = this.tasks[0].id;
      }

      this.updateSelectedTask();
    } catch (err) {
      console.warn('[FocusMode] Error loading tasks:', err);
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  updateSelectedTask() {
    if (this.selectedTaskId) {
      this.selectedTask = this.tasks.find((t) => t.id === this.selectedTaskId) || null;
      if (this.selectedTask && this.timerMode === 'pomodoro') {
        const mins = this.selectedTask.estimated_duration || 25;
        this.targetSeconds = mins * 60;
      }
    } else {
      this.selectedTask = null;
    }
  }

  startTimer() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;
    this.showCompletionPrompt = false;

    this.timerInterval = setInterval(() => {
      this.elapsedSeconds++;

      if (this.timerMode === 'pomodoro' && this.elapsedSeconds >= this.targetSeconds) {
        this.pauseTimer();
        this.showCompletionPrompt = true;
        toastManager.show('Focus interval finished! Take a mindful breath.', 'info');
      }

      this.updateTimerDisplay();
    }, 1000);

    this.render();
  }

  pauseTimer() {
    if (!this.isRunning) return;
    clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.isRunning = false;
    this.isPaused = true;
    this.render();
  }

  resumeTimer() {
    this.startTimer();
  }

  stopTimer() {
    clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.isRunning = false;
    this.isPaused = false;
    this.showCompletionPrompt = true;
    this.render();
  }

  resetTimer() {
    clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.isRunning = false;
    this.isPaused = false;
    this.elapsedSeconds = 0;
    this.showCompletionPrompt = false;
    this.render();
  }

  async completeTask() {
    if (!this.selectedTask) return;
    try {
      await tasksService.updateTask(this.selectedTask.id, {
        status: 'completed',
        is_completed: true,
      });
      toastManager.show(`Task "${this.selectedTask.title}" marked as completed!`, 'success');
      this.resetTimer();
      await this.loadTasks();
    } catch (err) {
      toastManager.show(`Error completing task: ${err.message}`, 'error');
    }
  }

  keepTaskInProgress() {
    this.showCompletionPrompt = false;
    toastManager.show('Task kept in progress for subsequent focus blocks.', 'info');
    this.resetTimer();
  }

  render() {
    if (!this._container) return;
    const mount = this._container.querySelector('#focus-page-root');
    if (!mount) return;
    mount.innerHTML = this.renderContent();
    this.bindEvents();
  }

  updateTimerDisplay() {
    if (!this._container) return;
    const timeEl = this._container.querySelector('#focus-time-display');
    const ringEl = this._container.querySelector('#focus-ring-progress');
    if (timeEl) {
      timeEl.textContent = this.formatTime();
    }
    if (ringEl) {
      const radius = 110;
      const circumference = 2 * Math.PI * radius;
      const progress = this.timerMode === 'pomodoro'
        ? Math.min(1, this.elapsedSeconds / (this.targetSeconds || 1))
        : (this.elapsedSeconds % 3600) / 3600;
      const offset = circumference - progress * circumference;
      ringEl.style.strokeDashoffset = offset;
    }
  }

  formatTime() {
    let displaySeconds = this.elapsedSeconds;
    if (this.timerMode === 'pomodoro') {
      displaySeconds = Math.max(0, this.targetSeconds - this.elapsedSeconds);
    }

    const mins = Math.floor(displaySeconds / 60);
    const secs = displaySeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  renderContent() {
    const timeStr = this.formatTime();
    const radius = 110;
    const circumference = 2 * Math.PI * radius;
    const progress = this.timerMode === 'pomodoro'
      ? Math.min(1, this.elapsedSeconds / (this.targetSeconds || 1))
      : (this.elapsedSeconds % 3600) / 3600;
    const strokeDashoffset = circumference - progress * circumference;

    return `
      <div class="page-container" style="max-width: 840px; margin: 0 auto;">
        
        <!-- Top Navigation Bar -->
        <div class="flex justify-between items-center" style="margin-bottom: var(--space-6);">
          <button id="focus-back-btn" class="btn btn-outline btn-sm">
            ← Back to Tasks
          </button>
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-muted">Focus Mode</span>
            <div class="flex gap-1" style="background: var(--color-surface-hover); padding: 2px; border-radius: var(--radius-md); border: 1px solid var(--color-border-subtle);">
              <button class="btn btn-sm ${this.timerMode === 'pomodoro' ? 'btn-primary' : 'btn-ghost'} mode-toggle-btn" data-mode="pomodoro" ${this.isRunning ? 'disabled' : ''}>
                Countdown
              </button>
              <button class="btn btn-sm ${this.timerMode === 'stopwatch' ? 'btn-primary' : 'btn-ghost'} mode-toggle-btn" data-mode="stopwatch" ${this.isRunning ? 'disabled' : ''}>
                Stopwatch
              </button>
            </div>
          </div>
        </div>

        <!-- Task Selector & Details Banner -->
        <div class="card" style="margin-bottom: var(--space-6); background: var(--color-surface-card);">
          <div class="flex justify-between items-center" style="flex-wrap: wrap; gap: var(--space-3); margin-bottom: var(--space-3);">
            <div class="flex items-center gap-2">
              <span style="font-size: 18px;">🎯</span>
              <h3 style="font-size: var(--font-size-md); font-weight: 700; margin: 0;">Active Focus Target</h3>
            </div>
            
            ${this.tasks.length > 0 ? `
              <div class="flex items-center gap-2">
                <label for="focus-task-select" class="text-xs text-muted">Switch Task:</label>
                <select id="focus-task-select" class="form-select" style="font-size: 13px; padding: 0.25rem 0.5rem; max-width: 260px;" ${this.isRunning ? 'disabled' : ''}>
                  ${this.tasks.map((t) => `
                    <option value="${t.id}" ${t.id === this.selectedTaskId ? 'selected' : ''}>
                      ${t.title} (${t.estimated_duration || 30}m)
                    </option>
                  `).join('')}
                </select>
              </div>
            ` : ''}
          </div>

          ${this.selectedTask ? `
            <div style="background: var(--color-surface-hover); border-radius: var(--radius-md); padding: var(--space-4); border: 1px solid var(--color-border-subtle);">
              <div class="flex justify-between items-start gap-4">
                <div>
                  <h2 style="font-size: var(--font-size-lg); font-weight: 700; margin: 0;">
                    ${this.selectedTask.title}
                  </h2>
                  ${this.selectedTask.description ? `
                    <p class="text-xs text-secondary" style="margin-top: 4px; line-height: 1.4;">
                      ${this.selectedTask.description}
                    </p>
                  ` : ''}
                  <div class="flex items-center gap-2 text-xs text-muted" style="margin-top: var(--space-2);">
                    <span>${this.selectedTask.estimated_duration || 30} mins planned</span>
                    ${this.selectedTask.goal_title ? `<span>•</span><span>${this.selectedTask.goal_title}</span>` : ''}
                  </div>
                </div>
                <span class="badge ${this.selectedTask.priority === 'urgent' || this.selectedTask.priority === 'high' ? 'badge-danger' : 'badge-neutral'}">
                  ${formatPriority(this.selectedTask.priority)}
                </span>
              </div>
            </div>
          ` : `
            <div class="empty-state" style="padding: var(--space-4) 0;">
              <p class="text-sm text-muted">No pending tasks for today. You can still use focus mode as an open stopwatch.</p>
            </div>
          `}
        </div>

        <!-- Timer Visual Ring & Controls -->
        <div class="card flex flex-col items-center justify-center text-center" style="padding: var(--space-8) var(--space-4); margin-bottom: var(--space-6);">
          
          <!-- SVG Progress Ring Container -->
          <div style="position: relative; width: 260px; height: 260px; display: flex; align-items: center; justify-content: center;">
            <svg width="260" height="260" style="transform: rotate(-90deg);">
              <!-- Background Ring -->
              <circle
                cx="130"
                cy="130"
                r="${radius}"
                stroke="var(--color-surface-hover)"
                stroke-width="12"
                fill="transparent"
              />
              <!-- Progress Ring -->
              <circle
                id="focus-ring-progress"
                cx="130"
                cy="130"
                r="${radius}"
                stroke="var(--color-primary-600)"
                stroke-width="12"
                stroke-linecap="round"
                fill="transparent"
                style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${strokeDashoffset}; transition: stroke-dashoffset 0.5s ease;"
              />
            </svg>

            <!-- Centered Digital Time Display -->
            <div style="position: absolute; display: flex; flex-direction: column; align-items: center;">
              <span id="focus-time-display" style="font-family: var(--font-mono); font-size: 48px; font-weight: 800; color: var(--color-text-primary); letter-spacing: -0.02em;">
                ${timeStr}
              </span>
              <span class="text-xs text-muted" style="text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; margin-top: 2px;">
                ${this.isRunning ? 'Focus Flow' : this.isPaused ? 'Paused' : 'Ready'}
              </span>
            </div>
          </div>

          <!-- Primary Control Buttons -->
          <div class="flex items-center gap-3" style="margin-top: var(--space-6);">
            ${!this.isRunning && !this.isPaused ? `
              <button id="focus-start-btn" class="btn btn-primary" style="padding: 0.6rem 1.6rem; font-size: 15px;">
                ▶ Start Focus
              </button>
            ` : ''}

            ${this.isRunning ? `
              <button id="focus-pause-btn" class="btn btn-outline" style="padding: 0.6rem 1.4rem; font-size: 15px;">
                ⏸ Pause
              </button>
              <button id="focus-stop-btn" class="btn btn-danger" style="padding: 0.6rem 1.4rem; font-size: 15px;">
                ⏹ Stop Session
              </button>
            ` : ''}

            ${this.isPaused ? `
              <button id="focus-resume-btn" class="btn btn-primary" style="padding: 0.6rem 1.4rem; font-size: 15px;">
                ▶ Resume
              </button>
              <button id="focus-reset-btn" class="btn btn-ghost" style="padding: 0.6rem 1.2rem; font-size: 15px;">
                ⟳ Reset
              </button>
            ` : ''}
          </div>

          <!-- Completion Choice Prompt (Non-destructive, never auto-completes) -->
          ${this.showCompletionPrompt && this.selectedTask ? `
            <div class="card" style="margin-top: var(--space-6); background: var(--color-surface-hover); border: 2px solid var(--color-primary-600); max-width: 520px; width: 100%; text-align: left;">
              <div class="flex items-start gap-3">
                <span style="font-size: 20px;">🎉</span>
                <div style="flex: 1;">
                  <h4 style="font-size: var(--font-size-md); font-weight: 700; margin: 0;">Session Concluded</h4>
                  <p class="text-xs text-secondary" style="margin: 4px 0 var(--space-3) 0;">
                    Your focus interval has ended. Did you complete "${this.selectedTask.title}"?
                  </p>
                  <div class="flex gap-2">
                    <button id="focus-mark-completed-btn" class="btn btn-primary btn-sm">
                      ✓ Mark Task Completed
                    </button>
                    <button id="focus-keep-in-progress-btn" class="btn btn-outline btn-sm">
                      Keep in Progress
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Optional Session Reflection / Flow Notes -->
        <div class="card">
          <h4 class="card-title" style="font-size: var(--font-size-md); margin-bottom: var(--space-1);">Session Focus Notes</h4>
          <p class="card-subtitle" style="margin-bottom: var(--space-3);">Record insights, thoughts, or distractions to preserve focus flow.</p>
          <textarea id="focus-notes-input" class="form-textarea" rows="3" placeholder="Jot down notes or observations during this session...">${this.sessionNotes}</textarea>
        </div>

      </div>
    `;
  }

  bindEvents() {
    if (!this._container) return;

    // Back button
    const backBtn = this._container.querySelector('#focus-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        router.navigate('tasks');
      });
    }

    // Mode toggles
    const modeBtns = this._container.querySelectorAll('.mode-toggle-btn');
    for (const btn of modeBtns) {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        if (mode && mode !== this.timerMode) {
          this.timerMode = mode;
          this.resetTimer();
        }
      });
    }

    // Task selector
    const taskSelect = this._container.querySelector('#focus-task-select');
    if (taskSelect) {
      taskSelect.addEventListener('change', (e) => {
        this.selectedTaskId = e.target.value;
        this.updateSelectedTask();
        this.resetTimer();
      });
    }

    // Timer controls
    const startBtn = this._container.querySelector('#focus-start-btn');
    if (startBtn) startBtn.addEventListener('click', () => this.startTimer());

    const pauseBtn = this._container.querySelector('#focus-pause-btn');
    if (pauseBtn) pauseBtn.addEventListener('click', () => this.pauseTimer());

    const resumeBtn = this._container.querySelector('#focus-resume-btn');
    if (resumeBtn) resumeBtn.addEventListener('click', () => this.resumeTimer());

    const stopBtn = this._container.querySelector('#focus-stop-btn');
    if (stopBtn) stopBtn.addEventListener('click', () => this.stopTimer());

    const resetBtn = this._container.querySelector('#focus-reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', () => this.resetTimer());

    // Completion prompt actions
    const completeBtn = this._container.querySelector('#focus-mark-completed-btn');
    if (completeBtn) completeBtn.addEventListener('click', () => this.completeTask());

    const keepProgressBtn = this._container.querySelector('#focus-keep-in-progress-btn');
    if (keepProgressBtn) keepProgressBtn.addEventListener('click', () => this.keepTaskInProgress());

    // Notes textarea
    const notesInput = this._container.querySelector('#focus-notes-input');
    if (notesInput) {
      notesInput.addEventListener('input', (e) => {
        this.sessionNotes = e.target.value;
      });
    }
  }

  destroy() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
}

export const focusController = new FocusModeController();

export function renderFocusPage() {
  return `
    <div id="focus-page-root">
      ${focusController.renderContent()}
    </div>
  `;
}

export function bindFocusEvents(mountElement) {
  focusController.setContainer(mountElement);
  focusController.bindEvents();

  if (!focusController.selectedTask && focusController.tasks.length === 0) {
    focusController.loadTasks();
  }
}
