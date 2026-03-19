import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import TaskCard from '../components/TaskCard';

export default function Dashboard() {
    const { user, logout } = useAuth();
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // Create task form state
    const [title, setTitle] = useState('');
    const [inputText, setInputText] = useState('');
    const [operation, setOperation] = useState('uppercase');
    const [creating, setCreating] = useState(false);

    // Fetch tasks
    const fetchTasks = useCallback(async () => {
        try {
            const { data } = await api.get('/tasks');
            setTasks(data.tasks);
        } catch (err) {
            console.error('Failed to fetch tasks:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTasks();
        // Auto-refresh every 5 seconds to pick up worker status updates
        const interval = setInterval(fetchTasks, 5000);
        return () => clearInterval(interval);
    }, [fetchTasks]);

    // Create task
    const handleCreateTask = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');

        if (!title.trim() || !inputText.trim()) {
            setError('Title and input text are required.');
            return;
        }

        setCreating(true);
        try {
            await api.post('/tasks', { title: title.trim(), inputText, operation });
            setTitle('');
            setInputText('');
            setOperation('uppercase');
            setSuccessMsg('Task created successfully!');
            await fetchTasks();
            setTimeout(() => setSuccessMsg(''), 3000);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to create task.');
        } finally {
            setCreating(false);
        }
    };

    // Run task
    const handleRunTask = async (taskId) => {
        try {
            await api.post(`/tasks/${taskId}/run`);
            await fetchTasks();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to run task.');
            setTimeout(() => setError(''), 3000);
        }
    };

    return (
        <div>
            {/* Navbar */}
            <nav className="navbar">
                <span className="navbar-brand">⚡ AI Task Platform</span>
                <div className="navbar-user">
                    <span className="navbar-email">{user?.email}</span>
                    <button className="btn-logout" onClick={logout}>
                        Logout
                    </button>
                </div>
            </nav>

            <div className="dashboard">
                {/* Header */}
                <div className="dashboard-header">
                    <h1>Dashboard</h1>
                    <p>Manage and create your AI processing tasks</p>
                </div>

                {/* Alerts */}
                {error && <div className="alert alert-error">{error}</div>}
                {successMsg && <div className="alert alert-success">{successMsg}</div>}

                {/* Create Task Section */}
                <div className="create-task-section">
                    <h2>✨ Create New Task</h2>
                    <form onSubmit={handleCreateTask}>
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="task-title">Task Title</label>
                                <input
                                    id="task-title"
                                    type="text"
                                    className="form-input"
                                    placeholder="e.g. Client Report Analysis"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="task-operation">Operation</label>
                                <select
                                    id="task-operation"
                                    className="form-input"
                                    value={operation}
                                    onChange={(e) => setOperation(e.target.value)}
                                >
                                    <option value="uppercase">Uppercase</option>
                                    <option value="lowercase">Lowercase</option>
                                    <option value="reverse">Reverse</option>
                                    <option value="wordcount">Word Count</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="task-input">Input Text</label>
                            <textarea
                                id="task-input"
                                className="form-input"
                                placeholder="Enter the text you want to process..."
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                rows={4}
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={creating}
                        >
                            {creating ? <><span className="spinner" /> Creating...</> : '🚀 Create Task'}
                        </button>
                    </form>
                </div>

                {/* Task List */}
                <div className="task-list-header">
                    <h2>📋 Recent Tasks</h2>
                    <span className="task-count">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
                </div>

                {loading ? (
                    <div className="empty-state">
                        <div className="spinner" />
                        <p>Loading tasks...</p>
                    </div>
                ) : tasks.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📭</div>
                        <p>No tasks yet. Create your first task above!</p>
                    </div>
                ) : (
                    <div className="task-grid">
                        {tasks.map((task) => (
                            <TaskCard key={task._id} task={task} onRun={handleRunTask} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
