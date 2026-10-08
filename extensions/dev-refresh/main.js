'use strict';
// 本地开发辅助：在编辑器主进程里起一个只监听本机的 HTTP 服务，让外部工具（脚本 / AI）能：
//   GET /ping                 探活
//   GET /refresh              相当于资源管理器点刷新（重新导入 + 编译脚本）
//   GET /open-scene?uuid=...  在编辑器里打开场景（预览默认跑“当前打开的场景”）
//   GET /start-scene?uuid=... 把预览起始场景固定成某个场景
// 构建产物不包含 extensions/ 目录，不影响发布。
const http = require('http');
const { URL } = require('url');

let server = null;

exports.methods = {};

exports.load = function () {
  server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    const url = new URL(req.url, 'http://127.0.0.1');
    const uuid = url.searchParams.get('uuid');
    try {
      switch (url.pathname) {
        case '/ping':
          res.end('pong');
          break;
        case '/refresh':
          await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets');
          res.end('refreshed');
          break;
        case '/open-scene':
          if (!uuid) throw new Error('uuid required');
          await Editor.Message.request('scene', 'open-scene', uuid);
          res.end('opened ' + uuid);
          break;
        case '/start-scene':
          if (!uuid) throw new Error('uuid required');
          await Editor.Profile.setConfig('preview', 'general.start_scene', uuid, 'local');
          res.end('start scene = ' + uuid);
          break;
        default:
          res.statusCode = 404;
          res.end('dev-refresh: /ping | /refresh | /open-scene?uuid= | /start-scene?uuid=');
      }
    } catch (e) {
      res.statusCode = 500;
      res.end(String(e && e.stack ? e.stack : e));
    }
  });
  server.on('error', (e) => console.warn('[dev-refresh] server error', e));
  server.listen(7457, '127.0.0.1', () => console.log('[dev-refresh] listening on http://127.0.0.1:7457'));
};

exports.unload = function () {
  if (server) {
    server.close();
    server = null;
  }
};
