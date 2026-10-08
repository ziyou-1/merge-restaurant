import { JsonAsset, Rect, Size, SpriteFrame, Texture2D, Vec2, resources } from 'cc';
import { AREA_MAP } from '../config/Decor';

/**
 * 美术资源：雪碧图 + atlas.json（每格的矩形），运行时切成 SpriteFrame。
 * 资源在 assets/resources/art/，由 scratchpad/pack_art.py 生成。
 * 图片按编辑器默认的 texture 类型导入即可（路径 art/xxx/texture），不需要手动改成 sprite-frame。
 * 加载失败时 get() 返回 null，各视图退回色块占位画法，所以缺图不会崩。
 */
interface AtlasJSON {
  sheets: Record<string, { w: number; h: number; frames: Record<string, [number, number, number, number]> }>;
}

function loadRes<T>(path: string, type: new (...args: any[]) => T): Promise<T> {
  return new Promise((resolve, reject) => {
    (resources.load as (p: string, t: unknown, cb: (err: Error | null, asset: T) => void) => void)(path, type, (err, asset) =>
      err ? reject(err) : resolve(asset),
    );
  });
}

class ArtStore {
  private frames = new Map<string, SpriteFrame>();
  ready = false;

  async load(): Promise<void> {
    const atlasAsset = await loadRes('art/atlas', JsonAsset);
    const atlas = atlasAsset.json as AtlasJSON;
    const names = Object.keys(atlas.sheets);
    const sheets = await Promise.all(names.map((n) => loadRes('art/' + n + '/texture', Texture2D)));
    names.forEach((name, i) => {
      const base = sheets[i];
      const info = atlas.sheets[name];
      for (const key of Object.keys(info.frames)) {
        const [x, y, w, h] = info.frames[key];
        const sf = new SpriteFrame();
        sf.texture = base;
        sf.rect = new Rect(x, y, w, h);
        sf.originalSize = new Size(w, h);
        sf.offset = new Vec2(0, 0);
        sf.packable = false;
        if (name === 'ui_panels') {
          // 面板类走九宫格：四边各留 30% 不拉伸，中间平铺
          sf.insetLeft = sf.insetRight = Math.round(w * 0.3);
          sf.insetTop = sf.insetBottom = Math.round(h * 0.3);
        }
        this.frames.set(name + '/' + key, sf);
      }
    });
    this.ready = true;
  }

  get(key: string): SpriteFrame | null {
    return this.frames.get(key) ?? null;
  }

  item(chain: string, level: number): SpriteFrame | null {
    return this.get('items_' + chain + '/' + level);
  }

  generator(chain: string): SpriteFrame | null {
    return this.get('items_' + chain + '/gen');
  }

  /** 区域按装修等级取对应状态图；等级超过图的数量时用最后一张 */
  area(areaId: string, level: number): SpriteFrame | null {
    const max = AREA_MAP[areaId]?.tasks.length ?? 0;
    return this.get('area_' + areaId + '/' + Math.min(level, max));
  }

  /** 剧情立绘；顾客当说话人时退回头像 */
  story(speaker: string): SpriteFrame | null {
    return this.get('chars_story/' + speaker) ?? this.get('chars_customers/' + speaker);
  }

  customer(name: string): SpriteFrame | null {
    return this.get('chars_customers/' + name);
  }

  /** 九宫格面板：panel / card / tray / slot / button / paper */
  ui(kind: string): SpriteFrame | null {
    return this.get('ui_panels/' + kind);
  }

  /** 小图标：coin / energy / star / lock / check / tools / heart / arrow */
  icon(name: string): SpriteFrame | null {
    return this.get('ui_icons/' + name);
  }

  background(): SpriteFrame | null {
    return this.get('bg_wallpaper/bg');
  }
}

export const Art = new ArtStore();
