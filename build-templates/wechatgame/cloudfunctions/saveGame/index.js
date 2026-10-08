// 云函数：按 OPENID 存整份存档。集合 saves 需在云开发控制台先建好（权限选“仅创建者可读写”或直接用云函数管理员权限）。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, reason: 'no openid' };
  const save = event && event.save;
  // save === null 表示清档
  if (save === null) {
    await db.collection('saves').doc(OPENID).remove().catch(() => {});
    return { ok: true };
  }
  if (!save || typeof save !== 'object' || save.v !== 1) return { ok: false, reason: 'bad save' };
  // savedAt 以服务端为准，客户端时间不可信；再盖一个 updatedAt 方便排查
  save.savedAt = Date.now();
  await db.collection('saves').doc(OPENID).set({ data: { save, updatedAt: db.serverDate() } });
  return { ok: true };
};
