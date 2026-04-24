import { useEffect, useMemo, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useSettingsStore } from './stores/settings';
import { useTasksStore } from './stores/tasks';
import { AiooivLogo } from './components/AiooivLogo';
import { SettingsDialog } from './components/SettingsDialog';
import { TaskForm } from './components/TaskForm';
import { TaskList } from './components/TaskList';
import './App.css';

function App() {
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const loadTasks = useTasksStore((s) => s.loadTasks);
  const setupEventListener = useTasksStore((s) => s.setupEventListener);
  const tasks = useTasksStore((s) => s.tasks);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const appWindow = useMemo(() => getCurrentWindow(), []);

  const taskSummary = useMemo(() => {
    const active = tasks.filter((task) => task.status === 'running' || task.status === 'pending').length;
    return { total: tasks.length, active };
  }, [tasks]);

  useEffect(() => {
    loadSettings();
    loadTasks();
    let unlisten: (() => void) | undefined;
    setupEventListener().then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [loadSettings, loadTasks, setupEventListener]);

  const minimizeWindow = () => {
    void appWindow.minimize().catch((error) => {
      console.error('最小化窗口失败', error);
    });
  };

  const toggleMaximizeWindow = () => {
    void appWindow.toggleMaximize().catch((error) => {
      console.error('切换窗口最大化失败', error);
    });
  };

  const closeWindow = () => {
    void appWindow.close().catch((error) => {
      console.error('关闭窗口失败', error);
    });
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">跳到生成记录</a>

      <header className="app-topbar" data-tauri-drag-region>
        <div className="topbar-brand" data-tauri-drag-region>
          <div className="logo-mark" data-tauri-drag-region>
            <AiooivLogo size={28} />
          </div>
          <div className="topbar-brand-copy" data-tauri-drag-region>
            <span className="topbar-title" data-tauri-drag-region>aiooiv</span>
            <span className="topbar-subtitle" data-tauri-drag-region>暗室创作工作台</span>
          </div>
        </div>

        <label className="topbar-search" htmlFor="global-task-search" role="search">
          <SearchIcon />
          <input
            id="global-task-search"
            name="globalTaskSearch"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="搜索提示词、状态或错误…"
            autoComplete="off"
            aria-label="搜索任务"
          />
          {searchTerm && (
            <button type="button" onClick={() => setSearchTerm('')} aria-label="清空任务搜索">
              <CloseIcon />
            </button>
          )}
        </label>

        <div className="topbar-actions">
          <span className="topbar-stat" data-tauri-drag-region>{taskSummary.active} 个进行中</span>
          <span className="topbar-stat" data-tauri-drag-region>共 {taskSummary.total} 个任务</span>
          <button
            onClick={() => setSettingsOpen(true)}
            className="main-header-gear"
            aria-label="打开设置"
          >
            <GearIcon />
          </button>
          <div className="window-controls" role="group" aria-label="窗口控制">
            <button type="button" className="window-control-btn" onClick={minimizeWindow} aria-label="最小化窗口" title="最小化">
              <MinimizeIcon />
            </button>
            <button type="button" className="window-control-btn" onClick={toggleMaximizeWindow} aria-label="最大化或还原窗口" title="最大化/还原">
              <MaximizeIcon />
            </button>
            <button type="button" className="window-control-btn close" onClick={closeWindow} aria-label="关闭窗口" title="关闭">
              <WindowCloseIcon />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="app-main">
        <div className="main-content">
          <CreationPanel />
          <TaskList searchTerm={searchTerm} />
        </div>
      </main>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

export default App;

function CreationPanel() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditing = target instanceof HTMLElement
        && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

      if (isEditing) return;

      if ((event.metaKey || event.ctrlKey) && event.key === '/') {
        event.preventDefault();
        setCollapsed((current) => !current);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <section className={`creation-panel ${collapsed ? 'collapsed' : ''}`} aria-labelledby="creation-panel-title">
      <div className="creation-panel-header">
        <div className="creation-panel-title-group">
          <SparkleIcon />
          <div>
            <h1 id="creation-panel-title" className="creation-panel-title">新建图像任务</h1>
            <p className="creation-panel-subtitle">输入提示词、选择模式，然后把任务交给队列并行处理。</p>
          </div>
        </div>
        <button
          type="button"
          className="creation-panel-toggle"
          onClick={() => setCollapsed((current) => !current)}
          aria-expanded={!collapsed}
          aria-controls="creation-panel-body"
          aria-label={collapsed ? '展开创作面板' : '收起创作面板'}
          title="快捷键：Ctrl/Cmd + /"
        >
          <ChevronIcon expanded={!collapsed} />
        </button>
      </div>
      <div id="creation-panel-body" className="creation-panel-body" hidden={collapsed}>
        <TaskForm />
      </div>
    </section>
  );
}

// ── Icons ──────────────────────────────────────────

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg className={expanded ? 'rotate-180' : ''} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 7.5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <rect x="2.75" y="2.75" width="6.5" height="6.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function WindowCloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
