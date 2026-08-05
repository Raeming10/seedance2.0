const fs = require('fs');

let content = fs.readFileSync('app.js', 'utf8');

// Remove the hover actions logic and customRole properties
content = content.replace(/window\.setFrameRole = function[\s\S]*?renderTokens\(\);\n}/, '');

content = content.replace(/let roleBadge = '';[\s\S]*?<\/div>\n\s*`;/m, `
        div.innerHTML += \`
            <div class="remove-btn" onclick="event.stopPropagation(); window.removeFile('\${uf.id}')"><i class="ph ph-x"></i></div>
            <div class="badge-overlay">\${uf.name}</div>
        \`;
`);

content = content.replace(/div\.addEventListener\('mouseenter'[\s\S]*?\}\);\n*\s*div\.addEventListener\('mouseleave'[\s\S]*?\}\);/m, '');

// Inject UI toggle logic
const toggleLogic = `
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
    const file = Array.from(files)[0];
    if (!file || !file.type.startsWith('image/')) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const url = e.target.result; // skipping compression here for brevity, or we can use it
        if (type === 'first') firstFrameDataUrl = url;
        if (type === 'last') lastFrameDataUrl = url;
        renderFLPreview();
    };
    reader.readAsDataURL(file);
}

function renderFLPreview() {
    const firstPreview = document.getElementById('firstFramePreview');
    if (firstFrameDataUrl) {
        firstPreview.style.backgroundImage = \`url('\${firstFrameDataUrl}')\`;
        firstPreview.innerHTML = \`<div class="fl-preview-remove" onclick="event.stopPropagation(); window.removeFL('first')"><i class="ph ph-x"></i></div>\`;
        firstPreview.classList.remove('hidden');
    } else {
        firstPreview.classList.add('hidden');
    }

    const lastPreview = document.getElementById('lastFramePreview');
    if (lastFrameDataUrl) {
        lastPreview.style.backgroundImage = \`url('\${lastFrameDataUrl}')\`;
        lastPreview.innerHTML = \`<div class="fl-preview-remove" onclick="event.stopPropagation(); window.removeFL('last')"><i class="ph ph-x"></i></div>\`;
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

`;

content = content.replace("const fileInput = document.getElementById('fileInput');", toggleLogic + "\nconst fileInput = document.getElementById('fileInput');");

// Strip the natural language prompt injection:
content = content.replace(/let finalPromptValue = promptValue;\n\s*uploadedFiles\.forEach\(uf => \{[\s\S]*?\}\);\n/, 'let finalPromptValue = promptValue;\n');

// Update content array population to handle the specific first_last mode:
const payloadGen = `
    const contentArray = [];
    const referenceMode = referenceModeSelect.value;

    if (referenceMode === 'first_last') {
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
`;

content = content.replace(/const contentArray = \[\];[\s\S]*?contentArray\.push\(\{\n\s*type: 'text',\n\s*text: finalPromptValue\n\s*\}\);/m, payloadGen);

fs.writeFileSync('app.js', content, 'utf8');
console.log('patched');
