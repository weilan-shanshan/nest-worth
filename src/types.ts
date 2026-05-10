export type AssetCategory =
  | 'cash'        // 现金/活期
  | 'deposit'     // 定期存款（银行存款）
  | 'wealth'      // 固收理财（银行理财/券商资管/信托）
  | 'fund'        // 基金
  | 'stock'       // 股票
  | 'realestate'  // 房产
  | 'insurance'   // 保险
  | 'receivable'  // 应收/借出
  | 'other';

export type TickerType = 'cn-stock' | 'hk-stock' | 'us-stock' | 'cn-fund' | 'forex' | 'metal' | 'none';

/**
 * LLM/系统算出的派生字段（不允许用户手填，只通过 derive.ts 写入）。
 * 渲染层只读这里，AssetRow 不再调 asset-calc.ts 的派生函数（仅作为兜底）。
 */
export interface AssetDerived {
  daysToMaturity?: number;     // 距到期天数
  maturityValue?: number;      // 到期金额
  maturityProfit?: number;     // 到期收益
  fundReturnAbs?: number;      // 基金累计收益金额
  fundReturnPct?: number;      // 基金累计收益率 %
  annualized?: number;         // 年化收益率 %（基金/固收）
  holdingDays?: number;        // 持有天数
  pnlAbs?: number;             // 通用浮盈金额（房产/股票）
  pnlPct?: number;             // 通用浮盈率
  note?: string;               // LLM 给出的一句话点评（可选）
}

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

  // 自动行情同步（基金/股票）
  tickerSymbol?: string;    // 600519 / AAPL / 008888 / 0700.HK
  tickerType?: TickerType;
  shares?: number;          // 持仓数量（股/份）
  lastQuoteAt?: number;     // 上次行情更新时间戳
  lastQuotePrice?: number;  // 上次更新时的单位价格

  // 固收类（存款 / 理财）—— 基础事实字段，可由用户填或截图识别
  termMonths?: number;        // 期限（月），如 12 / 36
  interestRate?: number;      // 年化利率 %，如 3.5
  startDate?: string;         // 起息日 / 买入日 YYYY-MM-DD
  maturityDate?: string;      // 到期日 YYYY-MM-DD

  // 截图识别带回的"App 显示值"，仅作为 LLM 计算的参考输入，UI 不直接展示。
  // @deprecated 不要在 UI 里读这两个字段；改读 derived。
  totalReturn?: number;
  annualizedReturn?: number;
  /** @deprecated 用 derived.maturityValue */
  maturityValue?: number;

  /** LLM/系统算出的派生字段 */
  derived?: AssetDerived;
  /** 派生字段最近一次计算的时间戳 */
  derivedAt?: number;
  /** 缺哪些基础事实字段，导致 LLM 无法算（key 列表，如 ['interestRate', 'startDate']） */
  missingFields?: string[];

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

export type DeriveMode = 'batch' | 'parallel';

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
  /** 派生字段计算模式：batch=整库一次 prompt（默认） / parallel=每条一次并发 */
  deriveMode?: DeriveMode;
  /** 整库最近一次重算时间戳；> 12h 时下次 load 自动重算 */
  derivedAllAt?: number;
}
