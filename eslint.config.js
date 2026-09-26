// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // Redesigned UI takes colours from theme roles (lib/design-system/tokens.ts),
    // so light/dark mode and the contrast test cover every colour on screen.
    files: ['features/**/*.{ts,tsx}', 'components/design-system/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
          message: 'Use a theme colour role (useTheme().rawColors or a NativeWind class) instead of a hex literal. Add a role to lib/design-system/tokens.ts if none fits.',
        },
        {
          selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{3}/]',
          message: 'Use a theme colour role instead of a hex literal.',
        },
      ],
    },
  },
  {
    // SDK 56 enables React Compiler diagnostics through react-hooks v7.
    // Keep the SDK 55 lint policy until compiler adoption is planned separately.
    rules: {
      'react-hooks/config': 'off',
      'react-hooks/error-boundaries': 'off',
      'react-hooks/gating': 'off',
      'react-hooks/globals': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/set-state-in-render': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/unsupported-syntax': 'off',
      'react-hooks/use-memo': 'off',
    },
  },
]);
