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
  const sections = ["story", "ability", "film", "app"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const navLinks = new Map();
  document.querySelectorAll('.nav a[href^="#"]').forEach((link) => {
    navLinks.set(link.getAttribute("href").slice(1), link);
  });

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
