import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
tl=json.loads((ROOT/'timeline.json').read_text(encoding='utf-8'))
segs=tl['segments']
def stamp(t):
    ms=int(round(t*1000)); h,ms=divmod(ms,3600000); m,ms=divmod(ms,60000); s,ms=divmod(ms,1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
lines=[]
for i,m in enumerate(segs,1):
    a=m['start']; b=segs[i]['start']-.05 if i<len(segs) else m['start']+m['duration']+.4
    lines += [str(i), f"{stamp(a)} --> {stamp(b)}", m['text'], ""]
out=ROOT.parent/'师说宣传片_完整版_字幕.srt'
out.write_text('\n'.join(lines),encoding='utf-8')
print(out,len(segs))
