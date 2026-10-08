import { _decorator, Button, Color, Component, Graphics, Node } from 'cc';
import { itemName } from '../config/GameConfig';
import type { TaskRef } from '../config/Decor';
import type { GameState } from '../core/GameState';
import { Art } from './Art';
import { THEME, addLabel, drawRoundRect, hex, makeIcon, makeNode, makePanel } from './Theme';

const { ccclass } = _decorator;

/** 最多同时展示几个任务卡 */
const MAX_CARDS = 3;
const CARD_GAP = 12;

/**
 * 装修任务列表：每个已开放区域的下一个任务一张卡。
 * 卡片少，每次 change 直接重建。
 */
@ccclass('TaskPanel')
export class TaskPanel extends Component {
  private game!: GameState;
  private w = 0;
  private h = 0;
  private cards: Node[] = [];
  /** 只显示这一章的任务，由餐厅页的章节切换驱动 */
  private chapter = 1;
  /** 点「去凑齐」时回调，GameManager 用来切回棋盘页 */
  onGoBoard: () => void = () => {};

  init(game: GameState, w: number, h: number): void {
    this.game = game;
    this.w = w;
    this.h = h;
    game.events.on('change', () => this.rebuild());
    this.rebuild();
  }

  setChapter(chapter: number): void {
    if (this.chapter === chapter) return;
    this.chapter = chapter;
    this.rebuild();
  }

  rebuild(): void {
    for (const c of this.cards) c.destroy();
    this.cards = [];
    const d = this.game.decor;
    const tasks = d.currentTasks(this.chapter).slice(0, MAX_CARDS);
    if (tasks.length === 0) {
      const n = makeNode('empty', this.node, this.w, 80, 0, this.h / 2 - 60);
      const text = d.isChapterFinished(this.chapter)
        ? '本章装修全部完成！'
        : d.isChapterUnlocked(this.chapter)
          ? '暂时没有可做的任务'
          : '先把上一章做完，这一章才会开放';
      addLabel(n, text, { size: 22, bold: true, color: hex(THEME.textLight) });
      this.cards.push(n);
      return;
    }
    const cardH = (this.h - CARD_GAP * (MAX_CARDS - 1)) / MAX_CARDS;
    tasks.forEach((ref, i) => {
      const y = this.h / 2 - cardH / 2 - i * (cardH + CARD_GAP);
      this.cards.push(this.makeCard(ref, this.w, cardH, y));
    });
  }

  private makeCard(ref: TaskRef, w: number, h: number, y: number): Node {
    const { area, task, index } = ref;
    const game = this.game;
    const check = game.decor.check(task, game.player.coins, game.board);

    const card = makePanel('task', this.node, 'card', w, h, 0, y, check.ok ? hex(THEME.cardReady) : undefined, {
      fill: hex(check.ok ? THEME.cardReady : THEME.card),
      stroke: hex(check.ok ? THEME.cardReadyStroke : THEME.cellStroke),
    });

    // 左侧色条标区域 + 小锤子（一个节点只能有一个渲染组件，色条放子节点）
    const g = makeNode('bar', card).addComponent(Graphics);
    g.roundRect(-w / 2 + 10, -h / 2 + 14, 8, h - 28, 4);
    g.fillColor = hex(area.color);
    g.fill();
    makeIcon('tools', card, 28, -w / 2 + 40, h / 2 - 26);
    const titleShift = Art.icon('tools') ? 30 : 0;

    const textLeft = -w / 2 + 30;
    const textW = w - 30 - 190;
    addLabel(card, `${area.name} · ${task.name}`, {
      size: 24,
      bold: true,
      align: 'left',
      x: textLeft + titleShift + (textW - titleShift) / 2,
      y: h / 2 - 26,
      w: textW - titleShift,
      h: 30,
      color: hex(THEME.text),
    });
    addLabel(card, `第 ${index + 1}/${area.tasks.length} 步 · 奖励 ${task.xp} 经验`, {
      size: 14,
      align: 'left',
      x: textLeft + textW / 2,
      y: h / 2 - 50,
      w: textW,
      h: 18,
      color: hex(THEME.textLight),
    });

    // 花费行：金币 + 要交的菜
    const parts: { text: string; ok: boolean }[] = [];
    parts.push({ text: `金币 ${task.coins}`, ok: check.coinsOk });
    for (const r of task.items) {
      const have = game.board.count(r.chain, r.level);
      parts.push({ text: `${itemName(r.chain, r.level)} ×${r.count}（有${have}）`, ok: have >= r.count });
    }
    const lineY = -h / 2 + 26;
    let cx = textLeft;
    for (const p of parts) {
      const pw = Math.min(textW, p.text.length * 15 + 16);
      const chip = makeNode('chip', card, pw, 26, cx + pw / 2, lineY);
      const cg = chip.addComponent(Graphics);
      drawRoundRect(cg, pw, 26, 8, hex(p.ok ? '#DFF5E1' : '#F8E3E0'));
      addLabel(chip, p.text, { size: 14, w: pw - 6, h: 26, color: hex(p.ok ? '#2E7D32' : THEME.danger) });
      cx += pw + 8;
      if (cx > textLeft + textW) break;
    }

    // 右侧按钮
    const btnW = 160;
    const btnH = 56;
    const btnColor = hex(check.ok ? THEME.accent : check.itemsOk ? '#CFC4B8' : THEME.energy);
    const btn = makePanel('btn', card, 'button', btnW, btnH, w / 2 - 20 - btnW / 2, 0, btnColor, { fill: btnColor });
    addLabel(btn, check.ok ? '完成装修' : check.itemsOk ? '金币不够' : '去凑菜', {
      size: 22,
      bold: true,
      color: Color.WHITE,
      outline: hex('#000000', 60),
      w: btnW - 10,
      h: btnH,
    });
    const b = btn.addComponent(Button);
    b.transition = Button.Transition.SCALE;
    b.zoomScale = 0.94;
    btn.on(Button.EventType.CLICK, () => {
      if (check.ok) game.completeTask(task.id);
      else if (!check.itemsOk) this.onGoBoard();
      else game.events.emit('toast', `还差 ${task.coins - game.player.coins} 金币，多交几单订单吧`);
    });
    return card;
  }
}
