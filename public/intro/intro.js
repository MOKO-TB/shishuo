(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const header = document.querySelector(".site-header");
  const progressBar = document.querySelector(".scroll-progress i");
  const heroVisual = document.querySelector(".hero-visual");
  const about = document.querySelector(".about");

  /* 滚动揭示 */
  const reveals = Array.from(document.querySelectorAll(".reveal"));
  if (reduceMotion || !("IntersectionObserver" in window)) {
    reveals.forEach((el) => el.classList.add("is-visible"));
  } else {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.08 }
    );
    reveals.forEach((el) => revealObserver.observe(el));
  }

  /* 数字滚动 */
  const countEls = Array.from(document.querySelectorAll("[data-count]"));
  const statsBand = document.querySelector(".stats-band");
  if (countEls.length && statsBand) {
    const setFinal = () => {
      countEls.forEach((el) => {
        el.textContent = el.dataset.count;
      });
    };
    if (reduceMotion || !("IntersectionObserver" in window)) {
      setFinal();
    } else {
      countEls.forEach((el) => {
        el.textContent = "0";
      });
      const runCount = () => {
        const started = performance.now();
        const duration = 1400;
        const tick = (now) => {
          const progress = Math.min(1, (now - started) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          countEls.forEach((el) => {
            el.textContent = String(Math.round(Number(el.dataset.count) * eased));
          });
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      };
      const countObserver = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          countObserver.disconnect();
          runCount();
        },
        { threshold: 0.45 }
      );
      countObserver.observe(statsBand);
    }
  }

  /* 滚动叙事：左侧步骤滚动，右侧画面吸顶切换 */
  const storySteps = Array.from(document.querySelectorAll(".story-step"));
  const storyFrames = Array.from(document.querySelectorAll(".story-frame"));
  const storyBars = Array.from(document.querySelectorAll(".story-rail i"));
  const storyMeta = document.querySelector(".story-meta");
  const storyNo = document.querySelector(".story-no");
  const storyCaption = document.querySelector(".story-caption");
  const storyCaptions = [
    "学生端 · 提问与同题组",
    "AI 助教 · 回答与转交",
    "教师工作台 · 待办",
    "教师端 · 回复抽屉",
    "课程知识库 · 已沉淀",
  ];
  let storyActive = 0;
  let metaTimer = 0;

  const setStory = (index) => {
    if (index === storyActive) return;
    storyActive = index;
    storySteps.forEach((step, i) => {
      step.classList.toggle("is-active", i === index);
    });
    storyFrames.forEach((frame, i) => {
      frame.classList.toggle("is-active", i === index);
    });
    storyBars.forEach((bar, i) => {
      bar.classList.toggle("is-active", i === index);
      bar.classList.toggle("is-done", i < index);
    });
    if (!storyMeta || !storyNo || !storyCaption) return;
    window.clearTimeout(metaTimer);
    storyMeta.classList.add("is-fading");
    metaTimer = window.setTimeout(() => {
      storyNo.textContent = String(index + 1).padStart(2, "0");
      storyCaption.textContent = storyCaptions[index] || "";
      storyMeta.classList.remove("is-fading");
    }, 140);
  };

  /* 顶栏当前章节 */
  const sections = ["research", "story", "ability", "film", "app", "faq", "team", "roadmap"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const navLinks = new Map();
  document.querySelectorAll('.nav a[href^="#"]').forEach((link) => {
    navLinks.set(link.getAttribute("href").slice(1), link);
  });

  /* 章节吸附翻页器 */
  const deckNav = document.querySelector(".deck-nav");
  const deckChapters = Array.from(document.querySelectorAll("[data-deck-label]"));
  if (deckNav && deckChapters.length) {
    const deckIndexEl = deckNav.querySelector("[data-deck-index]");
    const deckTotalEl = deckNav.querySelector("[data-deck-total]");
    const deckLabelEl = deckNav.querySelector("[data-deck-label-current]");
    const deckDotsEl = deckNav.querySelector("[data-deck-dots]");
    const deckPrev = deckNav.querySelector("[data-deck-prev]");
    const deckNext = deckNav.querySelector("[data-deck-next]");
    const deckDots = [];
    let deckActive = 0;

    const setDeck = (index) => {
      deckActive = Math.max(0, Math.min(deckChapters.length - 1, index));
      const chapter = deckChapters[deckActive];
      if (deckIndexEl) deckIndexEl.textContent = String(deckActive + 1).padStart(2, "0");
      if (deckTotalEl) deckTotalEl.textContent = String(deckChapters.length).padStart(2, "0");
      if (deckLabelEl) deckLabelEl.textContent = chapter.dataset.deckLabel || "";
      deckDots.forEach((dot, i) => {
        const active = i === deckActive;
        dot.classList.toggle("is-active", active);
        dot.setAttribute("aria-current", active ? "step" : "false");
      });
      if (deckPrev) deckPrev.disabled = deckActive === 0;
      if (deckNext) deckNext.disabled = deckActive === deckChapters.length - 1;
    };

    const goDeck = (index) => {
      const target = deckChapters[index];
      if (!target) return;
      setDeck(index);
      target.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
    };

    deckChapters.forEach((chapter, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "deck-dot";
      dot.setAttribute("aria-label", `第 ${index + 1} 章：${chapter.dataset.deckLabel || ""}`);
      dot.title = chapter.dataset.deckLabel || "";
      dot.addEventListener("click", () => goDeck(index));
      deckDotsEl.append(dot);
      deckDots.push(dot);
    });

    if (deckPrev) deckPrev.addEventListener("click", () => goDeck(deckActive - 1));
    if (deckNext) deckNext.addEventListener("click", () => goDeck(deckActive + 1));

    const syncDeck = () => {
      const probe = window.innerHeight * 0.18;
      let index = 0;
      deckChapters.forEach((chapter, i) => {
        if (chapter.getBoundingClientRect().top <= probe) index = i;
      });
      if (index !== deckActive) setDeck(index);
    };

    let deckFrame = 0;
    const onDeckScroll = () => {
      if (deckFrame) return;
      deckFrame = window.requestAnimationFrame(() => {
        deckFrame = 0;
        syncDeck();
      });
    };
    window.addEventListener("scroll", onDeckScroll, { passive: true });
    window.addEventListener("resize", onDeckScroll);
    setDeck(0);
    syncDeck();

    document.addEventListener("keydown", (event) => {
      if (event.key !== "PageDown" && event.key !== "PageUp") return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (
        target &&
        target.closest &&
        target.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      if (document.body.style.overflow === "hidden") return;
      event.preventDefault();
      goDeck(deckActive + (event.key === "PageDown" ? 1 : -1));
    });
  }

  const syncScroll = () => {
    const y = window.scrollY;

    if (header) header.classList.toggle("is-scrolled", y > 8);

    if (progressBar) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const percent = max > 0 ? Math.min(100, (y / max) * 100) : 0;
      progressBar.style.width = `${percent}%`;
    }

    if (navLinks.size) {
      const probe = window.innerHeight * 0.42;
      let current = null;
      sections.forEach((section) => {
        if (section.getBoundingClientRect().top <= probe) current = section.id;
      });
      if (about && about.getBoundingClientRect().top <= probe) current = null;
      navLinks.forEach((link, id) => {
        link.classList.toggle("is-active", id === current);
      });
    }

    if (storySteps.length) {
      const probe = window.innerHeight * 0.44;
      let index = 0;
      storySteps.forEach((step, i) => {
        if (step.getBoundingClientRect().top <= probe) index = i;
      });
      setStory(index);
    }

    if (!reduceMotion && heroVisual) {
      const progress = Math.max(0, Math.min(1, y / (window.innerHeight * 0.7)));
      heroVisual.style.setProperty("--scroll-bg", `${(progress * 24).toFixed(2)}px`);
      heroVisual.style.setProperty("--scroll-mid", `${(-progress * 44).toFixed(2)}px`);
      heroVisual.style.setProperty("--scroll-fg", `${(-progress * 80).toFixed(2)}px`);
    }
  };

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      syncScroll();
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  syncScroll();

  /* 首屏鼠标视差与光斑 */
  if (heroVisual && !reduceMotion) {
    let pointerFrame = 0;
    let pointerX = 0;
    let pointerY = 0;

    heroVisual.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      const rect = heroVisual.getBoundingClientRect();
      pointerX = (event.clientX - rect.left) / rect.width - 0.5;
      pointerY = (event.clientY - rect.top) / rect.height - 0.5;
      if (pointerFrame) return;
      pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0;
        heroVisual.style.setProperty("--px", pointerX.toFixed(3));
        heroVisual.style.setProperty("--py", pointerY.toFixed(3));
        heroVisual.style.setProperty("--mx", `${((pointerX + 0.5) * 100).toFixed(1)}%`);
        heroVisual.style.setProperty("--my", `${((pointerY + 0.5) * 100).toFixed(1)}%`);
      });
    });

    heroVisual.addEventListener("pointerleave", () => {
      heroVisual.style.setProperty("--px", "0");
      heroVisual.style.setProperty("--py", "0");
      heroVisual.style.setProperty("--mx", "50%");
      heroVisual.style.setProperty("--my", "50%");
    });
  }

  /* 本地双击打开时，主站按钮回落到生产地址 */
  if (window.location.protocol === "file:") {
    document.querySelectorAll("[data-main-site]").forEach((link) => {
      link.href = "http://121.37.30.147/";
    });
  }

  /* 宣传片灯箱 */
  const lightbox = document.getElementById("film-lightbox");
  const video = document.getElementById("film-video");
  let lastTrigger = null;

  const closeFilm = () => {
    if (!lightbox || lightbox.hidden) return;
    video.pause();
    lightbox.hidden = true;
    document.body.style.overflow = "";
    if (lastTrigger && typeof lastTrigger.focus === "function") lastTrigger.focus();
  };

  const openFilm = (trigger) => {
    if (!lightbox || !video) return;
    lastTrigger = trigger || document.activeElement;
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
    const track = video.textTracks && video.textTracks[0];
    if (track) track.mode = "showing";
    const closeButton = lightbox.querySelector("[data-close-film]");
    if (closeButton) closeButton.focus();
    const started = video.play();
    if (started && typeof started.catch === "function") started.catch(() => {});
  };

  document.querySelectorAll("[data-open-film]").forEach((trigger) => {
    trigger.addEventListener("click", () => openFilm(trigger));
  });

  if (lightbox) {
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) closeFilm();
    });
    lightbox.querySelectorAll("[data-close-film]").forEach((button) => {
      button.addEventListener("click", closeFilm);
    });
    document.addEventListener("keydown", (event) => {
      if (lightbox.hidden) return;
      if (event.key === "Escape") {
        closeFilm();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = Array.from(
        lightbox.querySelectorAll("button, video, [href]")
      ).filter((el) => el.offsetParent !== null || el === video);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  /* 首屏学生 / 教师视角切换 */
  const device = document.querySelector(".device-desktop");
  if (device && heroVisual) {
    const deviceTitle = device.querySelector("[data-device-title]");
    const deviceTabs = Array.from(device.querySelectorAll("[data-device-tab]"));
    const deviceShots = Array.from(device.querySelectorAll("[data-device-shot]"));

    deviceTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const mode = tab.dataset.deviceTab;
        deviceTabs.forEach((item) => {
          const active = item === tab;
          item.classList.toggle("is-active", active);
          item.setAttribute("aria-pressed", active ? "true" : "false");
        });
        deviceShots.forEach((shot) => {
          shot.classList.toggle("is-active", shot.dataset.deviceShot === mode);
        });
        if (deviceTitle) {
          deviceTitle.textContent =
            mode === "teacher" ? "shishuo · 教师端" : "shishuo · 学生端";
        }
        heroVisual.dataset.mode = mode;
      });
    });
  }

  /* 课程问答演示 */
  const demoRoot = document.querySelector(".try-demo");
  if (demoRoot) {
    const demoData = {
      math: {
        name: "高等数学",
        teacher: "李芸",
        questions: [
          {
            q: "连续、可导、可微之间是什么关系？",
            source: "《高等数学》· 导数与微分",
            confidence: "高",
            same: 2,
            answer:
              "一元函数里，可导一定连续，但连续不一定可导；可导和可微是等价的。\n比如 f(x)=|x| 在 0 点连续，左右导数却不一样，所以不可导。\n分段函数在分界点要先验连续，再用导数定义比较左右导数。",
            teacher:
              "补一句：分段点不要先分别求导再代入，先看左右极限和左右导数是否都存在且相等。",
          },
          {
            q: "等价无穷小替换什么时候能用？",
            source: "《高等数学》· 函数、极限与连续",
            confidence: "中",
            same: 3,
            answer:
              "等价无穷小只能在乘除因子里整体替换，不能把加减项各自换掉。\n例如 x→0 时 sin x ~ x，但 sin x - x 不能换成 x - x = 0，它实际上和 -x³/6 同阶。\n加减时先通分、因式分解或做泰勒展开，展开到第一个非零项再判断。",
            teacher:
              "很多同学错在看着像就换。先判断结构：是因子还是加减项，再决定能不能换。",
          },
        ],
      },
      ds: {
        name: "数据结构",
        teacher: "陈砚",
        questions: [
          {
            q: "拓扑排序怎么判断有向图有没有环？",
            source: "《数据结构》· 图",
            confidence: "高",
            same: 3,
            answer:
              "Kahn 算法：先统计入度，把入度为 0 的节点入队；每次出队就删掉它的出边，并让邻居入度减 1。\n最后输出节点数小于 n，就说明图里有环。\nDFS 也可以：递归栈里的节点标灰，遇到灰色边就是环。拓扑序不唯一，只适用于有向图。",
            teacher:
              "判环和求拓扑序可以一起做；如果题目只问有没有环，Kahn 输出数量就够了。",
          },
          {
            q: "二分查找的边界怎么写才不容易死循环？",
            source: "《数据结构》· 查找",
            confidence: "中",
            same: 2,
            answer:
              "先把区间定义固定下来。闭区间用 while(l <= r)，循环里 l = mid + 1 或 r = mid - 1。\n找第一个满足条件的位置时，用 l < r、mid = l + (r-l)/2，满足就 r = mid，否则 l = mid + 1。\n不要在 l = mid 的写法里继续向下取整，容易死循环。",
            teacher:
              "写完先拿长度为 0、1、2 的数组各跑一遍，边界问题大多会暴露。",
          },
        ],
      },
      circuit: {
        name: "电路",
        teacher: "石岩",
        questions: [
          {
            q: "参考方向和实际方向不一致怎么办？",
            source: "《电路》· 电路模型和电路定律",
            confidence: "高",
            same: 3,
            answer:
              "参考方向是人为设的；算出负值只代表实际方向和参考方向相反，不要回头改方程。\n电压、电流取关联参考方向时 P = ui，非关联时 P = -ui；P > 0 表示吸收功率，P < 0 表示发出功率。\n列 KCL / KVL 前先把每个元件的参考方向标清楚。",
            teacher:
              "符号错了不要重列，先检查参考方向有没有标反；负值本身就是答案的一部分。",
          },
          {
            q: "一阶 RC 电路的三要素法怎么用？",
            source: "《电路》· 一阶/二阶时域分析",
            confidence: "中",
            same: 2,
            answer:
              "三要素是初始值 f(0+)、稳态值 f(∞) 和时间常数 τ = RC。\n先由换路定则求初始值：电容电压、电感电流不能突变；求 τ 时把独立源置零，从储能元件两端看等效电阻。\n代进 f(t) = f(∞) + [f(0+) - f(∞)]e^(-t/τ) 就是全响应。",
            teacher:
              "求 τ 时最容易忘记把独立源置零；电压源短路、电流源开路，再看等效电阻。",
          },
        ],
      },
      analog: {
        name: "模电",
        teacher: "陆衡",
        questions: [
          {
            q: "二极管导通怎么判断？",
            source: "《模拟电子技术》· 半导体器件基础",
            confidence: "高",
            same: 3,
            answer:
              "先假设二极管截止，算它两端的电压；如果正向电压超过导通电压，再假设导通，算出的电流必须大于等于 0。\n假设矛盾就换状态。理想模型导通压降为 0，恒压模型硅管约 0.7V、锗管约 0.3V。\n多个二极管要逐一假设，注意电流方向和有没有其他支路。",
            teacher:
              "判断完记得回代检查电流方向；如果算出来是负的，说明这个假设不成立。",
          },
          {
            q: "射极跟随器为什么电压增益接近 1？",
            source: "《模拟电子技术》· 基本放大电路",
            confidence: "高",
            same: 2,
            answer:
              "输出取自发射极，发射极电压跟着基极走，所以电压增益略小于 1 且同相。\n它的价值在阻抗变换：输入电阻高、输出电阻低，适合做缓冲级，增强带负载能力。\n虽然没有电压放大，但有电流和功率放大；分析时仍要先求 Q 点。",
            teacher:
              "面试常问射随有什么用，答阻抗变换比答放大倍数约等于 1 更加分。",
          },
        ],
      },
      digital: {
        name: "数电",
        teacher: "顾明",
        questions: [
          {
            q: "德摩根定律怎么用？",
            source: "《数字电子技术》· 信息与逻辑代数",
            confidence: "高",
            same: 3,
            answer:
              "德摩根定律：长横断开时，乘变加、加变乘，每一项都要取反。\n常用规则还有分配律、吸收律 A + AB = A、并项 AB + AB′ = A。\n化简目标是与项最少、每项变量最少；变量多时用卡诺图更直观。",
            teacher:
              "写长横的时候一层一层断，别一次断两层；每断一层，运算符和变量都要跟着变。",
          },
          {
            q: "怎么用现成计数器构造 N 进制计数器？",
            source: "《数字电子技术》· 时序逻辑电路",
            confidence: "中",
            same: 2,
            answer:
              "用模 M 的计数器构造模 N（N < M）：\n清零法是在计到 N 时产生清零信号，异步清零要提前一个状态；\n置数法是在某个状态置入初值，同步置数更稳定。\n最后要检查未用状态能不能回到有效循环，也就是自启动。",
            teacher:
              "先确定用的是同步还是异步清零，再决定反馈状态是 N 还是 N-1；这是最容易丢分的地方。",
          },
        ],
      },
    };

    const courseButtons = Array.from(demoRoot.querySelectorAll("[data-demo-course]"));
    const questionsEl = demoRoot.querySelector("[data-demo-questions]");
    const confidenceEl = demoRoot.querySelector("[data-demo-confidence]");
    const sourceEl = demoRoot.querySelector("[data-demo-source]");
    const textEl = demoRoot.querySelector("[data-demo-text]");
    const sameEl = demoRoot.querySelector("[data-demo-same]");
    const transferBtn = demoRoot.querySelector("[data-demo-transfer]");
    const teacherEl = demoRoot.querySelector("[data-demo-teacher]");
    const teacherAvatar = demoRoot.querySelector("[data-demo-teacher-avatar]");
    const teacherName = demoRoot.querySelector("[data-demo-teacher-name]");
    const teacherSame = demoRoot.querySelector("[data-demo-teacher-same]");
    const teacherText = demoRoot.querySelector("[data-demo-teacher-text]");
    const settleBtn = demoRoot.querySelector("[data-demo-settle]");
    const settledEl = demoRoot.querySelector("[data-demo-settled]");
    const resetBtn = demoRoot.querySelector("[data-demo-reset]");
    const settled = new Set();
    let currentCourse = "math";
    let currentIndex = 0;
    let typeTimer = 0;

    const typeAnswer = (text) => {
      window.clearTimeout(typeTimer);
      if (reduceMotion) {
        textEl.textContent = text;
        return;
      }
      textEl.textContent = "";
      let index = 0;
      const tick = () => {
        index = Math.min(text.length, index + 2);
        textEl.textContent = text.slice(0, index);
        if (index < text.length) typeTimer = window.setTimeout(tick, 16);
      };
      tick();
    };

    const renderQuestions = () => {
      questionsEl.innerHTML = "";
      demoData[currentCourse].questions.forEach((item, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `try-q${index === currentIndex ? " is-active" : ""}`;
        button.dataset.demoQ = String(index);
        button.setAttribute("aria-pressed", index === currentIndex ? "true" : "false");

        const no = document.createElement("span");
        no.className = "try-q-no";
        no.textContent = String(index + 1).padStart(2, "0");

        const text = document.createElement("span");
        text.className = "try-q-text";
        text.textContent = item.q;

        button.append(no, text);
        if (settled.has(`${currentCourse}:${index}`)) {
          const badge = document.createElement("span");
          badge.className = "try-q-settled";
          badge.textContent = "已沉淀";
          button.append(badge);
        }
        questionsEl.append(button);
      });
    };

    const renderQuestion = () => {
      const item = demoData[currentCourse].questions[currentIndex];
      confidenceEl.textContent = `${item.confidence}置信度`;
      confidenceEl.className = `chip ${
        item.confidence === "高"
          ? "chip-high"
          : item.confidence === "低"
            ? "chip-low"
            : "chip-mid"
      }`;
      sourceEl.textContent = item.source;
      sameEl.textContent = `同题 ${item.same} 人`;
      transferBtn.disabled = false;
      transferBtn.textContent = "让老师补充";
      teacherEl.hidden = true;
      settledEl.hidden = true;
      settleBtn.hidden = false;
      teacherAvatar.textContent = demoData[currentCourse].teacher.slice(0, 1);
      teacherName.textContent = `${demoData[currentCourse].teacher}老师`;
      teacherSame.textContent = `已合并 ${item.same} 人同问`;
      teacherText.textContent = item.teacher;
      textEl.dataset.fullText = item.answer;
      typeAnswer(item.answer);
    };

    const selectQuestion = (index) => {
      currentIndex = index;
      renderQuestions();
      renderQuestion();
    };

    const selectCourse = (key) => {
      if (!demoData[key]) return;
      currentCourse = key;
      currentIndex = 0;
      courseButtons.forEach((button) => {
        const active = button.dataset.demoCourse === key;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
      renderQuestions();
      renderQuestion();
    };

    courseButtons.forEach((button) => {
      button.addEventListener("click", () => selectCourse(button.dataset.demoCourse));
    });

    questionsEl.addEventListener("click", (event) => {
      const button = event.target.closest("[data-demo-q]");
      if (!button) return;
      selectQuestion(Number(button.dataset.demoQ));
    });

    transferBtn.addEventListener("click", () => {
      transferBtn.disabled = true;
      transferBtn.textContent = "老师已接手";
      teacherEl.hidden = false;
    });

    settleBtn.addEventListener("click", () => {
      settled.add(`${currentCourse}:${currentIndex}`);
      settledEl.hidden = false;
      settleBtn.hidden = true;
      renderQuestions();
    });

    resetBtn.addEventListener("click", () => {
      const total = demoData[currentCourse].questions.length;
      selectQuestion((currentIndex + 1) % total);
    });

    selectCourse("math");
  }

  /* 常见问题：手风琴 + 搜索 / 主题筛选 */
  const faqItems = Array.from(document.querySelectorAll(".faq-item"));
  const faqSearch = document.querySelector("[data-faq-search]");
  const faqClear = document.querySelector("[data-faq-clear]");
  const faqEmpty = document.querySelector("[data-faq-empty]");
  const faqTags = Array.from(document.querySelectorAll("[data-faq-tag]"));
  let faqTag = "all";

  const setFaqOpen = (item, open) => {
    item.classList.toggle("is-open", open);
    const button = item.querySelector(".faq-q");
    if (button) button.setAttribute("aria-expanded", open ? "true" : "false");
  };

  const applyFaqFilter = () => {
    const query = (faqSearch?.value || "").trim().toLowerCase();
    let visible = 0;
    faqItems.forEach((item) => {
      const tags = (item.dataset.faqTags || "").split(/\s+/).filter(Boolean);
      const matchTag = faqTag === "all" || tags.includes(faqTag);
      const matchQuery = !query || item.textContent.toLowerCase().includes(query);
      const show = matchTag && matchQuery;
      item.hidden = !show;
      if (show) visible += 1;
    });
    if (faqClear) faqClear.hidden = !query;
    if (faqEmpty) faqEmpty.hidden = visible !== 0;
    if (!visible) {
      faqItems.forEach((item) => setFaqOpen(item, false));
    } else if (visible === 1 && (query || faqTag !== "all")) {
      const only = faqItems.find((item) => !item.hidden);
      if (only) faqItems.forEach((item) => setFaqOpen(item, item === only));
    }
  };

  faqItems.forEach((item) => {
    const button = item.querySelector(".faq-q");
    if (!button) return;
    button.addEventListener("click", () => {
      const open = item.classList.contains("is-open");
      faqItems.forEach((other) => setFaqOpen(other, false));
      if (!open) setFaqOpen(item, true);
    });
  });

  faqTags.forEach((button) => {
    button.addEventListener("click", () => {
      faqTag = button.dataset.faqTag || "all";
      faqTags.forEach((tag) => {
        const active = tag === button;
        tag.classList.toggle("is-active", active);
        tag.setAttribute("aria-pressed", active ? "true" : "false");
      });
      applyFaqFilter();
    });
  });

  if (faqSearch) {
    faqSearch.addEventListener("input", applyFaqFilter);
    faqSearch.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      faqSearch.value = "";
      applyFaqFilter();
    });
  }

  if (faqClear) {
    faqClear.addEventListener("click", () => {
      if (faqSearch) {
        faqSearch.value = "";
        faqSearch.focus();
      }
      applyFaqFilter();
    });
  }

  /* 复制链接 / 二维码放大 */
  const toast = document.getElementById("intro-toast");
  let toastTimer = 0;
  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    window.requestAnimationFrame(() => toast.classList.add("is-visible"));
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
      toastTimer = window.setTimeout(() => {
        toast.hidden = true;
      }, 260);
    }, 2200);
  };

  const copyToClipboard = async (text) => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        /* HTTP / 权限受限时走下面的兜底 */
      }
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  };

  const copyIntroLink = async () => {
    const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const url = isLocal
      ? "http://121.37.30.147/intro/"
      : `${window.location.origin}${window.location.pathname}`;
    const copied = await copyToClipboard(url);
    showToast(copied ? "链接已复制，可以发给同学或老师" : "复制失败，请手动选择地址");
  };

  document.querySelectorAll("[data-copy-link]").forEach((button) => {
    button.addEventListener("click", copyIntroLink);
  });

  document.querySelectorAll("[data-demo-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const root = button.closest(".try-demo");
      if (!root) return;
      const answerEl = root.querySelector("[data-demo-text]");
      const source = root.querySelector("[data-demo-source]")?.textContent.trim() || "";
      const question =
        root.querySelector(".try-questions [data-demo-q].is-active .try-q-text")?.textContent.trim() ||
        "";
      const teacher = root.querySelector("[data-demo-teacher]");
      const teacherReply =
        teacher && !teacher.hidden
          ? root.querySelector("[data-demo-teacher-text]")?.textContent.trim() || ""
          : "";
      const answer = (answerEl?.dataset.fullText || answerEl?.textContent || "").trim();
      if (!answer) return;
      const text = [
        question ? `问：${question}` : "",
        answer,
        teacherReply ? `老师补充：${teacherReply}` : "",
        source ? `来源：${source}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      const copied = await copyToClipboard(text);
      showToast(copied ? "回答已复制，可以发给同学" : "复制失败，请手动选择答案");
    });
  });

  const qrLightbox = document.getElementById("qr-lightbox");
  let qrTrigger = null;

  const closeQr = () => {
    if (!qrLightbox || qrLightbox.hidden) return;
    qrLightbox.hidden = true;
    document.body.style.overflow = "";
    if (qrTrigger && typeof qrTrigger.focus === "function") qrTrigger.focus();
  };

  const openQr = (trigger) => {
    if (!qrLightbox) return;
    qrTrigger = trigger || document.activeElement;
    qrLightbox.hidden = false;
    document.body.style.overflow = "hidden";
    const closeButton = qrLightbox.querySelector("[data-close-qr]");
    if (closeButton) closeButton.focus();
  };

  document.querySelectorAll("[data-open-qr]").forEach((button) => {
    button.addEventListener("click", () => openQr(button));
  });

  if (qrLightbox) {
    qrLightbox.addEventListener("click", (event) => {
      if (event.target === qrLightbox) closeQr();
    });
    qrLightbox.querySelectorAll("[data-close-qr]").forEach((button) => {
      button.addEventListener("click", closeQr);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !qrLightbox.hidden) closeQr();
    });
  }

  /* 首屏产品截图放大 */
  const shotLightbox = document.getElementById("shot-lightbox");
  const shotZoom = document.querySelector("[data-device-zoom]");
  const shotImage = shotLightbox?.querySelector("[data-shot-image]");
  const shotCaption = shotLightbox?.querySelector("[data-shot-caption]");
  let shotTrigger = null;

  const closeShot = () => {
    if (!shotLightbox || shotLightbox.hidden) return;
    shotLightbox.hidden = true;
    document.body.style.overflow = "";
    if (shotTrigger && typeof shotTrigger.focus === "function") shotTrigger.focus();
  };

  const openShot = (trigger) => {
    if (!shotLightbox || !shotImage) return;
    const active = document.querySelector("[data-device-shot].is-active");
    if (!active) return;
    shotTrigger = trigger || document.activeElement;
    shotImage.src = active.currentSrc || active.src;
    shotImage.alt = active.alt || "";
    if (shotCaption) {
      shotCaption.textContent = active.dataset.shotCaption || active.alt || "";
    }
    shotLightbox.hidden = false;
    document.body.style.overflow = "hidden";
    const closeButton = shotLightbox.querySelector("[data-close-shot]");
    if (closeButton) closeButton.focus();
  };

  if (shotZoom) {
    shotZoom.addEventListener("click", () => openShot(shotZoom));
  }

  if (shotLightbox) {
    shotLightbox.addEventListener("click", (event) => {
      if (event.target === shotLightbox) closeShot();
    });
    shotLightbox.querySelectorAll("[data-close-shot]").forEach((button) => {
      button.addEventListener("click", closeShot);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !shotLightbox.hidden) closeShot();
    });
  }

  /* 调研 · 完整 10 题报告 */
  const reportToggle = document.querySelector("[data-report-toggle]");
  const reportPanel = document.querySelector("[data-report-panel]");
  if (reportToggle && reportPanel) {
    const reportData = [
      {
        no: "01",
        short: "年级",
        multi: false,
        chart: "bars",
        question: "你的年级是？",
        options: [
          { label: "大二", value: 61.64 },
          { label: "大三", value: 19.18 },
          { label: "大一", value: 10.96 },
          { label: "大四", value: 8.22 },
        ],
        insight: "61.64% 来自大二；大三 19.18%，大一 10.96%，大四 8.22%。",
      },
      {
        no: "02",
        short: "专业",
        multi: false,
        chart: "bars",
        question: "你的专业类别是？",
        options: [
          { label: "理工类", value: 54.79 },
          { label: "文史类", value: 34.25 },
          { label: "经管类", value: 6.85 },
          { label: "其他", value: 2.74 },
          { label: "艺术类", value: 1.37 },
        ],
        insight: "理工类 54.79%，文史类 34.25%；两者合计接近九成。",
      },
      {
        no: "03",
        short: "频率",
        multi: false,
        chart: "bars",
        question: "最近一学期，课后遇到不会做 / 看不懂的问题大概多久一次？",
        options: [
          { label: "每周 2-3 次", value: 36.99 },
          { label: "每周 1 次左右", value: 21.92 },
          { label: "每月几次", value: 21.92 },
          { label: "几乎每天都有", value: 12.33 },
          { label: "几乎没有", value: 6.85 },
        ],
        insight: "36.99% 每周遇到 2-3 次不会的题；加上每周 1 次，超过七成每周至少被卡住一次。",
      },
      {
        no: "04",
        short: "时段",
        multi: false,
        chart: "note",
        question: "这些问题通常出现在什么时候？",
        options: [
          { label: "作业截止前", tag: "高频" },
          { label: "晚上 8 点后", tag: "高频" },
          { label: "考前一周", value: 39.73 },
          { label: "周末", value: 27.4 },
        ],
        note: "手机端报告把两个长选项的百分比折叠了；报告里这两项是高频时段。",
        insight: "问题集中在作业截止前和晚上 8 点后；考前一周 39.73%，周末 27.4%。",
      },
      {
        no: "05",
        short: "遇到不会",
        multi: true,
        chart: "bars",
        question: "遇到不会的题，你通常会怎么办？（多选）",
        options: [
          { label: "问 AI（豆包 / DeepSeek）", value: 63.01 },
          { label: "问同学", value: 49.32 },
          { label: "搜题 App / 作业帮", value: 46.58 },
          { label: "先放着，最后再说", value: 39.73 },
          { label: "自己查书 / 搜资料", value: 38.36 },
          { label: "等下次上课问", value: 20.55 },
        ],
        insight: "问 AI 已经是第一选择（63.01%）；问同学 49.32%，搜题 App 46.58% 已超过自己查书 38.36%。",
      },
      {
        no: "06",
        short: "问老师",
        multi: false,
        chart: "bars",
        question: "你最常用哪种方式问老师？",
        options: [
          { label: "几乎不问老师", value: 43.84 },
          { label: "微信 / QQ", value: 28.77 },
          { label: "课后当面问", value: 16.44 },
          { label: "学习通 / 雨课堂", value: 10.96 },
          { label: "邮件", value: 0 },
        ],
        insight: "43.84% 几乎不问老师；问的人里，微信 / QQ 是主入口，邮件为 0。",
      },
      {
        no: "07",
        short: "回复时长",
        multi: false,
        chart: "note",
        question: "通过微信 / QQ 问老师，通常多久能收到回复？",
        options: [
          { label: "没问过 / 不清楚", tag: "最多人选" },
          { label: "当天能收到" },
          { label: "1 小时以内" },
          { label: "10 分钟以内", value: 5.48 },
          { label: "第二天才收到", value: 2.74 },
        ],
        note: "前三个长选项的百分比在手机端报告中被折叠；10 分钟与第二天两项是完整读数。",
        insight: "最多人选的不是回复慢，而是根本没问过；10 分钟内收到只占 5.48%。",
      },
      {
        no: "08",
        short: "搜题 App",
        multi: true,
        chart: "bars",
        question: "用搜题 App 时，最让你不满意的是什么？（多选）",
        options: [
          { label: "只给答案，不讲思路", value: 75.34 },
          { label: "要收费 / 广告多", value: 45.21 },
          { label: "主观题 / 证明题不会", value: 42.47 },
          { label: "答案经常是…", value: 32.88 },
          { label: "解法跟老师…", value: 23.29 },
        ],
        insight: "75.34% 的搜题 App 只给答案、不讲思路；45.21% 被收费 / 广告劝退。",
      },
      {
        no: "09",
        short: "用 AI",
        multi: true,
        chart: "bars",
        question: "用 AI 问学习问题，最让你不放心的是什么？（多选）",
        options: [
          { label: "不知道它答得对不对", value: 86.3 },
          { label: "会有错，但它说得很肯定", value: 79.45 },
          { label: "说得很泛，不针对教材", value: 39.73 },
          { label: "步骤跳得太快，看不懂", value: 28.77 },
        ],
        insight: "86.3% 不知道 AI 答得对不对；79.45% 怕它错了还说得肯定。",
      },
      {
        no: "10",
        short: "匿名意愿",
        multi: false,
        chart: "donut",
        question: "如果有一个平台：AI 先答（带出处），AI 没把握时转给你的老师，你愿意用吗？",
        options: [
          { label: "愿意", value: 43.84 },
          { label: "说不准", value: 28.77 },
          { label: "非常愿意", value: 12.33 },
          { label: "不太愿意", value: 12.33 },
          { label: "不愿意", value: 2.74 },
        ],
        colors: [
          "var(--jade)",
          "var(--gold)",
          "var(--jade-deep)",
          "var(--clay)",
          "var(--clay-deep)",
        ],
        center: "56.17%",
        centerLabel: "愿意试",
        insight: "愿意 + 非常愿意合计 56.17%；说不准 28.77%，真正不愿意的只有 15.07%。",
      },
    ];

    const reportNav = reportPanel.querySelector("[data-report-nav]");
    const reportNo = reportPanel.querySelector("[data-report-no]");
    const reportType = reportPanel.querySelector("[data-report-type]");
    const reportQuestion = reportPanel.querySelector("[data-report-question]");
    const reportChart = reportPanel.querySelector("[data-report-chart]");
    const reportInsight = reportPanel.querySelector("[data-report-insight]");
    const reportPick = reportPanel.querySelector("[data-report-selection]");
    const reportCount = reportPanel.querySelector("[data-report-count]");
    const reportPrev = reportPanel.querySelector("[data-report-prev]");
    const reportNext = reportPanel.querySelector("[data-report-next]");
    let reportIndex = 0;

    const makeReportPickable = (node, option) => {
      if (typeof option.value !== "number") return;
      node.dataset.reportPick = option.label;
      node.dataset.reportValue = String(option.value);
      node.tabIndex = 0;
      node.setAttribute("role", "button");
      node.setAttribute("aria-pressed", "false");
      node.setAttribute("aria-label", `${option.label}，${option.value}%`);
    };

    const handleReportPick = (event) => {
      if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
      const target = event.target.closest?.("[data-report-pick]");
      if (!target || !reportChart.contains(target)) return;
      event.preventDefault();
      const label = target.dataset.reportPick || "";
      const value = target.dataset.reportValue || "";
      const item = reportData[reportIndex];
      reportChart.querySelectorAll("[data-report-pick]").forEach((node) => {
        const picked = node === target;
        node.classList.toggle("is-picked", picked);
        node.setAttribute("aria-pressed", picked ? "true" : "false");
      });
      if (reportPick) {
        reportPick.hidden = false;
        reportPick.textContent = `你选了「${label}」· ${value}% 的同学${
          item?.multi ? "也选了这个" : "和你一样"
        }`;
      }
    };

    reportChart.addEventListener("click", handleReportPick);
    reportChart.addEventListener("keydown", handleReportPick);

    const renderReportChart = (item) => {
      reportChart.innerHTML = "";
      if (item.chart === "donut") {
        const wrap = document.createElement("div");
        wrap.className = "report-donut-wrap";
        const donut = document.createElement("div");
        donut.className = "report-donut";
        let cumulative = 0;
        const stops = item.options.map((option, index) => {
          const start = cumulative;
          cumulative += option.value;
          return `${item.colors[index]} ${start}% ${cumulative}%`;
        });
        donut.style.background = `conic-gradient(${stops.join(", ")})`;
        const center = document.createElement("div");
        center.className = "report-donut-center";
        const centerValue = document.createElement("strong");
        centerValue.textContent = item.center;
        const centerLabel = document.createElement("small");
        centerLabel.textContent = item.centerLabel;
        center.append(centerValue, centerLabel);
        donut.append(center);

        const legend = document.createElement("ul");
        legend.className = "report-legend";
        item.options.forEach((option, index) => {
          const li = document.createElement("li");
          const dot = document.createElement("i");
          dot.style.setProperty("--c", item.colors[index]);
          const label = document.createElement("span");
          label.textContent = option.label;
          const value = document.createElement("b");
          value.textContent = `${option.value}%`;
          li.append(dot, label, value);
          makeReportPickable(li, option);
          legend.append(li);
        });
        wrap.append(donut, legend);
        reportChart.append(wrap);
        return;
      }

      if (item.chart === "note") {
        const card = document.createElement("div");
        card.className = "report-note-card";
        item.options.forEach((option) => {
          const row = document.createElement("div");
          row.className = "report-note-row";
          const label = document.createElement("span");
          label.textContent = option.label;
          row.append(label);
          if (option.tag) {
            const tag = document.createElement("span");
            tag.className = "tag";
            tag.textContent = option.tag;
            row.append(tag);
          }
          if (typeof option.value === "number") {
            const value = document.createElement("b");
            value.textContent = `${option.value}%`;
            row.append(value);
            makeReportPickable(row, option);
          }
          card.append(row);
        });
        const note = document.createElement("p");
        note.className = "report-note-text";
        note.textContent = item.note || "";
        card.append(note);
        reportChart.append(card);
        return;
      }

      const list = document.createElement("div");
      list.className = "report-bars";
      item.options.forEach((option, index) => {
        const row = document.createElement("div");
        row.className = `report-bar${index === 0 ? " is-top" : ""}`;
        const label = document.createElement("span");
        label.className = "report-bar-label";
        label.textContent = option.label;
        const track = document.createElement("span");
        track.className = "report-bar-track";
        const fill = document.createElement("i");
        fill.className = "report-bar-fill";
        track.append(fill);
        const value = document.createElement("span");
        value.className = "report-bar-value";
        value.textContent = `${option.value}%`;
        row.append(label, track, value);
        makeReportPickable(row, option);
        list.append(row);
        window.requestAnimationFrame(() => {
          fill.style.width = `${option.value}%`;
        });
      });
      reportChart.append(list);
    };

    const renderReport = () => {
      const item = reportData[reportIndex];
      reportNo.textContent = item.no;
      reportType.textContent = item.multi ? "多选" : "单选";
      reportQuestion.textContent = item.question;
      reportInsight.textContent = item.insight;
      if (reportPick) {
        reportPick.hidden = true;
        reportPick.textContent = "";
      }
      reportCount.textContent = `${String(reportIndex + 1).padStart(2, "0")} / ${String(reportData.length).padStart(2, "0")}`;
      reportPrev.disabled = reportIndex === 0;
      reportNext.disabled = reportIndex === reportData.length - 1;
      reportNav.querySelectorAll(".report-tab").forEach((tab, index) => {
        const active = index === reportIndex;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-pressed", active ? "true" : "false");
      });
      renderReportChart(item);
    };

    reportData.forEach((item, index) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = `report-tab${index === 0 ? " is-active" : ""}`;
      tab.setAttribute("aria-pressed", index === 0 ? "true" : "false");
      const no = document.createElement("b");
      no.textContent = item.no;
      const label = document.createElement("span");
      label.textContent = item.short;
      tab.append(no, label);
      tab.addEventListener("click", () => {
        reportIndex = index;
        renderReport();
      });
      reportNav.append(tab);
    });

    reportPrev.addEventListener("click", () => {
      if (reportIndex === 0) return;
      reportIndex -= 1;
      renderReport();
    });
    reportNext.addEventListener("click", () => {
      if (reportIndex === reportData.length - 1) return;
      reportIndex += 1;
      renderReport();
    });

    reportToggle.addEventListener("click", () => {
      const open = reportPanel.hidden;
      reportPanel.hidden = !open;
      reportToggle.classList.toggle("is-open", open);
      reportToggle.setAttribute("aria-expanded", open ? "true" : "false");
      const label = reportToggle.querySelector("span");
      if (label) label.textContent = open ? "收起完整报告" : "查看完整 10 题报告";
      if (open) renderReport();
    });

    renderReport();
  }

  /* 版本筛选 */
  const roadmapItems = Array.from(document.querySelectorAll(".roadmap-item"));
  const roadmapFilters = Array.from(document.querySelectorAll("[data-roadmap-filter]"));
  if (roadmapItems.length && roadmapFilters.length) {
    const applyRoadmapFilter = (filter) => {
      roadmapItems.forEach((item) => {
        const show =
          filter === "all" ||
          (filter === "done" && item.classList.contains("is-done")) ||
          (filter === "next" && item.classList.contains("is-next"));
        item.hidden = !show;
      });
      roadmapFilters.forEach((button) => {
        const active = button.dataset.roadmapFilter === filter;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
    };
    roadmapFilters.forEach((button) => {
      button.addEventListener("click", () => applyRoadmapFilter(button.dataset.roadmapFilter));
    });
    applyRoadmapFilter("all");
  }

  /* App 下载：任一卡片填好 data-download-url 即自动启用 */
  document.querySelectorAll("[data-download-card]").forEach((card) => {
    const url = (card.dataset.downloadUrl || "").trim();
    const badge = card.querySelector("[data-download-badge]");

    if (!url) {
      if (badge) badge.textContent = card.dataset.downloadEmptyBadge || "开发中";
      return;
    }

    const kind = card.dataset.downloadKind || "APK";
    const version = (card.dataset.downloadVersion || "").trim();
    const size = (card.dataset.downloadSize || "").trim();
    const metaParts = [kind];
    if (version) metaParts.push(`v${version.replace(/^v/i, "")}`);
    if (size) metaParts.push(size);

    const meta = card.querySelector("[data-download-meta]");
    if (meta) meta.textContent = metaParts.join(" · ");
    if (badge) badge.textContent = card.dataset.downloadReadyBadge || "可下载";

    const button = card.querySelector("[data-download-button]");
    if (button) {
      const link = document.createElement("a");
      link.className = "btn btn-download is-ready";
      link.href = url;
      link.rel = "noopener";
      if (card.dataset.downloadDirect === "true") link.setAttribute("download", "");
      if (card.dataset.downloadNewtab === "true") link.setAttribute("target", "_blank");
      link.textContent = card.dataset.downloadLabel || "下载";
      button.replaceWith(link);
    }
    card.classList.add("is-ready");
  });
})();
