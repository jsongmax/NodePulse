import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginSecurity from 'eslint-plugin-security';
import pluginReact from 'eslint-plugin-react';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.wrangler/**',
      '**/.mf/**',
      '**/coverage/**',
      'agent/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      security: pluginSecurity,
      react: pluginReact,
    },
    rules: {
      ...pluginSecurity.configs.recommended.rules,
      // P6 & SECURITY §14: Ban dangerouslySetInnerHTML in React
      'react/no-danger': 'error',
      // Ban template strings in SQL query callers
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TaggedTemplateExpression[tag.name="sql"]',
          message:
            'Template string SQL is forbidden. Use parameterized queries with ? placeholders.',
        },
        {
          selector:
            'CallExpression[callee.property.name="prepare"] TemplateLiteral:has(TemplateElement + *)',
          message:
            'Do not use string interpolation in db.prepare(). Use parameterized SQL with ? placeholders.',
        },
        {
          selector:
            'CallExpression[callee.property.name="exec"] TemplateLiteral:has(TemplateElement + *)',
          message:
            'Do not use string interpolation in sql.exec(). Use parameterized SQL with ? placeholders.',
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'JSXAttribute[name.name="className"] Literal[value=/(#[0-9a-fA-F]{3,8}|rgba?\\(|hsla?\\()/]',
          message:
            'Do not use hardcoded hex or rgb/hsl color values in className. Use semantic tokens mapped via Tailwind theme classes (e.g. bg-bg-0, text-fg-1, text-accent).',
        },
      ],
    },
  },
  prettierConfig
);
