import {
  defineConfig,
  presetUno,
  presetIcons,
  presetWebFonts,
  transformerVariantGroup
} from 'unocss';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const phIcons = JSON.parse(readFileSync(resolve(__dirname, 'node_modules/@iconify-json/ph/icons.json'), 'utf-8'));

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons({
      scale: 1.2,
      warn: true,
      extraProperties: {
        display: 'inline-block',
        'vertical-align': 'middle'
      },
      collections: {
        ph: () => phIcons
      }
    }),
    presetWebFonts({
      provider: 'bunny',
      fonts: {
        brand: [{ name: 'Playfair Display', weights: ['600', '700'] }],
        sans: [{ name: 'Nunito', weights: ['400', '500', '600', '700'] }]
      }
    })
  ],
  transformers: [transformerVariantGroup()],
  theme: {
    colors: {
      bg: '#EFF6F1',
      brand: {
        DEFAULT: '#2E9E60',
        50: '#EFF6F1',
        100: '#E0EFE6',
        500: '#2E9E60',
        600: '#258752'
      },
      card: '#FFFFFF',
      border: '#E0EFE6',
      ink: {
        DEFAULT: '#1F2D26',
        muted: '#8BAF96'
      },
      pos: '#2E9E60',
      neg: '#E5604A',
      orange: '#F5A623',
      blue: '#5C8FE0'
    },
    borderRadius: {
      app: '32px',
      card: '24px',
      row: '16px',
      nav: '20px',
      navActive: '14px',
      icon: '12px'
    },
    fontFamily: {
      brand: '"Playfair Display", serif',
      sans: 'Nunito, system-ui, sans-serif'
    }
  },
  shortcuts: {
    'card-base': 'bg-card border border-border rounded-row p-4',
    'tap': 'transition-transform active:scale-97'
  },
  safelist: [
    'bg-brand', 'bg-orange', 'bg-blue', 'text-pos', 'text-neg',
    'i-ph-arrow-down-bold', 'i-ph-arrow-up-bold', 'i-ph-bank-duotone',
    'i-ph-camera-duotone', 'i-ph-caret-right-bold', 'i-ph-chart-line-up-duotone',
    'i-ph-chart-pie-slice-duotone', 'i-ph-coins-duotone', 'i-ph-currency-btc-duotone',
    'i-ph-dots-three-circle-duotone', 'i-ph-download-simple-duotone',
    'i-ph-eye-closed-duotone', 'i-ph-eye-duotone', 'i-ph-gear-six-duotone',
    'i-ph-handshake-duotone', 'i-ph-house-duotone', 'i-ph-image-square-duotone',
    'i-ph-info-duotone', 'i-ph-key-duotone', 'i-ph-plus-bold',
    'i-ph-shield-check-duotone', 'i-ph-spinner-gap-bold', 'i-ph-squares-four-duotone',
    'i-ph-target-duotone', 'i-ph-trash-duotone', 'i-ph-trend-up-duotone',
    'i-ph-upload-simple-duotone', 'i-ph-wallet-duotone', 'i-ph-x-bold',
    'i-ph-stack-duotone', 'i-ph-star-fill', 'i-ph-caret-down-bold',
    'i-ph-lightbulb-duotone', 'i-ph-arrows-clockwise-bold', 'i-ph-warning-circle-duotone',
    'i-ph-check-circle-duotone', 'i-ph-arrow-circle-right-duotone', 'i-ph-sparkle-duotone',
    'i-ph-globe-hemisphere-east-duotone', 'i-ph-calendar-check-duotone',
    'i-ph-broadcast-duotone', 'i-ph-cpu-duotone',
    'i-ph-brain-duotone', 'i-ph-caret-up-bold', 'i-ph-book-open-text-duotone',
    'i-ph-caret-left-bold', 'i-ph-list-checks-duotone', 'i-ph-rocket-launch-duotone',
    'i-ph-database-duotone', 'i-ph-globe-duotone', 'i-ph-code-duotone',
    'i-ph-shuffle-duotone', 'i-ph-clock-duotone',
    'i-ph-lock-key-duotone', 'i-ph-users-three-duotone', 'i-ph-x-circle-duotone',
    'i-ph-arrow-square-out-duotone', 'i-ph-paper-plane-tilt-duotone'
  ]
});
