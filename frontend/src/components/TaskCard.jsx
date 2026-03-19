import { useState } from 'react';

/**
 * TaskCard component — displays a single task with status, result, logs, and run button.
 */
export default function TaskCard({ task, onRun }) {
    const [logsOpen, setLogsOpen] = useState(false);
    const [running, setRunning] = useState(false);

    const handleRun = async () => {
        setRunning(true);
        try {
            await onRun(task._id);
        } finally {
            setRunning(false);
        }
    };

    // Format timestamp
    const formatTime = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const isRunnable = task.status !== 'running';
    const hasResult = task.result && task.status === 'success';
    const hasFailed = task.status === 'failed';
    const hasLogs = task.logs && task.logs.length > 0;

    return (
        <div className="task-card">
            {/* Header — Title + Badges */}
            <div className="task-card-header">
                <span className="task-card-title">{task.title}</span>
                <div className="task-card-badges">
                    <span className="badge badge-operation">{task.operation}</span>
                    <span className={`badge badge-${task.status}`}>{task.status}</span>
                </div>
            </div>

            {/* Input preview */}
            <div className="task-card-input">
                {task.inputText.length > 120
                    ? task.inputText.substring(0, 120) + '...'
                    : task.inputText}
            </div>

            {/* Result */}
            {(hasResult || hasFailed) && (
                <div className="task-card-result">
                    <div className="task-card-result-label">Result</div>
                    <div className={`task-card-result-value ${hasFailed ? 'error' : ''}`}>
                        {task.result || 'No result'}
                    </div>
                </div>
            )}

            {/* Logs */}
            {hasLogs && (
                <div className="task-card-logs">
                    <button className="logs-toggle" onClick={() => setLogsOpen(!logsOpen)}>
                        <span className={`logs-toggle-icon ${logsOpen ? 'open' : ''}`}>▶</span>
                        Logs ({task.logs.length})
                    </button>
                    {logsOpen && (
                        <div className="logs-content">
                            {task.logs.map((log, i) => (
                                <p key={i}>{log}</p>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Footer — Time + Run */}
            <div className="task-card-footer">
                <span className="task-card-time">{formatTime(task.createdAt)}</span>
                <button
                    className="btn btn-run"
                    onClick={handleRun}
                    disabled={!isRunnable || running}
                >
                    {running ? (
                        <><span className="spinner" /> Running</>
                    ) : task.status === 'running' ? (
                        '⏳ Running...'
                    ) : (
                        '▶ Run'
                    )}
                </button>
            </div>
        </div>
    );
}
