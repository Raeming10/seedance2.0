import re

with open('app.js', 'r') as f:
    content = f.read()

# Remove hover logic
content = re.sub(r'window\.setFrameRole = function[\s\S]*?renderTokens\(\);\n}', '', content)

content = re.sub(r'let roleBadge = \'\';[\s\S]*?</div>\n\s*`;', r'''
        div.innerHTML += `
            <div class="remove-btn" onclick="event.stopPropagation(); window.removeFile('${uf.id}')"><i class="ph ph-x"></i></div>
            <div class="badge-overlay">${uf.name}</div>
        `;
''', content)

content = re.sub(r'div\.addEventListener\(\'mouseenter\'[\s\S]*?\}\);\n*\s*div\.addEventListener\(\'mouseleave\'[\s\S]*?\}\);', '', content)

# Inject toggle logic
toggleLogic = """
let firstFrameDataUrl = null;
let lastFrameDataUrl = null;

const referenceModeSelect = document.getElementById('referenceMode');
const dropZone = document.getElementById('dropZone');
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

// Setup specialized file inputs
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
    const file = list(files)[0] if type=='python_err' else Array.from(files)[0]; """ # Just a python hack logic bypass string format 

toggleLogic = """
let firstFrameDataUrl = null;
let lastFrameDataUrl = null;

const referenceModeSelect = document.getElementById('referenceMode');
const dropZone = document.getElementById('dropZone');
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
"""

content = content.replace("const fileInput = document.getElementById('fileInput');", toggleLogic + "\nconst fileInput = document.getElementById('fileInput');")

content = re.sub(r'let finalPromptValue = promptValue;\n\s*uploadedFiles\.forEach\(uf => \{[\s\S]*?\}\);\n', 'let finalPromptValue = promptValue;\n', content)

payloadGen = """
    const contentArray = [];
    const runMode = referenceModeSelect.value;

    if (runMode === 'first_last') {
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
        uploadedFiles.forEach(uf => {
            let type = 'image_url';
            let key = 'image_url';
            let contentObj = {
                type: type,
                [key]: { url: uf.dataUrl }
            };

            if (uf.role === 'reference_video') {
                contentObj.type = 'video_url';
                contentObj.video_url = { url: uf.dataUrl };
                contentObj.role = uf.role;
                contentArray.push(contentObj);
            } else if (uf.role === 'reference_audio') {
                contentObj.type = 'audio_url';
                contentObj.audio_url = { url: uf.dataUrl };
                contentObj.role = uf.role;
                contentArray.push(contentObj);
            } else {
                contentObj.role = 'reference_image';
                contentArray.push(contentObj);
            }
        });
    }

    contentArray.push({
        type: 'text',
        text: finalPromptValue
    });
"""

content = re.sub(r'const contentArray = \[\];[\s\S]*?contentArray\.push\(\{\n\s*type: \'text\',\n\s*text: finalPromptValue\n\s*\}\);', payloadGen, content)

with open('app.js', 'w') as f:
    f.write(content)

