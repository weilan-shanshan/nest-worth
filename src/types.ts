export type AssetCategory =
  | 'cash'        // 现金/活期
  | 'deposit'     // 定期存款
  | 'fund'        // 基金
  | 'stock'       // 股票
  | 'crypto'      // 数字货币
  | 'realestate'  // 房产
  | 'insurance'   // 保险
  | 'receivable'  // 应收/借出
  | 'other';

export type TickerType = 'cn-stock' | 'hk-stock' | 'us-stock' | 'cn-fund' | 'crypto' | 'forex' | 'metal' | 'none';

export interface Asset {
  id?: number;
  name: string;             // 招商银行储蓄卡
  platform?: string;        // 招商银行 / 支付宝 / 富途
  category: AssetCategory;
  balance: number;          // 当前余额 (CNY)
  currency: string;         // CNY/USD/HKD ...
  cost?: number;            // 持仓成本，可选
  dailyChange?: number;     // 当日涨跌（金额）
  dailyChangePct?: number;  // 当日涨跌幅 %
  note?: string;

  // 自动行情同步（基金/股票/加密）
  tickerSymbol?: string;    // 600519 / AAPL / 008888 / BTC / 0700.HK
  tickerType?: TickerType;
  shares?: number;          // 持仓数量（股/份）
  lastQuoteAt?: number;     // 上次行情更新时间戳
  lastQuotePrice?: number;  // 上次更新时的单位价格

  createdAt: number;
  updatedAt: number;
}

export interface Snapshot {
  id?: number;
  date: string;             // YYYY-MM-DD
  total: number;            // 当日总净值（CNY 折算）
  byCategory?: Record<AssetCategory, number>;
}

export interface Goal {
  id?: number;
  name: string;
  target: number;
  current: number;          // 手动维护或自动跟随某分类
  deadline?: string;        // YYYY-MM-DD
  trackCategory?: AssetCategory;
  createdAt: number;
}

export interface Settings {
  id?: number;
  apiKey?: string;
  baseCurrency: string;     // 默认 CNY
  privacyMode?: boolean;    // 隐藏金额
  exhaustedModels?: string[];     // 免费额度已用完的模型名列表
  preferredModel?: string;        // 截图识别的首选模型
  analystModelOrder?: string[];   // 理财分析模型用户自定义顺序
  analystEnabled?: Record<string, boolean>;   // 每个分析模型是否启用
  ensembleSize?: number;          // 1-3，每次用 N 个模型交叉验证
}
