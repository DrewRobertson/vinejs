/**
 * Organic Weaving Vine System
 * Generates natural climbing vines that weave across section seams using p5.js
 */
type VineTarget = string | Element | NodeListOf<Element> | Element[];
type VineSections = NodeListOf<Element> | Element[];
interface VineOptions {
    seed?: number;
    swoop?: number;
    seams?: string;
    seamSelector?: string;
    layer?: 'bg' | 'fg';
    filter?: string;
    sections?: VineSections | null;
    targetSection?: Element | null;
}
interface VineInstance {
    readonly seed: number;
    readonly instance: any;
    destroy(): void;
}
interface VineApi {
    create(target: VineTarget, options?: VineOptions): VineInstance | VineInstance[];
    mount(target: VineTarget, options?: VineOptions): VineInstance | VineInstance[];
    mountAll(configs: Array<{
        target: VineTarget;
    } & VineOptions>): void;
    destroyAll(): void;
}
interface VineElement extends Element {
    _vineSeed?: number;
}
interface VinePoint {
    x: number;
    y: number;
    t?: number;
}
interface VineCoord extends VinePoint {
    t: number;
}
interface VineSegment {
    type: 'entrance' | 'exit';
    curvatureSeed: number;
    x1: number;
    y1: number;
    cp1x: number;
    cp1y: number;
    cp2x: number;
    cp2y: number;
    x2: number;
    y2: number;
}
declare const p5: any;
interface Window {
    Vine: VineApi;
    createVine: typeof createVine;
    initVine: typeof createVine;
    initVineSystem: typeof initVineSystem;
}
declare const activeVines: Set<VineInstance>;
declare const mountedTargets: WeakMap<Element, VineInstance>;
/**
 * Injects required self-contained CSS styles for the vine canvas layer
 * so external stylesheet definitions are not needed.
 */
declare function ensureVineStyles(): void;
/**
 * Injects the default SVG filter used to texture the vine canvas.
 */
declare function ensureVineFilter(): void;
/**
 * Pseudo-random generator (Mulberry32) seeded per vine instance.
 * Ensures consistent, deterministic curvature and leaves across window resizes.
 */
declare function createPRNG(seed: number): () => number;
/**
 * Calculates responsive horizontal entry/exit bounds based on container width.
 * Uses fixed, elegant edge flourish spans (capped at 280px on desktop)
 * so resizing the browser does NOT distort or stretch the vine geometry.
 */
declare function getResponsiveBounds(width: number, swoop?: number): {
    joinX: number;
    exitX: number;
    cutoutLeft: number;
    cutoutRight: number;
};
/**
 * Computes seam coordinates and horizontal bounds relative to the container.
 * Supports both full-width and boxed/centered container layouts.
 */
declare function getSeamMetrics(container: Element, targetSection: Element | null, seamSelector: string, customSections: VineSections | null): {
    topSeamY: number;
    bottomSeamY: number;
    boxLeft: number;
    boxRight: number;
    boxWidth: number;
} | null;
/**
 * Calculates Euclidean length of a Bezier chord.
 */
declare function getSegmentSpan(seg: VineSegment): number;
/**
 * Computes entrance (top-left) and exit (bottom-right) vine segments.
 * Uses a deterministic seed so curvature remains identical across window resizes.
 */
declare function computeWrapperSegments(container: Element, targetSection: Element | null, seamSelector: string, customSections: VineSections | null, instanceSeed?: number, swoop?: number): VineSegment[];
/**
 * Draws an individual leaf blade with organic cordate contour and venation.
 * Purely deterministic using normalized blade coordinates and seed.
 */
declare function drawLeafBlade(p: any, x: number, y: number, rotation: number, leafLength: number, leafWidthRatio: number, maturityRatio: number, seed: number): void;
/**
 * Draws an organic petiole with bark-to-leaf gradient, tapering, and attached leaf.
 * Uses persistent leafSeed so petiole length, curvature, and branching are 100% stable.
 */
declare function drawOrganicLeafWithStem(p: any, x: number, y: number, stemAngle: number, side: number, type: VineSegment['type'], segmentT: number, leafSeed: number): void;
/**
 * Draws a multi-layered fibrous vine segment with dual harmonic circumnutation.
 */
declare function drawVineSegment(p: any, seg: VineSegment, span: number, containerWidth: number, swoop?: number): void;
/**
 * Instantiates a p5 canvas attached to the container with responsive rendering.
 */
declare function createVineInstance(container: Element, options?: VineOptions & {
    sections?: VineSections | null;
    targetSection?: Element | null;
}): VineInstance;
/**
 * Resolves various target inputs into an array of DOM Elements.
 */
declare function resolveElements(target: VineTarget): Element[];
/**
 * Creates and attaches an organic weaving vine around target DOM node(s).
 *
 * @param {VineTarget} target Target DOM element or CSS selector.
 * @param {'wrap'|number|VineOptions} [vineTypeOrSeedOrOptions='wrap'] Mode, seed, or options.
 * @param {VineOptions} [options={}] Additional configuration options.
 * @returns {VineInstance|VineInstance[]} Vine instance(s).
 */
declare function createVine(target: VineTarget | (VineOptions & {
    target: VineTarget;
}), vineTypeOrSeedOrOptions?: 'wrap' | number | VineOptions, options?: VineOptions): VineInstance | VineInstance[];
/**
 * Batch initialization schema helper.
 */
declare function initVineSystem(configArray: Array<{
    target: VineTarget;
} & VineOptions>): void;
/** @type {VineApi} */
declare const Vine: Readonly<{
    create: typeof createVine;
    mount: typeof createVine;
    mountAll: typeof initVineSystem;
    destroyAll(): void;
}>;
