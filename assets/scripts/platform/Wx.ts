/**
 * 微信小游戏平台能力的薄封装。
 * 不在微信环境（Cocos 预览 / 浏览器）时全部走兜底，方便本地调试。
 */
import { CLOUD_ENV } from '../config/GameConfig';

declare const wx: any;

export const isWx: boolean = typeof wx !== 'undefined' && typeof wx.getSystemInfoSync === 'function';

// ---------------- 云开发 ----------------

let cloudReady = false;

/** 云开发是否可用：在微信里、配置了环境 id、init 成功 */
export function hasCloud(): boolean {
  return cloudReady;
}

/** 启动时调一次。没配 CLOUD_ENV 或不在微信里就静默跳过，游戏照常走本地 */
export function initCloud(): void {
  if (cloudReady) return;
  if (!isWx || !CLOUD_ENV || !wx.cloud || typeof wx.cloud.init !== 'function') return;
  try {
    wx.cloud.init({ env: CLOUD_ENV, traceUser: true });
    cloudReady = true;
  } catch (e) {
    console.warn('[Wx] 云开发初始化失败', e);
  }
}

/** 调云函数，带超时；失败 reject，调用方自己决定兜底 */
export function cloudCall<T = any>(name: string, data: Record<string, unknown> = {}, timeoutMs = 4000): Promise<T> {
  if (!cloudReady) return Promise.reject(new Error('cloud not ready'));
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('cloud timeout: ' + name)), timeoutMs);
    wx.cloud
      .callFunction({ name, data })
      .then((res: { result: T }) => {
        clearTimeout(timer);
        resolve(res.result);
      })
      .catch((err: unknown) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ---------------- 时间源 ----------------

/** 服务端时间 - 本机时间 的偏移(ms)，同步过后 now() 就不受玩家改手机时间影响 */
let clockOffset = 0;
let lastNow = 0;
let syncing = false;
let clockSynced = false;

/** 是否至少成功校过一次时。云存档只在校过时后才推，避免手机时间不准的设备写出错误的 savedAt */
export function isClockSynced(): boolean {
  return clockSynced;
}

/**
 * 当前时间(ms)。体力 / 生成器恢复都用它。
 * 单调不回退：玩家把系统时间往回拨，now() 也不会倒着走。
 * 校时进行中（回前台那一瞬）不用旧偏移往前推，免得在校正结果到来前先用错误时间结算掉体力。
 */
export function now(): number {
  if (syncing && lastNow > 0) return lastNow;
  const t = Date.now() + clockOffset;
  if (t < lastNow) return lastNow;
  lastNow = t;
  return t;
}

/**
 * 向云函数 getServerTime 校一次时间。启动和回到前台各调一次。
 * 返回是否同步成功；失败时保持上一次的偏移。
 */
export async function syncServerTime(): Promise<boolean> {
  if (!cloudReady) return false;
  syncing = true;
  try {
    const sent = Date.now();
    const res = await cloudCall<{ now: number }>('getServerTime', {}, 3000);
    const rtt = Date.now() - sent;
    if (!res || typeof res.now !== 'number') return false;
    // 服务端时间 + 半个来回，减本机时间
    clockOffset = res.now + rtt / 2 - Date.now();
    // 以服务端为准：重置单调基准，往回修正的偏移才能立刻生效
    lastNow = 0;
    clockSynced = true;
    return true;
  } catch (e) {
    console.warn('[Wx] 校时失败', e);
    return false;
  } finally {
    syncing = false;
  }
}

// ---------------- 分享 / 订阅 ----------------

/** 启动时调一次：右上角菜单可分享，分享卡片用统一文案 */
export function setupShare(title: string, imageUrl: string): void {
  if (!isWx) return;
  try {
    wx.showShareMenu?.({ withShareTicket: false });
    wx.onShareAppMessage?.(() => ({ title, imageUrl: imageUrl || undefined }));
  } catch (e) {
    console.warn('[Wx] 分享菜单设置失败', e);
  }
}

/**
 * 主动拉起分享。小游戏没有“分享成功”回调，业界做法是拉起后回到前台就当成功；
 * 这里 resolve(true) 表示已拉起，奖励次数由 GameState 每日上限兜底。非微信环境直接 true。
 */
export function shareAppMessage(title: string, imageUrl: string): Promise<boolean> {
  if (!isWx || typeof wx.shareAppMessage !== 'function') return Promise.resolve(true);
  try {
    wx.shareAppMessage({ title, imageUrl: imageUrl || undefined });
    return new Promise((resolve) => setTimeout(() => resolve(true), 1200));
  } catch (e) {
    console.warn('[Wx] 分享失败', e);
    return Promise.resolve(false);
  }
}

/** 订阅一次性消息（必须在用户点击里调）；resolve 是否订阅成功 */
export function requestSubscribe(tmplId: string): Promise<boolean> {
  if (!isWx || !tmplId || typeof wx.requestSubscribeMessage !== 'function') return Promise.resolve(false);
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: [tmplId],
      success: (res: Record<string, string>) => resolve(res[tmplId] === 'accept'),
      fail: () => resolve(false),
    });
  });
}

// ---------------- 广告 ----------------

/**
 * 激励视频：resolve(true) = 看完可以发奖，resolve(false) = 中途关闭或加载失败。
 * 非微信环境直接 resolve(true)，方便调试。
 * 流量主开通条件：小游戏累计独立访客达标（约 1000 UV），后台申请广告位得到 adUnitId。
 */
let rewardedAd: any = null;

export function showRewardedAd(adUnitId: string): Promise<boolean> {
  if (!isWx || typeof wx.createRewardedVideoAd !== 'function') {
    console.log('[Wx] 非微信环境，模拟广告看完');
    return Promise.resolve(true);
  }
  return new Promise<boolean>((resolve) => {
    if (!rewardedAd) rewardedAd = wx.createRewardedVideoAd({ adUnitId });
    const ad = rewardedAd;
    const onClose = (res: any) => {
      ad.offClose(onClose);
      // 老版本基础库 res 为 undefined，视为看完
      resolve(!res || res.isEnded);
    };
    ad.onClose(onClose);
    ad.show().catch(() => {
      ad
        .load()
        .then(() => ad.show())
        .catch((err: unknown) => {
          console.warn('[Wx] 广告加载失败', err);
          ad.offClose(onClose);
          resolve(false);
        });
    });
  });
}

/** 短震动，合成成功时用 */
/**
 * 顶部要避开的高度（设计像素）：状态栏 / 刘海 / 右上角胶囊按钮的下沿再留 8pt。
 * 不在微信里返回 0，调用方自己取 max(默认值, 这个)。
 */
export function topInset(designW: number): number {
  if (!isWx) return 0;
  try {
    const info = wx.getSystemInfoSync();
    const winW: number = info.windowWidth || info.screenWidth || 0;
    let bottomPt: number = (info.safeArea && info.safeArea.top) || info.statusBarHeight || 0;
    if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
      const r = wx.getMenuButtonBoundingClientRect();
      if (r && r.bottom) bottomPt = Math.max(bottomPt, r.bottom);
    }
    return winW > 0 ? (bottomPt + 8) * (designW / winW) : 0;
  } catch {
    return 0;
  }
}

export function vibrateShort(): void {
  if (isWx && typeof wx.vibrateShort === 'function') {
    try {
      wx.vibrateShort({ type: 'light' });
    } catch {
      /* 部分机型不支持 */
    }
  }
}
