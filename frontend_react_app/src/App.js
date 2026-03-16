import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

/**
 * A small, frontend-only single-page app that helps users plan and run short focus sessions.
 * - Header with title + quick stats
 * - Centered content area with cards
 * - Interactive: add/edit/complete tasks, filters, timer with notifications, keyboard shortcuts
 */

const STORAGE_KEY = "focus_dash_v1";

/** @typedef {"all"|"active"|"done"} TaskFilter */

/**
 * @typedef {Object} Task
 * @property {string} id
 * @property {string} title
 * @property {boolean} done
 * @property {number} createdAt
 */

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatMMSS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

// PUBLIC_INTERFACE
function App() {
  /** @type {[Task[], Function]} */
  const [tasks, setTasks] = useState(() => {
    const saved = safeJsonParse(localStorage.getItem(STORAGE_KEY), null);
    if (saved && Array.isArray(saved.tasks)) return saved.tasks;
    return [
      { id: uid(), title: "Draft today’s top 3 tasks", done: false, createdAt: Date.now() - 300000 },
      { id: uid(), title: "Run a 25-minute focus session", done: false, createdAt: Date.now() - 200000 },
      { id: uid(), title: "Take a short break and review", done: false, createdAt: Date.now() - 100000 }
    ];
  });

  /** @type {[TaskFilter, Function]} */
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  // Focus session timer
  const [minutes, setMinutes] = useState(25);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);

  // UI state
  const [toast, setToast] = useState(null); // { title, message, tone }
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");

  const addInputRef = useRef(null);
  const editInputRef = useRef(null);

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.done).length;
    const active = total - done;
    const progress = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, active, progress };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter((t) => {
        if (filter === "active") return !t.done;
        if (filter === "done") return t.done;
        return true;
      })
      .filter((t) => (q ? t.title.toLowerCase().includes(q) : true))
      .sort((a, b) => (a.done === b.done ? b.createdAt - a.createdAt : a.done ? 1 : -1));
  }, [tasks, filter, query]);

  // Persist
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks }));
  }, [tasks]);

  // Keep secondsLeft aligned when minutes changes (but don't interrupt a running session)
  useEffect(() => {
    if (!isRunning) {
      setSecondsLeft(minutes * 60);
    }
  }, [minutes, isRunning]);

  // Tick
  useEffect(() => {
    if (!isRunning) return undefined;

    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [isRunning]);

  // Completion side effects
  useEffect(() => {
    if (!isRunning) return;
    if (secondsLeft > 0) return;

    setIsRunning(false);
    notify("Focus session complete", "Nice work. Take a short break.");
    showToast("Session complete", "Nice work — consider a 5-minute break.", "success");
  }, [secondsLeft, isRunning]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e) => {
      // Avoid stealing keystrokes while typing in inputs/textarea
      const tag = (e.target && e.target.tagName) || "";
      const isTyping = ["INPUT", "TEXTAREA"].includes(tag);
      if (isTyping) return;

      if (e.key === "/") {
        e.preventDefault();
        addInputRef.current?.focus();
      }
      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        setIsRunning((r) => !r);
      }
      if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        handleResetTimer();
      }
      if (e.key === "Escape") {
        setEditingId(null);
        setEditValue("");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function showToast(title, message, tone = "info") {
    setToast({ title, message, tone });
    window.setTimeout(() => setToast(null), 3500);
  }

  async function notify(title, body) {
    // Notification is optional; the app remains frontend-only.
    if (!("Notification" in window)) return;

    try {
      if (Notification.permission === "granted") {
        new Notification(title, { body });
        return;
      }
      if (Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        if (permission === "granted") new Notification(title, { body });
      }
    } catch {
      // Silently ignore; some browsers block in iframes or insecure contexts.
    }
  }

  function handleAddTask(title) {
    const trimmed = title.trim();
    if (!trimmed) {
      showToast("Task not added", "Enter a short title (e.g., “Review PR notes”).", "error");
      return;
    }
    if (trimmed.length > 80) {
      showToast("Task too long", "Keep it under 80 characters for readability.", "error");
      return;
    }

    const task = { id: uid(), title: trimmed, done: false, createdAt: Date.now() };
    setTasks((prev) => [task, ...prev]);
    showToast("Task added", `“${trimmed}”`, "success");
  }

  function handleToggleTask(id) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  function handleDeleteTask(id) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    showToast("Task removed", "It’s been deleted from your list.", "info");
  }

  function startEditing(task) {
    setEditingId(task.id);
    setEditValue(task.title);
    // Defer focus until after render
    window.setTimeout(() => editInputRef.current?.focus(), 0);
  }

  function commitEdit(id) {
    const trimmed = editValue.trim();
    if (!trimmed) {
      showToast("Edit cancelled", "Task title can’t be empty.", "error");
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, title: trimmed } : t)));
    setEditingId(null);
    setEditValue("");
    showToast("Task updated", `Saved “${trimmed}”.`, "success");
  }

  function handleClearCompleted() {
    const completed = tasks.filter((t) => t.done).length;
    if (completed === 0) {
      showToast("Nothing to clear", "No completed tasks yet.", "info");
      return;
    }
    setTasks((prev) => prev.filter((t) => !t.done));
    showToast("Cleared completed", `Removed ${completed} task${completed === 1 ? "" : "s"}.`, "success");
  }

  function handleStartPause() {
    if (secondsLeft === 0) {
      setSecondsLeft(minutes * 60);
    }
    setIsRunning((r) => !r);
  }

  function handleResetTimer() {
    setIsRunning(false);
    setSecondsLeft(minutes * 60);
    showToast("Timer reset", "Ready when you are. Press “Start”.", "info");
  }

  const nextMilestoneText = useMemo(() => {
    if (stats.total === 0) return "Add a task to get started.";
    if (stats.done === stats.total) return "All done — nice work.";
    return `You have ${stats.active} active task${stats.active === 1 ? "" : "s"} to go.`;
  }, [stats]);

  return (
    <div className="App">
      <AppHeader
        title="Focus Dashboard"
        subtitle="A lightweight, frontend-only productivity page"
        stats={stats}
        timer={{
          secondsLeft,
          isRunning,
          minutes,
          onStartPause: handleStartPause,
          onReset: handleResetTimer
        }}
      />

      <main className="Main" role="main">
        <div className="Container">
          <div className="Grid">
            <Card
              title="Today’s tasks"
              subtitle="Capture, refine, and check off items. Tip: press “/” to focus the add box."
              right={
                <Button variant="ghost" onClick={handleClearCompleted} ariaLabel="Clear completed tasks">
                  Clear completed
                </Button>
              }
            >
              <TaskComposer
                inputRef={addInputRef}
                onAdd={(value) => handleAddTask(value)}
                placeholder="Add a task (e.g., “Write meeting notes”)"
              />

              <div className="Row Row--gap Row--wrap" style={{ marginTop: 12 }}>
                <SegmentedControl
                  label="Filter tasks"
                  value={filter}
                  options={[
                    { value: "all", label: `All (${stats.total})` },
                    { value: "active", label: `Active (${stats.active})` },
                    { value: "done", label: `Done (${stats.done})` }
                  ]}
                  onChange={(v) => setFilter(v)}
                />

                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="Search tasks…"
                  ariaLabel="Search tasks"
                />
              </div>

              <div className="Divider" />

              <TaskList
                tasks={filteredTasks}
                emptyStateTitle={stats.total === 0 ? "No tasks yet" : "No matches"}
                emptyStateBody={
                  stats.total === 0
                    ? "Add your first task above to build momentum."
                    : "Try a different filter or search term."
                }
                onToggle={handleToggleTask}
                onDelete={handleDeleteTask}
                onEdit={startEditing}
                editingId={editingId}
                editValue={editValue}
                onEditChange={setEditValue}
                onEditCommit={commitEdit}
                editInputRef={editInputRef}
              />
            </Card>

            <Card title="Focus session" subtitle="Set a duration, then run a distraction-free sprint. Shortcut: press “F” to start/pause.">
              <div className="FocusCard">
                <div className="FocusTime" aria-label="Time remaining">
                  {formatMMSS(secondsLeft)}
                </div>
                <div className="Row Row--gap Row--wrap" style={{ justifyContent: "center" }}>
                  <Button variant="primary" onClick={handleStartPause} ariaLabel={isRunning ? "Pause focus session" : "Start focus session"}>
                    {isRunning ? "Pause" : "Start"}
                  </Button>
                  <Button variant="secondary" onClick={handleResetTimer} ariaLabel="Reset focus timer">
                    Reset
                  </Button>
                </div>

                <div className="Row Row--gap Row--wrap" style={{ justifyContent: "center", marginTop: 12 }}>
                  <Label htmlFor="minutes">Minutes</Label>
                  <div className="Stepper" role="group" aria-label="Set focus session minutes">
                    <button
                      className="StepperBtn"
                      type="button"
                      onClick={() => setMinutes((m) => clamp(m - 5, 5, 90))}
                      disabled={isRunning}
                      aria-label="Decrease minutes by 5"
                    >
                      −
                    </button>
                    <input
                      id="minutes"
                      className="StepperInput"
                      type="number"
                      min={5}
                      max={90}
                      step={5}
                      value={minutes}
                      disabled={isRunning}
                      onChange={(e) => setMinutes(clamp(parseInt(e.target.value || "25", 10), 5, 90))}
                    />
                    <button
                      className="StepperBtn"
                      type="button"
                      onClick={() => setMinutes((m) => clamp(m + 5, 5, 90))}
                      disabled={isRunning}
                      aria-label="Increase minutes by 5"
                    >
                      +
                    </button>
                  </div>
                </div>

                <p className="Hint" style={{ marginTop: 12 }}>
                  Optional: allow browser notifications when prompted to get an alert when the session ends.
                </p>
              </div>
            </Card>

            <Card title="Insights" subtitle="A quick pulse check for the day.">
              <div className="Insights">
                <StatPill label="Progress" value={`${stats.progress}%`} tone="primary" />
                <StatPill label="Active" value={String(stats.active)} tone="accent" />
                <StatPill label="Done" value={String(stats.done)} tone="success" />
              </div>
              <div className="Divider" />
              <Callout tone={stats.progress === 100 ? "success" : "info"} title="Next milestone">
                {nextMilestoneText}
              </Callout>

              <div className="Divider" />

              <ul className="MiniList">
                <li>
                  <Kbd>/</Kbd> Focus add-task input
                </li>
                <li>
                  <Kbd>F</Kbd> Start/Pause timer
                </li>
                <li>
                  <Kbd>R</Kbd> Reset timer
                </li>
                <li>
                  <Kbd>Esc</Kbd> Cancel editing
                </li>
              </ul>
            </Card>
          </div>

          <FooterNote />
        </div>
      </main>

      {toast ? <Toast tone={toast.tone} title={toast.title} message={toast.message} onClose={() => setToast(null)} /> : null}
    </div>
  );
}

function AppHeader({ title, subtitle, stats, timer }) {
  return (
    <header className="Header">
      <div className="HeaderInner">
        <div className="Brand">
          <div className="LogoMark" aria-hidden="true">
            <span className="LogoDot" />
          </div>
          <div>
            <div className="TitleRow">
              <h1 className="AppTitle">{title}</h1>
              <span className="Badge" aria-label="Frontend only badge">
                Frontend-only
              </span>
            </div>
            <p className="AppSubtitle">{subtitle}</p>
          </div>
        </div>

        <div className="HeaderRight">
          <div className="HeaderStats" aria-label="Task statistics">
            <div className="HeaderStat">
              <div className="HeaderStatLabel">Tasks</div>
              <div className="HeaderStatValue">{stats.total}</div>
            </div>
            <div className="HeaderStat">
              <div className="HeaderStatLabel">Done</div>
              <div className="HeaderStatValue">{stats.done}</div>
            </div>
            <div className="HeaderStat">
              <div className="HeaderStatLabel">Progress</div>
              <div className="HeaderStatValue">{stats.progress}%</div>
            </div>
          </div>

          <div className="HeaderTimer" aria-label="Focus timer summary">
            <div className="HeaderTimerTime">{formatMMSS(timer.secondsLeft)}</div>
            <div className="Row Row--gap" style={{ justifyContent: "flex-end" }}>
              <Button variant="ghost" size="sm" onClick={timer.onReset} ariaLabel="Reset focus timer (header)">
                Reset
              </Button>
              <Button
                variant={timer.isRunning ? "secondary" : "primary"}
                size="sm"
                onClick={timer.onStartPause}
                ariaLabel={timer.isRunning ? "Pause focus session (header)" : "Start focus session (header)"}
              >
                {timer.isRunning ? "Pause" : "Start"}
              </Button>
            </div>
            <div className="HeaderTimerMeta">{timer.minutes} min focus</div>
          </div>
        </div>
      </div>
    </header>
  );
}

function Card({ title, subtitle, right, children }) {
  return (
    <section className="Card" aria-label={title}>
      <div className="CardHeader">
        <div>
          <h2 className="CardTitle">{title}</h2>
          {subtitle ? <p className="CardSubtitle">{subtitle}</p> : null}
        </div>
        <div className="CardHeaderRight">{right}</div>
      </div>
      <div className="CardBody">{children}</div>
    </section>
  );
}

function Button({ variant = "primary", size = "md", onClick, children, ariaLabel, type = "button", disabled = false }) {
  const className = ["Btn", `Btn--${variant}`, `Btn--${size}`].join(" ");
  return (
    <button type={type} className={className} onClick={onClick} aria-label={ariaLabel} disabled={disabled}>
      {children}
    </button>
  );
}

function Label({ htmlFor, children }) {
  return (
    <label className="Label" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

function SegmentedControl({ label, value, options, onChange }) {
  return (
    <div className="Segmented" role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={["Segment", opt.value === value ? "is-active" : ""].join(" ")}
          onClick={() => onChange(opt.value)}
          aria-pressed={opt.value === value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SearchInput({ value, onChange, placeholder, ariaLabel }) {
  return (
    <div className="Search">
      <span className="SearchIcon" aria-hidden="true">
        ⌕
      </span>
      <input
        className="SearchInput"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
    </div>
  );
}

function TaskComposer({ onAdd, placeholder, inputRef }) {
  const [value, setValue] = useState("");

  const submit = () => {
    onAdd(value);
    setValue("");
  };

  return (
    <div className="Composer" role="form" aria-label="Add a new task">
      <input
        ref={inputRef}
        className="ComposerInput"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="Task title"
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      <Button variant="primary" onClick={submit} ariaLabel="Add task">
        Add
      </Button>
    </div>
  );
}

function TaskList({
  tasks,
  emptyStateTitle,
  emptyStateBody,
  onToggle,
  onDelete,
  onEdit,
  editingId,
  editValue,
  onEditChange,
  onEditCommit,
  editInputRef
}) {
  if (tasks.length === 0) {
    return (
      <div className="EmptyState" role="status" aria-live="polite">
        <div className="EmptyStateTitle">{emptyStateTitle}</div>
        <div className="EmptyStateBody">{emptyStateBody}</div>
      </div>
    );
  }

  return (
    <ul className="TaskList" aria-label="Task list">
      {tasks.map((t) => {
        const isEditing = editingId === t.id;
        return (
          <li key={t.id} className={["TaskItem", t.done ? "is-done" : ""].join(" ")}>
            <button
              type="button"
              className="TaskCheck"
              onClick={() => onToggle(t.id)}
              aria-label={t.done ? "Mark task as not done" : "Mark task as done"}
              aria-pressed={t.done}
              title={t.done ? "Mark as not done" : "Mark as done"}
            >
              <span className="TaskCheckInner" aria-hidden="true">
                {t.done ? "✓" : ""}
              </span>
            </button>

            <div className="TaskMain">
              {isEditing ? (
                <input
                  ref={editInputRef}
                  className="TaskEditInput"
                  value={editValue}
                  onChange={(e) => onEditChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onEditCommit(t.id);
                    if (e.key === "Escape") {
                      onEditChange("");
                    }
                  }}
                  aria-label="Edit task title"
                />
              ) : (
                <div className="TaskTitle" title={t.title}>
                  {t.title}
                </div>
              )}
              <div className="TaskMeta">
                {new Date(t.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </div>
            </div>

            <div className="TaskActions">
              {isEditing ? (
                <Button variant="primary" size="sm" onClick={() => onEditCommit(t.id)} ariaLabel="Save task edit">
                  Save
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => onEdit(t)} ariaLabel="Edit task">
                  Edit
                </Button>
              )}
              <Button variant="ghostDanger" size="sm" onClick={() => onDelete(t.id)} ariaLabel="Delete task">
                Delete
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StatPill({ label, value, tone = "primary" }) {
  return (
    <div className={["StatPill", `StatPill--${tone}`].join(" ")} aria-label={`${label}: ${value}`}>
      <div className="StatPillLabel">{label}</div>
      <div className="StatPillValue">{value}</div>
    </div>
  );
}

function Callout({ tone = "info", title, children }) {
  return (
    <div className={["Callout", `Callout--${tone}`].join(" ")} role="note" aria-label={title}>
      <div className="CalloutTitle">{title}</div>
      <div className="CalloutBody">{children}</div>
    </div>
  );
}

function Kbd({ children }) {
  return <kbd className="Kbd">{children}</kbd>;
}

function Toast({ title, message, tone, onClose }) {
  return (
    <div className={["Toast", `Toast--${tone}`].join(" ")} role="status" aria-live="polite">
      <div className="ToastMain">
        <div className="ToastTitle">{title}</div>
        <div className="ToastMessage">{message}</div>
      </div>
      <button type="button" className="ToastClose" onClick={onClose} aria-label="Dismiss message" title="Dismiss">
        ×
      </button>
    </div>
  );
}

function FooterNote() {
  return (
    <footer className="Footer">
      <div className="FooterInner">
        <div className="FooterLeft">
          <span className="FooterDot" aria-hidden="true" />
          <span>
            Built with React + vanilla CSS. Data stays in your browser (<span className="Mono">localStorage</span>).
          </span>
        </div>
        <div className="FooterRight">
          <a
            className="FooterLink"
            href="https://react.dev"
            target="_blank"
            rel="noreferrer"
            aria-label="Open React documentation"
          >
            React Docs
          </a>
        </div>
      </div>
    </footer>
  );
}

export default App;
