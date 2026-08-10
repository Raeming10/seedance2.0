(function(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MinimaxH3Api = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    const MINIMAX_H3_MODEL = 'minimax/h3/image-to-video';
    const SUPPORTED_DURATIONS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const SUPPORTED_ASPECT_RATIOS = ['9:16', '16:9', '4:3', '3:4', '1:1', '21:9'];

    function isMinimaxH3Model(model) {
        return model === MINIMAX_H3_MODEL;
    }

    function shouldStripAudio(generateAudio = true) {
        return !Boolean(generateAudio);
    }

    function buildMinimaxH3Payload({ prompt, imageUrl, endImageUrl = null, duration }) {
        const normalizedPrompt = String(prompt || '').trim();
        const normalizedDuration = Number(duration);

        if (!normalizedPrompt) {
            throw new Error('MiniMax H3 requires a prompt.');
        }
        if (!imageUrl) {
            throw new Error('MiniMax H3 requires an opening frame image.');
        }
        if (!SUPPORTED_DURATIONS.includes(normalizedDuration)) {
            throw new Error('MiniMax H3 only supports durations from 5 to 15 seconds.');
        }

        const payload = {
            prompt: normalizedPrompt,
            duration: normalizedDuration,
            resolution: '768P',
            image_url: imageUrl,
        };
        if (endImageUrl) payload.end_image_url = endImageUrl;
        return payload;
    }

    function getCenterCrop(width, height, aspectRatio) {
        if (!SUPPORTED_ASPECT_RATIOS.includes(aspectRatio)) {
            throw new Error('Unsupported MiniMax H3 aspect ratio.');
        }
        const [ratioWidth, ratioHeight] = aspectRatio.split(':').map(Number);
        const targetRatio = ratioWidth / ratioHeight;
        const sourceRatio = width / height;

        if (sourceRatio > targetRatio) {
            const sWidth = height * targetRatio;
            return { sx: (width - sWidth) / 2, sy: 0, sWidth, sHeight: height };
        }

        const sHeight = width / targetRatio;
        return { sx: 0, sy: (height - sHeight) / 2, sWidth: width, sHeight };
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
                errorMessage: responseBody?.error || responseBody?.message || 'MiniMax H3 generation failed.',
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
        MINIMAX_H3_MODEL,
        SUPPORTED_ASPECT_RATIOS: [...SUPPORTED_ASPECT_RATIOS],
        SUPPORTED_DURATIONS: [...SUPPORTED_DURATIONS],
        buildMinimaxH3Payload,
        extractVideoUrl,
        getCenterCrop,
        getRequestId,
        isMinimaxH3Model,
        normalizeQueueStatus,
        shouldStripAudio,
    };
});
