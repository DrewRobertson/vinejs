"use strict";
/**
 * Organic Weaving Vine System
 * Generates natural climbing vines that weave across section seams using p5.js
 */
const activeVines = new Set();
const mountedTargets = new WeakMap();
/**
 * Injects required self-contained CSS styles for the vine canvas layer
 * so external stylesheet definitions are not needed.
 */
function ensureVineStyles() {
    if (typeof document === 'undefined' || document.getElementById('vine-system-styles')) {
        return;
    }
    const style = document.createElement('style');
    style.id = 'vine-system-styles';
    style.textContent = `
		.canvas-bg {
			position: absolute !important;
			top: 0 !important;
			left: 0 !important;
			width: 100% !important;
			height: 100% !important;
			pointer-events: none !important;
			z-index: 2 !important;
		}
		.canvas-fg {
			position: absolute !important;
			top: 0 !important;
			left: 0 !important;
			width: 100% !important;
			height: 100% !important;
			pointer-events: none !important;
			z-index: 4 !important;
		}
	`;
    document.head.appendChild(style);
}
/**
 * Injects the default SVG filter used to texture the vine canvas.
 */
function ensureVineFilter() {
    if (typeof document === 'undefined' || document.getElementById('earthy-paper-shader')) {
        return;
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    svg.style.width = '0';
    svg.style.height = '0';
    svg.style.pointerEvents = 'none';
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', 'earthy-paper-shader');
    const turbulence = document.createElementNS('http://www.w3.org/2000/svg', 'feTurbulence');
    turbulence.setAttribute('type', 'fractalNoise');
    turbulence.setAttribute('baseFrequency', '0.05');
    turbulence.setAttribute('numOctaves', '3');
    turbulence.setAttribute('result', 'noise');
    const displacement = document.createElementNS('http://www.w3.org/2000/svg', 'feDisplacementMap');
    displacement.setAttribute('in', 'SourceGraphic');
    displacement.setAttribute('in2', 'noise');
    displacement.setAttribute('scale', '5');
    displacement.setAttribute('xChannelSelector', 'R');
    displacement.setAttribute('yChannelSelector', 'G');
    displacement.setAttribute('result', 'textured');
    const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    blur.setAttribute('in', 'SourceGraphic');
    blur.setAttribute('stdDeviation', '0.4');
    blur.setAttribute('result', 'bleed');
    const merge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
    const bleedNode = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    bleedNode.setAttribute('in', 'bleed');
    const textureNode = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    textureNode.setAttribute('in', 'textured');
    merge.append(bleedNode, textureNode);
    filter.append(turbulence, displacement, blur, merge);
    svg.appendChild(filter);
    document.body.appendChild(svg);
}
/**
 * Pseudo-random generator (Mulberry32) seeded per vine instance.
 * Ensures consistent, deterministic curvature and leaves across window resizes.
 */
function createPRNG(seed) {
    let s = (Math.abs(seed) || 1) | 0;
    return function next() {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
// ============================================================================
// 1. Responsive & Metric Helpers
// ============================================================================
/**
 * Calculates responsive horizontal entry/exit bounds based on container width.
 * Uses fixed, elegant edge flourish spans (capped at 280px on desktop)
 * so resizing the browser does NOT distort or stretch the vine geometry.
 */
function getResponsiveBounds(width, swoop = 1) {
    const factor = Math.max(0.5, Math.min(Number(swoop) || 1, 1.75));
    const entranceSpan = Math.min(280 * factor, width * Math.min(0.35 * factor, 0.46));
    const exitSpan = Math.min(290 * factor, width * Math.min(0.35 * factor, 0.46));
    const joinX = entranceSpan;
    const exitX = width - exitSpan;
    return {
        joinX,
        exitX,
        cutoutLeft: joinX * 0.30,
        cutoutRight: exitX + exitSpan * 0.70
    };
}
/**
 * Computes seam coordinates and horizontal bounds relative to the container.
 * Supports both full-width and boxed/centered container layouts.
 */
function getSeamMetrics(container, targetSection, seamSelector, customSections) {
    const parentRect = container.getBoundingClientRect();
    const parentTop = parentRect.top;
    const parentLeft = parentRect.left;
    if (targetSection) {
        const targetRect = targetSection.getBoundingClientRect();
        return {
            topSeamY: targetRect.top - parentTop,
            bottomSeamY: targetRect.bottom - parentTop,
            boxLeft: targetRect.left - parentLeft,
            boxRight: targetRect.right - parentLeft,
            boxWidth: targetRect.width
        };
    }
    const sections = customSections && customSections.length >= 2
        ? customSections
        : container.querySelectorAll(seamSelector || '.site-section');
    if (sections.length < 2)
        return null;
    const bounds = Array.from(sections).map(s => {
        const r = s.getBoundingClientRect();
        return {
            top: r.top - parentTop,
            bottom: r.bottom - parentTop,
            left: r.left - parentLeft,
            right: r.right - parentLeft,
            width: r.width
        };
    });
    return {
        topSeamY: bounds[0].bottom,
        bottomSeamY: bounds.length > 1 ? bounds[1].bottom : bounds[0].bottom + (bounds[0].bottom - bounds[0].top),
        boxLeft: bounds[0].left,
        boxRight: bounds[0].right,
        boxWidth: bounds[0].width
    };
}
/**
 * Calculates Euclidean length of a Bezier chord.
 */
function getSegmentSpan(seg) {
    return Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
}
// ============================================================================
// 2. Segment Path Generation
// ============================================================================
/**
 * Computes entrance (top-left) and exit (bottom-right) vine segments.
 * Uses a deterministic seed so curvature remains identical across window resizes.
 */
function computeWrapperSegments(container, targetSection, seamSelector, customSections, instanceSeed = 100, swoop = 1) {
    const w = container.getBoundingClientRect().width;
    const seams = getSeamMetrics(container, targetSection, seamSelector, customSections);
    if (!seams)
        return [];
    const { topSeamY, bottomSeamY, boxLeft = 0, boxRight = w } = seams;
    const factor = Math.max(0.5, Math.min(Number(swoop) || 1, 1.75));
    const { joinX, exitX } = getResponsiveBounds(w, factor);
    const startX = Math.max(0, boxLeft);
    const endX = Math.min(w, boxRight);
    const exitSpan = endX - exitX;
    // Deterministic pseudo-random variances based on instanceSeed
    const rng = createPRNG(instanceSeed);
    const topArchVar = (rng() - 0.5) * 28 * factor;
    const topCp1XVar = (rng() - 0.5) * 20;
    const topCp2XVar = (rng() - 0.5) * 24;
    const botDroopVar = (rng() - 0.5) * 28 * factor;
    const botCp1XVar = (rng() - 0.5) * 24;
    const botCp2XVar = (rng() - 0.5) * 20;
    const entranceOffset = (rng() - 0.5) * 12 * factor;
    const exitOffset = (rng() - 0.5) * 12 * factor;
    const curvatureSeed = Math.floor(rng() * 1000);
    return [
        // 1. Top-Left Vine: starts at leftmost seam, loops naturally near left edge,
        // arches over the seam, and dips behind Section 2.
        {
            type: 'entrance',
            curvatureSeed,
            x1: startX,
            y1: topSeamY + 50 * factor + entranceOffset,
            cp1x: joinX * 0.25 + topCp1XVar,
            cp1y: topSeamY - 70 * factor + topArchVar,
            cp2x: joinX * 0.70 + topCp2XVar,
            cp2y: topSeamY - 45 * factor + topArchVar * 0.65,
            x2: joinX,
            y2: topSeamY + 45 * factor
        },
        // 2. Bottom-Right Vine: emerges smoothly under Section 2 without surface overlap,
        // sags down in a natural catenary droop, curves back up, and exits at the right seam.
        {
            type: 'exit',
            curvatureSeed: curvatureSeed + 421,
            x1: exitX,
            y1: bottomSeamY - 45 * factor,
            cp1x: exitX + exitSpan * 0.28 + botCp1XVar,
            cp1y: bottomSeamY + 65 * factor + botDroopVar,
            cp2x: exitX + exitSpan * 0.70 + botCp2XVar,
            cp2y: bottomSeamY + 45 * factor + botDroopVar * 0.65,
            x2: endX + 15,
            y2: bottomSeamY - 12 * factor + exitOffset
        }
    ];
}
// ============================================================================
// 3. Botanical Rendering (Leaves, Petioles, Vine Fibers)
// ============================================================================
/**
 * Draws an individual leaf blade with organic cordate contour and venation.
 * Purely deterministic using normalized blade coordinates and seed.
 */
function drawLeafBlade(p, x, y, rotation, leafLength, leafWidthRatio, maturityRatio, seed) {
    p.randomSeed(seed);
    p.push();
    p.translate(x, y);
    p.rotate(rotation);
    const leafR = Math.floor(66 + p.random(-6, 10));
    const leafG = Math.floor(88 + p.random(-5, 12));
    const leafB = Math.floor(68 + p.random(-5, 8));
    p.fill(leafR, leafG, leafB, 242);
    p.noStroke();
    const halfW = leafLength * leafWidthRatio * 0.5;
    const topCurvature = p.random(0.9, 1.1);
    const botCurvature = p.random(0.9, 1.1);
    const leafSegs = 14;
    p.beginShape();
    p.vertex(0, 0); // Stem insertion point
    for (let k = 1; k <= leafSegs; k++) {
        const u = k / leafSegs;
        const lx = p.lerp(0, leafLength, u);
        let ly = -Math.sin(u * Math.PI) * halfW * topCurvature;
        ly += (p.noise(u * 14, (seed % 1000) * 0.01) - 0.5) * (halfW * 0.12);
        p.vertex(lx, ly);
    }
    for (let k = leafSegs; k >= 0; k--) {
        const u = k / leafSegs;
        const lx = p.lerp(0, leafLength, u);
        let ly = Math.sin(u * Math.PI) * halfW * botCurvature;
        ly += (p.noise(u * 14, (seed % 1000) * 0.01 + 50) - 0.5) * (halfW * 0.12);
        p.vertex(lx, ly);
    }
    p.endShape(p.CLOSE);
    // Leaf venation
    const veinR = Math.floor(92 + p.random(-8, 12));
    const veinG = Math.floor(118 + p.random(-6, 12));
    const veinB = Math.floor(92 + p.random(-6, 10));
    const leafStrokeThick = p.map(maturityRatio, 0.6, 1.2, 1.0, 1.6);
    // Primary central vein
    p.stroke(veinR, veinG, veinB, 215);
    p.strokeWeight(leafStrokeThick);
    p.noFill();
    p.beginShape();
    for (let v = 0; v <= 8; v++) {
        const vt = v / 8;
        const vx = p.lerp(0, leafLength * 0.94, vt);
        const vy = (p.noise(vt * 6, (seed % 1000) * 0.05) - 0.5) * (leafLength * 0.04);
        p.vertex(vx, vy);
    }
    p.endShape();
    // Secondary lateral veins (pinnate)
    const secondaryVeins = Math.floor(p.map(leafLength, 15, 26, 2, 4));
    p.strokeWeight(leafStrokeThick * 0.55);
    p.stroke(veinR, veinG, veinB, 150);
    for (let sv = 1; sv <= secondaryVeins; sv++) {
        const svT = sv / (secondaryVeins + 1);
        const vx = p.lerp(0, leafLength * 0.85, svT);
        const spanLen = halfW * 0.62 * Math.sin(svT * Math.PI);
        p.line(vx, 0, vx + spanLen * 0.35, -spanLen);
        p.line(vx, 0, vx + spanLen * 0.35, spanLen);
    }
    p.pop();
}
/**
 * Draws an organic petiole with bark-to-leaf gradient, tapering, and attached leaf.
 * Uses persistent leafSeed so petiole length, curvature, and branching are 100% stable.
 */
function drawOrganicLeafWithStem(p, x, y, stemAngle, side, type, segmentT, leafSeed) {
    p.randomSeed(leafSeed);
    let localTaper = 1.0;
    if (type === 'entrance' && segmentT < 0.18) {
        localTaper = p.lerp(0.85, 1.0, segmentT / 0.18);
    }
    else if (type === 'exit' && segmentT > 0.82) {
        localTaper = p.lerp(1.0, 0.82, (segmentT - 0.82) / 0.18);
    }
    const basePetioleLen = p.random(11, 17);
    const baseLeafLen = p.random(18, 23.5);
    const minPetiole = 9;
    const maxPetiole = 18;
    const petioleLen = Math.max(minPetiole, basePetioleLen * localTaper);
    const maturityRatio = p.constrain(p.map(petioleLen, minPetiole, maxPetiole, 0.75, 1.2), 0.75, 1.2);
    const leafLength = Math.max(15, baseLeafLen * localTaper);
    const leafWidthRatio = p.random(0.62, 0.74);
    // Phototropism / gravitropism tilt
    const gravitySag = (side > 0 ? 0.18 : -0.15) * p.random(0.8, 1.2);
    const organicSway = (p.random() - 0.5) * 0.22;
    const finalStemAngle = stemAngle + gravitySag + organicSway;
    const stemEndX = x + Math.cos(finalStemAngle) * petioleLen;
    const stemEndY = y + Math.sin(finalStemAngle) * petioleLen;
    const cpAngle = stemAngle + (side * 0.22);
    const cpX = x + Math.cos(cpAngle) * (petioleLen * 0.52);
    const cpY = y + Math.sin(cpAngle) * (petioleLen * 0.52);
    const petioleBaseThick = p.lerp(1.8, 2.3, maturityRatio - 0.75);
    const petioleTipThick = 0.9;
    const veinR = Math.floor(92 + p.random(-8, 12));
    const veinG = Math.floor(118 + p.random(-6, 12));
    const veinB = Math.floor(92 + p.random(-6, 10));
    p.noFill();
    const petioleSteps = 8;
    const petiolePoints = [{ x, y }];
    let px = x;
    let py = y;
    for (let k = 1; k <= petioleSteps; k++) {
        const st = k / petioleSteps;
        const cx = p.bezierPoint(x, cpX, cpX, stemEndX, st);
        const cy = p.bezierPoint(y, cpY, cpY, stemEndY, st);
        const nOffX = (p.noise(st * 4, (leafSeed % 1000) * 0.02) - 0.5) * 0.8;
        const nOffY = (p.noise(st * 4, (leafSeed % 1000) * 0.02 + 25) - 0.5) * 0.8;
        const nx = cx + nOffX;
        const ny = cy + nOffY;
        petiolePoints.push({ x: nx, y: ny, t: st });
        const gradStep = p.drawingContext.createLinearGradient(px, py, nx, ny);
        gradStep.addColorStop(0, p.lerpColor(p.color('#384B3C'), p.color(veinR, veinG, veinB), Math.max(0, st - 0.15)).toString());
        gradStep.addColorStop(1, p.lerpColor(p.color('#384B3C'), p.color(veinR, veinG, veinB), st).toString());
        p.drawingContext.strokeStyle = gradStep;
        p.strokeWeight(p.lerp(petioleBaseThick, petioleTipThick, st));
        p.line(px, py, nx, ny);
        px = nx;
        py = ny;
    }
    const tipAngle = p.atan2(p.bezierTangent(y, cpY, cpY, stemEndY, 1.0), p.bezierTangent(x, cpX, cpX, stemEndX, 1.0));
    const leafTilt = tipAngle + (side * 0.08) + (p.random() - 0.5) * 0.12;
    drawLeafBlade(p, stemEndX, stemEndY, leafTilt, leafLength, leafWidthRatio, maturityRatio, (leafSeed * 17 + 31) & 0x7fffffff);
    // Rare circumstance: longer petioles branch off to form secondary leaves
    const isLongPetiole = petioleLen >= 14.5;
    if (isLongPetiole && p.random() < 0.25) {
        const bIdx = Math.floor(petiolePoints.length * p.random(0.42, 0.62));
        const bPoint = petiolePoints[bIdx] || petiolePoints[Math.floor(petiolePoints.length / 2)];
        const bT = bPoint.t;
        const bTanX = p.bezierTangent(x, cpX, cpX, stemEndX, bT);
        const bTanY = p.bezierTangent(y, cpY, cpY, stemEndY, bT);
        const bTanAngle = p.atan2(bTanY, bTanX);
        const branchSide = (p.random() < 0.65) ? -side : side;
        const branchAngle = bTanAngle + branchSide * p.radians(p.random(42, 60));
        const branchPetioleLen = petioleLen * p.random(0.45, 0.65);
        const bEndX = bPoint.x + Math.cos(branchAngle) * branchPetioleLen;
        const bEndY = bPoint.y + Math.sin(branchAngle) * branchPetioleLen;
        const bCpX = bPoint.x + Math.cos(branchAngle - branchSide * 0.18) * (branchPetioleLen * 0.5);
        const bCpY = bPoint.y + Math.sin(branchAngle - branchSide * 0.18) * (branchPetioleLen * 0.5);
        let bpx = bPoint.x;
        let bpy = bPoint.y;
        for (let bk = 1; bk <= 4; bk++) {
            const bst = bk / 4;
            const bcx = p.bezierPoint(bPoint.x, bCpX, bCpX, bEndX, bst);
            const bcy = p.bezierPoint(bPoint.y, bCpY, bCpY, bEndY, bst);
            const bGrad = p.drawingContext.createLinearGradient(bpx, bpy, bcx, bcy);
            bGrad.addColorStop(0, p.color(veinR - 10, veinG - 10, veinB - 10).toString());
            bGrad.addColorStop(1, p.color(veinR, veinG, veinB).toString());
            p.drawingContext.strokeStyle = bGrad;
            p.strokeWeight(p.lerp(petioleBaseThick * 0.7, 0.7, bst));
            p.line(bpx, bpy, bcx, bcy);
            bpx = bcx;
            bpy = bcy;
        }
        const subLeafLen = Math.max(13, leafLength * p.random(0.65, 0.75));
        const subLeafWidth = leafWidthRatio * p.random(0.95, 1.05);
        const subTipAngle = p.atan2(p.bezierTangent(bPoint.y, bCpY, bCpY, bEndY, 1.0), p.bezierTangent(bPoint.x, bCpX, bCpX, bEndX, 1.0));
        drawLeafBlade(p, bEndX, bEndY, subTipAngle, subLeafLen, subLeafWidth, maturityRatio * 0.8, (leafSeed * 29 + 53) & 0x7fffffff);
    }
}
/**
 * Draws a multi-layered fibrous vine segment with dual harmonic circumnutation.
 */
function drawVineSegment(p, seg, span, containerWidth, swoop = 1) {
    const { x1, y1, cp1x, cp1y, cp2x, cp2y, x2, y2, type } = seg;
    p.noFill();
    const steps = 150;
    const coords = [];
    // Simulate botanical circumnutation along stem normal vector
    // Parameterized by normalized progression t so scaling width stretches the shape smoothly
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const bx = p.bezierPoint(x1, cp1x, cp2x, x2, t);
        const by = p.bezierPoint(y1, cp1y, cp2y, y2, t);
        const tx = p.bezierTangent(x1, cp1x, cp2x, x2, t);
        const ty = p.bezierTangent(y1, cp1y, cp2y, y2, t);
        const tLen = Math.hypot(tx, ty) || 1;
        const nx = -ty / tLen;
        const ny = tx / tLen;
        const envelope = Math.sin(t * Math.PI);
        const seed = seg.curvatureSeed || 100;
        const wavePhase = (type === 'entrance' ? 0.35 : 1.75) + (seed % 10) * 0.15;
        const wave1 = Math.sin(t * Math.PI * 2.8 + wavePhase) * 10.5;
        const wave2 = Math.sin(t * Math.PI * 5.2 + wavePhase * 1.5) * 3.8;
        const noiseWander = (p.noise(t * 3.2, (seed % 1000) * 0.05) - 0.5) * 18.0;
        const displacement = (wave1 + wave2 + noiseWander) * envelope;
        coords.push({
            x: bx + nx * displacement,
            y: by + ny * displacement,
            t
        });
    }
    // Layered bark fibers with natural tapering
    const baseThickness = p.map(p.constrain(span, 100, 380), 100, 380, 2.8, 4.8);
    const fiberShades = ['#2A3A2E', '#384B3C', '#465A4A', '#586E5C'];
    for (let f = 0; f < fiberShades.length; f++) {
        p.stroke(fiberShades[f]);
        for (let i = 1; i < coords.length; i++) {
            const p1 = coords[i - 1];
            const p2 = coords[i];
            let w = baseThickness;
            if (type === 'entrance') {
                w = p.lerp(1.2, baseThickness, Math.pow(p2.t, 0.55));
            }
            else if (type === 'exit') {
                w = p.lerp(baseThickness, 1.0, Math.pow(p2.t, 1.1));
            }
            else {
                w = baseThickness * (0.88 + 0.12 * Math.sin(p2.t * Math.PI));
            }
            const fiberNoise = (p.noise(p2.t * 8, f * 12) - 0.5) * 0.8;
            p.strokeWeight(Math.max(0.5, (w + fiberNoise) * (1 - f * 0.13)));
            const fx = (p.noise(p2.t * 5, f * 6) - 0.5) * 1.5;
            const fy = (p.noise(p2.t * 5, f * 6 + 15) - 0.5) * 1.5;
            p.line(p1.x + fx, p1.y + fy, p2.x + fx, p2.y + fy);
        }
    }
    // Stable leaf count per responsive breakpoint tier, scaled with swoop.
    // Larger flourishes get more petioles/leaves; tighter flourishes get fewer.
    const densityFactor = Math.max(0.5, Math.min(Number(swoop) || 1, 1.75));
    const baseLeafCount = (containerWidth <= 640) ? 8 : (containerWidth <= 1024) ? 11 : 14;
    const leafCount = Math.max(4, Math.round(baseLeafCount * densityFactor));
    const nodeRng = createPRNG((seg.curvatureSeed || 100) ^ 0x45D9F3B);
    const spacingJitter = type === 'exit' ? 0.065 : 0.045;
    for (let i = 1; i <= leafCount; i++) {
        // Stable deterministic seed per leaf slot
        const leafSeed = ((seg.curvatureSeed || 100) * 10007 + i * 389) & 0x7fffffff;
        p.randomSeed(leafSeed);
        const baseT = i / (leafCount + 1);
        const jitterT = baseT + (nodeRng() - 0.5) * spacingJitter;
        const t = p.constrain(jitterT, 0.06, 0.94);
        const idx = Math.min(Math.floor(t * steps), coords.length - 1);
        const pt = coords[idx];
        if (!pt)
            continue;
        const pNext = coords[Math.min(idx + 2, coords.length - 1)];
        const pPrev = coords[Math.max(idx - 2, 0)];
        const forwardAngle = p.atan2(pNext.y - pPrev.y, pNext.x - pPrev.x);
        // Avoid a strict alternating comb pattern. The exit vine gets a slight
        // natural bias toward the outside of its downward-facing curve.
        let side = nodeRng() < (type === 'exit' ? 0.58 : 0.5) ? 1 : -1;
        if (nodeRng() < 0.12)
            side = -side;
        // Acute forward axillary branching angle
        const axillaryOffset = side * p.radians(p.random(46, 68));
        const stemAngle = forwardAngle + axillaryOffset;
        drawOrganicLeafWithStem(p, pt.x, pt.y, stemAngle, side, type, t, leafSeed);
    }
}
// ============================================================================
// 4. p5 Instance Management
// ============================================================================
/**
 * Instantiates a p5 canvas attached to the container with responsive rendering.
 */
function createVineInstance(container, options = {}) {
    const { seamSelector = '.site-section', sections = null, targetSection = null, layer = 'fg', seed = Math.floor(Math.random() * 1000000), filter = 'url(#earthy-paper-shader)', swoop = 1 } = options;
    let resizeHandler = null;
    let resizeRafId = null;
    let destroyed = false;
    if (window.getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
    }
    const instance = new p5((p) => {
        const render = () => {
            const { width, height } = container.getBoundingClientRect();
            if (width === 0 || height === 0)
                return;
            // Ensure pixelDensity matches device capability consistently
            p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
            p.resizeCanvas(width, height);
            p.clear();
            p.push();
            // Apply exclusion mask across Section 2's interior face
            // Leaves window edge overlaps intact while masking the central body.
            // Offsets are clamped to the target section's actual horizontal box bounds.
            const seams = getSeamMetrics(container, targetSection, seamSelector, sections);
            if (seams && typeof Path2D !== 'undefined') {
                const { topSeamY, bottomSeamY, boxLeft = 0, boxRight = width } = seams;
                const { cutoutLeft, cutoutRight } = getResponsiveBounds(width, swoop);
                const maskLeft = Math.max(boxLeft, cutoutLeft);
                const maskRight = Math.min(boxRight, cutoutRight);
                if (maskRight > maskLeft) {
                    const mask = new Path2D();
                    mask.rect(0, 0, width, height);
                    mask.rect(maskLeft, topSeamY, maskRight - maskLeft, bottomSeamY - topSeamY);
                    p.drawingContext.clip(mask, 'evenodd');
                }
            }
            // Generate segments using the persistent instance seed (deterministic across resizes)
            p.randomSeed(seed % 65536);
            p.noiseSeed(seed % 65536);
            const segments = computeWrapperSegments(container, targetSection, seamSelector, sections, seed, swoop);
            segments.forEach(seg => {
                drawVineSegment(p, seg, getSegmentSpan(seg), width, swoop);
            });
            p.pop();
        };
        p.setup = () => {
            const { width, height } = container.getBoundingClientRect();
            p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
            const canvas = p.createCanvas(width || 100, height || 100);
            canvas.parent(container);
            canvas.class('canvas-' + layer);
            // Apply inline styles to be fully self-contained without external CSS dependencies
            canvas.style('position', 'absolute');
            canvas.style('top', '0');
            canvas.style('left', '0');
            canvas.style('width', '100%');
            canvas.style('height', '100%');
            canvas.style('pointer-events', 'none');
            canvas.style('clip-path', 'inset(0 0 0 0)');
            canvas.style('z-index', layer === 'bg' ? '2' : '4');
            // Apply filter if available in DOM or custom filter string provided
            if (filter) {
                const idMatch = filter.match(/#([\w-]+)/);
                if (!idMatch || document.getElementById(idMatch[1])) {
                    canvas.style('filter', filter);
                }
            }
            p.noLoop();
            // Throttled resize listener via requestAnimationFrame
            resizeHandler = () => {
                if (resizeRafId !== null)
                    cancelAnimationFrame(resizeRafId);
                resizeRafId = requestAnimationFrame(() => {
                    resizeRafId = null;
                    render();
                });
            };
            window.addEventListener('resize', resizeHandler, { passive: true });
            render();
        };
    });
    const api = {
        seed,
        instance,
        destroy() {
            if (destroyed)
                return;
            destroyed = true;
            if (resizeRafId !== null)
                cancelAnimationFrame(resizeRafId);
            if (resizeHandler)
                window.removeEventListener('resize', resizeHandler);
            instance.remove();
            activeVines.delete(api);
        }
    };
    return api;
}
// ============================================================================
// 5. Public API
// ============================================================================
/**
 * Resolves various target inputs into an array of DOM Elements.
 */
function resolveElements(target) {
    if (!target)
        return [];
    if (typeof target === 'string') {
        return Array.from(document.querySelectorAll(target));
    }
    if (target instanceof Element) {
        return [target];
    }
    if (target instanceof NodeList || target instanceof HTMLCollection || Array.isArray(target)) {
        return Array.from(target).filter(el => el instanceof Element);
    }
    return [];
}
/**
 * Creates and attaches an organic weaving vine around target DOM node(s).
 *
 * @param {VineTarget} target Target DOM element or CSS selector.
 * @param {'wrap'|number|VineOptions} [vineTypeOrSeedOrOptions='wrap'] Mode, seed, or options.
 * @param {VineOptions} [options={}] Additional configuration options.
 * @returns {VineInstance|VineInstance[]} Vine instance(s).
 */
function createVine(target, vineTypeOrSeedOrOptions = 'wrap', options = {}) {
    ensureVineStyles();
    ensureVineFilter();
    // Support object syntax: createVine({ target, ... })
    if (typeof target === 'object' && target !== null && !('nodeType' in target) && !Array.isArray(target) && 'target' in target) {
        const config = target;
        options = config;
        target = config.target;
    }
    else if (typeof vineTypeOrSeedOrOptions === 'number') {
        options = { ...options, seed: vineTypeOrSeedOrOptions };
    }
    else if (typeof vineTypeOrSeedOrOptions === 'object' && vineTypeOrSeedOrOptions !== null) {
        options = vineTypeOrSeedOrOptions;
    }
    const elements = resolveElements(target);
    if (elements.length === 0)
        return [];
    const instances = [];
    elements.forEach(el => {
        const hasChildSections = el.querySelectorAll(options.seams || '.site-section').length >= 2;
        const previousInstance = mountedTargets.get(el);
        if (previousInstance)
            previousInstance.destroy();
        // Persist or reuse seed on the DOM element so re-instantiations stay identical
        const vineElement = el;
        const seed = options.seed ?? vineElement._vineSeed ?? Math.floor(Math.random() * 1000000);
        vineElement._vineSeed = seed;
        if (hasChildSections) {
            // Container wrapping child sections (e.g. '.vine-section-wrap')
            const instance = createVineInstance(el, {
                seamSelector: options.seams || '.site-section',
                layer: options.layer || 'fg',
                ...options,
                seed
            });
            instances.push(instance);
            activeVines.add(instance);
            mountedTargets.set(el, instance);
        }
        else {
            // Direct designated section (e.g. '.unique-block-2')
            const container = el.parentElement || el;
            const instance = createVineInstance(container, {
                targetSection: el,
                layer: options.layer || 'fg',
                ...options,
                seed
            });
            instances.push(instance);
            activeVines.add(instance);
            mountedTargets.set(el, instance);
        }
    });
    return instances.length === 1 ? instances[0] : instances;
}
/**
 * Batch initialization schema helper.
 */
function initVineSystem(configArray) {
    if (!Array.isArray(configArray))
        return;
    configArray.forEach(config => {
        createVine(config.target, 'wrap', config);
    });
}
/** @type {VineApi} */
const Vine = Object.freeze({
    create: createVine,
    mount: createVine,
    mountAll: initVineSystem,
    destroyAll() {
        for (const vine of activeVines) {
            vine.destroy();
        }
        activeVines.clear();
    }
});
window.Vine = Vine;
window.createVine = createVine;
window.initVine = createVine;
window.initVineSystem = initVineSystem;
