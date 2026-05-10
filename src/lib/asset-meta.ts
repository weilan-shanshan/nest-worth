import type { AssetCategory } from '../types';

export interface CategoryMeta {
  key: AssetCategory;
  label: string;
  icon: string;     // unocss icon class
  color: string;    // hex (icon background)
}

export const CATEGORIES: CategoryMeta[] = [
  { key: 'cash',       label: '现金/活期', icon: 'i-ph-wallet-duotone',           color: '#5C8FE0' },
  { key: 'deposit',    label: '定期存款',   icon: 'i-ph-bank-duotone',             color: '#3F73CC' },
  { key: 'wealth',     label: '理财',       icon: 'i-ph-coin-vertical-duotone',    color: '#9333EA' },
  { key: 'fund',       label: '基金',       icon: 'i-ph-chart-pie-slice-duotone',  color: '#2E9E60' },
  { key: 'stock',      label: '股票',       icon: 'i-ph-trend-up-duotone',         color: '#16A34A' },
  { key: 'realestate', label: '房产',       icon: 'i-ph-house-duotone',            color: '#F5A623' },
  { key: 'insurance',  label: '保险',       icon: 'i-ph-shield-check-duotone',     color: '#8BAF96' },
  { key: 'receivable', label: '应收借出',   icon: 'i-ph-handshake-duotone',        color: '#8BAF96' },
  { key: 'other',      label: '其他',       icon: 'i-ph-dots-three-circle-duotone', color: '#8BAF96' }
];

export const CATEGORY_MAP: Record<AssetCategory, CategoryMeta> =
  Object.fromEntries(CATEGORIES.map(c => [c.key, c])) as Record<AssetCategory, CategoryMeta>;
