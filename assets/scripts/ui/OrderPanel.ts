import { _decorator, Button, Color, Component, Graphics, Node } from 'cc';
import { Audio } from './Audio';
import { ORDER, itemName } from '../config/GameConfig';
import type { GameState } from '../core/GameState';
import type { Order } from '../core/Orders';
import { Art } from './Art';
import { THEME, addLabel, hex, makeNode, makePanel, makeSprite } from './Theme';

const { ccclass } = _decorator;

/**
 * 订单栏：并排显示几张顾客订单卡。
 * 卡片数量少，每次 change 直接重建，简单可靠；以后订单多了再改成复用。
 */
@ccclass('OrderPanel')
export class OrderPanel extends Component {
  private game!: GameState;
  private w = 0;
  private h = 0;
  private cards: Node[] = [];
  /** 「换」按钮的圆底，冷却结束时每秒刷新一次颜色 */
  private skipDots: Graphics[] = [];
  private skipReady = true;

  init(game: GameState, w: number, h: number): void {
    this.game = game;
    this.w = w;
    this.h = h;
    game.events.on('change', () => this.rebuild());
    this.rebuild();
  }

  /** 第 i 张卡片的中心 x（面板本地坐标），新手引导指箭头用 */
  cardX(i: number): number {
    const gap = 12;
    const cardW = (this.w - gap * (ORDER.slots - 1)) / ORDER.slots;
    return -this.w / 2 + cardW / 2 + i * (cardW + gap);
  }

  rebuild(): void {
    for (const c of this.cards) c.destroy();
    this.cards = [];
    this.skipDots = [];
    this.skipReady = this.game.orders.canSkip(this.game.now());
    const orders = this.game.orders.orders;
    const gap = 12;
    const cardW = (this.w - gap * (ORDER.slots - 1)) / ORDER.slots;
    orders.forEach((order, i) => {
      const card = this.makeCard(order, cardW, this.h, this.cardX(i));
      this.cards.push(card);
    });
  }

  private drawSkipDot(g: Graphics, ready: boolean): void {
    g.clear();
    g.circle(0, 0, 14);
    g.fillColor = hex(ready ? THEME.energy : '#CFC4B8');
    g.fill();
  }

  /** 每秒调一次：冷却结束把「换」点亮，不用整面板重建 */
  refreshSkip(now: number): void {
    const ready = this.game.orders.canSkip(now);
    if (ready === this.skipReady) return;
    this.skipReady = ready;
    for (const g of this.skipDots) if (g.isValid) this.drawSkipDot(g, ready);
  }

  private makeCard(order: Order, w: number, h: number, x: number): Node {
    const board = this.game.board;
    const ready = this.game.orders.canFulfill(order, board);
    const card = makePanel('order', this.node, 'card', w, h, x, 0, ready ? hex(THEME.cardReady) : undefined, {
      fill: hex(ready ? THEME.cardReady : THEME.card),
      stroke: hex(ready ? THEME.cardReadyStroke : THEME.cellStroke),
    });

    // 顾客头像 + 名字
    const avatar = Art.customer(order.customer);
    if (avatar) {
      const av = 44;
      const ring = makeNode('ring', card, av + 6, av + 6, -w / 2 + 12 + av / 2 + 3, h / 2 - 8 - av / 2 - 3);
      const rg = ring.addComponent(Graphics);
      rg.circle(0, 0, av / 2 + 3);
      rg.fillColor = hex('#FFFFFF');
      rg.fill();
      makeSprite('avatar', ring, avatar, av, av);
      addLabel(card, order.customer, {
        size: 18,
        bold: true,
        align: 'left',
        x: -w / 2 + 18 + av + 6 + (w - av - 36) / 2,
        y: h / 2 - 8 - av / 2 - 3,
        color: hex(THEME.text),
        w: w - av - 36,
        h: 26,
      });
    } else {
      addLabel(card, order.customer, { size: 20, bold: true, y: h / 2 - 20, color: hex(THEME.text), w: w - 12, h: 26 });
    }

    // 右上角「换」：三个槽共用冷却
    // 命中区 56×56（真机约 28pt），圆底只画 r=14；太小的话手指偏一点就落到整卡的「交付」上
    const skipBtn = makeNode('skip', card, 56, 56, w / 2 - 24, h / 2 - 24);
    const sg = skipBtn.addComponent(Graphics);
    this.drawSkipDot(sg, this.skipReady);
    this.skipDots.push(sg);
    addLabel(skipBtn, '换', { size: 15, bold: true, color: Color.WHITE });
    const sb = skipBtn.addComponent(Button);
    sb.transition = Button.Transition.SCALE;
    sb.zoomScale = 0.9;
    // 子节点上的 Button 会先接管触摸，卡片本身的「交付」点击不会一起触发
    skipBtn.on(Button.EventType.CLICK, () => {
      Audio.play('click');
      this.game.skipOrder(order.id);
    });

    // 需求列表：物品名 + 棋盘上有没有
    const lineH = 24;
    const startY = h / 2 - (avatar ? 66 : 48);
    order.reqs.forEach((r, i) => {
      const has = board.count(r.chain, r.level) > 0;
      const line = makeNode('req', card, w - 16, lineH, 0, startY - i * lineH);
      // 小图标 + 名字
      const icon = Art.item(r.chain, r.level);
      const iconW = icon ? 24 : 0;
      if (icon) makeSprite('icon', line, icon, 24, 24, -w / 2 + 12 + 12);
      addLabel(line, `${itemName(r.chain, r.level)} ×1`, {
        size: 18,
        align: 'left',
        x: -w / 2 + 12 + iconW + 4 + (w - 40 - iconW) / 2,
        w: w - 40 - iconW,
        h: lineH,
        color: hex(has ? THEME.text : THEME.textLight),
      });
      addLabel(line, has ? '✓' : '·', { size: 18, bold: true, x: w / 2 - 16, color: hex(has ? THEME.cardReadyStroke : THEME.textLight) });
    });

    addLabel(card, `+${order.coins} 金币  +${order.xp} 经验`, {
      size: 14,
      y: -h / 2 + 40,
      color: hex(THEME.textLight),
      w: w - 8,
      h: 18,
    });

    // 交付按钮：整张卡可点，凑齐时高亮
    const btnH = 30;
    const btnColor = hex(ready ? THEME.accent : '#CFC4B8');
    const btn = makePanel('deliver', card, 'button', w - 20, btnH, 0, -h / 2 + 18, btnColor, { fill: btnColor, radius: 12 });
    addLabel(btn, ready ? '交付' : '未凑齐', { size: 16, bold: true, color: Color.WHITE, outline: hex('#000000', 60) });

    const b = card.addComponent(Button);
    b.transition = Button.Transition.SCALE;
    b.zoomScale = 0.96;
    card.on(Button.EventType.CLICK, () => this.game.deliver(order.id));
    return card;
  }
}
