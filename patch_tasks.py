import re

with open('app.js', 'r') as f:
    content = f.read()

# Remove references to single result section UI, keeping the rest of UI helpers clean.
content = re.sub(r'const resultSection = document\.getElementById\(\'resultSection\'\);\n', '', content)
content = re.sub(r'const resultVideo = document\.getElementById\(\'resultVideo\'\);\n', '', content)
content = re.sub(r'const downloadBtn = document\.getElementById\(\'downloadBtn\'\);\n', '', content)

tasksLogic = """
// ---------------- Task History Manager ----------------
let taskHistory = JSON.parse(localStorage.getItem('seedanceTasks') || '[]');
const historyPanel = document.getElementById('historyPanel');
const tasksGrid = document.getElementById('tasksGrid');
const videoModal = document.getElementById('videoModal');
const modalVideo = document.getElementById('modalVideo');

function saveTasks() {
    localStorage.setItem('seedanceTasks', JSON.stringify(taskHistory));
}

function renderTaskHistory() {
    if (taskHistory.length === 0) {
        historyPanel.style.display = 'none';
        return;
    }
    historyPanel.style.display = 'block';
    tasksGrid.innerHTML = '';

    taskHistory.sort((a, b) => b.createdAt - a.createdAt).forEach(task => {
        const card = document.createElement('div');
        card.className = 'task-card';

        let statusClass = 'status-pending';
        let statusText = '排队中...';
        
        if (task.status === 'succeed' || task.status === 'success') {
            statusClass = 'status-success';
            statusText = '已完成';
        } else if (task.status === 'failed' || task.status === 'error') {
            statusClass = 'status-error';
            statusText = '失败';
        } else if (task.status === 'generating' || task.status === 'rendering') {
            statusClass = 'status-rendering';
            statusText = `生成中 ${task.progress || 0}%`;
        }

        let mediaHtml = '';
        if (task.status === 'succeed' && task.video_url) {
            mediaHtml = `
                <div class="task-preview-layer" onclick="openVideoModal('${task.video_url}')">
                    <video src="${task.video_url}" muted loop playsinline onmouseover="this.play()" onmouseout="this.pause()"></video>
                </div>
            `;
        } else if (statusClass === 'status-rendering' || statusClass === 'status-pending') {
            mediaHtml = `
                <div class="task-preview-layer">
                    <i class="ph ph-spinner-gap spin-anim spinner"></i>
                </div>
            `;
        } else {
            mediaHtml = `
                <div class="task-preview-layer" style="display:flex; align-items:center; justify-content:center;">
                    <i class="ph ph-warning-circle" style="color:#dc3545; font-size:24px;"></i>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="task-status ${statusClass}">${statusText}</div>
            ${mediaHtml}
            <div class="task-prompt-text">${task.prompt || '暂无描述'}</div>
            <div style="font-size:10px; color:#666;">${new Date(task.createdAt).toLocaleString()}</div>
        `;
        tasksGrid.appendChild(card);
    });
}

function addNewTask(taskId, promptText) {
    taskHistory.push({
        id: taskId,
        prompt: promptText,
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        video_url: null
    });
    saveTasks();
    renderTaskHistory();
    pollTask(taskId);
}

function updateTask(taskId, updates) {
    const task = taskHistory.find(t => t.id === taskId);
    if (task) {
        Object.assign(task, updates);
        saveTasks();
        renderTaskHistory();
    }
}

window.clearHistory = function() {
    taskHistory = [];
    saveTasks();
    renderTaskHistory();
}

window.openVideoModal = function(url) {
    modalVideo.src = url;
    videoModal.classList.remove('hidden');
    modalVideo.play();
}

window.closeVideoModal = function() {
    videoModal.classList.add('hidden');
    modalVideo.pause();
    modalVideo.src = '';
}

async function pollTask(taskId) {
    const pollInterval = 5000;
    try {
        const response = await fetch(STATUS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({ model: MODEL, task_id: taskId })
        });

        if (!response.ok) {
            setTimeout(() => pollTask(taskId), pollInterval);
            return;
        }

        const data = await response.json();
        const taskData = data.data;
        if (!taskData) throw new Error('Invalid response');

        const status = taskData.status.toLowerCase();
        
        if (status === 'succeed' || status === 'success') {
            updateTask(taskId, { status: 'success', video_url: taskData.content?.video_url });
        } else if (status === 'failed' || status === 'error') {
            updateTask(taskId, { status: 'error' });
        } else {
            updateTask(taskId, { status: 'rendering', progress: taskData.progress || 0 });
            setTimeout(() => pollTask(taskId), pollInterval);
        }
    } catch (e) {
        console.error(e);
        updateTask(taskId, { status: 'error' });
    }
}

// Start polling for any incomplete tasks on load
taskHistory.forEach(task => {
    if (task.status === 'pending' || task.status === 'rendering') {
        pollTask(task.id);
    }
});
renderTaskHistory();
"""

# Replace the generation flow
generationLogic = """
    try {
        updateStatus('Submitting task...');
        
        const response = await fetch(COMPLETIONS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const taskId = data.id;
        
        if (!taskId) throw new Error('No task ID returned.');

        // Successfully fired task
        showStatus('Task created successfully! Check history below.', false, true);
        setLoadingState(false);
        stopTimer();
        
        // Add to concurrent history
        addNewTask(taskId, finalPromptValue);
        
    } catch (error) {
        console.error('Generation Error:', error);
        showStatus(error.message, true);
        setLoadingState(false);
        stopTimer();
    }
}
"""

content = re.sub(r'try \{\n\s*updateStatus\(\'Submitting task\.\.\.\'\);[\s\S]*?\}\n\}', generationLogic, content)

# Remove the old single-poll methods
content = re.sub(r'async function pollStatus\(taskId\) \{[\s\S]*?\}\n\nfunction onSuccess\(videoUrl\) \{[\s\S]*?\}\n', '', content)
content = re.sub(r'function hideResult\(\) \{[\s\S]*?\}\n', '', content)
content = content.replace('hideResult();', '')

content += "\n" + tasksLogic

with open('app.js', 'w') as f:
    f.write(content)
