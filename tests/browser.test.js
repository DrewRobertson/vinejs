const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const test = require('node:test');

const demoPath = path.join(__dirname, '..', 'index.html');
const demoUrl = `file://${demoPath.replaceAll('\\', '/')}`;

test('browser demo renders and exposes the Vine plugin API', async () => {
	const browser = await chromium.launch({ headless: true });
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	const pageErrors = [];
	page.on('pageerror', error => pageErrors.push(error.message));

	try {
		await page.goto(demoUrl);
		await page.waitForFunction(() => document.querySelector('canvas')?.width > 0);

		const initialState = await page.evaluate(() => {
			const canvas = document.querySelector('canvas');
			const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
			return {
				canvasCount: document.querySelectorAll('canvas').length,
				filterPresent: Boolean(document.getElementById('earthy-paper-shader')),
				filterApplied: canvas.style.filter.includes('earthy-paper-shader'),
				nonTransparentPixels: Array.from(pixels).filter((value, index) => index % 4 === 3 && value > 0).length,
				api: ['create', 'mount', 'mountAll', 'destroyAll'].every(name => typeof window.Vine[name] === 'function')
			};
		});

		assert.equal(initialState.canvasCount, 1);
		assert.equal(initialState.filterPresent, true);
		assert.equal(initialState.filterApplied, true);
		assert.ok(initialState.nonTransparentPixels > 0);
		assert.equal(initialState.api, true);

		const lifecycleState = await page.evaluate(async () => {
			window.Vine.destroyAll();
			const first = window.Vine.mount('.unique-block-2', { seed: 77, swoop: 1.1 });
			await new Promise(resolve => requestAnimationFrame(resolve));
			const afterFirstMount = document.querySelectorAll('canvas').length;

			window.dispatchEvent(new Event('resize'));
			await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
			const afterResize = document.querySelectorAll('canvas').length;

			const second = window.Vine.mount('.unique-block-2', { seed: 77, swoop: 1.1 });
			await new Promise(resolve => requestAnimationFrame(resolve));
			const afterReplacementMount = document.querySelectorAll('canvas').length;
			second.destroy();
			const afterDestroy = document.querySelectorAll('canvas').length;

			return {
				firstSeed: first.seed,
				afterFirstMount,
				afterResize,
				afterReplacementMount,
				afterDestroy
			};
		});

		assert.equal(lifecycleState.firstSeed, 77);
		assert.equal(lifecycleState.afterFirstMount, 1);
		assert.equal(lifecycleState.afterResize, 1);
		assert.equal(lifecycleState.afterReplacementMount, 1);
		assert.equal(lifecycleState.afterDestroy, 0);
		assert.deepEqual(pageErrors, []);
	} finally {
		await browser.close();
	}
});

test('wrapper mounting, multi-target create, and mountAll batch init all work', async () => {
	const browser = await chromium.launch({ headless: true });
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	const pageErrors = [];
	page.on('pageerror', error => pageErrors.push(error.message));

	try {
		await page.goto(demoUrl);
		await page.waitForFunction(() => document.querySelector('canvas')?.width > 0);

		const result = await page.evaluate(async () => {
			window.Vine.destroyAll();

			// Wrapper containing multiple .site-section children (hasChildSections branch).
			const wrapperVine = window.Vine.mount('.vine-section-wrap', { seed: 5 });
			await new Promise(resolve => requestAnimationFrame(resolve));
			const afterWrapperMount = document.querySelectorAll('canvas').length;
			wrapperVine.destroy();
			await new Promise(resolve => requestAnimationFrame(resolve));
			const afterWrapperDestroy = document.querySelectorAll('canvas').length;

			// Multiple direct targets resolved from a NodeList (create() array-return branch).
			const multi = window.Vine.create(document.querySelectorAll('.site-section'), { seed: 9 });
			await new Promise(resolve => requestAnimationFrame(resolve));
			const afterMultiMount = document.querySelectorAll('canvas').length;
			const isArray = Array.isArray(multi);
			multi.forEach(v => v.destroy());
			const afterMultiDestroy = document.querySelectorAll('canvas').length;

			// Batch config helper.
			window.initVineSystem([{ target: '.unique-block-2', seed: 3 }]);
			await new Promise(resolve => requestAnimationFrame(resolve));
			const afterMountAll = document.querySelectorAll('canvas').length;
			window.Vine.destroyAll();

			return {
				afterWrapperMount,
				afterWrapperDestroy,
				isArray,
				multiCount: multi.length,
				afterMultiMount,
				afterMultiDestroy,
				afterMountAll
			};
		});

		assert.equal(result.afterWrapperMount, 1);
		assert.equal(result.afterWrapperDestroy, 0);
		assert.equal(result.isArray, true);
		assert.equal(result.multiCount, 3);
		assert.equal(result.afterMultiMount, 3);
		assert.equal(result.afterMultiDestroy, 0);
		assert.equal(result.afterMountAll, 1);
		assert.deepEqual(pageErrors, []);
	} finally {
		await browser.close();
	}
});
