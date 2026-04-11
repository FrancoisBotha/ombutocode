#!/usr/bin/env node
/**
 * SVG to PNG Conversion Tool
 *
 * Converts SVG files to PNG images using sharp. No Python or native build tools required.
 * Agents should write SVG mockups, then use this tool to produce PNG output.
 *
 * Usage:
 *   node .ombutocode/tools/svg-to-png.js <input.svg> [output.png] [--width N] [--height N] [--scale N]
 *
 * Arguments:
 *   input.svg       Path to the SVG file to convert
 *   output.png      Output PNG path (default: same name with .png extension)
 *
 * Options:
 *   --width N       Output width in pixels (default: from SVG viewBox or 1200)
 *   --height N      Output height in pixels (default: from SVG viewBox or 800)
 *   --scale N       Scale factor (e.g. 2 for 2x resolution, default: 1)
 *
 * Examples:
 *   node .ombutocode/tools/svg-to-png.js docs/Mockups/Dashboard.svg
 *   node .ombutocode/tools/svg-to-png.js docs/Mockups/Dashboard.svg docs/Mockups/Dashboard.png
 *   node .ombutocode/tools/svg-to-png.js docs/Mockups/Dashboard.svg --scale 2
 *   node .ombutocode/tools/svg-to-png.js docs/Mockups/Dashboard.svg --width 1920 --height 1080
 */

'use strict';

const fs = require('fs');
const path = require('path');

const OMBUTOCODE_DIR = path.resolve(__dirname, '..');

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`SVG to PNG Conversion Tool

Usage: node .ombutocode/tools/svg-to-png.js <input.svg> [output.png] [options]

Options:
  --width N     Output width in pixels
  --height N    Output height in pixels
  --scale N     Scale factor (e.g. 2 for retina)

Examples:
  node .ombutocode/tools/svg-to-png.js docs/Mockups/Dashboard.svg
  node .ombutocode/tools/svg-to-png.js docs/Mockups/Dashboard.svg --scale 2
`);
    return;
  }

  // Parse arguments
  const inputPath = args[0];
  let outputPath = null;
  let width = null;
  let height = null;
  let scale = 1;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--width' && args[i + 1]) { width = parseInt(args[++i]); }
    else if (args[i] === '--height' && args[i + 1]) { height = parseInt(args[++i]); }
    else if (args[i] === '--scale' && args[i + 1]) { scale = parseFloat(args[++i]); }
    else if (!args[i].startsWith('--') && !outputPath) { outputPath = args[i]; }
  }

  // Default output path
  if (!outputPath) {
    outputPath = inputPath.replace(/\.svg$/i, '.png');
  }

  // Validate input
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  // Read SVG
  const svgContent = fs.readFileSync(inputPath, 'utf-8');

  // Extract dimensions from SVG if not specified
  if (!width || !height) {
    const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
    const widthMatch = svgContent.match(/width="(\d+)"/);
    const heightMatch = svgContent.match(/height="(\d+)"/);

    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].split(/[\s,]+/).map(Number);
      if (!width) width = parts[2] || 1200;
      if (!height) height = parts[3] || 800;
    } else {
      if (!width) width = widthMatch ? parseInt(widthMatch[1]) : 1200;
      if (!height) height = heightMatch ? parseInt(heightMatch[1]) : 800;
    }
  }

  // Apply scale
  const outputWidth = Math.round(width * scale);
  const outputHeight = Math.round(height * scale);

  // Ensure the SVG has explicit dimensions for sharp
  let processedSvg = svgContent;
  if (!svgContent.includes('width=') || !svgContent.includes('height=')) {
    processedSvg = svgContent.replace(
      '<svg',
      `<svg width="${width}" height="${height}"`
    );
  }

  try {
    // Resolve sharp from the ombutocode src node_modules
    const sharpPath = path.join(OMBUTOCODE_DIR, 'src', 'node_modules', 'sharp');
    const sharp = require(sharpPath);

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    await sharp(Buffer.from(processedSvg))
      .resize(outputWidth, outputHeight)
      .png()
      .toFile(outputPath);

    console.log(`✓ Converted: ${inputPath} → ${outputPath}`);
    console.log(`  Dimensions: ${outputWidth}x${outputHeight}px${scale !== 1 ? ` (${scale}x scale)` : ''}`);
    console.log(`  File size: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
  } catch (e) {
    console.error(`Error converting SVG to PNG: ${e.message}`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
