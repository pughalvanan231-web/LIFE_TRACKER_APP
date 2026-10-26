/**
 * Application State Manager
 * Lightweight, centralized observable state with event notification.
 */

class AppStateManager {
  constructor() {
    this.listeners = new Set();
    this.state = {
      currentRoute: 'home',
      demoMode: typeof localStorage !== 'undefined' ? localStorage.getItem('life_goals_demo_mode') === 'true' : false,
      isSidebarOpen: false,
      notifications: [],
      modal: null,
      theme: 'light',
    };
  }

  getState() {
    return this.state;
  }

  setState(partialState) {
    this.state = { ...this.state, ...partialState };
    this.notify();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  // State Mutators
  setRoute(route) {
    if (this.state.currentRoute !== route) {
      this.setState({ currentRoute: route, isSidebarOpen: false });
    }
  }

  toggleDemoMode() {
    const nextVal = !this.state.demoMode;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('life_goals_demo_mode', String(nextVal));
    }
    this.setState({ demoMode: nextVal });
    this.showToast(
      nextVal ? 'Preview with sample demo data enabled' : 'Clean empty state restored',
      'info'
    );
  }

  toggleSidebar() {
    this.setState({ isSidebarOpen: !this.state.isSidebarOpen });
  }

  closeSidebar() {
    if (this.state.isSidebarOpen) {
      this.setState({ isSidebarOpen: false });
    }
  }

  showToast(message, type = 'info', duration = 3000) {
    const id = Date.now().toString();
    const toast = { id, message, type };
    this.setState({ notifications: [...this.state.notifications, toast] });

    if (duration > 0) {
      setTimeout(() => {
        this.dismissToast(id);
      }, duration);
    }
  }

  dismissToast(id) {
    this.setState({
      notifications: this.state.notifications.filter((n) => n.id !== id),
    });
  }

  openModal(modalConfig) {
    this.setState({ modal: modalConfig });
  }

  closeModal() {
    this.setState({ modal: null });
  }
}

export const appState = new AppStateManager();
