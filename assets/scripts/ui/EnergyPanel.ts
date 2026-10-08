import { _decorator, Component } from 'cc';
import { AD_UNIT_ID, ENERGY, SHARE, SUBSCRIBE_TMPL_ID } from '../config/GameConfig';
import type { GameState } from '../core/GameState';
import { requestSubscribe, shareAppMessage, showRewardedAd } from '../platform/Wx';
import { Audio } from './Audio';
import { Popup, popupRow } from './Popup';
import { THEME, addLabel, hex } from './Theme';

const { ccclass } = _decorator;

/** 体力获取：看广告 / 分享 / （可选）订阅回满提醒 */
@ccclass('EnergyPanel')
export class EnergyPanel extends Component {
  private game!: GameState;
  private popup!: Popup;
  private busy = false;
  /** 弹提示用 */
  toast: (t: string) => void = () => {};

  init(game: GameState, screenW: number, screenH: number): void {
    this.game = game;
    this.popup = this.node.addComponent(Popup);
    this.popup.init(screenW, screenH, 640, SUBSCRIBE_TMPL_ID ? 400 : 320, '补充体力');
  }

  open(): void {
    this.rebuild();
    this.popup.open();
  }

  private rebuild(): void {
    this.popup.clear();
    const c = this.popup.content;
    const g = this.game;
    const w = 580;
    addLabel(c, `当前体力 ${g.energy.value}/${g.energy.max}，每 ${ENERGY.regenSeconds / 60} 分钟回 1 点`, {
      size: 16,
      color: hex(THEME.textLight),
      y: 105,
    });

    popupRow(c, 40, w, `看广告 +${ENERGY.adRefill} 体力`, '看完整段视频才发奖', '去看', THEME.energy, !this.busy, () => {
      if (this.busy) return;
      this.busy = true;
      showRewardedAd(AD_UNIT_ID)
        .then((ok) => {
          if (ok) {
            g.refillEnergy();
            Audio.play('reward');
          } else this.toast('广告没看完，没有奖励');
        })
        .finally(() => {
          this.busy = false;
          if (this.popup.isOpen) this.rebuild();
        });
    });

    const left = g.shareLeft();
    popupRow(c, -46, w, `分享给好友 +${SHARE.energy} 体力`, `今天还能领 ${left}/${SHARE.perDay} 次`, '分享', THEME.accent, left > 0 && !this.busy, () => {
      if (this.busy) return;
      this.busy = true;
      shareAppMessage(SHARE.title, SHARE.imageUrl)
        .then((ok) => {
          if (ok && g.rewardShare()) Audio.play('reward');
        })
        .finally(() => {
          this.busy = false;
          if (this.popup.isOpen) this.rebuild();
        });
    });

    if (SUBSCRIBE_TMPL_ID) {
      popupRow(c, -132, w, '体力回满时提醒我', '订阅一次，回满推一条消息', '订阅', THEME.accentDark, !this.busy, () => {
        requestSubscribe(SUBSCRIBE_TMPL_ID).then((ok) => this.toast(ok ? '已订阅，回满时提醒你' : '没有订阅成功'));
      });
    }
  }
}
