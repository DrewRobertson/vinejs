const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'dist', 'vine.js'), 'utf8');
const windowObject = {};
const context = vm.createContext({
	console,
	Math,
	window: windowObject
});
vm.runInContext(source, context, { filename: 'dist/vine.js' });

function createRect({ top = 0, bottom = 100, left = 0, right = 100 } = {}) {
	return {
		top,
		bottom,
		left,
		right,
		width: right - left,
		height: bottom - top
	};
}

function createContainer(width = 1200) {
	const containerRect = createRect({ right: width, bottom: 1200 });
	return {
		getBoundingClientRect: () => containerRect,
		querySelectorAll: () => []
	};
}

test('PRNG is deterministic for the same seed', () => {
	const first = context.createPRNG(42);
	const second = context.createPRNG(42);
	const firstValues = Array.from({ length: 8 }, () => first());
	const secondValues = Array.from({ length: 8 }, () => second());

	assert.deepEqual(firstValues, secondValues);
});

test('responsive swoop bounds expand toward the center', () => {
	const tight = context.getResponsiveBounds(1200, 0.75);
	const normal = context.getResponsiveBounds(1200, 1);
	const wide = context.getResponsiveBounds(1200, 1.3);

	assert.ok(tight.joinX < normal.joinX);
	assert.ok(wide.joinX > normal.joinX);
	assert.ok(tight.exitX > normal.exitX);
	assert.ok(wide.exitX < normal.exitX);
});

test('wrapper geometry is deterministic and respects boxed targets', () => {
	const container = createContainer();
	const targetRect = createRect({ top: 400, bottom: 800, left: 120, right: 1080 });
	const target = {
		getBoundingClientRect: () => targetRect
	};

	const first = context.computeWrapperSegments(container, target, '.site-section', null, 1234, 1.2);
	const second = context.computeWrapperSegments(container, target, '.site-section', null, 1234, 1.2);

	assert.deepEqual(first, second);
	assert.equal(first.length, 2);
	assert.equal(first[0].x1, 120);
	assert.equal(first[1].x2, 1080 + 15);
	assert.equal(first[0].y2, 400 + 45 * 1.2);
	assert.equal(first[1].y1, 800 - 45 * 1.2);
});

test('different seeds produce different curvature', () => {
	const container = createContainer();
	const target = {
		getBoundingClientRect: () => createRect({ top: 400, bottom: 800, left: 0, right: 1200 })
	};

	const first = context.computeWrapperSegments(container, target, '.site-section', null, 1, 1);
	const second = context.computeWrapperSegments(container, target, '.site-section', null, 2, 1);

	assert.notDeepEqual(first, second);
});

test('getSeamMetrics computes bounds from the first two child sections when no target is given', () => {
	const containerRect = createRect({ top: 50, left: 20, right: 1220, bottom: 1250 });
	const sectionRects = [
		createRect({ top: 50, bottom: 450, left: 20, right: 1220 }),
		createRect({ top: 450, bottom: 850, left: 20, right: 1220 }),
		createRect({ top: 850, bottom: 1250, left: 20, right: 1220 })
	];
	const container = {
		getBoundingClientRect: () => containerRect,
		querySelectorAll: () => sectionRects.map(rect => ({ getBoundingClientRect: () => rect }))
	};

	const seams = context.getSeamMetrics(container, null, '.site-section', null);

	assert.equal(seams.topSeamY, 400);
	assert.equal(seams.bottomSeamY, 800);
	assert.equal(seams.boxLeft, 0);
	assert.equal(seams.boxRight, 1200);
	assert.equal(seams.boxWidth, 1200);
});

test('getSeamMetrics honors an explicit customSections list over seamSelector', () => {
	const containerRect = createRect({ right: 1000, bottom: 900 });
	const customSections = [
		{ getBoundingClientRect: () => createRect({ top: 0, bottom: 300, right: 1000 }) },
		{ getBoundingClientRect: () => createRect({ top: 300, bottom: 600, right: 1000 }) }
	];
	const container = {
		getBoundingClientRect: () => containerRect,
		querySelectorAll: () => {
			throw new Error('should not query the DOM when customSections is provided');
		}
	};

	const seams = context.getSeamMetrics(container, null, '.site-section', customSections);

	assert.equal(seams.topSeamY, 300);
	assert.equal(seams.bottomSeamY, 600);
});

test('getSeamMetrics returns null when fewer than two seam sections are found', () => {
	const container = createContainer();
	assert.equal(context.getSeamMetrics(container, null, '.site-section', null), null);
});

test('computeWrapperSegments returns an empty array when seam metrics cannot be resolved', () => {
	const container = createContainer();
	assert.equal(context.computeWrapperSegments(container, null, '.site-section', null, 1, 1).length, 0);
});

test('public Vine namespace exposes the plugin lifecycle API', () => {
	assert.equal(typeof windowObject.Vine.create, 'function');
	assert.equal(typeof windowObject.Vine.mount, 'function');
	assert.equal(typeof windowObject.Vine.mountAll, 'function');
	assert.equal(typeof windowObject.Vine.destroyAll, 'function');
});
