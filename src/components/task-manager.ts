import { Task } from '../state/types';
import { getTasks, saveTask, deleteTask, updateTask } from '../utils/storage';

export class TaskManager {
  private container: HTMLElement;
  private tasks: Task[] = [];
  private onTasksChanged: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async load() {
    this.tasks = await getTasks();
  }

  public setOnTasksChanged(callback: () => void) {
    this.onTasksChanged = callback;
  }

  public render() {
    this.container.innerHTML = `
      <div class="task-manager">
        <div class="task-header">
          <h2>Tasks</h2>
          <button id="add-task-btn" class="btn btn-primary btn-small" title="Add new task" aria-label="Add new task">+ Add</button>
        </div>

        <form id="task-form" class="task-form" hidden>
          <input type="text" id="task-title" placeholder="Task title" required>
          <textarea id="task-description" placeholder="Description (optional)"></textarea>

          <div class="form-row">
            <select id="task-priority">
              <option value="low">Low Priority</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
            </select>

            <input type="number" id="task-duration" placeholder="Duration (min)" min="1" max="480">
          </div>

          <div class="form-row">
            <button type="submit" class="btn btn-primary">Add Task</button>
            <button type="button" class="btn btn-secondary" id="cancel-task">Cancel</button>
          </div>
        </form>

        <div id="tasks-list" class="tasks-list">
          ${this.renderTasksList()}
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  private renderTasksList(): string {
    if (this.tasks.length === 0) {
      return '<p class="empty-state">No tasks yet. Add one to get started!</p>';
    }

    return `
      <ul class="task-items">
        ${[...this.tasks]
          .sort((a, b) => {
            // Open tasks first, then by priority (high > medium > low), then newest first
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            return (
              Number(a.completed) - Number(b.completed) ||
              priorityOrder[a.priority] - priorityOrder[b.priority] ||
              b.createdAt - a.createdAt
            );
          })
          .map((task) => this.renderTaskItem(task))
          .join('')}
      </ul>
    `;
  }

  private renderTaskItem(task: Task): string {
    const priorityColor = {
      low: '#96CEB4',
      medium: '#FFEAA7',
      high: '#FF6B6B',
    }[task.priority];

    const durationStr = task.duration ? `• ${task.duration}m` : '';

    return `
      <li class="task-item ${task.completed ? 'completed' : ''}" data-task-id="${task.id}">
        <div class="task-checkbox-wrapper">
          <input type="checkbox" class="task-checkbox" aria-label="Mark complete" ${task.completed ? 'checked' : ''}>
        </div>

        <div class="task-content">
          <div class="task-title">${this.escapeHtml(task.title)}</div>
          ${
            task.description
              ? `<div class="task-description">${this.escapeHtml(task.description)}</div>`
              : ''
          }
          <div class="task-meta">
            <span class="priority-badge" style="background-color: ${priorityColor}">
              ${task.priority}
            </span>
            ${durationStr}
          </div>
        </div>

        <button class="task-delete-btn" title="Delete task" aria-label="Delete task">×</button>
      </li>
    `;
  }

  private attachEventListeners() {
    const addBtn = this.container.querySelector<HTMLButtonElement>('#add-task-btn');
    const form = this.container.querySelector<HTMLFormElement>('#task-form');
    const cancelBtn = this.container.querySelector<HTMLButtonElement>('#cancel-task');
    const taskList = this.container.querySelector<HTMLElement>('#tasks-list');

    // Show form
    addBtn?.addEventListener('click', () => {
      if (!form) return;
      form.hidden = false;
      form.querySelector<HTMLInputElement>('#task-title')?.focus();
    });

    // Cancel form
    cancelBtn?.addEventListener('click', () => {
      if (!form) return;
      form.reset();
      form.hidden = true;
    });

    // Submit form
    form?.addEventListener('submit', (e: SubmitEvent) => {
      e.preventDefault();
      void this.handleTaskSubmit(form);
    });

    // Task checkboxes and delete buttons
    taskList?.addEventListener('change', (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.classList.contains('task-checkbox')) {
        const taskId = target.closest<HTMLElement>('.task-item')?.dataset.taskId;
        if (taskId) {
          void this.toggleTaskComplete(taskId);
        }
      }
    });

    taskList?.addEventListener('click', (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('.task-delete-btn');
      if (target) {
        const taskId = target.closest<HTMLElement>('.task-item')?.dataset.taskId;
        if (taskId) {
          void this.deleteTaskItem(taskId);
        }
      }
    });
  }

  private async handleTaskSubmit(form: HTMLFormElement) {
    const title = (form.querySelector('#task-title') as HTMLInputElement).value.trim();
    const description = (form.querySelector('#task-description') as HTMLTextAreaElement).value
      .trim();
    const priority = (form.querySelector('#task-priority') as HTMLSelectElement)
      .value as 'low' | 'medium' | 'high';
    const duration = parseInt((form.querySelector('#task-duration') as HTMLInputElement).value, 10);

    if (!title) {
      alert('Please enter a task title');
      return;
    }

    const newTask: Task = {
      id: `task-${Date.now()}`,
      title,
      description: description || undefined,
      priority,
      category: 'general',
      duration: duration || undefined,
      completed: false,
      createdAt: Date.now(),
    };

    await saveTask(newTask);
    this.tasks.push(newTask);

    // Reset form
    form.reset();
    form.hidden = true;

    this.render();
    this.onTasksChanged?.();
  }

  private async toggleTaskComplete(taskId: string) {
    const task = this.tasks.find((t) => t.id === taskId);
    if (task) {
      task.completed = !task.completed;
      await updateTask(taskId, { completed: task.completed });
      this.render();
      this.onTasksChanged?.();
    }
  }

  private async deleteTaskItem(taskId: string) {
    if (confirm('Delete this task?')) {
      await deleteTask(taskId);
      this.tasks = this.tasks.filter((t) => t.id !== taskId);
      this.render();
      this.onTasksChanged?.();
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
