/**
 * 云端存档：本地存档永远是主，这里只负责“把本地那份推上去”和“开局拉一份下来比新旧”。
 * 云函数 saveGame / loadGame 按 OPENID 存取，玩家换手机登录同一微信就能接着玩。
 * 没有云开发（预览、没配环境）时所有方法都是空操作。
 */
import type { GameJSON } from '../core/GameState';
import { cloudCall, hasCloud, isClockSynced } from './Wx';

const PUSH_DEBOUNCE_MS = 15_000;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pending: GameJSON | null = null;
let pushing = false;

/** 拉云端存档；没有 / 失败返回 null */
export async function pullCloudSave(): Promise<GameJSON | null> {
  if (!hasCloud()) return null;
  try {
    const res = await cloudCall<{ save: GameJSON | null }>('loadGame', {}, 4000);
    return res && res.save && typeof res.save === 'object' && res.save.v === 1 ? res.save : null;
  } catch (e) {
    console.warn('[CloudSave] 拉取失败', e);
    return null;
  }
}

/** 排队推送（15 秒合并一次），频繁存档也不会刷爆云函数调用量 */
export function pushCloudSave(save: GameJSON): void {
  if (!hasCloud()) return;
  pending = save;
  // 没校过时的设备 savedAt 不可信，先攒着，校时成功后 GameManager 会 flush
  if (!isClockSynced()) return;
  if (pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void flushCloudSave();
  }, PUSH_DEBOUNCE_MS);
}

/** 立刻推送（切后台时调），有排队的就推排队的那份 */
export async function flushCloudSave(save?: GameJSON): Promise<void> {
  if (!hasCloud()) return;
  if (save) pending = save;
  if (!pending || pushing || !isClockSynced()) return;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  const data = pending;
  pending = null;
  pushing = true;
  try {
    await cloudCall('saveGame', { save: data }, 5000);
  } catch (e) {
    console.warn('[CloudSave] 推送失败，下次再试', e);
    // 失败保留，等下次 push/flush
    if (!pending) pending = data;
  } finally {
    pushing = false;
  }
  // 推送期间又来了一份新的（比如切后台那份）→ 立刻接着推；失败时 catch 把 data 放回了 pending，这里不会死循环
  if (pending && pending !== data) void flushCloudSave();
}

/** 清档：取消排队的推送，并让云端把这个 openid 的存档删掉 */
export async function clearCloudSave(): Promise<void> {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  pending = null;
  if (!hasCloud()) return;
  try {
    await cloudCall('saveGame', { save: null }, 5000);
  } catch (e) {
    console.warn('[CloudSave] 清云存档失败', e);
  }
}

/** 两份存档挑新的：savedAt 大的赢；只有一份就用那份 */
export function newerSave(local: GameJSON | null, cloud: GameJSON | null): GameJSON | null {
  if (!local) return cloud;
  if (!cloud) return local;
  return (cloud.savedAt ?? 0) > (local.savedAt ?? 0) ? cloud : local;
}
