(function(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.KlingApi = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    const KLING_V3_PRO_MODEL = 'fal-ai/kling-video/v3/pro/image-to-video';
    const SUPPORTED_DURATIONS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

    function isKlingModel(model) {
        return model === KLING_V3_PRO_MODEL;
    }

    function buildKlingPayload({ prompt, startImageUrl, endImageUrl, duration, generateAudio = false }) {
        const normalizedDuration = Number(duration);

        if (!String(prompt || '').trim()) {
            throw new Error('Kling V3 Pro requires a prompt.');
        }
        if (!startImageUrl || !endImageUrl) {
            throw new Error('Kling V3 Pro 首尾帧模式必须同时上传首帧和尾帧。');
        }
        if (!SUPPORTED_DURATIONS.includes(normalizedDuration)) {
            throw new Error('Kling V3 Pro only supports durations from 3 to 15 seconds.');
        }

        return {
            prompt: String(prompt).trim(),
            start_image_url: startImageUrl,
            end_image_url: endImageUrl,
            duration: String(normalizedDuration),
            generate_audio: Boolean(generateAudio),
        };
    }

    function normalizeKlingPayload(payload) {
        if (!payload?.image_url || payload.start_image_url) return { ...payload };
        const normalized = {
            ...payload,
            start_image_url: payload.image_url,
            generate_audio: Boolean(payload.generate_audio),
        };
        delete normalized.image_url;
        return normalized;
    }

    function getRequestId(responseBody) {
        return responseBody?.request_id || responseBody?.requestId || null;
    }

    function normalizeQueueStatus(responseBody) {
        const rawStatus = String(responseBody?.status || '').toUpperCase();
        if (rawStatus === 'COMPLETED') {
            return { status: 'succeed', progress: 100, errorMessage: null };
        }
        if (['FAILED', 'CANCELLED', 'CANCELED'].includes(rawStatus)) {
            return {
                status: 'error',
                progress: 0,
                errorMessage: responseBody?.error || responseBody?.message || 'Kling generation failed.',
            };
        }
        return {
            status: rawStatus === 'IN_QUEUE' ? 'pending' : 'rendering',
            progress: 0,
            errorMessage: null,
        };
    }

    function extractVideoUrl(responseBody) {
        return responseBody?.video?.url || responseBody?.data?.video?.url || null;
    }

    return {
        KLING_V3_PRO_MODEL,
        SUPPORTED_DURATIONS: [...SUPPORTED_DURATIONS],
        buildKlingPayload,
        extractVideoUrl,
        getRequestId,
        isKlingModel,
        normalizeKlingPayload,
        normalizeQueueStatus,
    };
});
