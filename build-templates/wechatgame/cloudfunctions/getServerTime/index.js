// 云函数：返回服务端时间(ms)。客户端拿它校正本机时钟，防止改手机时间刷体力。
exports.main = async () => ({ now: Date.now() });
