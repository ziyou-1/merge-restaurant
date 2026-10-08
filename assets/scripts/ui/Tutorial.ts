import { _decorator, Component, Node, Tween, UITransform, Vec3, tween } from 'cc';
import type { GameState } from '../core/GameState';
import type { BoardView } from './BoardView';
import type { OrderPanel } from './OrderPanel';
import { THEME, addLabel, hex, makeIcon, makeNode, makePanel } from './Theme';

const { ccclass } = _decorator;

/** 引导做完的步骤号 */
export const TUTORIAL_DONE = 4;

export interface TutorialTargets {
  boardView: BoardView;
  boardNode: Node;
  ordersNode: Node;
  orderPanel: OrderPanel;
  restaurantBtn: Node;
}

/**
 * 新手引导：一个跳动的箭头 + 一句话，跟着玩家的第一次操作走。
 *   0 点生成器 → 1 合成一次 → 2 交一单 → 3 打开餐厅 → 4 完成
 * 进度存在 GameState.tutorialStep；老存档直接视为完成。
 */
@ccclass('Tutorial')
export class Tutorial extends Component {
  private game!: GameState;
  private t!: TutorialTargets;
  private arrow!: Node;
  private hint!: Node;
  private hintLabel!: { string: string };
  /** 上次摆箭头的位置，目标没变就不重启动画（不然连点生成器时箭头一直被拉回起点） */
  private lastKey = '';

  init(game: GameState, targets: TutorialTargets): void {
    this.game = game;
    this.t = targets;

    this.hint = makePanel('hint', this.node, 'paper', 520, 64, 0, 0, undefined, { fill: hex('#FFFDF9'), stroke: hex(THEME.accent), radius: 16 });
    this.hintLabel = addLabel(this.hint, '', { size: 20, bold: true, color: hex(THEME.text), w: 490, h: 60 });
    this.arrow = makeIcon('arrow', this.node, 56) ?? makeNode('arrow', this.node, 56, 56);
    this.arrow.angle = -90; // 图标朝右，转成朝下

    game.events.on('spawn', () => this.advanceIf(0));
    game.events.on('merge', () => this.advanceIf(1));
    game.events.on('delivered', () => this.advanceIf(2));
    game.events.on('taskDone', () => this.advanceIf(3));
    game.events.on('change', () => this.refresh());
    this.refresh();
  }

  /** 玩家打开了餐厅页 → 第 3 步完成 */
  onRestaurantOpened(): void {
    this.advanceIf(3);
  }

  private advanceIf(step: number): void {
    if (this.game.tutorialStep === step) this.game.setTutorialStep(step + 1);
  }

  /** 按当前步骤摆箭头和提示；没东西可指就先藏起来 */
  refresh(): void {
    const step = this.game.tutorialStep;
    if (step >= TUTORIAL_DONE) {
      this.node.active = false;
      return;
    }
    this.node.active = true;
    const b = this.game.board;
    const bv = this.t.boardView;
    const boardPos = this.t.boardNode.position;
    const cellWorld = (idx: number) => {
      const p = bv.cellPos(idx);
      return new Vec3(boardPos.x + p.x, boardPos.y + p.y, 0);
    };

    // 棋盘外框：提示框固定放在棋盘的某一行上（引导期间上下两行基本是空的）
    const bt = this.t.boardNode.getComponent(UITransform);
    const boardH = bt ? bt.height : 0;
    const cell = bv.cellPos(1).x - bv.cellPos(0).x;
    const rowY = (r: number) => boardPos.y + boardH / 2 - 10 - cell / 2 - r * cell;
    const lastRow = Math.round((boardH - 20) / cell) - 1;

    let target: Vec3 | null = null;
    let text = '';
    let arrowUp = false; // 箭头默认在目标上方朝下；指订单卡时放在下方朝上
    let hintY = rowY(0);
    if (step === 0) {
      const gen = b.entries().find((e) => e.item.kind === 'generator');
      if (gen) target = cellWorld(gen.idx);
      text = '点一下生成器，做出食材';
    } else if (step === 1) {
      // 找一对能合的
      const seen = new Map<string, number>();
      let pairIdx = -1;
      for (const { idx, item } of b.entries()) {
        if (item.kind !== 'item') continue;
        const k = item.chain + ':' + item.level;
        if (seen.has(k)) {
          pairIdx = idx;
          break;
        }
        seen.set(k, idx);
      }
      if (pairIdx >= 0) {
        target = cellWorld(pairIdx);
        text = '把两个一样的拖到一起，就能合成更好的';
      } else {
        const gen = b.entries().find((e) => e.item.kind === 'generator');
        if (gen) target = cellWorld(gen.idx);
        text = '再点几下生成器，凑出两个一样的';
      }
    } else if (step === 2) {
      // 有能交的就指那张卡的「交付」，否则指中间那张
      const o = this.t.ordersNode.position;
      const ot = this.t.ordersNode.getComponent(UITransform);
      const oh = ot ? ot.height : 190;
      const orders = this.game.orders.orders;
      let i = orders.findIndex((od) => this.game.orders.canFulfill(od, b));
      if (i < 0) i = Math.floor(orders.length / 2);
      target = new Vec3(o.x + this.t.orderPanel.cardX(i), o.y - oh / 2 + 24, 0);
      arrowUp = true;
      hintY = rowY(1);
      text = '凑齐顾客要的菜，点「交付」赚金币';
    } else if (step === 3) {
      const r = this.t.restaurantBtn;
      const bar = r.parent!;
      const page = bar.parent!;
      target = new Vec3(page.position.x + bar.position.x + r.position.x, page.position.y + bar.position.y + r.position.y + 30, 0);
      hintY = rowY(lastRow - 1); // 最后一行会被箭头挡住
      text = '去餐厅看看，金币攒够就能装修';
    }

    if (!target) {
      this.arrow.active = false;
      this.hint.active = false;
      this.lastKey = '';
      return;
    }
    this.arrow.active = true;
    this.hint.active = true;
    this.hint.setPosition(0, hintY, 0);
    this.hintLabel.string = text;
    const key = `${step}:${Math.round(target.x)}:${Math.round(target.y)}:${arrowUp}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    Tween.stopAllByTarget(this.arrow);
    const dir = arrowUp ? -1 : 1;
    this.arrow.angle = arrowUp ? 90 : -90;
    this.arrow.setPosition(target.x, target.y + 70 * dir, 0);
    tween(this.arrow)
      .by(0.4, { position: new Vec3(0, -12 * dir, 0) }, { easing: 'sineInOut' })
      .by(0.4, { position: new Vec3(0, 12 * dir, 0) }, { easing: 'sineInOut' })
      .union()
      .repeatForever()
      .start();
  }
}
