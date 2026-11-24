import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Compass,
  GraduationCap,
  Inbox,
  MessageSquarePlus,
  MessagesSquare,
  Moon,
  Presentation,
  QrCode,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sun,
  UserCog,
  UtensilsCrossed,
} from "lucide-react";
import type { Role, ViewKey } from "../types";
import { teacherByName } from "../data/seed";
import {
  profileMeta,
  courseGlyph,
  courseToneMap,
  isClassOngoing,
  periodTime,
  runsInWeek,
  teachingWeek,
  upcomingTodayClasses,
  useProfile,
  weekdayNumber,
} from "../lib/profile";
import { useAuth } from "../auth";
import { useStore } from "../store";
import { cn } from "../lib/utils";
import { loadThemePreference, toggleTheme, type ThemePreference } from "../lib/theme";
import { triggerHaptic } from "../lib/nativeShell";
import { useMentorSelection } from "../lib/mentorSelection";
import { DigitalAvatarBadge } from "./DigitalAvatar";
import { Avatar, BrandMark } from "./ui";
interface NavItem {
  key: ViewKey;
  label: string;
  icon: typeof MessagesSquare;
  badge?: number;
  /** 手机底栏使用的短标签（默认按 label 去掉「课程」二字）。 */
  shortLabel?: string;
}
interface LayoutProps {
  role: Role;
  view: ViewKey;
  teacherName: string;
  pendingCount: number;
  unreadCount: number;
  onOpenNotifications: () => void;
  /** 设置页是否打开；打开时底栏「账号」高亮，其余导航不高亮 */
  accountOpen?: boolean;
  onOpenAccount: (
    tab?: "identity" | "schedule" | "scores" | "teachers",
  ) => void;
  onOpenAdmin: () => void;
  onOpenMentor: (prompt?: string) => void;
  onNavigate: (view: ViewKey) => void;
  onOpenGuide: () => void;
  onOpenFeedback?: (tab?: "compose" | "mine") => void;
  onRequestReset: () => void;
  children: ReactNode;
}
const breadcrumbMap: Record<ViewKey, { root: string; current: string }> = {
  student: { root: "学生端", current: "我的答疑" },
  teacher: { root: "教师端", current: "待办台" },
  knowledge: { root: "课程空间", current: "知识库" },
  chaoxing: { root: "学习空间", current: "学习通" },
  campus: { root: "校园空间", current: "校园生活" },
  insights: { root: "教师端", current: "答疑洞察" },
  fandian: { root: "校园空间", current: "食堂决策" },
  about: { root: "关于师说", current: "方案说明" },
  schedule: { root: "学习空间", current: "我的课程表" },
};
export function Layout({
  role,
  view,
  teacherName,
  pendingCount,
  unreadCount,
  onOpenNotifications,
  accountOpen = false,
  onOpenAccount,
  onOpenAdmin,
  onOpenMentor,
  onNavigate,
  onOpenFeedback,
  onRequestReset,
  children,
}: LayoutProps) {
  const isTeacher = role === "teacher";
  const { user, logout } = useAuth();
  const { syncState } = useStore();
  const studentProfile = useProfile();
  const { mentor } = useMentorSelection();
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => loadThemePreference());
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const syncLabel =
    syncState === "saving"
      ? "共享空间 · 保存中"
      : syncState === "error"
        ? "共享空间 · 同步失败"
        : "共享空间 · 已同步";
  const teachingWeekNow = teachingWeek(studentProfile.termStart) ?? 1;
  const weekEntries = studentProfile.schedule.filter((entry) =>
    runsInWeek(entry.weeks, teachingWeekNow),
  );
  const courseTones = courseToneMap(studentProfile.schedule);
  const miniPeriods = Math.max(
    10,
    ...weekEntries.map((entry) => entry.endSection),
  );
  const today = weekdayNumber(nowTs);
  const todayClassesList = weekEntries.filter((entry) => entry.day === today);
  const todayCount = todayClassesList.length;
  const upcomingToday = upcomingTodayClasses(studentProfile, nowTs).filter((entry) =>
    runsInWeek(entry.weeks, teachingWeekNow),
  );
  const nextToday = upcomingToday[0];
  const nextOngoing = Boolean(nextToday && isClassOngoing(nextToday, nowTs));
  /** 教师侧栏分组：教学工具与校园生活分开，食堂决策不再混在「教学空间」里 */
  const teacherNavGroups: { label: string; items: NavItem[] }[] = [
    {
      label: "教学空间",
      items: [
        { key: "teacher", label: "待办台", icon: Inbox, badge: pendingCount },
        { key: "knowledge", label: "课程知识库", icon: BookOpen },
        { key: "insights", label: "答疑洞察", icon: BarChart3 },
      ],
    },
    {
      label: "校园生活",
      items: [
        {
          key: "fandian",
          label: "食堂决策",
          icon: UtensilsCrossed,
          shortLabel: "食堂",
        },
      ],
    },
  ];
  const navItems: NavItem[] = isTeacher
    ? teacherNavGroups.flatMap((group) => group.items)
    : [
        { key: "student", label: "我的答疑", icon: MessagesSquare },
        {
          key: "schedule",
          label: "课程表",
          icon: CalendarDays,
          shortLabel: "课表",
        },
        {
          key: "chaoxing",
          label: "学习通",
          icon: QrCode,
          shortLabel: "学习通",
        },
        { key: "campus", label: "校园生活", icon: Compass, shortLabel: "校园" },
      ];
  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    // 设置页打开时归到「账号/设置」，其余导航项不高亮
    const active = !accountOpen && view === item.key;
    return (
      <button
        key={item.key}
        className={cn("nav-item", active && "is-active")}
        onClick={() => onNavigate(item.key)}
        aria-current={active ? "page" : undefined}
      >
        <span className="nav-icon">
          <Icon size={18} />
        </span>
        <span className="nav-label">{item.label}</span>
        {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
      </button>
    );
  };
  const teacherProfile = teacherByName(teacherName);
  const profile = isTeacher ? teacherProfile : studentProfile;
  const profileMetaText = isTeacher
    ? teacherProfile.meta
    : profileMeta(studentProfile);
  const crumb = breadcrumbMap[view];
  const mobileNavItems = navItems.slice(0, 4);
  const totalMobileTabs = mobileNavItems.length + 1;
  const matchedMobileIndex = mobileNavItems.findIndex((item) => item.key === view);
  const activeMobileIndex = accountOpen
    ? mobileNavItems.length
    : matchedMobileIndex >= 0
      ? matchedMobileIndex
      : 0;
  const prevMobileIndexRef = useRef(activeMobileIndex);
  const prevDirectionRef = useRef<"next" | "prev" | "none">("none");
  if (prevMobileIndexRef.current !== activeMobileIndex) {
    prevDirectionRef.current =
      activeMobileIndex > prevMobileIndexRef.current ? "next" : "prev";
    prevMobileIndexRef.current = activeMobileIndex;
  }
  const pageTransitionKey = accountOpen ? "account" : view;
  return (
    <div className="app-shell">
      <aside
        className={cn(
          "sidebar",
          !isTeacher && view !== "campus" && "has-mentor",
        )}
      >
        <button
          className="brand"
          onClick={() => onNavigate(isTeacher ? "teacher" : "student")}
        >
          <BrandMark size={40} />
          <span className="brand-text">
            <strong>师说</strong>
            <span>AI 双通道答疑</span>
          </span>
        </button>
        <div className="sidebar-role-note">
          <span className="sidebar-live-dot" />
          {isTeacher
            ? `教师视角 · ${teacherProfile.name}`
            : `学生视角 · ${studentProfile.name}`}
        </div>
        <nav className="side-nav" aria-label="主导航">
          {isTeacher ? (
            teacherNavGroups.map((group, index) => (
              <Fragment key={group.label}>
                <span
                  className={cn(
                    "nav-section-label",
                    index > 0 && "nav-section-group",
                  )}
                >
                  {group.label}
                </span>
                {group.items.map(renderNavItem)}
              </Fragment>
            ))
          ) : (
            <>
              <span className="nav-section-label">学习空间</span>
              {navItems.map(renderNavItem)}
            </>
          )}
        </nav>
        {!isTeacher && (
          <button className="side-mentor-entry" onClick={() => onOpenMentor()}>
            <DigitalAvatarBadge size={32} />
            <span className="side-mentor-entry-copy">
              <strong>{mentor.name}</strong>
              <span>{mentor.title} · AI 导师</span>
            </span>
            <ChevronRight size={14} />
          </button>
        )}
        <div className="sidebar-bottom">
          {/* 本周课程 + 设置：整体贴底，位置不随上方模块滚动 */}
          {!isTeacher && (
            <section className="side-timetable" aria-label="本周课程表">
              <div className="side-timetable-head">
                <span>本周课程</span>
                <button
                  className="side-timetable-link"
                  onClick={() => onNavigate("schedule")}
                >
                  查看 / 添加
                </button>
              </div>
              {weekEntries.length > 0 ? (
                <>
                  <div className="side-week">
                    <span
                      className="side-week-corner"
                      style={{ gridColumn: 1, gridRow: 1 }}
                    />
                    {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                      <span
                        key={day}
                        className={`side-week-day ${day === today ? "is-today" : ""}`}
                        style={{ gridColumn: day + 1, gridRow: 1 }}
                      >
                        {["一", "二", "三", "四", "五", "六", "日"][day - 1]}
                      </span>
                    ))}
                    {Array.from(
                      { length: miniPeriods },
                      (_, index) => index + 1,
                    ).map((period) => (
                      <Fragment key={period}>
                        <span
                          className="side-week-period"
                          style={{ gridColumn: 1, gridRow: period + 1 }}
                        >
                          {period}
                        </span>
                        {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                          <span
                            key={day}
                            className={`side-week-cell ${day === today ? "is-today" : ""}`}
                            style={{ gridColumn: day + 1, gridRow: period + 1 }}
                          />
                        ))}
                      </Fragment>
                    ))}
                    {weekEntries.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className={cn(
                          "side-week-block",
                          `tone-${courseTones.get(entry.course) ?? "jade"}`,
                          isClassOngoing(entry, nowTs) && "is-live",
                        )}
                        style={{
                          gridColumn: entry.day + 1,
                          gridRow: `${entry.startSection + 1} / ${entry.endSection + 2}`,
                        }}
                        title={`${entry.course}${entry.room ? ` · ${entry.room}` : ""}`}
                        aria-label={entry.course}
                        onClick={() => onNavigate("schedule")}
                      >
                        <span className="side-week-glyph" aria-hidden="true">
                          {courseGlyph(entry.course)}
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="side-timetable-foot">
                    第 {teachingWeekNow} 周 · 今天 {todayCount} 节
                  </p>
                  <button
                    type="button"
                    className={cn("side-timetable-compact", nextOngoing && "is-live")}
                    onClick={() => onNavigate("schedule")}
                  >
                    <strong>
                      {nextOngoing && <em className="side-timetable-live">上课中</em>}
                      <span>
                        {nextToday
                          ? `${nextToday.course}`
                          : todayCount > 0
                            ? "今日课程已上完"
                            : "今日无课"}
                      </span>
                    </strong>
                    <span>
                      {nextToday
                        ? `${periodTime(nextToday)}${nextToday.room ? ` · ${nextToday.room}` : ""}`
                        : `第 ${teachingWeekNow} 周 · 本周共 ${weekEntries.length} 节`}
                    </span>
                  </button>
                </>
              ) : (
                <button
                  className="side-timetable-empty"
                  onClick={() => onOpenAccount("schedule")}
                >
                  <CalendarDays size={15} />
                  {studentProfile.schedule.length > 0
                    ? `第 ${teachingWeekNow} 周没有课`
                    : "还没有课程表，点这里添加"}
                </button>
              )}
            </section>
          )}
          {/* 本周课程与设置同属底部固定区，整块贴底 */}
          <button
            onClick={() => onOpenAccount("identity")}
            className="side-settings-button"
            aria-label={
              profile.name ? `打开设置（${profile.name}）` : "打开设置"
            }
          >
            <Avatar
              name={profile.name}
              tone={isTeacher ? teacherProfile.accent : "jade"}
              size="sm"
            />
            <span className="side-settings-copy">
              <strong>{profile.name}</strong>
              <span>{isTeacher ? "教师账号" : "学生账号"}</span>
            </span>
            <Settings size={15} />
          </button>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-brand-mobile">
              <BrandMark size={28} />
              <strong>师说</strong>
            </div>
            <div className="breadcrumb" aria-label="面包屑">
              <span>{crumb.root}</span>
              <ChevronRight size={13} />
              <strong>{crumb.current}</strong>
            </div>
          </div>
          <div className="topbar-right">
            {syncState === "error" && (
              <span className="demo-pill is-error" title={syncLabel}>
                <i />
                {syncLabel}
              </span>
            )}
            <span className="topbar-account" title={user?.email ?? ""}>
              {isTeacher ? (
                <Presentation size={15} />
              ) : (
                <GraduationCap size={15} />
              )}
              <span>{user?.name ?? profile.name}</span>
              <small>{isTeacher ? "教师账号" : "学生账号"}</small>
            </span>
            {user?.isAdmin && (
              <button
                className="bell-button admin-entry"
                onClick={onOpenAdmin}
                aria-label="管理台"
                title="管理台"
              >
                <UserCog size={16} />
              </button>
            )}
            {onOpenFeedback && (
              <button
                className="guide-button"
                onClick={() => onOpenFeedback("compose")}
                aria-label="意见反馈"
                title="意见反馈"
              >
                <MessageSquarePlus size={16} />
                <span>反馈</span>
              </button>
            )}
            <button
              className="theme-toggle"
              onClick={() => setThemePreference(toggleTheme())}
              aria-label={
                themePreference === "light"
                  ? "当前浅色，点击切换到深色"
                  : "当前深色，点击切换到浅色"
              }
              title={
                themePreference === "light"
                  ? "当前浅色，点击切换到深色"
                  : "当前深色，点击切换到浅色"
              }
            >
              {themePreference === "light" ? (
                <Sun size={15} />
              ) : (
                <Moon size={15} />
              )}
              <span>{themePreference === "light" ? "浅色" : "深色"}</span>
            </button>
            <button
              className="bell-button"
              onClick={onOpenNotifications}
              aria-label={`消息通知${unreadCount > 0 ? `，${unreadCount} 条未读` : ""}`}
            >
              <Bell size={16} />
              {unreadCount > 0 && (
                <span className="bell-badge">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </div>
        </header>
        <main
          className={cn(
            "page-wrap",
            prevDirectionRef.current === "next" && "is-nav-next",
            prevDirectionRef.current === "prev" && "is-nav-prev",
          )}
          key={pageTransitionKey}
        >
          {children}
        </main>
      </div>
      <nav
        className="mobile-nav"
        aria-label="移动端导航"
        style={
          {
            "--nav-index": activeMobileIndex,
            "--nav-count": totalMobileTabs,
          } as CSSProperties
        }
      >
        <span className="mobile-nav-glider" aria-hidden="true" />
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const active = !accountOpen && view === item.key;
          return (
            <button
              key={item.key}
              className={cn(active && "is-active")}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                triggerHaptic("light");
                onNavigate(item.key);
              }}
            >
              <Icon size={20} />
              <span>{item.shortLabel ?? item.label.replace("课程", "")}</span>
            </button>
          );
        })}
        <button
          className={cn(accountOpen && "is-active")}
          aria-current={accountOpen ? "page" : undefined}
          onClick={() => {
            triggerHaptic("light");
            onOpenAccount("identity");
          }}
        >
          <Settings size={20} />
          <span>账号</span>
        </button>
      </nav>
    </div>
  );
}
