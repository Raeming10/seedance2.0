const seedanceConfig = window.SeedanceApi.getConfig();
const API_KEY = seedanceConfig.apiKey;
const MODEL = seedanceConfig.model;
const COMPLETIONS_URL = seedanceConfig.createUrl;
const FILES_URL = seedanceConfig.filesUrl;

// DOM Elements
const promptInput = document.getElementById('prompt');
const generateBtn = document.getElementById('generateBtn');
const modelSelect = document.getElementById('modelSelect');
const aspectRatioSelect = document.getElementById('aspectRatio');
const durationSelect = document.getElementById('duration');
const generateAudioCheck = document.getElementById('generateAudio');

const dropZone = document.getElementById('dropZone');

let firstFrameDataUrl = null;
let lastFrameDataUrl = null;

const referenceModeSelect = document.getElementById('referenceMode');
const firstLastDropZone = document.getElementById('firstLastDropZone');

referenceModeSelect.addEventListener('change', () => {
    if (referenceModeSelect.value === 'first_last') {
        dropZone.classList.add('hidden');
        firstLastDropZone.classList.remove('hidden');
        firstLastDropZone.style.display = 'flex';
    } else {
        dropZone.classList.remove('hidden');
        firstLastDropZone.classList.add('hidden');
        firstLastDropZone.style.display = 'none';
    }
});

['first', 'last'].forEach(type => {
    const input = document.getElementById(type + 'FrameInput');
    input.addEventListener('change', (e) => {
        handleFLFiles(e.target.files, type);
        input.value = ''; // reset
    });
});

window.handleFLDrop = function(e, type) {
    e.preventDefault();
    if (e.dataTransfer.files) {
        handleFLFiles(e.dataTransfer.files, type);
    }
}

function handleFLFiles(files, type) {
    const file = Array.from(files)[0];
    if (!file || !file.type.startsWith('image/')) return;
    
    // Use canvas to compress similarly to general images
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 1080;
        let w = img.width, h = img.height;
        if (w > h && w > MAX) { h *= MAX / w; w = MAX; }
        else if (h > MAX) { w *= MAX / h; h = MAX; }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const url = canvas.toDataURL('image/jpeg', 0.85);

        if (type === 'first') firstFrameDataUrl = url;
        if (type === 'last') lastFrameDataUrl = url;
        renderFLPreview();
    };
    
    const reader = new FileReader();
    reader.onload = (e) => {
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function renderFLPreview() {
    const firstPreview = document.getElementById('firstFramePreview');
    if (firstFrameDataUrl) {
        firstPreview.style.backgroundImage = `url('${firstFrameDataUrl}')`;
        firstPreview.innerHTML = `<div class="fl-preview-remove" onclick="event.stopPropagation(); window.removeFL('first')"><i class="ph ph-x"></i></div>`;
        firstPreview.classList.remove('hidden');
    } else {
        firstPreview.classList.add('hidden');
    }

    const lastPreview = document.getElementById('lastFramePreview');
    if (lastFrameDataUrl) {
        lastPreview.style.backgroundImage = `url('${lastFrameDataUrl}')`;
        lastPreview.innerHTML = `<div class="fl-preview-remove" onclick="event.stopPropagation(); window.removeFL('last')"><i class="ph ph-x"></i></div>`;
        lastPreview.classList.remove('hidden');
    } else {
        lastPreview.classList.add('hidden');
    }
}

window.removeFL = function(type) {
    if (type === 'first') firstFrameDataUrl = null;
    if (type === 'last') lastFrameDataUrl = null;
    renderFLPreview();
}

const fileInput = document.getElementById('fileInput');
const uploadedTokensContainer = document.getElementById('uploadedTokens');
const mentionDropdown = document.getElementById('mentionDropdown');
const charCountEl = document.getElementById('charCount');
const atBtn = document.getElementById('atBtn');

const statusMessage = document.getElementById('statusMessage');
const statusText = document.getElementById('statusText');
const elapsedTimeEl = document.getElementById('elapsedTime');
const spinnerIcon = document.querySelector('.spin-anim');

function initializeModelSelect() {
    if (!modelSelect) return;

    const options = window.SeedanceApi.getModelOptions();
    modelSelect.innerHTML = options
        .map(option => `<option value="${option.value}">${option.label}</option>`)
        .join('');

    const configuredModel = seedanceConfig.model;
    modelSelect.value = options.some(option => option.value === configuredModel)
        ? configuredModel
        : MODEL;
}

function replaceDurationOptions(values, preferredValue) {
    const preferred = String(preferredValue || durationSelect.value);
    durationSelect.innerHTML = values
        .map(value => `<option value="${value}">${value}s</option>`)
        .join('');
    durationSelect.value = values.map(String).includes(preferred) ? preferred : String(values[0]);
}

function updateModelUi() {
    const isKling = window.KlingApi.isKlingModel(modelSelect?.value);
    const isInterviewCoder = window.SeedanceApi.isInterviewCoderModel(modelSelect?.value);
    const isInterviewCoderContent = window.SeedanceApi.isInterviewCoderContentModel(modelSelect?.value);
    fileInput.accept = 'image/*,video/*,audio/*';
    if (isKling) {
        referenceModeSelect.value = 'first_last';
        referenceModeSelect.dispatchEvent(new Event('change'));
        referenceModeSelect.disabled = true;
        aspectRatioSelect.disabled = true;
        generateAudioCheck.checked = false;
        generateAudioCheck.disabled = false;
        replaceDurationOptions(window.KlingApi.SUPPORTED_DURATIONS, durationSelect.value);
        promptInput.placeholder = '描述首帧到尾帧之间的运动或转场。可用 @Image1 表示首帧、@Image2 表示尾帧。';
    } else if (isInterviewCoderContent) {
        referenceModeSelect.value = 'all';
        referenceModeSelect.dispatchEvent(new Event('change'));
        referenceModeSelect.disabled = true;
        fileInput.accept = 'image/*';
        aspectRatioSelect.value = '16:9|1920x1080';
        aspectRatioSelect.disabled = true;
        generateAudioCheck.checked = false;
        generateAudioCheck.disabled = true;
        replaceDurationOptions([5], 5);
        promptInput.placeholder = '上传 1 张图片并描述运动；使用 InterviewCoder v7 inputs 格式提交。';
    } else if (isInterviewCoder) {
        referenceModeSelect.value = 'all';
        referenceModeSelect.dispatchEvent(new Event('change'));
        referenceModeSelect.disabled = true;
        dropZone.classList.add('hidden');
        aspectRatioSelect.value = '16:9|1920x1080';
        aspectRatioSelect.disabled = true;
        generateAudioCheck.checked = false;
        generateAudioCheck.disabled = true;
        replaceDurationOptions([5], 5);
        promptInput.placeholder = '描述要生成的视频。此模型固定为 5 秒、480p、16:9、无音频。';
    } else {
        referenceModeSelect.dispatchEvent(new Event('change'));
        referenceModeSelect.disabled = false;
        aspectRatioSelect.disabled = false;
        generateAudioCheck.disabled = false;
        replaceDurationOptions([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], durationSelect.value);
        promptInput.placeholder = '上传1-12个参考素材，输入文字，自由组合图、文、音、视频多元素，定义精彩互动。';
    }
}

let timerInterval;
let uploadedFiles = []; // { id, name, file, dataUrl, role, icon, uploadStatus, publicUrl }

initializeModelSelect();
updateModelUi();
modelSelect.addEventListener('change', updateModelUi);

// Drag and drop events
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

function createUploadedFile(file, dataUrl, role, icon) {
    const uploadedFile = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        name: '',
        file,
        dataUrl,
        role,
        icon,
        uploadStatus: role === 'reference_video' ? 'uploading' : 'ready',
        uploadError: null,
        fileId: null,
        publicUrl: null
    };

    uploadedFiles.push(uploadedFile);
    recalculateNames();
    renderTokens();

    if (role === 'reference_video') {
        uploadReferenceVideo(uploadedFile);
    }
}

async function uploadReferenceVideo(uploadedFile) {
    if (!API_KEY) {
        uploadedFile.uploadStatus = 'error';
        uploadedFile.uploadError = 'Missing BytePlus ARK API key.';
        renderTokens();
        return;
    }

    try {
        const localVideoUrl = await uploadReferenceFileViaLocalServer(uploadedFile);
        if (localVideoUrl) {
            uploadedFile.publicUrl = localVideoUrl;
            uploadedFile.dataUrl = localVideoUrl;
            uploadedFile.uploadStatus = 'ready';
            uploadedFile.uploadError = null;
            renderTokens();
            return;
        }

        const formData = new FormData();
        formData.append('purpose', 'user_data');
        formData.append('file', uploadedFile.file, uploadedFile.file.name || `${uploadedFile.id}.mp4`);

        const response = await fetch(FILES_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Upload Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        uploadedFile.fileId = data.id || data.data?.id || null;
        uploadedFile.publicUrl = window.SeedanceApi.extractUploadedFileUrl(data);

        if (uploadedFile.publicUrl) {
            uploadedFile.dataUrl = uploadedFile.publicUrl;
            uploadedFile.uploadStatus = 'ready';
            uploadedFile.uploadError = null;
        } else {
            uploadedFile.uploadStatus = 'uploaded_no_url';
            uploadedFile.uploadError = uploadedFile.fileId
                ? `视频已上传到 ModelArk（${uploadedFile.fileId}），但它没有返回 Seedance 可用的公网视频 URL。请用 node server.js 启动本地服务来自动生成公网临时链接。`
                : '视频已上传到 ModelArk，但它没有返回 Seedance 可用的公网视频 URL。请用 node server.js 启动本地服务来自动生成公网临时链接。';
        }
    } catch (error) {
        uploadedFile.uploadStatus = 'error';
        uploadedFile.uploadError = error.message;
    }

    renderTokens();
}

async function uploadReferenceFileViaLocalServer(uploadedFile, uploadBody = uploadedFile.file, uploadFilename = uploadedFile.file?.name) {
    const status = await fetch('/api/upload-status').then(response => {
        if (!response.ok) return null;
        return response.json();
    }).catch(() => null);

    if (!status) return null;

    for (let attempt = 0; attempt < 12; attempt++) {
        const currentStatus = attempt === 0
            ? status
            : await fetch('/api/upload-status').then(response => response.json()).catch(() => null);

        if (currentStatus?.ready) {
            const response = await fetch(`/api/upload-reference?filename=${encodeURIComponent(uploadFilename || `${uploadedFile.id}.bin`)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': uploadBody?.type || 'application/octet-stream'
                },
                body: uploadBody
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Local Upload Error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            return data.url || null;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('Public upload tunnel is not ready yet. 请稍等几秒后重新上传视频。');
}

function extensionForMimeType(mimeType) {
    const extensions = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'audio/mpeg': 'mp3',
        'audio/mp3': 'mp3',
        'audio/wav': 'wav',
        'audio/x-wav': 'wav',
        'video/mp4': 'mp4',
        'video/quicktime': 'mov',
    };
    return extensions[String(mimeType || '').toLowerCase()] || 'bin';
}

async function ensurePublicReferenceUrls(files) {
    const inlineFiles = files.filter(window.SeedanceApi.mediaNeedsPublicUpload);
    for (const file of inlineFiles) {
        file.uploadStatus = 'uploading';
        renderTokens();
        try {
            const mediaBlob = await fetch(file.dataUrl).then(response => response.blob());
            if (!mediaBlob.size) throw new Error('媒体文件为空。');
            const extension = extensionForMimeType(mediaBlob.type);
            const publicUrl = await uploadReferenceFileViaLocalServer(
                file,
                mediaBlob,
                `${file.id}.${extension}`
            );
            if (!/^https:\/\//i.test(String(publicUrl || ''))) {
                throw new Error('本地媒体上传服务不可用，请通过 node server.js 打开应用后重试。');
            }
            file.publicUrl = publicUrl;
            file.uploadStatus = 'ready';
            file.uploadError = null;
        } catch (error) {
            file.uploadStatus = 'error';
            file.uploadError = error.message;
            renderTokens();
            throw new Error(`${file.name || '参考素材'}上传失败：${error.message}`);
        }
        renderTokens();
    }
}

function handleFiles(files) {
    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            let role = window.SeedanceApi.getReferenceRoleForMimeType(file.type);
            let icon = 'ph-image';
            if (file.type.startsWith('video/')) {
                icon = 'ph-video-camera';
            } else if (file.type.startsWith('audio/')) {
                icon = 'ph-speaker-high';
            }

            if (file.type.startsWith('image/')) {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1080;
                    const MAX_HEIGHT = 1080;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);

                    createUploadedFile(file, compressedDataUrl, role, icon);
                };
                img.src = e.target.result;
            } else {
                createUploadedFile(file, e.target.result, role, icon);
            }
        };
        reader.readAsDataURL(file);
    });
    fileInput.value = ''; // reset
}

function recalculateNames() {
    let imgCounter = 0;
    let vidCounter = 0;
    let audCounter = 0;
    let promptContent = promptInput.value;

    const oldNames = uploadedFiles.map(f => f.name);

    uploadedFiles.forEach((file, idx) => {
        if (file.role === 'reference_video') {
            vidCounter++;
            file.name = `视频${vidCounter}`;
        } else if (file.role === 'reference_audio') {
            audCounter++;
            file.name = `音频${audCounter}`;
        } else {
            imgCounter++;
            file.name = `图片${imgCounter}`;
        }

        const oldName = oldNames[idx];
        if (oldName && oldName !== file.name) {
            // Replace old name references in prompt safely
            const regex = new RegExp(`@${oldName}(?!\\d)`, 'g');
            promptContent = promptContent.replace(regex, `@${file.name}`);
        }
    });

    if (promptInput.value !== promptContent) {
        promptInput.value = promptContent;
        // Trigger manual input update
        promptInput.dispatchEvent(new Event('input'));
    }
}



function renderTokens() {
    uploadedTokensContainer.innerHTML = '';
    const uploadPlaceholder = document.getElementById('uploadPlaceholder');
    
    if (uploadedFiles.length === 0) {
        uploadPlaceholder.classList.remove('mini');
        uploadPlaceholder.innerHTML = `<i class="ph ph-plus"></i><span style="font-size: 0.8rem; margin-top: 0.2rem; color: var(--text-muted);">参考内容</span>`;
        uploadedTokensContainer.classList.add('hidden');
    } else {
        uploadPlaceholder.classList.add('mini');
        uploadPlaceholder.innerHTML = `<i class="ph ph-plus" style="font-size: 1.2rem;"></i>`;
        uploadedTokensContainer.classList.remove('hidden');
    }

    uploadedFiles.forEach((uf, index) => {
        const div = document.createElement('div');
        div.className = 'uploaded-token-thumb';
        if (uf.uploadStatus === 'uploading') {
            div.classList.add('uploading');
        }
        if (uf.uploadStatus === 'error' || uf.uploadStatus === 'uploaded_no_url') {
            div.classList.add('upload-error');
            div.title = uf.uploadError || '';
        }
        div.draggable = true;
        
        if (uf.role === 'reference_video') {
            div.innerHTML = `<i class="ph ph-video-camera audio-icon-overlay"></i>`;
        } else if (uf.role !== 'reference_audio') {
            div.style.backgroundImage = `url('${uf.dataUrl}')`;
        } else {
            div.innerHTML = `<i class="ph ph-speaker-high audio-icon-overlay"></i>`;
        }

        const statusIcon = uf.uploadStatus === 'uploading'
            ? '<i class="ph ph-spinner-gap spin-anim"></i>'
            : (uf.uploadStatus === 'error' || uf.uploadStatus === 'uploaded_no_url')
                ? '<i class="ph ph-warning-circle"></i>'
                : '';
        
        div.innerHTML += `
            <div class="remove-btn" onclick="event.stopPropagation(); window.removeFile('${uf.id}')"><i class="ph ph-x"></i></div>
            <div class="badge-overlay">${statusIcon} ${uf.name}</div>
        `;

        
        
        
        div.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', index);
            div.classList.add('dragging');
        });
        
        div.addEventListener('dragend', () => {
            div.classList.remove('dragging');
        });
        
        div.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            div.classList.add('drag-over');
        });
        
        div.addEventListener('dragleave', () => {
            div.classList.remove('drag-over');
        });
        
        div.addEventListener('drop', (e) => {
            e.preventDefault();
            div.classList.remove('drag-over');
            const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
            if (draggedIndex !== index && !isNaN(draggedIndex)) {
                const [item] = uploadedFiles.splice(draggedIndex, 1);
                uploadedFiles.splice(index, 0, item);
                recalculateNames();
                renderTokens();
            }
        });

        uploadedTokensContainer.appendChild(div);
    });
}

window.removeFile = function(id) {
    uploadedFiles = uploadedFiles.filter(uf => uf.id !== id);
    recalculateNames();
    renderTokens();
}

// Mention Logic
promptInput.addEventListener('input', () => {
    const val = promptInput.value;
    charCountEl.textContent = val.length;

    const cursorPos = promptInput.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const match = textBeforeCursor.match(/@([^\s]*)$/);
    
    if (match) {
        const query = match[1].toLowerCase();
        const matches = uploadedFiles.filter(uf => uf.name.toLowerCase().includes(query));
        if (matches.length > 0) {
            showMentionDropdown(matches, match[0].length);
        } else {
            hideMentionDropdown();
        }
    } else {
        hideMentionDropdown();
    }
});

atBtn.addEventListener('click', () => {
    promptInput.focus();
    const cursorPos = promptInput.selectionStart;
    const val = promptInput.value;
    promptInput.value = val.slice(0, cursorPos) + '@' + val.slice(cursorPos);
    promptInput.selectionStart = cursorPos + 1;
    promptInput.selectionEnd = cursorPos + 1;
    promptInput.dispatchEvent(new Event('input'));
});

promptInput.addEventListener('blur', () => {
    setTimeout(hideMentionDropdown, 200);
});

function showMentionDropdown(matches, matchLength) {
    mentionDropdown.innerHTML = '';
    matches.forEach(uf => {
        const div = document.createElement('div');
        div.className = 'mention-item';
        div.innerHTML = `<i class="ph ${uf.icon}"></i> <span>${uf.name}</span>`;
        div.addEventListener('mousedown', (e) => {
            e.preventDefault(); // prevent blur from firing first
            const val = promptInput.value;
            const cursorPos = promptInput.selectionStart;
            const before = val.slice(0, cursorPos - matchLength);
            const after = val.slice(cursorPos);
            promptInput.value = before + '@' + uf.name + ' ' + after;
            hideMentionDropdown();
            promptInput.focus();
        });
        mentionDropdown.appendChild(div);
    });
    mentionDropdown.classList.remove('hidden');
}

function hideMentionDropdown() {
    mentionDropdown.classList.add('hidden');
}

// Listeners
generateBtn.addEventListener('click', handleGenerate);

async function handleGenerate() {
    const promptValue = promptInput.value.trim();
    if (!promptValue) {
        showStatus('Please enter a description for your video.', true);
        promptInput.focus();
        return;
    }

    // Parse options
    const [aspectRatio] = aspectRatioSelect.value.split('|');
    const selectedModel = modelSelect?.value || MODEL;
    const isInterviewCoder = window.SeedanceApi.isInterviewCoderModel(selectedModel);
    const isInterviewCoderContent = window.SeedanceApi.isInterviewCoderContentModel(selectedModel);
    const resolution = '720p';
    const duration = parseInt(durationSelect.value, 10);
    const generateAudio = generateAudioCheck.checked;

    const finalPromptValue = window.SeedanceApi.normalizePromptReferences(promptValue, uploadedFiles);

    if (window.KlingApi.isKlingModel(selectedModel)) {
        let klingPayload;
        try {
            klingPayload = window.KlingApi.buildKlingPayload({
                prompt: promptValue,
                startImageUrl: firstFrameDataUrl,
                endImageUrl: lastFrameDataUrl,
                duration,
                generateAudio,
            });
        } catch (validationError) {
            showStatus(validationError.message, true);
            return;
        }

        const appState = {
            promptValue,
            model: selectedModel,
            referenceMode: 'first_last',
            aspectRatio: aspectRatioSelect.value,
            duration: durationSelect.value,
            generateAudio,
            firstFrameDataUrl,
            lastFrameDataUrl,
            uploadedFiles: [],
        };

        setLoadingState(true);
        startTimer();
        try {
            updateStatus('Submitting Kling V3 Standard task to fal.ai...');
            const taskId = await submitKlingPayload(klingPayload);
            showStatus('Kling V3 Standard task created successfully! Check history below.', false, true);
            addNewTask(taskId, promptValue, klingPayload, appState, 'fal');
        } catch (error) {
            console.error('Kling Generation Error:', error);
            showStatus(error.message, true);
        } finally {
            setLoadingState(false);
            stopTimer();
        }
        return;
    }

    const pendingVideo = !isInterviewCoder && uploadedFiles.find(file => file.role === 'reference_video' && file.uploadStatus === 'uploading');
    if (pendingVideo) {
        showStatus(`${pendingVideo.name || '参考视频'} is still uploading. Please wait until it finishes.`, true);
        return;
    }

    const blockedVideo = !isInterviewCoder && uploadedFiles.find(file => file.role === 'reference_video' && file.uploadStatus !== 'ready');
    if (blockedVideo) {
        showStatus(blockedVideo.uploadError || `${blockedVideo.name || '参考视频'} is not ready.`, true);
        return;
    }

    
    const contentArray = [];
    const runMode = referenceModeSelect.value;

    if (runMode !== 'first_last' && !isInterviewCoder) {
        try {
            updateStatus('Uploading reference media to public HTTPS URLs...');
            await ensurePublicReferenceUrls(uploadedFiles);
        } catch (uploadError) {
            showStatus(uploadError.message, true);
            return;
        }
    }

    if (runMode === 'first_last') {
        if (!firstFrameDataUrl || !lastFrameDataUrl) {
            showStatus('首尾帧模式必须同时上传首帧和尾帧。', true);
            return;
        }

        if (firstFrameDataUrl) {
            contentArray.push({
                type: 'image_url',
                image_url: { url: firstFrameDataUrl },
                role: 'first_frame'
            });
        }
        if (lastFrameDataUrl) {
            contentArray.push({
                type: 'image_url',
                image_url: { url: lastFrameDataUrl },
                role: 'last_frame'
            });
        }
    } else {
        contentArray.push(...window.SeedanceApi.buildSeedanceReferenceItems(uploadedFiles));
    }

    contentArray.unshift({
        type: 'text',
        text: finalPromptValue
    });

    try {
        if (!isInterviewCoder) window.SeedanceApi.validateSeedanceContent(contentArray);
    } catch (validationError) {
        showStatus(validationError.message, true);
        return;
    }

    let payload;
    try {
        if (isInterviewCoderContent) {
            const imageFiles = uploadedFiles.filter(file => file.role === 'reference_image');
            if (imageFiles.length !== 1 || uploadedFiles.length !== 1) {
                throw new Error('实验 I2V 模式只支持上传 1 张图片，请移除其他素材。');
            }
            const imageFile = imageFiles[0];
            let imageUrl = imageFile.publicUrl;
            if (!/^https:\/\//i.test(String(imageUrl || ''))) {
                updateStatus('Uploading I2V reference image to a public HTTPS URL...');
                const compressedImage = await fetch(imageFile.dataUrl).then(response => response.blob());
                imageUrl = await uploadReferenceFileViaLocalServer(
                    imageFile,
                    compressedImage,
                    `${imageFile.id}.jpg`
                );
                imageFile.publicUrl = imageUrl;
            }
            payload = window.SeedanceApi.buildInterviewCoderImagePayload({
                prompt: promptValue,
                imageUrl,
            });
        } else if (isInterviewCoder) {
            payload = window.SeedanceApi.buildInterviewCoderPayload({
            model: selectedModel,
            prompt: promptValue,
            });
        } else {
            payload = window.SeedanceApi.buildSeedancePayload({
                model: selectedModel,
                content: contentArray,
                ratio: aspectRatio,
                duration: duration,
                resolution: resolution,
                generateAudio: generateAudio
            });
        }
    } catch (validationError) {
        showStatus(validationError.message, true);
        return;
    }

    setLoadingState(true);
    startTimer();
    

    
    try {
        if (!isInterviewCoder && !API_KEY) {
            throw new Error('Missing BytePlus ARK API key. Please set it in config.local.js.');
        }

        updateStatus(isInterviewCoderContent
            ? 'Submitting official-content I2V experiment...'
            : isInterviewCoder
                ? 'Submitting Mini Unfiltered task...'
                : 'Submitting task...');
        
        const response = await fetch(isInterviewCoder ? '/api/interviewcoder/videos' : COMPLETIONS_URL, {
            method: 'POST',
            headers: isInterviewCoder
                ? {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': crypto.randomUUID(),
                }
                : window.SeedanceApi.buildAuthHeaders(API_KEY),
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const taskId = window.SeedanceApi.getTaskId(data);
        
        if (!taskId) throw new Error('No task ID returned.');

        // Successfully fired task
        showStatus('Task created successfully! Check history below.', false, true);
        setLoadingState(false);
        stopTimer();
        
        // Capture app UI state for re-editing
        const appState = {
            promptValue: promptValue,
            model: selectedModel,
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
                icon: uf.icon,
                uploadStatus: uf.uploadStatus,
                uploadError: uf.uploadError,
                fileId: uf.fileId,
                publicUrl: uf.publicUrl
            }))
        };

        // Add to concurrent history
        addNewTask(taskId, finalPromptValue, payload, appState, isInterviewCoder ? 'interviewcoder' : 'byteplus');
        
    } catch (error) {
        console.error('Generation Error:', error);
        showStatus(error.message, true);
        setLoadingState(false);
        stopTimer();
    }
}

async function submitKlingPayload(payload) {
    const response = await fetch('/api/fal/kling-v3-standard/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(window.KlingApi.normalizeKlingPayload(payload)),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`fal.ai API Error: ${response.status} - ${errorText}`);
    }
    const taskId = window.KlingApi.getRequestId(await response.json());
    if (!taskId) throw new Error('fal.ai did not return a request ID.');
    return taskId;
}



// UI Helpers
function setLoadingState(isLoading) {
    generateBtn.disabled = isLoading;
    if (isLoading) {
        generateBtn.innerHTML = '<i class="ph ph-spinner-gap spin-anim"></i>';
        statusMessage.classList.remove('hidden', 'error');
        spinnerIcon.classList.remove('hidden');
        spinnerIcon.className = 'ph ph-spinner-gap spin-anim';
        elapsedTimeEl.classList.remove('hidden');
    } else {
        generateBtn.innerHTML = '<i class="ph ph-arrow-up"></i>';
        elapsedTimeEl.classList.add('hidden');
    }
}

function updateStatus(text) {
    statusText.textContent = text;
}

function showStatus(text, isError = false, hideSpinner = false) {
    statusMessage.classList.remove('hidden');
    statusText.textContent = text;
    
    if (isError) {
        statusMessage.classList.add('error');
        spinnerIcon.className = 'ph ph-warning-circle';
    } else if (hideSpinner) {
        spinnerIcon.className = 'ph ph-check-circle';
        spinnerIcon.style.color = 'var(--success)';
    } else {
        statusMessage.classList.remove('error');
        spinnerIcon.className = 'ph ph-spinner-gap spin-anim';
        spinnerIcon.style.color = 'var(--accent)';
    }
}


// Timer
let startTime;
function startTimer() {
    startTime = Date.now();
    elapsedTimeEl.textContent = '0:00';
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const diff = Date.now() - startTime;
        const totalSeconds = Math.floor(diff / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        elapsedTimeEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
}

// Aspect ratio to resolution mapping adjustments
aspectRatioSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    // Adapt UI if needed based on selected aspect ratio
    const videoContainer = document.querySelector('.video-container');
    if (val.startsWith('16:9')) {
        videoContainer.style.aspectRatio = '16 / 9';
    } else if (val.startsWith('9:16')) {
        videoContainer.style.aspectRatio = '9 / 16';
    }
});


// ---------------- Task History Manager ----------------
let taskHistory = JSON.parse(localStorage.getItem('seedanceTasks') || '[]');
const historyPanel = document.getElementById('historyPanel');
const tasksGrid = document.getElementById('tasksGrid');
const videoModal = document.getElementById('videoModal');
const modalVideo = document.getElementById('modalVideo');

function saveTasks() {
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
        if ((task.status === 'succeed' || task.status === 'success') && task.video_url) {
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
        `;
        tasksGrid.appendChild(card);
    });
}

function addNewTask(taskId, promptText, payload, appState, provider = 'byteplus') {
    taskHistory.push({
        id: taskId,
        provider,
        prompt: promptText,
        status: 'pending',
        progress: 0,
        createdAt: Date.now(),
        video_url: null,
        payload: payload,
        appState: appState
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
    const task = taskHistory.find(item => item.id === taskId);
    if (task?.provider === 'fal') {
        pollKlingTask(taskId);
        return;
    }

    const isInterviewCoder = task?.provider === 'interviewcoder';

    try {
        const response = await fetch(isInterviewCoder
            ? `/api/interviewcoder/videos/${encodeURIComponent(taskId)}`
            : window.SeedanceApi.buildTaskStatusUrl(taskId, seedanceConfig.baseUrl), {
            method: 'GET',
            headers: isInterviewCoder ? {} : window.SeedanceApi.buildAuthHeaders(API_KEY)
        });

        if (!response.ok) {
            setTimeout(() => pollTask(taskId), pollInterval);
            return;
        }

        const taskData = window.SeedanceApi.normalizeTaskStatus(await response.json());

        if (taskData.status === 'succeed') {
            console.log('Task completed! Video URL:', taskData.videoUrl);
            updateTask(taskId, {
                status: 'succeed',
                video_url: isInterviewCoder
                    ? `/api/interviewcoder/videos/${encodeURIComponent(taskId)}/content`
                    : taskData.videoUrl
            });
        } else if (taskData.status === 'error') {
            updateTask(taskId, { status: 'error', error: taskData.errorMessage });
        } else {
            updateTask(taskId, { status: taskData.status, progress: taskData.progress || 0 });
            setTimeout(() => pollTask(taskId), pollInterval);
        }
    } catch (e) {
        console.error(e);
        updateTask(taskId, { status: 'error' });
    }
}

async function pollKlingTask(taskId) {
    const pollInterval = 5000;
    try {
        const statusResponse = await fetch(`/api/fal/kling-v3-standard/requests/${encodeURIComponent(taskId)}/status`);
        if (!statusResponse.ok) {
            const errorText = await statusResponse.text();
            throw new Error(`fal.ai status error: ${statusResponse.status} - ${errorText}`);
        }

        const taskData = window.KlingApi.normalizeQueueStatus(await statusResponse.json());
        if (taskData.status === 'succeed') {
            const resultResponse = await fetch(`/api/fal/kling-v3-standard/requests/${encodeURIComponent(taskId)}/result`);
            if (!resultResponse.ok) {
                const errorText = await resultResponse.text();
                throw new Error(`fal.ai result error: ${resultResponse.status} - ${errorText}`);
            }
            const videoUrl = window.KlingApi.extractVideoUrl(await resultResponse.json());
            if (!videoUrl) throw new Error('fal.ai completed the task but returned no video URL.');
            updateTask(taskId, { status: 'succeed', progress: 100, video_url: videoUrl });
        } else if (taskData.status === 'error') {
            updateTask(taskId, { status: 'error', error: taskData.errorMessage });
        } else {
            updateTask(taskId, { status: taskData.status, progress: taskData.progress });
            setTimeout(() => pollTask(taskId), pollInterval);
        }
    } catch (error) {
        console.error(error);
        updateTask(taskId, { status: 'error', error: error.message });
    }
}

// Start polling for any incomplete tasks on load
taskHistory.forEach(task => {
    if (task.status === 'pending' || task.status === 'rendering') {
        pollTask(task.id);
    }
});
renderTaskHistory();

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
    
    if (modelSelect) {
        modelSelect.value = st.model || MODEL;
        modelSelect.dispatchEvent(new Event('change'));
    }
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
                    icon: f.icon,
                    uploadStatus: f.uploadStatus || 'ready',
                    uploadError: f.uploadError || null,
                    fileId: f.fileId || null,
                    publicUrl: f.publicUrl || null
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
        if (task.provider === 'fal') {
            const newTaskId = await submitKlingPayload(task.payload);
            showStatus('Kling V3 Standard task recreated successfully!', false, true);
            setLoadingState(false);
            addNewTask(newTaskId, task.prompt, task.payload, task.appState, 'fal');
            return;
        }

        const isInterviewCoder = task.provider === 'interviewcoder'
            || window.SeedanceApi.isInterviewCoderModel(task.payload.model);
        if (!isInterviewCoder && !API_KEY) {
            throw new Error('Missing BytePlus ARK API key. Please set it in config.local.js.');
        }

        if (!isInterviewCoder) {
            window.SeedanceApi.validateSeedanceContent(task.payload.content);
        }

        const response = await fetch(isInterviewCoder ? '/api/interviewcoder/videos' : COMPLETIONS_URL, {
            method: 'POST',
            headers: isInterviewCoder
                ? {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': crypto.randomUUID(),
                }
                : window.SeedanceApi.buildAuthHeaders(API_KEY),
            body: JSON.stringify(task.payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const newTaskId = window.SeedanceApi.getTaskId(data);
        if (!newTaskId) throw new Error('No task ID returned.');

        showStatus('Task recreated successfully!', false, true);
        setLoadingState(false);
        
        addNewTask(newTaskId, task.prompt, task.payload, task.appState, isInterviewCoder ? 'interviewcoder' : 'byteplus');
        
    } catch (error) {
        console.error('Regeneration Error:', error);
        showStatus(error.message, true);
        setLoadingState(false);
    }
};
