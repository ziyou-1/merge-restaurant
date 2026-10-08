// 让 Node 直接跑 assets/scripts 下的 .ts：补全无扩展名的相对 import
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z]+$/i.test(specifier)) {
    const candidate = new URL(specifier + '.ts', context.parentURL);
    if (existsSync(fileURLToPath(candidate))) return next(specifier + '.ts', context);
  }
  return next(specifier, context);
}
