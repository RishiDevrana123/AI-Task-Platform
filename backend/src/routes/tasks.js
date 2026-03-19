const express = require('express');
const Task = require('../models/Task');
const authMiddleware = require('../middleware/auth');
const { pushToQueue } = require('../config/redis');

const router = express.Router();

// All task routes require authentication
router.use(authMiddleware);

/**
 * POST /api/tasks
 * Create a new task
 */
router.post('/', async (req, res) => {
    try {
        const { title, inputText, operation } = req.body;

        if (!title || !inputText || !operation) {
            return res.status(400).json({
                error: 'title, inputText, and operation are required.',
            });
        }

        const task = new Task({
            title,
            inputText,
            operation,
            status: 'pending',
            userId: req.userId,
        });

        await task.save();
        console.log(`📝 Task created: ${task._id} by user ${req.userId}`);

        res.status(201).json({ message: 'Task created.', task });
    } catch (err) {
        console.error('Create task error:', err);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to create task.' });
    }
});

/**
 * GET /api/tasks
 * List all tasks for the authenticated user
 */
router.get('/', async (req, res) => {
    try {
        const { status, page = 1, limit = 50 } = req.query;
        const filter = { userId: req.userId };

        if (status) {
            filter.status = status;
        }

        const tasks = await Task.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit, 10));

        const total = await Task.countDocuments(filter);

        res.json({
            tasks,
            pagination: {
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (err) {
        console.error('List tasks error:', err);
        res.status(500).json({ error: 'Failed to fetch tasks.' });
    }
});

/**
 * GET /api/tasks/:id
 * Get a single task by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const task = await Task.findOne({
            _id: req.params.id,
            userId: req.userId,
        });

        if (!task) {
            return res.status(404).json({ error: 'Task not found.' });
        }

        res.json({ task });
    } catch (err) {
        console.error('Get task error:', err);
        if (err.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid task ID.' });
        }
        res.status(500).json({ error: 'Failed to fetch task.' });
    }
});

/**
 * POST /api/tasks/:id/run
 * Push task to Redis queue for processing
 */
router.post('/:id/run', async (req, res) => {
    try {
        const task = await Task.findOne({
            _id: req.params.id,
            userId: req.userId,
        });

        if (!task) {
            return res.status(404).json({ error: 'Task not found.' });
        }

        if (task.status === 'running') {
            return res.status(409).json({ error: 'Task is already running.' });
        }

        // Reset task for re-run
        task.status = 'pending';
        task.result = '';
        task.logs = [];
        await task.save();

        // Push to Redis queue
        await pushToQueue(task._id.toString());

        console.log(`▶️  Task ${task._id} queued for processing`);
        res.json({ message: 'Task queued for processing.', task });
    } catch (err) {
        console.error('Run task error:', err);
        if (err.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid task ID.' });
        }
        res.status(500).json({ error: 'Failed to run task.' });
    }
});

module.exports = router;
