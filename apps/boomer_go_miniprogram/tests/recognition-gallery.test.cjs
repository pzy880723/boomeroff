const { test } = require('node:test');
const assert = require('node:assert/strict');
const { businessContent } = require('../miniprogram/pages/detail/content');
const photo = n => 'https://example.invalid/storage/v1/object/public/product-images/owner/photo-' + n + '.jpg';

test('native saved recognition photos fill the existing gallery without exposing transport metadata', () => {
  const raw = { ai_analysis: { story: '商品故事', __go_mini: { client_submitted: true, image_urls: [photo(1), photo(2), photo(1)] } } };
  const before = JSON.stringify(raw), result = businessContent(raw, { recognitionPhotos: true });
  assert.deepEqual(result.gallery, [photo(1), photo(2)]);
  assert.match(JSON.stringify(result.sections), /商品故事/);
  assert.doesNotMatch(JSON.stringify(result.sections), /__go_mini|image_urls|client_submitted/);
  assert.equal(JSON.stringify(raw), before);
});

test('existing explicit gallery retains priority over the native saved-photo fallback', () => {
  const raw = { gallery: [{ url: photo(3) }, photo(4)], ai_analysis: { __go_mini: { client_submitted: true, image_urls: [photo(1)] } } };
  assert.deepEqual(businessContent(raw, { recognitionPhotos: true }).gallery, [photo(3), photo(4)]);
});

test('saved-photo fallback rejects malformed or oversized groups instead of truncating them', () => {
  for (const image_urls of [[], Array.from({ length: 6 }, (_, i) => photo(i)), [photo(1), { url: photo(2) }], [photo(1), 'javascript:alert(1)'], [photo(1), 'data:image/png;base64,AA']]) {
    assert.deepEqual(businessContent({ ai_analysis: { __go_mini: { client_submitted: true, image_urls } } }, { recognitionPhotos: true }).gallery, []);
  }
  for (const marker of [null, [], {}, { client_submitted: false, image_urls: [photo(1)] }, { client_submitted: true, image_urls: 'bad' }]) {
    assert.deepEqual(businessContent({ ai_analysis: { __go_mini: marker } }, { recognitionPhotos: true }).gallery, []);
  }
});

test('transport marker alone cannot enable native photo fallback outside a verified recognition context', () => {
  const raw = { ai_analysis: { __go_mini: { client_submitted: true, image_urls: [photo(1)] } } };
  assert.deepEqual(businessContent(raw).gallery, []);
  assert.deepEqual(businessContent(raw, { recognitionPhotos: false }).gallery, []);
});
