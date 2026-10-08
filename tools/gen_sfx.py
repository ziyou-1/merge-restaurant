"""合成一套占位音效（16-bit 22050Hz 单声道 WAV）到 assets/resources/sfx/。

用法：python tools/gen_sfx.py
正式音效到位后同名替换即可（mp3/wav 都行），代码里按文件名取：见 ui/Audio.ts 的 SFX 表。
"""
import os
import wave
import numpy as np

SR = 22050
HERE = os.path.dirname(os.path.abspath(__file__))
DST = os.path.join(HERE, "..", "assets", "resources", "sfx")
os.makedirs(DST, exist_ok=True)


def env(n, attack=0.005, release=0.08):
    """线性起音 + 指数衰音"""
    t = np.arange(n) / SR
    a = np.minimum(1.0, t / max(attack, 1e-4))
    r = np.exp(-t / max(release, 1e-4))
    return a * r


def tone(freq, dur, wave_fn=np.sin, harmonics=(1.0,), glide_to=None):
    n = int(SR * dur)
    t = np.arange(n) / SR
    if glide_to is not None:
        f = np.geomspace(freq, glide_to, n)
        phase = 2 * np.pi * np.cumsum(f) / SR
    else:
        phase = 2 * np.pi * freq * t
    out = np.zeros(n)
    for i, amp in enumerate(harmonics):
        out += amp * wave_fn(phase * (i + 1))
    return out / max(1e-6, np.max(np.abs(out)))


def seq(notes, dur, gap=0.0, release=0.12, harmonics=(1.0, 0.3)):
    """一串音符依次播放"""
    parts = []
    for f in notes:
        n = int(SR * dur)
        parts.append(tone(f, dur, harmonics=harmonics) * env(n, 0.004, release))
        if gap:
            parts.append(np.zeros(int(SR * gap)))
    return np.concatenate(parts)


def write(name, data, volume=0.8):
    data = np.clip(data * volume, -1, 1)
    pcm = (data * 32767).astype("<i2")
    path = os.path.join(DST, name + ".wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"{name}.wav  {len(data)/SR*1000:.0f} ms  {os.path.getsize(path)/1024:.0f} KB")


# 点生成器：短促的“啵”
n = int(SR * 0.09)
write("tap", tone(700, 0.09, glide_to=350, harmonics=(1.0, 0.2)) * env(n, 0.002, 0.04))

# 合成：两声上扬的叮
write("merge", seq([523.25, 783.99], 0.11, release=0.09, harmonics=(1.0, 0.4, 0.15)))

# 交单得金币：亮亮的叮当（两个不协和高音叠一起像硬币）
n = int(SR * 0.22)
coin = (tone(1318.5, 0.22, harmonics=(1.0, 0.5)) * 0.6 + tone(1975.5, 0.22) * 0.4) * env(n, 0.002, 0.07)
write("coin", coin)

# 装修完成：C-E-G 琶音
write("task", seq([523.25, 659.25, 783.99], 0.12, release=0.15))

# 升级：C-E-G-C 上行 + 长尾
lv = seq([523.25, 659.25, 783.99], 0.1, release=0.12)
n = int(SR * 0.45)
lv = np.concatenate([lv, tone(1046.5, 0.45, harmonics=(1.0, 0.3, 0.1)) * env(n, 0.004, 0.25)])
write("levelup", lv)

# 界面点击：很短的滴
n = int(SR * 0.035)
write("click", tone(1500, 0.035) * env(n, 0.001, 0.015), volume=0.5)

# 不能操作：低沉短哔
n = int(SR * 0.12)
write("error", tone(180, 0.12, wave_fn=lambda p: np.sign(np.sin(p)), harmonics=(1.0,)) * env(n, 0.003, 0.06), volume=0.35)

# 出售：往下滑的一声
n = int(SR * 0.12)
write("sell", tone(900, 0.12, glide_to=400, harmonics=(1.0, 0.3)) * env(n, 0.002, 0.06), volume=0.6)

# 签到 / 领奖：短琶音 + 叮
gift = np.concatenate([seq([659.25, 783.99], 0.08, release=0.08), coin])
write("reward", gift)
