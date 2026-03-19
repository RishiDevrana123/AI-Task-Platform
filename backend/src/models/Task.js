const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Title is required'],
            trim: true,
            maxlength: [200, 'Title cannot exceed 200 characters'],
        },
        inputText: {
            type: String,
            required: [true, 'Input text is required'],
        },
        operation: {
            type: String,
            required: [true, 'Operation is required'],
            enum: {
                values: ['uppercase', 'lowercase', 'reverse', 'wordcount'],
                message: 'Operation must be one of: uppercase, lowercase, reverse, wordcount',
            },
        },
        status: {
            type: String,
            enum: ['pending', 'running', 'success', 'failed'],
            default: 'pending',
        },
        result: {
            type: String,
            default: '',
        },
        logs: {
            type: [String],
            default: [],
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
    },
    { timestamps: true }
);

// Compound index for efficient user-scoped queries
taskSchema.index({ userId: 1, status: 1 });
taskSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Task', taskSchema);
