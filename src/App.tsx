import { useLanguage, LanguageSwitch, ChineseStaffScope } from "./language";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { RefreshCw, ArrowUpRight, CalendarDays } from "lucide-react";
import { api } from "./api";
import { overview } from "../shared/programme";
import { type Snapshot, type Session, monthKey } from "../shared/model";
import { Notice, Message, SessionRow, Footnote, Modal } from "./components";
import { backgroundEn, programmeTitleEn } from "./english";
import SessionDrawer from "./SessionDrawer";
import MyRegistrations from "./MyRegistrations";
import LoadBoundary from "./LoadBoundary";
import {
  useFilterTransition,
  usePagePosition,
  useSessionReveal,
} from "./motion";
const Admin = lazy(() => import("./Admin"));
const currentPage = () =>
  location.hash === "#staff"
    ? "staff"
    : location.hash === "#mine"
      ? "mine"
      : "sessions";
export default function App() {
  const { tr, english, content, monthLabel } = useLanguage();
  const [page, setPage] = useState(currentPage),
    [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [offline, setOffline] = useState(!navigator.onLine),
    [month, setMonth] = useState("all"),
    [selected, setSelected] = useState<Session | null>(null),
    [info, setInfo] = useState(""),
    [refreshed, setRefreshed] = useState("");
  const inFlight = useRef<Promise<void> | null>(null),
    refreshAfterWrite = useRef(false);
  const main = useRef<HTMLElement>(null);
  usePagePosition(main, page);
  useFilterTransition(main, page, month);
  useSessionReveal(
    main,
    page,
    `${data?.dataSpace}:${month}:${english}:${data?.sessions.map((s) => s.id).join(",")}`,
    month !== "all",
  );
  const refresh = useCallback((afterWrite = false): Promise<void> => {
    if (inFlight.current) {
      // A mutation needs a fresh read AFTER the earlier request has completed.
      if (afterWrite) refreshAfterWrite.current = true;
      return inFlight.current;
    }
    setRefreshing(true);
    const task = (async () => {
      do {
        refreshAfterWrite.current = false;
        try {
          const next = await api<Snapshot>("/sessions");
          if (
            !Array.isArray(next.sessions) ||
            !Array.isArray(next.rounds) ||
            !next.settings ||
            typeof next.dataSpace !== "string"
          )
            throw new Error("服务暂时没有返回可识别的结果，请稍后重试。");
          setData(next);
          setSelected((prev) =>
            prev
              ? next.sessions.find((s) => s.id === prev.id) || {
                  ...prev,
                  status: "archived",
                  state: "archived",
                }
              : null,
          );
          setError("");
          setRefreshed(
            new Date().toLocaleTimeString("zh-CN", {
              hour12: false,
              timeZone: "Asia/Shanghai",
            }),
          );
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setLoading(false);
        }
      } while (refreshAfterWrite.current);
    })().finally(() => {
      inFlight.current = null;
      setRefreshing(false);
    });
    inFlight.current = task;
    return task;
  }, []);
  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60000);
    const visible = () => {
        if (document.visibilityState === "visible") void refresh();
      },
      hash = () => setPage(currentPage()),
      online = () => {
        setOffline(false);
        void refresh();
      },
      disconnected = () => setOffline(true);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("hashchange", hash);
    window.addEventListener("online", online);
    window.addEventListener("offline", disconnected);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", disconnected);
    };
  }, [refresh]);
  function navigate(p: string) {
    location.hash = p;
    setPage(p);
  }
  const months = Array.from(
      new Set(data?.sessions.map((s) => monthKey(s.start_at)) || []),
    ).sort(),
    filtered =
      data?.sessions.filter(
        (s) => month === "all" || monthKey(s.start_at) === month,
      ) || [];
  const connectionWarning = error && (
    <Message>
      {tr(error)}
      {data && (
        <p>{tr("当前显示的是上次成功读取的信息，余量和安排可能已变化。")}</p>
      )}
      <button
        className="text-button"
        disabled={refreshing}
        onClick={() => void refresh()}
      >
        {refreshing ? tr("正在重新连接…") : tr("重新连接")}
      </button>
      <details className="connection-help">
        <summary>{tr("仍然连接不上？")}</summary>
        <p>
          {tr(
            "可尝试切换 Wi-Fi／手机流量，或在系统浏览器中打开同一链接。若同一网络下多位老师都无法访问，请把网址、发生时间和浏览器报错交给工作人员核查。切换浏览器后，已有报名可使用私密凭证找回，请勿重复报名。",
          )}
        </p>
      </details>
    </Message>
  );
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <a
            className="brand"
            href="#sessions"
            onClick={() => navigate("sessions")}
          >
            <strong>{tr("导师同行")}</strong>
            <span>{tr("培训报名与参会管理")}</span>
          </a>
          <div className="header-actions">
            <nav aria-label={tr("主导航")}>
              <button
                className={page === "sessions" ? "active" : ""}
                aria-current={page === "sessions" ? "page" : undefined}
                onClick={() => navigate("sessions")}
              >
                {tr("培训场次")}
              </button>
              <button
                className={page === "mine" ? "active" : ""}
                aria-current={page === "mine" ? "page" : undefined}
                onClick={() => navigate("mine")}
              >
                {tr("我的报名")}
              </button>
            </nav>
            <LanguageSwitch />
          </div>
        </div>
      </header>
      <main ref={main} className="main page-surface" key={page} tabIndex={-1}>
        {data?.mode === "preview" && <Notice />}
        {offline && (
          <Message>
            {tr(
              "浏览器提示网络可能已断开。已填写的信息仍留在当前页面，请恢复连接后继续。",
            )}
          </Message>
        )}
        {page === "mine" && connectionWarning}
        {page === "staff" ? (
          <LoadBoundary key="staff">
            <Suspense
              fallback={<p className="loading">{tr("正在打开管理入口…")}</p>}
            >
              <ChineseStaffScope>
                <Admin onChanged={() => void refresh(true)} />
              </ChineseStaffScope>
            </Suspense>
          </LoadBoundary>
        ) : page === "mine" ? (
          data ? (
            <MyRegistrations
              space={data.dataSpace}
              formal={data.mode === "formal"}
              contact={data.settings.contact}
              onChanged={() => void refresh(true)}
            />
          ) : (
            !error && <p className="loading">{tr("正在读取报名入口…")}</p>
          )
        ) : (
          <>
            <section className="intro">
              <h1>{tr("选择适合你的培训场次")}</h1>
              <p className="lede">
                {tr("四场一轮")}
                <span>·</span>
                {tr("主题轮换")}
                <span>·</span>
                {tr("各场独立报名")}
              </p>
              <p className="subtitle-en">{programmeTitleEn}</p>
              <p className="intro-copy">
                {english ? backgroundEn[0] : overview}
              </p>
              <button
                className="text-button"
                onClick={() => setInfo("programme")}
              >
                {tr("培训介绍 / Programme overview")}
                <ArrowUpRight size={14} />
              </button>
            </section>
            {data?.settings.registration_open === "false" && (
              <Message>
                {tr("报名入口暂时关闭，可以继续查看场次和已有报名。")}
              </Message>
            )}
            <div className="list-toolbar">
              <div
                className="months"
                role="group"
                aria-label={tr("按月份筛选")}
              >
                {["all", ...months].map((value) => (
                  <button
                    key={value}
                    className={month === value ? "active" : ""}
                    onClick={() => setMonth(value)}
                    aria-pressed={month === value}
                  >
                    {value === "all"
                      ? tr("全部轮次")
                      : monthLabel(
                          value,
                          months.every(
                            (m) => m.slice(0, 4) === months[0].slice(0, 4),
                          ),
                        )}
                  </button>
                ))}
              </div>
              <button
                className="text-button refresh"
                onClick={() => void refresh()}
                disabled={refreshing}
                aria-busy={refreshing}
              >
                <RefreshCw size={15} />
                <span>
                  {refreshing
                    ? tr("正在刷新…")
                    : refreshed
                      ? tr("更新于 ") + refreshed
                      : tr("刷新余量")}
                </span>
              </button>
            </div>
            {connectionWarning}
            {loading ? (
              <div className="loading">
                <CalendarDays size={24} />
                {tr("正在读取培训场次…")}
              </div>
            ) : data ? (
              <div className="session-results" key={month}>
                {data?.rounds.map((round) => {
                  const list = filtered.filter((s) => s.round_id === round.id);
                  return list.length ? (
                    <section className="round-section" key={round.id}>
                      <div
                        className="round-heading"
                        data-reveal-key={`round:${round.id}`}
                      >
                        <h2>{content(round.title)}</h2>
                        <span>
                          {list.length}
                          {tr("场")}
                          {month !== "all" ? tr(" · 当前月份") : ""}
                        </span>
                      </div>
                      <div className="list-head">
                        <span>{tr("日期")}</span>
                        <span>{tr("主题与内容")}</span>
                        <span>{tr("名额")}</span>
                        <span>{tr("操作")}</span>
                      </div>
                      <div className="session-list">
                        {list.map((s) => (
                          <SessionRow
                            key={s.id}
                            session={s}
                            onOpen={setSelected}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null;
                })}
                {!filtered.length && (
                  <div className="empty">{tr("暂无对应的培训安排。")}</div>
                )}
                <Footnote />
                <p className="rule-note">
                  {tr("无需注册，填写姓名、所属部门、工号和联系邮箱即可报名。")}
                  {data?.settings.max_sessions === "0"
                    ? tr("每人可报场数不限；")
                    : tr("每人最多可报 ") +
                      data?.settings.max_sessions +
                      tr(" 场；")}
                  {data?.settings.self_cancel === "true"
                    ? tr("截止前可在“我的报名”自行取消。")
                    : tr("取消需联系工作人员。")}
                  {tr("余量每分钟更新，提交时核实名额与截止时间。")}
                </p>
              </div>
            ) : null}
          </>
        )}
      </main>
      <footer className="footer">
        <div>
          <button onClick={() => setInfo("programme")}>{tr("培训介绍")}</button>
          <button onClick={() => setInfo("privacy")}>
            {tr("信息使用说明")}
          </button>
          <button onClick={() => navigate("staff")}>
            {tr("工作人员入口")}
          </button>
        </div>
        <span>{tr("导师同行 · 培训报名与参会管理")}</span>
      </footer>
      {selected && data && (
        <SessionDrawer
          session={selected}
          data={data}
          onClose={() => setSelected(null)}
          onChanged={() => void refresh(true)}
          onPrivacy={() => setInfo("privacy")}
        />
      )}
      {info && (
        <Modal
          title={
            info === "programme"
              ? tr("培训介绍 / Programme overview")
              : tr("信息使用说明 / Information use")
          }
          onClose={() => setInfo("")}
        >
          <div className="prose">
            {info === "programme" ? (
              <>
                <h2>{tr("导师同行：培训报名与参会管理")}</h2>
                {english ? (
                  backgroundEn.map((paragraph, i) => <p key={i}>{paragraph}</p>)
                ) : (
                  <p>{overview}</p>
                )}
                <h3>{tr("培训目标")}</h3>
                <ul>
                  <li>{tr("了解活动目标、参与方式和可用资源。")}</li>
                  <li>{tr("分享实践经验，讨论常见问题。")}</li>
                  <li>{tr("学习沟通方法，建立协作联系。")}</li>
                  <li>{tr("交流行动计划，促进持续学习。")}</li>
                </ul>
                <p>
                  {tr(
                    "参与对象与活动形式以组织方通知为准，请按场次安排准时参加。",
                  )}
                </p>
                <h3>{tr("轮次与内容")}</h3>
                <p>
                  {tr(
                    "场次按轮次组织，包含主题分享与交流讨论。可以根据需要选择单场，不要求整轮报名。",
                  )}
                </p>
                <p>
                  {tr(
                    "请在每场详情中核对最新日期、时间、地点、内容和报名截止时间。",
                  )}
                </p>
                <h3>{tr("报名须知")}</h3>
                <p>
                  {tr(
                    "请确认能够按时参加，勿重复报名同一场次。改期等安排会在“我的报名”中提示，请留意工作人员发布的通知。",
                  )}
                </p>
              </>
            ) : (
              <>
                <p>
                  {tr(
                    "本页面由活动组织方用于培训报名与参会管理。姓名、部门、工号、联系邮箱及报名与参会记录用于登记、名额统筹、去重、参会核对和培训通知。邮箱仅供工作人员联系，不向其他报名者公开。网站不会自动发送邮件。",
                  )}
                </p>

                <p>
                  {tr(
                    "资料由本网站组织方配置的数据库保存。公开页面只显示人数，不公开个人名单；名单仅供登录后的工作人员查看和导出。",
                  )}
                </p>
                <p>
                  {tr(
                    "本浏览器保存私密报名凭证，用于查看和取消自己的报名。换设备时可导入凭证；请勿转发给他人。在公用设备使用后，请清除本浏览器中保存的凭证。",
                  )}
                </p>
                <p>{content(data?.settings.retention || "")}</p>
                <p>
                  {tr("更正、取消或资料使用事宜，请联系：")}
                  {content(data?.settings.contact || "活动组织方工作人员")}
                  {english ? "." : "。"}
                </p>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
