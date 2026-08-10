const assert = require('node:assert/strict');
const test = require('node:test');

let api = {};
try {
    api = require('./minimax_h3_api');
} catch (_) {
    // The first TDD run intentionally happens before the module exists.
}

test('builds a fixed-768P MiniMax H3 image-to-video payload', () => {
    assert.equal(typeof api.buildMinimaxH3Payload, 'function');
    assert.deepEqual(api.buildMinimaxH3Payload({
        prompt: 'The camera slowly pulls back',
        imageUrl: 'data:image/jpeg;base64,aaa',
        endImageUrl: 'data:image/jpeg;base64,bbb',
        duration: 8,
    }), {
        prompt: 'The camera slowly pulls back',
        duration: 8,
        resolution: '768P',
        image_url: 'data:image/jpeg;base64,aaa',
        end_image_url: 'data:image/jpeg;base64,bbb',
    });
});

test('supports one opening frame and validates the fal-hosted H3 duration range', () => {
    assert.equal(api.isMinimaxH3Model('minimax/h3/image-to-video'), true);
    assert.deepEqual(api.buildMinimaxH3Payload({
        prompt: 'Animate the portrait',
        imageUrl: 'https://example.com/start.jpg',
        duration: 5,
    }), {
        prompt: 'Animate the portrait',
        duration: 5,
        resolution: '768P',
        image_url: 'https://example.com/start.jpg',
    });
    assert.throws(
        () => api.buildMinimaxH3Payload({ prompt: 'animate', imageUrl: 'start', duration: 4 }),
        /5 to 15/
    );
    assert.throws(
        () => api.buildMinimaxH3Payload({ prompt: 'animate', duration: 5 }),
        /opening frame/
    );
});

test('defaults H3 delivery to native audio and follows the frontend audio toggle', () => {
    assert.equal(typeof api.shouldStripAudio, 'function');
    assert.equal(api.shouldStripAudio(), false);
    assert.equal(api.shouldStripAudio(false), true);
    assert.equal(api.shouldStripAudio(true), false);
});

test('exposes every app aspect ratio and computes a centered crop for it', () => {
    assert.deepEqual(api.SUPPORTED_ASPECT_RATIOS, [
        '9:16', '16:9', '4:3', '3:4', '1:1', '21:9',
    ]);
    assert.deepEqual(api.getCenterCrop(1920, 1080, '9:16'), {
        sx: 656.25,
        sy: 0,
        sWidth: 607.5,
        sHeight: 1080,
    });
    assert.deepEqual(api.getCenterCrop(1080, 1920, '21:9'), {
        sx: 0,
        sy: 728.5714285714286,
        sWidth: 1080,
        sHeight: 462.85714285714283,
    });
});

test('normalizes MiniMax H3 fal queue responses', () => {
    assert.equal(api.getRequestId({ request_id: 'h3-123' }), 'h3-123');
    assert.deepEqual(api.normalizeQueueStatus({ status: 'COMPLETED' }), {
        status: 'succeed',
        progress: 100,
        errorMessage: null,
    });
    assert.equal(api.normalizeQueueStatus({ status: 'IN_PROGRESS' }).status, 'rendering');
    assert.equal(
        api.extractVideoUrl({ video: { url: 'https://example.com/h3.mp4' } }),
        'https://example.com/h3.mp4'
    );
});
