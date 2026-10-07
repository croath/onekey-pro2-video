"""Subtitles for the rendered video, from data/lyrics.json (the edit's word timings).

Writes release/onekey-pro2.en.srt, .zh-Hans.srt and .bilingual.srt (EN over 中文).
Each line shows from 0.1 s before it is sung until 0.4 s after its last word (never past
the next line's start). Run: python3 release/make_subs.py
"""
import json

ZH = {
    'Glass on the front and glass on the back': '正面是玻璃，背面也是玻璃',
    'A ribbon of metal, graphite and black': '一圈金属边框，石墨般的黑',
    'Thin as a card, it slips out of sight': '薄如卡片，一放就不见踪影',
    'One little key mark catching the light': '一枚小小的钥匙标，映着光',
    'Quiet by design, no edges to show': '低调是设计，不露一丝棱角',
    'Everything that matters stays down below': '真正重要的，都藏在深处',
    'Scan it, sign it, send it': '扫码，签名，发送',
    'Not a single wire': '一根线都不用',
    'Read it before you mean it': '先看清，再确认',
    'Every word in plain type': '每个字都明明白白',
    'Keep your keys at home': '私钥只留在你身边',
    'Only the signatures go': '出门的只有签名',
    'Twenty-four words the internet will never know': '二十四个助记词，网络永远无从得知',
    'One key (OneKey), all yours': '一把钥匙（OneKey），完全属于你',
    'Hold it, sign it, go': '握住它，签下它，出发',
    'Four secure elements, EAL six plus': '四颗安全芯片，EAL 6+',
    "Bank-card silicon, so you don't have to trust": '银行卡级芯片，无需盲目信任',
    'A camera on the back that only reads light': '背面的摄像头只读取光',
    'QR in, QR out, and nothing online': '二维码进，二维码出，全程不联网',
    'Contract says "approve all"? SignGuard says wait': '合约要你“全部授权”？SignGuard 说：等一下',
    'Clear signing in words, not hex on a plate': '用文字清楚签名，而不是一堆十六进制',
    'Touch to unlock it, a PIN if you must': '指纹解锁，必要时再用 PIN',
    'Too many wrong guesses, it wipes itself to dust': '猜错太多次，它会自毁清空',
    "It's not just your coins anymore": '守护的不再只是你的币',
    "It's the key to every door": '它是打开每一扇门的钥匙',
    'FIDO in your pocket, passkeys, no passwords to type': '口袋里的 FIDO，通行密钥，不必再输密码',
    "Tap it once and you're in, no phishing link tonight": '轻点一下即可登录，今晚没有钓鱼链接',
    'Open source, read every line': '开源，每一行都可查看',
    'OneKey Pro 2': 'OneKey Pro 2',
}

lines = json.load(open('data/lyrics.json'))['lines']


def ts(t):
    ms = int(round(t * 1000))
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'


cues = []
for i, l in enumerate(lines):
    nxt = lines[i + 1]['start'] if i + 1 < len(lines) else l['end'] + 2
    prev_end = cues[-1][1] if cues else 0
    a = max(l['start'] - 0.1, prev_end)
    b = min(l['words'][-1]['start'] + 0.4 if l['end'] - l['words'][-1]['start'] > 2 else l['end'] + 0.4, nxt - 0.1)
    b = max(b, l['words'][-1]['start'] + 0.4, a + 1.0)
    b = min(b, nxt - 0.1) if i + 1 < len(lines) else b
    cues.append((a, b, l['text']))
    assert l['text'] in ZH, l['text']

for name, fmt in [('en', lambda t: t), ('zh-Hans', lambda t: ZH[t]), ('bilingual', lambda t: f'{t}\n{ZH[t]}')]:
    with open(f'release/onekey-pro2.{name}.srt', 'w', encoding='utf-8') as f:
        for n, (a, b, t) in enumerate(cues, 1):
            f.write(f'{n}\n{ts(a)} --> {ts(b)}\n{fmt(t)}\n\n')
print(len(cues), 'cues; last ends', ts(cues[-1][1]))
