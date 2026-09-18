# Organic Weaving Vine

A self-contained, deterministic vine decoration plugin for p5.js. It renders a procedural vine around a target DOM section, with seeded curvature, responsive edge swoops, textured fibers, tapered petioles, organic leaves, and rare secondary branches.

## Requirements

- A browser with Canvas and SVG filter support
- p5.js 1.x loaded before `dist/vine.js`

The repository includes `p5.min.js` for the demo. The plugin expects the p5 constructor to be available globally as `p5`.

## Quick Start

### From npm

```bash
npm install organic-weaving-vine p5
```

The package publishes `dist/vine.js`, `dist/vine.min.js`, and `dist/vine.d.ts`. In a browser asset pipeline, load p5.js first and then the desired vine build:

```html
<script src="p5.min.js"></script>
<script src="node_modules/organic-weaving-vine/dist/vine.min.js"></script>
```

### From a CDN

```html
<script src="https://cdn.jsdelivr.net/npm/p5@1/lib/p5.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/organic-weaving-vine@0.1.0/dist/vine.min.js"></script>
```

### From this repository

Use `dist/vine.js` during development or `dist/vine.min.js` for a smaller production asset:

```html
<script src="p5.min.js"></script>
<script src="dist/vine.js"></script>
<script>
  Vine.mount('.hero-section', {
    seed: 12345,
    swoop: 1.1
  });
</script>
```

The target may be a CSS selector, a DOM element, a `NodeList`, or an array of elements. A parent wrapper containing multiple `.site-section` elements is also supported.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `seed` | `number` | generated | Reproduces the same vine geometry and foliage. |
| `swoop` | `number` | `1` | Controls edge reach and arch depth. Values from `0.5` to `1.75` are supported. |
| `seams` | `string` | `.site-section` | Child section selector when targeting a wrapper. |
| `layer` | `'bg' \| 'fg'` | `'fg'` | Canvas stacking layer. |
| `filter` | `string` | default SVG filter | Custom SVG filter URL, or `''` to disable filtering. |

## API

```javascript
const vine = Vine.mount('.hero-section', { swoop: 0.85 });

// The returned instance exposes its resolved seed and cleanup method.
console.log(vine.seed);
vine.destroy();

// Mount multiple targets.
const vines = Vine.create(document.querySelectorAll('.section'));

// Remove every instance mounted through the plugin API.
Vine.destroyAll();
```

Legacy globals remain available:

```javascript
createVine('.hero-section', { seed: 42 });
initVineSystem([{ target: '.hero-section', swoop: 1.2 }]);
```

Type declarations are generated at `dist/vine.d.ts`.

## Development

```bash
npm run check
npm test
npm run test:browser
```

The demo is `index.html`. It uses `style.css` for page-specific layout styling; the vine canvas styling and SVG filter are injected by `dist/vine.js`.

The Node test suite covers deterministic seeded geometry, swoop bounds, boxed targets, seed variation, and the public lifecycle API. The Playwright suite loads the real demo in Chromium and checks canvas rendering, SVG filter injection, resize behavior, duplicate-mount replacement, and cleanup.

## License

This project is licensed under the MIT License. p5.js is a separate dependency and retains its own license and attribution.
