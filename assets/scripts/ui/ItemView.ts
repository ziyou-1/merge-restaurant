import { _decorator, Color, Component, Graphics, Label, Node, Sprite, UITransform } from 'cc';
import { CHAIN_MAP, GENERATOR, MAX_LEVEL, itemName } from '../config/GameConfig';
import type { Board, BoardItem } from '../core/Board';
import { Art } from './Art';
import { THEME, addLabel, darken, drawRoundRect, fitSprite, hex, makeNode } from './Theme';

const { ccclass } = _decorator;

/**
 * 棋盘上一个物品 / 生成器的显示。
 * 有美术资源时：底板 + 图标 + 小名字 + 等级角标；没有时退回纯色块 + 文字。
 */
@ccclass('ItemView')
export class ItemView extends Component {
  item!: BoardItem;
  size = 88;

  private bg!: Graphics;
  private icon: Node | null = null;
  private nameLabel!: Label;
  private subLabel!: Label;
  private badgeLabel: Label | null = null;
  private selected = false;

  setup(item: BoardItem, size: number): void {
    this.item = item;
    this.size = size;
    this.node.getComponent(UITransform)!.setContentSize(size, size);
    this.bg = this.node.addComponent(Graphics);

    const isGen = item.kind === 'generator';
    const frame = isGen ? Art.generator(item.chain) : Art.item(item.chain, item.level);
    if (frame) {
      const pad = isGen ? 8 : 4;
      this.icon = makeNode('icon', this.node, size - pad * 2, size - pad * 2, 0, isGen ? 6 : 6);
      const sp = this.icon.addComponent(Sprite);
      sp.sizeMode = Sprite.SizeMode.CUSTOM;
      sp.trim = false;
      sp.spriteFrame = frame;
      fitSprite(this.icon, frame, size - pad * 2, size - pad * 2 - (isGen ? 14 : 10));
    }

    // 有图时名字缩到底部一行；没图时名字居中当主体
    this.nameLabel = addLabel(this.node, '', {
      size: frame ? 13 : isGen ? 20 : 22,
      bold: true,
      color: Color.WHITE,
      outline: hex('#000000', frame ? 160 : 110),
      w: size - 6,
      h: frame ? 18 : isGen ? 54 : 44,
      y: frame ? -size / 2 + 12 : isGen ? 12 : 4,
    });
    this.subLabel = addLabel(this.node, '', {
      size: frame ? 13 : 16,
      bold: !!frame,
      color: Color.WHITE,
      outline: hex('#000000', 150),
      w: size - 8,
      h: 20,
      y: frame ? size / 2 - 12 : isGen ? -26 : -28,
    });

    if (!isGen) {
      // 右上角等级角标
      const badge = makeNode('badge', this.node, 26, 20, size / 2 - 15, size / 2 - 12);
      const bg = badge.addComponent(Graphics);
      drawRoundRect(bg, 26, 20, 7, hex('#000000', 140));
      this.badgeLabel = addLabel(badge, '', { size: 13, bold: true, color: Color.WHITE });
    }
    this.redraw();
  }

  /** 每秒刷新一次生成器的恢复倒计时 */
  refresh(board: Board, now: number): void {
    if (this.item.kind !== 'generator') return;
    const charges = this.item.charges ?? 0;
    const wait = board.generatorRechargeIn(this.item, now);
    this.subLabel.string = charges > 0 ? `${charges}/${GENERATOR.maxCharges}` : `恢复 ${wait}s`;
  }

  setSelected(v: boolean): void {
    if (this.selected === v) return;
    this.selected = v;
    this.redraw();
  }

  private redraw(): void {
    const def = CHAIN_MAP[this.item.chain];
    const base = def ? def.color : '#999999';
    const s = this.size;
    const hasIcon = !!this.icon;
    if (this.item.kind === 'generator') {
      // 有图：深色底板让机器突出；无图：整块深色 + 文字
      drawRoundRect(this.bg, s, s, 18, hasIcon ? hex('#5B4636', 200) : darken(base), this.selected ? Color.WHITE : hex('#FFFFFF', 160), 4);
      this.nameLabel.string = hasIcon ? '生成器' : `${def ? def.name : this.item.chain}\n生成器`;
      this.subLabel.string = `${this.item.charges ?? 0}/${GENERATOR.maxCharges}`;
      return;
    }
    const stroke = this.selected ? hex(THEME.accentDark) : hex('#FFFFFF', 200);
    drawRoundRect(this.bg, s, s, 18, hasIcon ? hex('#FFFFFF', 150) : hex(base), stroke, this.selected ? 5 : 3);
    this.nameLabel.string = itemName(this.item.chain, this.item.level);
    this.subLabel.string = this.item.level >= MAX_LEVEL ? (hasIcon ? '' : '满级') : '';
    if (this.badgeLabel) this.badgeLabel.string = `${this.item.level}`;
  }
}
