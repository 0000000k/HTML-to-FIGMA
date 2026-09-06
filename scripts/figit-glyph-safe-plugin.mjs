import { readFile } from "node:fs/promises";

/**
 * Soften figit glyph encoding so emoji / COLR / odd fontkit commands
 * skip a single character instead of aborting the whole text node.
 */
export function figitGlyphSafePlugin() {
  return {
    name: "figit-glyph-safe",
    setup(build) {
      build.onLoad(
        { filter: /node_modules\/@figit\/dom-to-figma\/dist\/figma\.mjs$/ },
        async (args) => {
          let source = await readFile(args.path, "utf8");

          const unsafeEncoder = `function pathCommandsToGlyphBytes(commands, options = {}) {
	if (commands.length === 0) return [0];
	const { unitsPerEm = 2048 } = options;
	const bytes = [];
	const writeFloat = (value) => {
		const buffer = /* @__PURE__ */ new ArrayBuffer(4);
		new DataView(buffer).setFloat32(0, value, true);
		const u = new Uint8Array(buffer);
		bytes.push(u[0] ?? 0, u[1] ?? 0, u[2] ?? 0, u[3] ?? 0);
	};
	for (const { command, args } of commands) {
		const opcode = COMMAND_OPCODES[command];
		if (opcode === void 0) throw new Error(\`Unknown path command: \${command}\`);
		bytes.push(opcode);
		for (let i = 0; i < args.length; i += 2) {
			writeFloat((args[i] ?? 0) / unitsPerEm);
			writeFloat((args[i + 1] ?? 0) / unitsPerEm);
		}
	}
	return bytes;
}`;

          const safeEncoder = `function pathCommandsToGlyphBytes(commands, options = {}) {
	if (!commands || commands.length === 0) return [0];
	const { unitsPerEm = 2048 } = options;
	const bytes = [];
	const writeFloat = (value) => {
		const buffer = /* @__PURE__ */ new ArrayBuffer(4);
		new DataView(buffer).setFloat32(0, value, true);
		const u = new Uint8Array(buffer);
		bytes.push(u[0] ?? 0, u[1] ?? 0, u[2] ?? 0, u[3] ?? 0);
	};
	const aliases = {
		curveTo: "bezierCurveTo",
		qcurveTo: "quadraticCurveTo",
		close: "closePath",
		M: "moveTo",
		L: "lineTo",
		Q: "quadraticCurveTo",
		C: "bezierCurveTo",
		Z: "closePath",
		z: "closePath"
	};
	for (const entry of commands) {
		const raw = entry.command ?? entry.type;
		const command = aliases[raw] ?? raw;
		const args = entry.args ?? [];
		const opcode = COMMAND_OPCODES[command];
		if (opcode === void 0) {
			console.warn("[Free HTML to Figma] Skipping unknown glyph path command:", raw);
			continue;
		}
		bytes.push(opcode);
		for (let i = 0; i < args.length; i += 2) {
			writeFloat((args[i] ?? 0) / unitsPerEm);
			writeFloat((args[i + 1] ?? 0) / unitsPerEm);
		}
	}
	return bytes.length ? bytes : [0];
}`;

          const unsafeGlyph = `function processSingleGlyph(font, char, metrics, fontSize, registerBlob) {
	const codePoint = char.codePointAt(0);
	if (codePoint === void 0) return null;
	const glyph = font.glyphForCodePoint(codePoint);
	if (glyph.id === 0 && char !== " ") {
		console.warn(\`No glyph found for character: '\${char}' (U+\${codePoint.toString(16).toUpperCase()})\`);
		return null;
	}
	if (char === " ") return createSpaceGlyph(char, glyph, fontSize, metrics.unitsPerEm, registerBlob);
	const glyphBytes = pathCommandsToGlyphBytes(glyph.path.commands, { unitsPerEm: metrics.unitsPerEm });
	if (glyphBytes.length <= 1) {
		console.warn(\`Empty path for character: '\${char}'\`);
		return null;
	}
	const registeredBlobIndex = registerBlob({ bytes: glyphBytes });
	return {
		character: char,
		unicode: codePoint,
		bytes: glyphBytes,
		advance: calculateAdvanceWidth(glyph, fontSize, metrics.unitsPerEm),
		registeredBlobIndex
	};
}`;

          const safeGlyph = `function processSingleGlyph(font, char, metrics, fontSize, registerBlob) {
	try {
		const codePoint = char.codePointAt(0);
		if (codePoint === void 0) return null;
		const glyph = font.glyphForCodePoint(codePoint);
		if (!glyph) return null;
		if (glyph.id === 0 && char !== " ") {
			console.warn(\`No glyph found for character: '\${char}' (U+\${codePoint.toString(16).toUpperCase()})\`);
			return null;
		}
		if (char === " ") return createSpaceGlyph(char, glyph, fontSize, metrics.unitsPerEm, registerBlob);
		const commands = glyph.path?.commands;
		if (!commands) {
			console.warn(\`No vector path for character: '\${char}' (bitmap/COLR/emoji glyph)\`);
			return null;
		}
		const glyphBytes = pathCommandsToGlyphBytes(commands, { unitsPerEm: metrics.unitsPerEm });
		if (glyphBytes.length <= 1) {
			console.warn(\`Empty path for character: '\${char}'\`);
			return null;
		}
		const registeredBlobIndex = registerBlob({ bytes: glyphBytes });
		return {
			character: char,
			unicode: codePoint,
			bytes: glyphBytes,
			advance: calculateAdvanceWidth(glyph, fontSize, metrics.unitsPerEm),
			registeredBlobIndex
		};
	} catch (error) {
		console.warn(\`[Free HTML to Figma] Glyph failed for '\${char}':\`, error);
		return null;
	}
}`;

          if (!source.includes(unsafeEncoder) || !source.includes(unsafeGlyph)) {
            console.warn(
              "[figit-glyph-safe] Could not locate glyph helpers to patch; figit may have changed.",
            );
            return { contents: source, loader: "js" };
          }

          source = source
            .replace(unsafeEncoder, safeEncoder)
            .replace(unsafeGlyph, safeGlyph);

          return { contents: source, loader: "js" };
        },
      );
    },
  };
}
