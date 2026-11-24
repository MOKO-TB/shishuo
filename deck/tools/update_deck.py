"""One-off content update: add Android slide, refresh counts and new features."""
from pathlib import Path

p = Path("D:/100h/jiaoshi ai/deck/index.html")
s = p.read_text(encoding="utf-8")

CSS = r'''
/* ---------- 09 android ---------- */
.android-head{position:absolute;left:120px;top:92px;width:900px}
.android-head h1{font-size:108px;margin-top:14px}
.android-head .lead{margin-top:22px;max-width:760px;font-size:19px}
.android-stat{display:flex;align-items:center;gap:24px;margin-top:38px}
.android-stat .n{font-size:112px;font-weight:200;line-height:.82;letter-spacing:-.05em;color:var(--ink);font-variant-numeric:tabular-nums}
.android-stat .n small{font-size:18px;font-weight:400;letter-spacing:.12em;color:var(--ink-3);margin-left:8px}
.android-stat .cap{font-size:11px;line-height:1.75;letter-spacing:.08em;color:var(--ink-3)}
.android-stat .cap b{display:block;color:var(--ink-2);font-weight:400;letter-spacing:.04em}
.android-feats{display:grid;grid-template-columns:1fr 1fr;column-gap:44px;margin-top:28px;width:800px}
.android-feat{display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--line);
  font-size:14px;letter-spacing:.02em;color:var(--ink-2)}
.android-feat .ic{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;flex:none;
  background:rgba(99,221,176,.12);color:var(--jade)}
.android-verify{position:absolute;left:120px;bottom:92px;display:flex;align-items:center;gap:12px;
  font-size:10px;letter-spacing:.05em;color:var(--ink-4);white-space:nowrap}
.android-verify b{color:var(--ink-3);font-weight:400}
.android-verify i{width:5px;height:5px;border-radius:50%;background:var(--jade);box-shadow:0 0 10px var(--jade)}
.android-phone{position:absolute;right:110px;top:96px;width:640px;height:930px;display:grid;place-items:center;perspective:1700px}
.android-phone .phone{width:348px;height:750px;border-radius:60px;padding:10px;
  transform:rotateY(-9deg) rotateX(2deg) rotateZ(-1.5deg)}
.android-phone .phone::before{inset:10px;border-radius:52px}
.android-phone .phone img{border-radius:52px}
.android-phone .island{top:23px;width:92px;height:26px}
.android-phone .side.s1{top:170px;height:56px}
.android-phone .side.s2{top:244px;height:80px}
.android-phone .side.s3{top:210px;height:104px}
.widget-card{position:absolute;left:-18px;top:112px;width:432px;padding:10px 10px 8px;border-radius:26px;
  background:linear-gradient(160deg,rgba(255,255,255,.18),rgba(255,255,255,.055));
  border:1px solid rgba(255,255,255,.22);
  box-shadow:0 46px 90px -34px rgba(0,0,0,.95),inset 0 1px 0 rgba(255,255,255,.16);
  backdrop-filter:blur(14px);z-index:4}
.widget-card img{width:100%;display:block;border-radius:20px}
.widget-card .cap{margin-top:9px;padding:0 6px;display:flex;justify-content:space-between;align-items:center;
  font-size:9px;letter-spacing:.1em;color:var(--ink-3)}
.widget-card .cap b{font-weight:400;color:#8ef0c8}
#s9 .widget-card[data-step]{transform:rotate(-3deg) translateY(12px)}
#s9 .widget-card[data-step].is-in{transform:rotate(-3deg)}
.teacher-extra{position:absolute;left:120px;top:760px;display:flex;align-items:center;gap:16px;
  font-size:11px;letter-spacing:.08em;color:var(--ink-3)}
.teacher-extra .tag{padding:5px 10px;border:1px solid rgba(99,221,176,.3);border-radius:999px;
  color:#8ef0c8;font-size:9px;letter-spacing:.14em}
'''

if "/* ---------- 09 android ---------- */" not in s:
    s = s.replace("/* ---------- 09 trust ---------- */", CSS + "\n/* ---------- 09 trust ---------- */", 1)

for a, b in [
    ("/* ---------- 12 close ---------- */", "/* ---------- 13 close ---------- */"),
    ("/* ---------- 11 roadmap ---------- */", "/* ---------- 12 roadmap ---------- */"),
    ("/* ---------- 10 proof ---------- */", "/* ---------- 11 proof ---------- */"),
    ("/* ---------- 09 trust ---------- */", "/* ---------- 10 trust ---------- */"),
    ("<!-- 12 · close -->", "<!-- 13 · close -->"),
    ("<!-- 11 · roadmap -->", "<!-- 12 · roadmap -->"),
    ("<!-- 10 · proof -->", "<!-- 11 · proof -->"),
    ("<!-- 09 · trust -->", "<!-- 10 · trust -->"),
    ('id="s12"', 'id="s13"'),
    ('id="s11"', 'id="s12"'),
    ('id="s10"', 'id="s11"'),
    ('id="s9"', 'id="s10"'),
]:
    s = s.replace(a, b, 1)

CHECK = '<span class="ic"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M4 12l5 5L20 6"/></svg></span>'
FEATS = ["4×2 桌面课表小组件", "上课前本地提醒", "拍题 / 相册保存", "系统分享到师说", "学习通一键直达", "系统深色跟随"]
feat_html = "\n".join(f'            <div class="android-feat" data-step="2">{CHECK}{t}</div>' for t in FEATS)

ANDROID = f'''    <!-- 09 · android -->
    <section class="slide" id="s9" data-tone="dark" data-beats="2">
      <div class="scene">
        <div class="bg bg--dark"></div>
        <div class="aurora" style="right:-160px;top:110px;width:1150px;height:860px;opacity:.3"></div>
        <div class="grain"></div>
        <div class="vignette"></div>

        <div class="android-head">
          <div class="kicker" data-in style="--d:60">Android App · v0.2.6</div>
          <h1 class="h1 mask" style="--d:140"><span>装进口袋。</span></h1>
          <p class="lead" data-in style="--d:300">课表上桌面，通知进状态栏，学习通一键直达。<br>不只是套壳：相机、相册、小组件、分享、返回键，都做了原生。</p>

          <div class="android-stat" data-step="1">
            <div class="n">1.4<small>MB</small></div>
            <div class="cap"><b>APK · 从 8.4MB 瘦到 1.4MB</b>应用内直接更新 · OPPO 小组件兼容</div>
          </div>

          <div class="android-feats">
{feat_html}
          </div>
        </div>

        <div class="android-verify" data-step="2"><i></i><b>Android 15 实测</b><span>冷启动 · 登录保持 · 相册授权 · 返回键 · 断网兜底</span></div>

        <div class="android-phone" data-in style="--d:220">
          <div class="phone">
            <div class="island"></div>
            <span class="side s1"></span><span class="side s2"></span><span class="side s3"></span>
            <img src="assets/img/student-mobile.jpg" alt="师说 Android App">
          </div>
          <div class="widget-card" data-step="1">
            <img src="assets/img/android-widget.png" alt="师说 4×2 课表小组件">
            <div class="cap"><span>4×2 课表小组件</span><b>OPPO 兼容版</b></div>
          </div>
        </div>
      </div>
    </section>

'''

if "<!-- 09 · android -->" not in s:
    s = s.replace("    <!-- 10 · trust -->", ANDROID + "    <!-- 10 · trust -->", 1)

s = s.replace("引路学长 · 73 条校园经验卡 · 可信度分级", "引路学长 · 804 条校园经验卡 · 7 大分类")
s = s.replace("103 档口 · 3173 道菜", "107 档口 · 3758 道菜")
s = s.replace("36 栋建筑 · 搜索即定位", "36 栋建筑 · GPA / 空教室 / 校历")
s = s.replace('<div class="v" data-count="73">73</div>', '<div class="v" data-count="804">804</div>')
if "Android v0.2.6</span>" not in s:
    s = s.replace("<span>157 / 157 检索评测</span>", "<span>157 / 157 检索评测</span>\n            <span>Android v0.2.6</span>", 1)
s = s.replace("在线演示 · 学生端 / 教师端", "在线演示 · Android 安装包")
s = s.replace('<span class="chip live">LIVE · 121.37.30.147</span>', '<span class="chip live">LIVE · Web + Android</span>')
s = s.replace("提问、转交、回复、沉淀、回流，全流程真实可用。", "Web 与 Android 都跑通；提问、转交、回复、沉淀、回流。")
s = s.replace('<div class="tag" style="color:var(--clay)">复习卡</div>', '<div class="tag" style="color:var(--clay)">复习卡 · 期末包</div>')
s = s.replace("收藏、负反馈、未解决，自动组一轮自测。", "错题、收藏、未解决自动组卷；期末一键打包。")
s = s.replace('<span class="count"><b>01</b> — 12</span>', '<span class="count"><b>01</b> — 13</span>')

TB5 = '''            <div class="tb" data-in style="--d:760">
              <div class="ti"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></div>
              <div><b>AI 已答抽查</b><span>纠正一次，同步给引用同一条 FAQ 的同学。</span></div>
            </div>
'''
old4 = '''              <div><b>撤回按快照回滚</b><span>回复撤回，问题回待办，FAQ 同步回滚。</span></div>
            </div>
          </div>
'''
new4 = '''              <div><b>撤回按快照回滚</b><span>回复撤回，问题回待办，FAQ 同步回滚。</span></div>
            </div>
''' + TB5 + "          </div>\n"
if "AI 已答抽查" not in s:
    s = s.replace(old4, new4, 1)

EXTRA = '''
        <div class="teacher-extra" data-in style="--d:840">
          <span class="tag">课堂工具</span>
          <span>本节提问墙</span><span>期末复习包</span><span>下节课开场卡</span>
        </div>
'''
if "teacher-extra" not in s:
    s = s.replace('        <div class="merge">\n', EXTRA + '\n        <div class="merge">\n', 1)

s = s.replace(
    "  .pulse,.start-hint,.beam{display:none!important}",
    "  .pulse,.start-hint,.beam{display:none!important}\n  .widget-card{transform:rotate(-3deg)!important}",
    1,
)

p.write_text(s, encoding="utf-8")
print("updated", len(s))
