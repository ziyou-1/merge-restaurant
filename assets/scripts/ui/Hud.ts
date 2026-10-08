import { _decorator, Color, Component, Graphics, Label, Node, Tween, tween } from 'cc';
import type { GameState } from '../core/GameState';
import { Audio } from './Audio';
import { THEME, addLabel, hex, makeButton, makeIcon, makeNode, makePanel } from './Theme';
import { Vec3 } from 'cc';

const { ccclass } = _decorator;

/** 顶栏：等级 + 经验条 / 金币 / 体力 */
@ccclass('Hud')
export class Hud extends Component {
  private game!: GameState;
  private levelLabel!: Label;
  private xpBar!: Graphics;
  private xpLabel!: Label;
  private coinLabel!: Label;
  private energyLabel!: Label;
  private energySub!: Label;
  private barW = 180;
  /** 金币图标在 Hud 节点里的位置，飞金币动画的终点 */
  coinLocal = new Vec3(-58, -8, 0);
  private coinNode: Node | null = null;

  init(game: GameState, w: number, h: number): void {
    this.game = game;
    makePanel('bg', this.node, 'panel', w, h, 0, 0, undefined, { fill: hex('#FFFFFF', 190), radius: 20 });

    const third = w / 3;
    // 左：等级 + 经验条
    const left = makeNode('level', this.node, third, h, -third, 0);
    const starIcon = makeIcon('star', left, 34, -60, 18);
    this.levelLabel = addLabel(left, 'Lv.1', { size: 28, bold: true, x: starIcon ? 6 : 0, y: 18, color: hex(THEME.text) });
    const barNode = makeNode('xpbar', left, this.barW, 14, 0, -16);
    this.xpBar = barNode.addComponent(Graphics);
    this.xpLabel = addLabel(left, '0/40', { size: 14, y: -36, color: hex(THEME.textLight) });

    // 中：金币
    const mid = makeNode('coins', this.node, third, h, 0, 0);
    addLabel(mid, '金币', { size: 18, y: 22, color: hex(THEME.textLight) });
    const coinIcon = makeIcon('coin', mid, 36, -58, -8);
    this.coinNode = coinIcon;
    this.coinLocal = new Vec3(mid.position.x + (coinIcon ? -58 : 0), -8, 0);
    this.coinLabel = addLabel(mid, '0', { size: 34, bold: true, x: coinIcon ? 8 : 0, y: -8, color: hex(THEME.accentDark) });

    // 右：体力
    const right = makeNode('energy', this.node, third, h, third, 0);
    addLabel(right, '体力', { size: 18, y: 22, color: hex(THEME.textLight) });
    const energyIcon = makeIcon('energy', right, 34, -76, -6);
    this.energyLabel = addLabel(right, '100/100', { size: 30, bold: true, x: energyIcon ? 10 : 0, y: -6, color: hex(THEME.energy) });
    this.energySub = addLabel(right, '', { size: 14, y: -32, color: hex(THEME.textLight) });

    // 右上角小静音按钮（右下角会贴着体力数字）
    const mute = makeButton(this.node, Audio.muted ? '静音' : '音效', 64, 30, Audio.muted ? '#B9AEA2' : THEME.accentDark, () => {
      Audio.setMuted(!Audio.muted);
      const l = mute.getChildByName('label')?.getComponent(Label);
      if (l) l.string = Audio.muted ? '静音' : '音效';
      const sp = mute.getComponent('cc.Sprite') as { color: Color } | null;
      if (sp) sp.color = hex(Audio.muted ? '#B9AEA2' : THEME.accentDark);
    }, w / 2 - 40, h / 2 - 20);
    const ml = mute.getChildByName('label')?.getComponent(Label);
    if (ml) ml.fontSize = 13;

    game.events.on('change', () => this.refresh(game.now()));
    this.refresh(game.now());
  }

  /** 金币到账时图标弹一下 */
  bumpCoin(): void {
    const n = this.coinNode;
    if (!n) return;
    Tween.stopAllByTarget(n);
    n.setScale(1, 1, 1);
    tween(n).to(0.08, { scale: new Vec3(1.35, 1.35, 1) }).to(0.12, { scale: new Vec3(1, 1, 1) }).start();
  }

  refresh(now: number): void {
    const p = this.game.player;
    const e = this.game.energy;
    this.levelLabel.string = `Lv.${p.level}`;
    const need = p.xpForNext();
    this.xpLabel.string = `${p.xp}/${need}`;
    this.drawBar(Math.min(1, p.xp / need));
    this.coinLabel.string = `${p.coins}`;
    this.energyLabel.string = `${e.value}/${e.max}`;
    this.energyLabel.color = e.value <= 0 ? hex(THEME.danger) : hex(THEME.energy);
    const s = e.secondsToNext(now);
    this.energySub.string = s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} 后 +1` : '已满';
  }

  private drawBar(ratio: number): void {
    const g = this.xpBar;
    const w = this.barW;
    const h = 14;
    g.clear();
    g.roundRect(-w / 2, -h / 2, w, h, 7);
    g.fillColor = hex('#E4DCD3');
    g.fill();
    if (ratio > 0) {
      g.roundRect(-w / 2, -h / 2, Math.max(h, w * ratio), h, 7);
      g.fillColor = hex(THEME.xp);
      g.fill();
    }
  }
}
