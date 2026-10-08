import { AudioClip, AudioSource, Node, resources, sys } from 'cc';

/**
 * 音效：一个 AudioSource 用 playOneShot 放短音。
 * 片段在 assets/resources/sfx/，由 tools/gen_sfx.py 生成占位，同名替换即可。
 * 静音开关存本地（和存档分开，换手机不同步也无所谓）。
 */
export type SfxName = 'tap' | 'merge' | 'coin' | 'task' | 'levelup' | 'click' | 'error' | 'sell' | 'reward';

const NAMES: SfxName[] = ['tap', 'merge', 'coin', 'task', 'levelup', 'click', 'error', 'sell', 'reward'];
const SETTINGS_KEY = 'merge-restaurant-settings';

class AudioStore {
  private clips = new Map<SfxName, AudioClip>();
  private source: AudioSource | null = null;
  private _muted = false;
  /** 同一帧同一个音只放一次，合成连锁时不会糊成一团 */
  private lastPlay = new Map<SfxName, number>();

  get muted(): boolean {
    return this._muted;
  }

  /** 挂到某个常驻节点上；加载失败只是没声音 */
  init(host: Node): void {
    this.source = host.getComponent(AudioSource) ?? host.addComponent(AudioSource);
    this.source.playOnAwake = false;
    try {
      const raw = sys.localStorage.getItem(SETTINGS_KEY);
      if (raw) this._muted = !!JSON.parse(raw).muted;
    } catch {
      /* 没设置就默认开声 */
    }
    for (const name of NAMES) {
      resources.load('sfx/' + name, AudioClip, (err, clip) => {
        if (!err && clip) this.clips.set(name, clip);
      });
    }
  }

  play(name: SfxName, volume = 1): void {
    if (this._muted || !this.source) return;
    const clip = this.clips.get(name);
    if (!clip) return;
    const t = Date.now();
    if (t - (this.lastPlay.get(name) ?? 0) < 40) return;
    this.lastPlay.set(name, t);
    try {
      this.source.playOneShot(clip, volume);
    } catch {
      /* 浏览器没交互前会拒绝播放，忽略 */
    }
  }

  setMuted(v: boolean): void {
    this._muted = v;
    try {
      sys.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ muted: v }));
    } catch {
      /* 存不了就算了 */
    }
  }
}

export const Audio = new AudioStore();
