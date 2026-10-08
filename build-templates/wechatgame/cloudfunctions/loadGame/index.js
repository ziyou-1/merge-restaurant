// 云函数：按 OPENID 取存档，没有返回 null。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { save: null };
  try {
    const res = await db.collection('saves').doc(OPENID).get();
    return { save: (res.data && res.data.save) || null };
  } catch (e) {
    // 文档不存在会抛错，当作没存档
    return { save: null };
  }
};
