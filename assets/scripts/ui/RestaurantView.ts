import { _decorator, Button, Color, Component, Graphics, Node, Sprite } from 'cc';
import { CHAPTERS, areasOfChapter } from '../config/Decor';
import type { DecorArea } from '../config/Decor';
import type { GameState } from '../core/GameState';
import { Art } from './Art';
import { THEME, addLabel, drawRoundRect, fitSprite, hex, makeIcon, makeNode, makePanel } from './Theme';

const { ccclass } = _decorator;

const COLS = 3;
const GAP = 12;
const TAB_H = 44;

/**
 * 餐厅全景：顶部章节页签，下面 3×2 网格 = 本章 5 个区域 + 1 格章节信息。
 * 每格显示该区域当前装修等级对应的立体小场景图；没图时退回色块。
 */
@ccclass('RestaurantView')
export class RestaurantView extends Component {
  private game!: GameState;
  private w = 0;
  private h = 0;
  private blocks: Node[] = [];
  /** 当前显示的章节 */
  chapter = 1;
  /** 切换章节时通知外面（任务列表要跟着换） */
  onChapterChange: (chapter: number) => void = () => {};

  init(game: GameState, w: number, h: number): void {
    this.game = game;
    this.w = w;
    this.h = h;
    this.chapter = game.decor.latestChapter();
    makePanel('bg', this.node, 'panel', w, h, 0, 0, undefined, { fill: hex('#FBF1E6'), stroke: hex(THEME.cellStroke), radius: 22 });
    game.events.on('change', () => this.onChange());
    this.rebuild();
  }

  private onChange(): void {
    // 本章做完、后面的章节刚开放 → 自动翻页
    const d = this.game.decor;
    const latest = d.latestChapter();
    if (latest > this.chapter && d.isChapterFinished(this.chapter)) this.setChapter(latest);
    else this.rebuild();
  }

  setChapter(chapter: number): void {
    if (!this.game.decor.isChapterUnlocked(chapter)) {
      this.game.events.emit('toast', '先把上一章做完，这一章才会开放');
      return;
    }
    const changed = chapter !== this.chapter;
    this.chapter = chapter;
    this.rebuild();
    if (changed) this.onChapterChange(chapter);
  }

  rebuild(): void {
    for (const b of this.blocks) b.destroy();
    this.blocks = [];

    this.blocks.push(this.makeTabs());

    const inner = 10;
    const top = this.h / 2 - inner - TAB_H - 8;
    const bw = (this.w - inner * 2 - GAP * (COLS - 1)) / COLS;
    const bh = (top + this.h / 2 - inner - GAP) / 2;
    const cellAt = (i: number) => {
      const cx = i % COLS;
      const cy = Math.floor(i / COLS);
      return {
        x: -this.w / 2 + inner + bw / 2 + cx * (bw + GAP),
        y: top - bh / 2 - cy * (bh + GAP),
      };
    };

    const areas = areasOfChapter(this.chapter);
    areas.forEach((area, i) => {
      const p = cellAt(i);
      this.blocks.push(this.makeBlock(area, bw, bh, p.x, p.y));
    });
    const p = cellAt(areas.length);
    this.blocks.push(this.makeInfoTile(bw, bh, p.x, p.y));
  }

  /** 章节页签：选中的橙色，没开放的灰色带锁 */
  private makeTabs(): Node {
    const d = this.game.decor;
    const row = makeNode('tabs', this.node, this.w - 20, TAB_H, 0, this.h / 2 - 10 - TAB_H / 2);
    const tabW = Math.min(220, (this.w - 20 - GAP * (CHAPTERS.length - 1)) / CHAPTERS.length);
    const totalW = tabW * CHAPTERS.length + GAP * (CHAPTERS.length - 1);
    CHAPTERS.forEach((c, i) => {
      const unlocked = d.isChapterUnlocked(c.id);
      const selected = c.id === this.chapter;
      const color = selected ? THEME.accent : unlocked ? '#D9C3AE' : '#BDB3A8';
      const x = -totalW / 2 + tabW / 2 + i * (tabW + GAP);
      const tab = makePanel('tab-' + c.id, row, 'button', tabW, TAB_H - 6, x, 0, hex(color), { fill: hex(color), radius: 14 });
      const lockIcon = unlocked ? null : makeIcon('lock', tab, 22, -tabW / 2 + 22, 0);
      addLabel(tab, `第${c.id}章 · ${c.name}`, {
        size: 17,
        bold: true,
        color: selected || !unlocked ? Color.WHITE : hex(THEME.text),
        outline: selected ? hex('#000000', 60) : undefined,
        x: lockIcon ? 10 : 0,
        w: tabW - (lockIcon ? 40 : 10),
        h: TAB_H - 6,
      });
      const btn = tab.addComponent(Button);
      btn.transition = Button.Transition.SCALE;
      btn.zoomScale = 0.95;
      tab.on(Button.EventType.CLICK, () => this.setChapter(c.id));
    });
    return row;
  }

  private makeBlock(area: DecorArea, w: number, h: number, x: number, y: number): Node {
    const d = this.game.decor;
    const level = d.areaLevel(area.id);
    const max = area.tasks.length;
    const unlocked = d.isAreaUnlocked(area);
    const finished = level >= max;

    const stroke = finished ? hex('#F2C14E') : unlocked ? hex('#FFFFFF', 230) : hex('#B9AEA2');
    const n = makePanel('area-' + area.id, this.node, 'card', w, h, x, y, unlocked ? undefined : hex('#E9E2DA'), {
      fill: unlocked ? hex('#FFF9F2') : hex('#E9E2DA'),
      stroke,
      lineWidth: finished ? 5 : 3,
    });

    const frame = Art.area(area.id, level);
    if (frame) {
      const icon = makeNode('icon', n, w - 16, h - 44, 0, 12);
      const sp = icon.addComponent(Sprite);
      sp.sizeMode = Sprite.SizeMode.CUSTOM;
      sp.trim = false;
      sp.spriteFrame = frame;
      // 未开放的区域压暗
      sp.color = unlocked ? Color.WHITE : new Color(110, 110, 110, 255);
      fitSprite(icon, frame, w - 16, h - 44);
      if (!unlocked) makeIcon('lock', n, 48, 0, 12);
      if (finished) makeIcon('check', n, 40, w / 2 - 26, h / 2 - 26);
    } else {
      // 无图占位：等级越高颜色越接近区域本色
      const t = max > 0 ? level / max : 1;
      const fill = mix(hex('#CFC6BC'), hex(area.color), unlocked ? 0.25 + 0.75 * t : 0.1);
      // 卡片节点已有渲染组件，色块放子节点
      const g = makeNode('lvl', n, w - 24, h - 48, 0, 12).addComponent(Graphics);
      drawRoundRect(g, w - 24, h - 48, 12, fill);
    }

    // 底部名牌 + 星星
    const pill = makeNode('pill', n, w - 20, 30, 0, -h / 2 + 22);
    const pg = pill.addComponent(Graphics);
    drawRoundRect(pg, w - 20, 30, 12, unlocked ? hex(area.color) : hex('#B9AEA2'));
    const stars = '★'.repeat(level) + '☆'.repeat(Math.max(0, max - level));
    addLabel(pill, unlocked ? `${area.name}  ${stars}` : `${area.name}  未开放`, {
      size: 15,
      bold: true,
      color: Color.WHITE,
      outline: hex('#000000', 70),
      w: w - 26,
      h: 30,
    });
    return n;
  }

  private makeInfoTile(w: number, h: number, x: number, y: number): Node {
    const d = this.game.decor;
    const c = CHAPTERS.find((ch) => ch.id === this.chapter) ?? CHAPTERS[0];
    const p = d.chapterProgress(this.chapter);
    const finished = d.isChapterFinished(this.chapter);
    const n = makePanel('info', this.node, 'paper', w, h, x, y, undefined, { fill: hex('#F6E7D8'), stroke: hex(THEME.cellStroke) });
    makeIcon(finished ? 'check' : 'heart', n, 30, 0, 74);
    addLabel(n, c.name, { size: 22, bold: true, color: hex(THEME.text), y: 40 });
    addLabel(n, `第${c.id}章 · 装修进度`, { size: 14, color: hex(THEME.textLight), y: 10 });
    addLabel(n, `${p.done} / ${p.total}`, { size: 34, bold: true, color: hex(THEME.accentDark), y: -22 });
    addLabel(n, finished ? '本章完成！' : c.slogan, { size: 13, color: hex(THEME.textLight), y: -58, w: w - 16, h: 36 });
    return n;
  }
}

function mix(a: Color, b: Color, t: number): Color {
  const c = new Color();
  c.r = Math.round(a.r + (b.r - a.r) * t);
  c.g = Math.round(a.g + (b.g - a.g) * t);
  c.b = Math.round(a.b + (b.b - a.b) * t);
  c.a = 255;
  return c;
}
