const assert = require('node:assert/strict');
const test = require('node:test');

const {
    buildSeedancePayload,
    buildInterviewCoderPayload,
    buildInterviewCoderImagePayload,
    buildTaskStatusUrl,
    extractUploadedFileUrl,
    getModelOptions,
    getReferenceRoleForMimeType,
    getTaskId,
    isInterviewCoderModel,
    isInterviewCoderContentModel,
    normalizeTaskStatus,
    validateSeedanceContent,
} = require('./seedance_api');

test('builds BytePlus task payload without chat wrapper', () => {
    const content = [
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,aaa' }, role: 'first_frame' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,bbb' }, role: 'last_frame' },
        { type: 'text', text: 'make a cinematic transition' },
    ];

    const payload = buildSeedancePayload({
        model: 'dreamina-seedance-2-0-260128',
        content,
        ratio: '16:9',
        resolution: '720p',
        duration: 5,
        generateAudio: true,
    });

    assert.deepEqual(payload, {
        model: 'dreamina-seedance-2-0-260128',
        content,
        ratio: '16:9',
        resolution: '720p',
        duration: 5,
        generate_audio: true,
        watermark: false,
    });
    assert.equal(payload.messages, undefined);
    assert.equal(payload.aspect_ratio, undefined);
    assert.equal(payload.size, undefined);
});

test('exposes Seedance model options including Mini Unfiltered', () => {
    assert.deepEqual(getModelOptions(), [
        { label: 'Seedance 2.0', value: 'dreamina-seedance-2-0-260128' },
        { label: 'Seedance 2 Mini', value: 'dreamina-seedance-2-0-mini-260615' },
        { label: 'Seedance 2.0 Mini Unfiltered', value: 'seedance-2.0-mini-unfiltered' },
        { label: 'Kling V3 Standard 首尾帧 (fal.ai)', value: 'fal-ai/kling-video/v3/standard/image-to-video' },
        { label: '实验 I2V · Mini Unfiltered（文档 inputs）', value: 'seedance-2.0-mini-unfiltered-content-i2v' },
    ]);
});

test('builds the fixed InterviewCoder Mini Unfiltered payload', () => {
    assert.equal(isInterviewCoderModel('seedance-2.0-mini-unfiltered'), true);
    assert.deepEqual(buildInterviewCoderPayload({
        model: 'seedance-2.0-mini-unfiltered',
        prompt: ' cinematic scene ',
    }), {
        model: 'seedance-2.0-mini-unfiltered',
        prompt: 'cinematic scene',
        duration_seconds: 5,
        resolution: '480p',
        aspect_ratio: '16:9',
        generate_audio: false,
    });
});

test('builds experimental I2V with the documented InterviewCoder inputs array', () => {
    assert.equal(
        isInterviewCoderContentModel('seedance-2.0-mini-unfiltered-content-i2v'),
        true
    );
    assert.deepEqual(buildInterviewCoderImagePayload({
        prompt: 'The subject turns toward the camera',
        imageUrl: 'https://example.com/reference.jpg',
    }), {
        model: 'seedance-2.0-mini-unfiltered',
        prompt: 'The subject turns toward the camera',
        inputs: [{
            type: 'image_url',
            role: 'reference_image',
            url: 'https://example.com/reference.jpg',
        }],
        duration_seconds: 5,
        resolution: '480p',
        aspect_ratio: '16:9',
        generate_audio: false,
    });
});

test('rejects non-HTTPS images for documented InterviewCoder I2V', () => {
    assert.throws(
        () => buildInterviewCoderImagePayload({
            prompt: 'animate',
            imageUrl: 'data:image/jpeg;base64,abc',
        }),
        /public HTTPS/
    );
});

test('classifies an image from the general uploader as a reference image', () => {
    assert.equal(getReferenceRoleForMimeType('image/png'), 'reference_image');
    assert.equal(getReferenceRoleForMimeType('video/mp4'), 'reference_video');
    assert.equal(getReferenceRoleForMimeType('audio/mpeg'), 'reference_audio');
});

test('builds BytePlus GET status URL', () => {
    assert.equal(
        buildTaskStatusUrl('cgt-202606070001-aa11'),
        'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/cgt-202606070001-aa11'
    );
});

test('normalizes BytePlus task statuses and video URL', () => {
    const result = normalizeTaskStatus({
        id: 'cgt-1',
        status: 'succeeded',
        content: { video_url: 'https://example.com/out.mp4' },
    });

    assert.deepEqual(result, {
        status: 'succeed',
        videoUrl: 'https://example.com/out.mp4',
        progress: 100,
        errorMessage: null,
    });
});

test('extracts task id from create response', () => {
    assert.equal(getTaskId({ id: 'cgt-202606070001-aa11' }), 'cgt-202606070001-aa11');
});

test('rejects local data URLs for reference videos', () => {
    assert.throws(
        () => validateSeedanceContent([
            {
                type: 'video_url',
                video_url: { url: 'data:video/mp4;base64,AAAA' },
                role: 'reference_video',
            },
        ]),
        /reference video must use an http\(s\) URL/
    );
});

test('allows web URLs for reference videos', () => {
    assert.doesNotThrow(() => validateSeedanceContent([
        {
            type: 'video_url',
            video_url: { url: 'https://example.com/reference.mp4' },
            role: 'reference_video',
        },
    ]));
});

test('requires both first and last frames when using first-last frame roles', () => {
    assert.throws(
        () => validateSeedanceContent([
            { type: 'text', text: 'animate this' },
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,aaa' }, role: 'first_frame' },
        ]),
        /first and last frame images must both be provided/
    );

    assert.doesNotThrow(() => validateSeedanceContent([
        { type: 'text', text: 'animate this' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,aaa' }, role: 'first_frame' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,bbb' }, role: 'last_frame' },
    ]));
});

test('extracts uploaded file URL from common file API response fields', () => {
    assert.equal(
        extractUploadedFileUrl({ id: 'file-1', url: 'https://example.com/a.mp4' }),
        'https://example.com/a.mp4'
    );
    assert.equal(
        extractUploadedFileUrl({ data: { download_url: 'https://example.com/b.mp4' } }),
        'https://example.com/b.mp4'
    );
});

test('ignores uploaded file responses without a web URL', () => {
    assert.equal(
        extractUploadedFileUrl({ id: 'file-20260611-abc', filename: 'clip.mp4' }),
        null
    );
});
