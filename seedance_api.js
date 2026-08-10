(function(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.SeedanceApi = factory(root);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
    const DEFAULT_BASE_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3';
    const DEFAULT_MODEL = 'dreamina-seedance-2-0-260128';
    const INTERVIEWCODER_UNFILTERED_MODELS = [
        'seedance-2.0-unfiltered',
        'seedance-2.0-fast-unfiltered',
        'seedance-2.0-mini-unfiltered',
    ];
    const INTERVIEWCODER_ASPECT_RATIOS = ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'];
    const MODEL_OPTIONS = [
        { label: 'Seedance 2.0 Standard', value: 'dreamina-seedance-2-0-260128' },
        { label: 'Seedance 2.0 Mini', value: 'dreamina-seedance-2-0-mini-260615' },
        { label: 'Seedance 2.0 Standard Unfiltered', value: 'seedance-2.0-unfiltered' },
        { label: 'Seedance 2.0 Fast Unfiltered', value: 'seedance-2.0-fast-unfiltered' },
        { label: 'Seedance 2.0 Mini Unfiltered', value: 'seedance-2.0-mini-unfiltered' },
        { label: 'Kling V3 Pro 首尾帧 (fal.ai)', value: 'fal-ai/kling-video/v3/pro/image-to-video' },
        { label: 'MiniMax H3 图生视频 768P (fal.ai)', value: 'minimax/h3/image-to-video' },
    ];

    function stripTrailingSlash(value) {
        return String(value || '').replace(/\/+$/, '');
    }

    function getConfig(overrides = {}) {
        const runtimeConfig = root && root.SEEDANCE_CONFIG ? root.SEEDANCE_CONFIG : {};
        const merged = {
            accountId: '',
            apiKeyName: '',
            apiKey: '',
            model: DEFAULT_MODEL,
            baseUrl: DEFAULT_BASE_URL,
            ...runtimeConfig,
            ...overrides,
        };
        merged.baseUrl = stripTrailingSlash(merged.baseUrl);
        merged.createUrl = `${merged.baseUrl}/contents/generations/tasks`;
        merged.filesUrl = `${merged.baseUrl}/files`;
        return merged;
    }

    function buildAuthHeaders(apiKey) {
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) {
            headers.Authorization = `Bearer ${apiKey}`;
        }
        return headers;
    }

    function getModelOptions() {
        return MODEL_OPTIONS.map(option => ({ ...option }));
    }

    function getReferenceRoleForMimeType(mimeType) {
        const value = String(mimeType || '').toLowerCase();
        if (value.startsWith('video/')) return 'reference_video';
        if (value.startsWith('audio/')) return 'reference_audio';
        return 'reference_image';
    }

    function isInterviewCoderModel(model) {
        return INTERVIEWCODER_UNFILTERED_MODELS.includes(model);
    }

    function buildInterviewCoderPayload({ model, prompt, duration, aspectRatio, imageUrl = null }) {
        if (!isInterviewCoderModel(model)) {
            throw new Error('Unsupported InterviewCoder model.');
        }
        if (!String(prompt || '').trim()) {
            throw new Error('A prompt is required.');
        }
        const normalizedDuration = Number(duration);
        if (!Number.isInteger(normalizedDuration) || normalizedDuration < 4 || normalizedDuration > 15) {
            throw new Error('InterviewCoder videos must be 4 to 15 seconds.');
        }
        if (!INTERVIEWCODER_ASPECT_RATIOS.includes(aspectRatio)) {
            throw new Error('Unsupported aspect ratio for InterviewCoder.');
        }
        if (imageUrl && !/^https:\/\//i.test(String(imageUrl))) {
            throw new Error('InterviewCoder I2V requires a directly readable public HTTPS image URL.');
        }

        const payload = {
            model,
            prompt: String(prompt).trim(),
            duration_seconds: normalizedDuration,
            resolution: '720p',
            aspect_ratio: aspectRatio,
            generate_audio: false,
        };

        if (imageUrl) {
            payload.inputs = [{
                type: 'image_url',
                role: 'reference_image',
                url: imageUrl,
            }];
        }

        return payload;
    }

    function buildSeedancePayload({
        model = DEFAULT_MODEL,
        content,
        ratio,
        resolution = '720p',
        duration,
        generateAudio = false,
        watermark = false,
        returnLastFrame = false,
    }) {
        const payload = {
            model,
            content,
            ratio,
            resolution,
            duration,
            generate_audio: Boolean(generateAudio),
        };

        payload.watermark = Boolean(watermark);

        if (returnLastFrame) {
            payload.return_last_frame = true;
        }

        return payload;
    }

    function isHttpUrl(value) {
        return /^https?:\/\//i.test(String(value || ''));
    }

    function normalizePromptReferences(promptValue, files = []) {
        return files.reduce((prompt, file) => {
            const name = String(file?.name || '');
            if (!name) return prompt;
            const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const referenceLabel = name
                .replace(/^图片(\d+)$/, '[Image $1]')
                .replace(/^视频(\d+)$/, '[Video $1]')
                .replace(/^音频(\d+)$/, '[Audio $1]');
            return prompt.replace(new RegExp(`@${escapedName}(?!\\d)`, 'g'), referenceLabel);
        }, String(promptValue || ''));
    }

    function mediaNeedsPublicUpload(file) {
        const currentUrl = file?.publicUrl || file?.dataUrl || '';
        if (isHttpUrl(currentUrl) || /^asset:\/\//i.test(currentUrl)) return false;
        return /^data:/i.test(currentUrl);
    }

    function buildSeedanceReferenceItems(files = []) {
        return files.map(file => {
            const url = file?.publicUrl || file?.dataUrl;
            if (file?.role === 'reference_video') {
                return { type: 'video_url', video_url: { url }, role: 'reference_video' };
            }
            if (file?.role === 'reference_audio') {
                return { type: 'audio_url', audio_url: { url }, role: 'reference_audio' };
            }
            return { type: 'image_url', image_url: { url }, role: 'reference_image' };
        });
    }

    function isValidImageDataUrl(value) {
        const match = String(value || '').match(
            /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/]+={0,2})$/
        );
        return Boolean(match && match[1].length % 4 === 0);
    }

    function extractUploadedFileUrl(responseBody) {
        const file = responseBody?.data || responseBody || {};
        const candidates = [
            file.url,
            file.file_url,
            file.download_url,
            file.content_url,
            file.public_url,
            file.file?.url,
            file.file?.download_url,
        ];
        return candidates.find(isHttpUrl) || null;
    }

    function validateSeedanceContent(content) {
        const items = Array.isArray(content) ? content : [];
        const hasFirstFrame = items.some(item => item.role === 'first_frame');
        const hasLastFrame = items.some(item => item.role === 'last_frame');

        if (hasFirstFrame !== hasLastFrame) {
            throw new Error('BytePlus first and last frame images must both be provided. 首尾帧模式必须同时上传首帧和尾帧。');
        }

        items.forEach(item => {
            const imageUrl = typeof item.image_url === 'string' ? item.image_url : item.image_url?.url;
            if (item.type === 'image_url') {
                const isSupportedImageReference = isHttpUrl(imageUrl)
                    || /^asset:\/\/[A-Za-z0-9._:-]+$/.test(String(imageUrl || ''))
                    || isValidImageDataUrl(imageUrl);
                if (!isSupportedImageReference) {
                    throw new Error('Invalid Base64 image reference. 图片必须使用公网 http(s) URL、asset:// 素材 ID，或完整的 data:image/<格式>;base64,<数据>。');
                }
            }

            const videoUrl = typeof item.video_url === 'string' ? item.video_url : item.video_url?.url;
            if ((item.role === 'reference_video' || item.type === 'video_url') && !isHttpUrl(videoUrl)) {
                throw new Error('BytePlus reference video must use an http(s) URL. 参考视频必须先上传到公网 URL，不能直接使用本地视频文件。');
            }
        });
    }

    function buildTaskStatusUrl(taskId, baseUrl = DEFAULT_BASE_URL) {
        return `${stripTrailingSlash(baseUrl)}/contents/generations/tasks/${encodeURIComponent(taskId)}`;
    }

    function getTaskId(responseBody) {
        if (!responseBody) return null;
        return responseBody.id || responseBody.task_id || responseBody.data?.id || responseBody.data?.task_id || null;
    }

    function extractVideoUrl(content) {
        if (!content) return null;
        if (typeof content.video_url === 'string') return content.video_url;
        if (content.video_url?.url) return content.video_url.url;
        if (Array.isArray(content)) {
            const videoItem = content.find(item => item.type === 'video_url' || item.video_url);
            if (typeof videoItem?.video_url === 'string') return videoItem.video_url;
            if (videoItem?.video_url?.url) return videoItem.video_url.url;
        }
        return null;
    }

    function getTaskErrorDetails(task) {
        const error = task?.error;
        return {
            code: String(task?.errorCode || (typeof error === 'object' ? error?.code : '') || ''),
            message: String((typeof error === 'string' ? error : error?.message) || task?.errorMessage || ''),
        };
    }

    function normalizeTaskStatus(responseBody) {
        const task = responseBody?.data?.status ? responseBody.data : responseBody;
        const rawStatus = String(task?.status || '').toLowerCase();
        const videoUrl = extractVideoUrl(task?.content);
        const errorMessage = task?.error?.message || task?.message || null;
        const errorCode = task?.error?.code || null;

        if (['succeed', 'succeeded', 'success', 'completed', 'done'].includes(rawStatus)) {
            return { status: 'succeed', videoUrl, progress: 100, errorMessage, errorCode };
        }

        if (['failed', 'error', 'cancelled', 'canceled', 'expired'].includes(rawStatus)) {
            return { status: 'error', videoUrl, progress: task?.progress || 0, errorMessage, errorCode };
        }

        return {
            status: rawStatus === 'queued' ? 'pending' : 'rendering',
            videoUrl,
            progress: task?.progress || 0,
            errorMessage,
            errorCode,
        };
    }

    return {
        INTERVIEWCODER_ASPECT_RATIOS: [...INTERVIEWCODER_ASPECT_RATIOS],
        INTERVIEWCODER_UNFILTERED_MODELS: [...INTERVIEWCODER_UNFILTERED_MODELS],
        buildAuthHeaders,
        buildInterviewCoderPayload,
        buildSeedanceReferenceItems,
        buildSeedancePayload,
        buildTaskStatusUrl,
        extractUploadedFileUrl,
        getConfig,
        getModelOptions,
        getReferenceRoleForMimeType,
        getTaskErrorDetails,
        getTaskId,
        isInterviewCoderModel,
        mediaNeedsPublicUpload,
        normalizePromptReferences,
        normalizeTaskStatus,
        validateSeedanceContent,
    };
});
