const assert = require('node:assert/strict');
const test = require('node:test');

const {
    buildSeedancePayload,
    buildInterviewCoderPayload,
    buildTaskStatusUrl,
    buildSeedanceReferenceItems,
    extractUploadedFileUrl,
    getModelOptions,
    getReferenceRoleForMimeType,
    getTaskErrorDetails,
    getTaskId,
    isInterviewCoderModel,
    mediaNeedsPublicUpload,
    normalizePromptReferences,
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

test('exposes the three production InterviewCoder Unfiltered models', () => {
    assert.deepEqual(getModelOptions(), [
        { label: 'Seedance 2.0 Standard', value: 'dreamina-seedance-2-0-260128' },
        { label: 'Seedance 2.0 Mini', value: 'dreamina-seedance-2-0-mini-260615' },
        { label: 'Seedance 2.0 Standard Unfiltered', value: 'seedance-2.0-unfiltered' },
        { label: 'Seedance 2.0 Fast Unfiltered', value: 'seedance-2.0-fast-unfiltered' },
        { label: 'Seedance 2.0 Mini Unfiltered', value: 'seedance-2.0-mini-unfiltered' },
        { label: 'Kling V3 Pro 首尾帧 (fal.ai)', value: 'fal-ai/kling-video/v3/pro/image-to-video' },
        { label: 'MiniMax H3 图生视频 768P (fal.ai)', value: 'minimax/h3/image-to-video' },
    ]);
});

test('builds a configurable 720p InterviewCoder Unfiltered payload', () => {
    for (const model of [
        'seedance-2.0-unfiltered',
        'seedance-2.0-fast-unfiltered',
        'seedance-2.0-mini-unfiltered',
    ]) {
        assert.equal(isInterviewCoderModel(model), true);
        assert.deepEqual(buildInterviewCoderPayload({
            model,
            prompt: ' cinematic scene ',
            duration: 12,
            aspectRatio: '9:16',
        }), {
            model,
            prompt: 'cinematic scene',
            duration_seconds: 12,
            resolution: '720p',
            aspect_ratio: '9:16',
            generate_audio: false,
        });
    }
});

test('adds one documented HTTPS reference image to an Unfiltered payload', () => {
    assert.deepEqual(buildInterviewCoderPayload({
        model: 'seedance-2.0-fast-unfiltered',
        prompt: 'The subject turns toward the camera',
        duration: 8,
        aspectRatio: '1:1',
        imageUrl: 'https://example.com/reference.webp',
    }), {
        model: 'seedance-2.0-fast-unfiltered',
        prompt: 'The subject turns toward the camera',
        inputs: [{
            type: 'image_url',
            role: 'reference_image',
            url: 'https://example.com/reference.webp',
        }],
        duration_seconds: 8,
        resolution: '720p',
        aspect_ratio: '1:1',
        generate_audio: false,
    });
});

test('validates InterviewCoder Unfiltered capability fields', () => {
    assert.throws(() => buildInterviewCoderPayload({
        model: 'seedance-2.0-mini-unfiltered-content-i2v',
        prompt: 'animate',
        duration: 5,
        aspectRatio: '16:9',
    }), /Unsupported InterviewCoder model/);
    assert.throws(() => buildInterviewCoderPayload({
        model: 'seedance-2.0-unfiltered',
        prompt: 'animate',
        duration: 3,
        aspectRatio: '16:9',
    }), /4 to 15 seconds/);
    assert.throws(() => buildInterviewCoderPayload({
        model: 'seedance-2.0-unfiltered',
        prompt: 'animate',
        duration: 5,
        aspectRatio: 'adaptive',
    }), /Unsupported aspect ratio/);
    assert.throws(() => buildInterviewCoderPayload({
        model: 'seedance-2.0-unfiltered',
        prompt: 'animate',
        duration: 5,
        aspectRatio: '16:9',
        imageUrl: 'data:image/jpeg;base64,abc',
    }), /public HTTPS/);
});

test('classifies an image from the general uploader as a reference image', () => {
    assert.equal(getReferenceRoleForMimeType('image/png'), 'reference_image');
    assert.equal(getReferenceRoleForMimeType('video/mp4'), 'reference_video');
    assert.equal(getReferenceRoleForMimeType('audio/mpeg'), 'reference_audio');
});

test('normalizes @ mentions to the official BytePlus reference labels', () => {
    assert.equal(
        normalizePromptReferences(
            '@图片1 穿上 @图片2 的服装，并模仿 @视频1 的动作',
            [
                { name: '图片1' },
                { name: '图片2' },
                { name: '视频1' },
            ]
        ),
        '[Image 1] 穿上 [Image 2] 的服装，并模仿 [Video 1] 的动作'
    );
});

test('requires inline multimodal media to be uploaded before submission', () => {
    assert.equal(mediaNeedsPublicUpload({
        role: 'reference_image',
        dataUrl: 'data:image/jpeg;base64,YWJj',
    }), true);
    assert.equal(mediaNeedsPublicUpload({
        role: 'reference_audio',
        dataUrl: 'data:audio/mpeg;base64,YWJj',
    }), true);
    assert.equal(mediaNeedsPublicUpload({
        role: 'reference_video',
        publicUrl: 'https://example.com/reference.mp4',
    }), false);
    assert.equal(mediaNeedsPublicUpload({
        role: 'reference_image',
        dataUrl: 'asset://asset-123',
    }), false);
});

test('builds multimodal reference items from public URLs for every media type', () => {
    assert.deepEqual(buildSeedanceReferenceItems([
        { role: 'reference_image', publicUrl: 'https://example.com/image.jpg', dataUrl: 'data:image/jpeg;base64,YWJj' },
        { role: 'reference_audio', publicUrl: 'https://example.com/voice.mp3', dataUrl: 'data:audio/mpeg;base64,YWJj' },
        { role: 'reference_video', publicUrl: 'https://example.com/motion.mp4', dataUrl: 'data:video/mp4;base64,YWJj' },
    ]), [
        { type: 'image_url', image_url: { url: 'https://example.com/image.jpg' }, role: 'reference_image' },
        { type: 'audio_url', audio_url: { url: 'https://example.com/voice.mp3' }, role: 'reference_audio' },
        { type: 'video_url', video_url: { url: 'https://example.com/motion.mp4' }, role: 'reference_video' },
    ]);
});

test('rejects malformed Base64 image references before submission', () => {
    assert.throws(
        () => validateSeedanceContent([
            { type: 'text', text: '使用图片1中的角色' },
            {
                type: 'image_url',
                image_url: { url: 'data:image/jpeg;base64,not-valid-@@' },
                role: 'reference_image',
            },
        ]),
        /invalid Base64 image/i
    );
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
        errorCode: null,
    });
});

test('preserves failure code and message for history cards', () => {
    const normalized = normalizeTaskStatus({
        status: 'failed',
        error: {
            code: 'OutputVideoSensitiveContentDetected.PolicyViolation',
            message: 'The output may be related to copyright restrictions.',
        },
    });
    assert.equal(normalized.errorCode, 'OutputVideoSensitiveContentDetected.PolicyViolation');
    assert.equal(normalized.errorMessage, 'The output may be related to copyright restrictions.');
    assert.deepEqual(getTaskErrorDetails({
        errorCode: normalized.errorCode,
        error: normalized.errorMessage,
    }), {
        code: 'OutputVideoSensitiveContentDetected.PolicyViolation',
        message: 'The output may be related to copyright restrictions.',
    });
});

test('supports legacy history records that only stored an error string', () => {
    assert.deepEqual(getTaskErrorDetails({ error: 'Legacy failure message' }), {
        code: '',
        message: 'Legacy failure message',
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
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,YWFh' }, role: 'first_frame' },
        ]),
        /first and last frame images must both be provided/
    );

    assert.doesNotThrow(() => validateSeedanceContent([
        { type: 'text', text: 'animate this' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,YWFh' }, role: 'first_frame' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,YmJi' }, role: 'last_frame' },
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
