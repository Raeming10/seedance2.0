const assert = require('node:assert/strict');
const test = require('node:test');

const {
    KLING_V3_STANDARD_MODEL,
    buildKlingPayload,
    extractVideoUrl,
    getRequestId,
    isKlingModel,
    normalizeKlingPayload,
    normalizeQueueStatus,
} = require('./kling_api');

test('builds a Kling V3 Standard first-last-frame payload', () => {
    assert.deepEqual(buildKlingPayload({
        prompt: 'Move smoothly from @Image1 to @Image2',
        startImageUrl: 'data:image/jpeg;base64,aaa',
        endImageUrl: 'data:image/jpeg;base64,bbb',
        duration: 5,
        generateAudio: true,
    }), {
        prompt: 'Move smoothly from @Image1 to @Image2',
        start_image_url: 'data:image/jpeg;base64,aaa',
        end_image_url: 'data:image/jpeg;base64,bbb',
        duration: '5',
        generate_audio: true,
    });
});

test('recognizes the Kling V3 Standard endpoint and validates its inputs', () => {
    assert.equal(isKlingModel(KLING_V3_STANDARD_MODEL), true);
    assert.throws(
        () => buildKlingPayload({ prompt: 'animate', startImageUrl: 'a', duration: 5 }),
        /同时上传首帧和尾帧/
    );
    assert.throws(
        () => buildKlingPayload({ prompt: 'animate', startImageUrl: 'a', endImageUrl: 'b', duration: 16 }),
        /3 to 15/
    );
});

test('migrates an O3 payload for V3 Standard regeneration', () => {
    assert.deepEqual(normalizeKlingPayload({
        prompt: 'animate',
        image_url: 'start',
        end_image_url: 'end',
        duration: '5',
    }), {
        prompt: 'animate',
        start_image_url: 'start',
        end_image_url: 'end',
        duration: '5',
        generate_audio: false,
    });
});

test('normalizes fal queue responses', () => {
    assert.equal(getRequestId({ request_id: 'fal-123' }), 'fal-123');
    assert.deepEqual(normalizeQueueStatus({ status: 'COMPLETED' }), {
        status: 'succeed',
        progress: 100,
        errorMessage: null,
    });
    assert.equal(normalizeQueueStatus({ status: 'IN_PROGRESS' }).status, 'rendering');
    assert.equal(extractVideoUrl({ video: { url: 'https://example.com/out.mp4' } }), 'https://example.com/out.mp4');
});
