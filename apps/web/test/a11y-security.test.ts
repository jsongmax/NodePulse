import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, '../src');

describe('Accessibility & Safe Rendering (M3-T6)', () => {
  it('strictly_bans_dangerouslySetInnerHTML_in_all_web_source_files', () => {
    function checkDir(dir: string): string[] {
      const results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...checkDir(fullPath));
        } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes('dangerouslySetInnerHTML')) {
            results.push(fullPath);
          }
        }
      }
      return results;
    }

    const violations = checkDir(srcDir);
    expect(violations).toEqual([]);
  });

  it('defines_accessible_focus_visible_styling_in_css', () => {
    const cssPath = path.resolve(srcDir, 'index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    expect(cssContent).toContain(':focus-visible');
    expect(cssContent).toContain('outline: 2px solid');
  });

  it('defines_reduced_motion_media_query_in_css', () => {
    const cssPath = path.resolve(srcDir, 'index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    expect(cssContent).toContain('@media (prefers-reduced-motion: reduce)');
    expect(cssContent).toContain('animation-duration: 0.01ms');
  });
});
