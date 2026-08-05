import re

with open('app.js', 'r') as f:
    content = f.read()

# 1. Update `addNewTask` to accept and store `payload` and `appState`
content = content.replace(
    '''function addNewTask(taskId, promptText) {
    taskHistory.push({
        id: taskId,
        prompt: promptText,
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        video_url: null
    });''',
    '''function addNewTask(taskId, promptText, payload, appState) {
    taskHistory.push({
        id: taskId,
        prompt: promptText,
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        video_url: null,
        payload: payload,
        appState: appState
    });'''
)

# 2. Update `saveTasks()` to handle QuotaExceededError robustly
content = content.replace(
    '''function saveTasks() {
    localStorage.setItem('seedanceTasks', JSON.stringify(taskHistory));
}''',
    '''function saveTasks() {
    try {
        localStorage.setItem('seedanceTasks', JSON.stringify(taskHistory));
    } catch (e) {
        console.warn('localStorage capacity reached, purging oldest tasks...');
        // Remove oldest until it fits
        while (taskHistory.length > 1) {
            // Sort to ensure oldest is first
            taskHistory.sort((a, b) => a.createdAt - b.createdAt);
            taskHistory.shift();
            try {
                localStorage.setItem('seedanceTasks', JSON.stringify(taskHistory));
                break;
            } catch (e2) {
                continue;
            }
        }
    }
}'''
)

# 3. Update the handleGenerate call to `addNewTask`
call_search = r'''        // Add to concurrent history
        addNewTask\(taskId, finalPromptValue\);'''

call_replace = r'''        // Capture app UI state for re-editing
        const appState = {
            promptValue: promptValue,
            referenceMode: referenceModeSelect.value,
            aspectRatio: aspectRatioSelect.value,
            duration: durationSelect.value,
            generateAudio: generateAudioCheck.checked,
            firstFrameDataUrl: firstFrameDataUrl,
            lastFrameDataUrl: lastFrameDataUrl,
            uploadedFiles: uploadedFiles.map(uf => ({
                id: uf.id,
                name: uf.name,
                dataUrl: uf.dataUrl,
                role: uf.role,
                icon: uf.icon
            }))
        };

        // Add to concurrent history
        addNewTask(taskId, finalPromptValue, payload, appState);'''

content = re.sub(call_search, call_replace, content)

# 4. Inject re-edit and regenerate actions into the task cards
card_inner_html_search = r'''        card\.innerHTML = `
            <div class="task-status \$\{statusClass\}">\$\{statusText\}</div>
            \$\{mediaHtml\}
            <div class="task-prompt-text">\$\{task\.prompt \|\| '暂无描述'\}</div>
            <div style="font-size:10px; color:#666;">\$\{new Date\(task\.createdAt\)\.toLocaleString\(\)\}</div>
        `;'''

card_inner_html_replace = r'''
        const actionsHtml = task.payload ? `
            <div style="display:flex; gap:0.5rem; margin-top:0.3rem;">
                <!-- Re-edit Button -->
                <button onclick="window.reEditTask('${task.id}')" style="background:rgba(255,255,255,0.1); border:none; color:white; padding:4px 8px; border-radius:4px; font-size:10px; cursor:pointer;" title="重新编辑">
                    <i class="ph ph-pencil-simple"></i> 编辑
                </button>
                <!-- Regenerate Button -->
                <button onclick="window.regenerateTask('${task.id}')" style="background:rgba(255,255,255,0.1); border:none; color:white; padding:4px 8px; border-radius:4px; font-size:10px; cursor:pointer;" title="再次生成">
                    <i class="ph ph-arrows-clockwise"></i> 重生
                </button>
            </div>
        ` : '';

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div class="task-status ${statusClass}">${statusText}</div>
                ${actionsHtml}
            </div>
            ${mediaHtml}
            <div class="task-prompt-text" title="${task.prompt || ''}">${task.prompt || '暂无描述'}</div>
            <div style="font-size:10px; color:#666;">${new Date(task.createdAt).toLocaleString()}</div>
        `;'''

content = re.sub(card_inner_html_search, card_inner_html_replace, content)

# 5. Inject the action logic functions at the bottom
actions_logic = r'''
window.reEditTask = function(taskId) {
    const task = taskHistory.find(t => t.id === taskId);
    if (!task || !task.appState) {
        alert("无法复原此任务状态");
        return;
    }
    const st = task.appState;
    promptInput.value = st.promptValue || '';
    referenceModeSelect.value = st.referenceMode || 'all';
    referenceModeSelect.dispatchEvent(new Event('change'));
    
    aspectRatioSelect.value = st.aspectRatio || '9:16|1080x1920';
    durationSelect.value = st.duration || '4';
    generateAudioCheck.checked = st.generateAudio || false;

    // Restore files
    if (st.referenceMode === 'first_last') {
        firstFrameDataUrl = st.firstFrameDataUrl || null;
        lastFrameDataUrl = st.lastFrameDataUrl || null;
        renderFLPreview();
    } else {
        uploadedFiles.length = 0; // clear current
        if (st.uploadedFiles) {
            st.uploadedFiles.forEach(f => {
                uploadedFiles.push({
                    id: f.id,
                    name: f.name,
                    dataUrl: f.dataUrl,
                    role: f.role,
                    icon: f.icon
                });
            });
        }
        renderTokens();
    }
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.regenerateTask = async function(taskId) {
    const task = taskHistory.find(t => t.id === taskId);
    if (!task || !task.payload) {
        alert("无法找到重试该任务所需的 Payload！");
        return;
    }
    
    setLoadingState(true);
    updateStatus('Submitting duplicate task...');
    
    try {
        const response = await fetch(COMPLETIONS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify(task.payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const newTaskId = data.id;
        if (!newTaskId) throw new Error('No task ID returned.');

        showStatus('Task recreated successfully!', false, true);
        setLoadingState(false);
        
        addNewTask(newTaskId, task.prompt, task.payload, task.appState);
        
    } catch (error) {
        console.error('Regeneration Error:', error);
        showStatus(error.message, true);
        setLoadingState(false);
    }
};

'''

content += actions_logic

with open('app.js', 'w') as f:
    f.write(content)
