/**
 * Procedural canvas textures (no binary assets): wood, tiles, plaster, fabric.
 * Every generator is seeded, so a scene looks the same on every load.
 */

export function seeded(seed = 1) {
    let s = seed;
    return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function repeat(THREE, texture, rx, ry) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(rx, ry);
    return texture;
}

/** Wood grain along x: base colour with darker and lighter streaks. */
export function woodTexture(scene, { base = "#a8774c", dark = "rgba(70, 40, 18, 0.22)", light = "rgba(255, 230, 190, 0.12)", seed = 3, rx = 1, ry = 1 } = {}) {
    const rnd = seeded(seed);
    const { texture } = scene.tex(512, 256, (ctx, w, h) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 140; i++) {
            const y = rnd() * h, amp = 1 + rnd() * 4, freq = 0.004 + rnd() * 0.01, phase = rnd() * 6;
            ctx.strokeStyle = rnd() < 0.7 ? dark : light;
            ctx.lineWidth = 0.6 + rnd() * 2.2;
            ctx.beginPath();
            for (let x = 0; x <= w; x += 8) {
                const yy = y + Math.sin(x * freq + phase) * amp;
                x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
            }
            ctx.stroke();
        }
        // a couple of knots
        for (let i = 0; i < 2; i++) {
            const x = rnd() * w, y = rnd() * h;
            const g = ctx.createRadialGradient(x, y, 0, x, y, 10 + rnd() * 8);
            g.addColorStop(0, "rgba(60, 32, 12, 0.35)");
            g.addColorStop(1, "rgba(60, 32, 12, 0)");
            ctx.fillStyle = g;
            ctx.fillRect(x - 20, y - 20, 40, 40);
        }
    });
    return repeat(scene.THREE, texture, rx, ry);
}

/** Square floor tiles with grout and a slight colour variation per tile. */
export function tileTexture(scene, { tiles = 4, colors = ["#cdbea8", "#c6b69f", "#d3c5b0", "#c9baa4"], grout = "#a8997f", seed = 5, rx = 1, ry = 1 } = {}) {
    const rnd = seeded(seed);
    const { texture } = scene.tex(512, 512, (ctx, w) => {
        const size = w / tiles;
        ctx.fillStyle = grout;
        ctx.fillRect(0, 0, w, w);
        for (let i = 0; i < tiles; i++) {
            for (let j = 0; j < tiles; j++) {
                const x = i * size + 2, y = j * size + 2, s = size - 4;
                ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
                ctx.fillRect(x, y, s, s);
                // soft mottling, like stone
                for (let k = 0; k < 18; k++) {
                    const cx = x + rnd() * s, cy = y + rnd() * s, r = 6 + rnd() * 22;
                    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
                    const tone = rnd() < 0.5 ? "120, 100, 75" : "255, 250, 240";
                    g.addColorStop(0, `rgba(${tone}, 0.07)`);
                    g.addColorStop(1, `rgba(${tone}, 0)`);
                    ctx.fillStyle = g;
                    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
                }
                // bevel: light top-left edge, dark bottom-right edge
                ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
                ctx.fillRect(x, y, s, 2);
                ctx.fillRect(x, y, 2, s);
                ctx.fillStyle = "rgba(80, 60, 40, 0.12)";
                ctx.fillRect(x, y + s - 2, s, 2);
                ctx.fillRect(x + s - 2, y, 2, s);
            }
        }
    });
    return repeat(scene.THREE, texture, rx, ry);
}

/** Painted plaster: a flat colour with very soft, large-scale unevenness. */
export function plasterTexture(scene, { base = "#f1e8da", seed = 9, rx = 1, ry = 1 } = {}) {
    const rnd = seeded(seed);
    const { texture } = scene.tex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 60; i++) {
            const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 60;
            const tone = rnd() < 0.5 ? "140, 120, 95" : "255, 252, 245";
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, `rgba(${tone}, 0.05)`);
            g.addColorStop(1, `rgba(${tone}, 0)`);
            ctx.fillStyle = g;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
    });
    return repeat(scene.THREE, texture, rx, ry);
}

/** Woven rug: border bands around a fine cross-hatched field. */
export function rugTexture(scene, { field = "#8f9db0", border = "#efe4d2", accent = "#b0735a" } = {}) {
    const { texture } = scene.tex(512, 640, (ctx, w, h) => {
        ctx.fillStyle = border;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = accent;
        ctx.fillRect(26, 26, w - 52, h - 52);
        ctx.fillStyle = border;
        ctx.fillRect(38, 38, w - 76, h - 76);
        ctx.fillStyle = field;
        ctx.fillRect(56, 56, w - 112, h - 112);
        // weave
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = "#000";
        for (let y = 0; y < h; y += 4) {
            ctx.fillRect(0, y, w, 1);
        }
        ctx.fillStyle = "#fff";
        for (let x = 0; x < w; x += 4) {
            ctx.fillRect(x, 0, 1, h);
        }
        ctx.globalAlpha = 1;
        // central motif
        ctx.strokeStyle = border;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(w / 2, h / 2 - 110);
        ctx.lineTo(w / 2 + 90, h / 2);
        ctx.lineTo(w / 2, h / 2 + 110);
        ctx.lineTo(w / 2 - 90, h / 2);
        ctx.closePath();
        ctx.stroke();
    });
    return texture;
}

/** Keyboard top: rows of keys. */
export function keyboardTexture(scene) {
    const { texture } = scene.tex(256, 96, (ctx, w, h) => {
        ctx.fillStyle = "#2f343c";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#e9eaed";
        const rows = 5, cols = 14, kw = (w - 12) / cols, kh = (h - 10) / rows;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (r === rows - 1 && c > 3 && c < 10) {
                    continue; // space bar
                }
                ctx.fillRect(6 + c * kw + 1, 5 + r * kh + 1, kw - 2, kh - 2);
            }
        }
        ctx.fillRect(6 + 4 * kw + 1, 5 + (rows - 1) * kh + 1, 6 * kw - 2, kh - 2);
    });
    return texture;
}
